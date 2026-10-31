import {admin,answer,fail,preflight,originOK,authMember,hasPermission,errResponse,digest} from '../_shared/common.ts';

const clientId=Deno.env.get('GOOGLE_CLIENT_ID')||'';
const clientSecret=Deno.env.get('GOOGLE_CLIENT_SECRET')||'';
const redirect=Deno.env.get('FCAP_GOOGLE_REDIRECT_URI')||'';
const site=Deno.env.get('FCAP_SITE_ORIGIN')||'';
const encKey=Deno.env.get('FCAP_TOKEN_ENCRYPTION_KEY')||'';
function b64(bytes){return btoa(String.fromCharCode(...bytes))}
function unb64(s){return Uint8Array.from(atob(s),x=>x.charCodeAt(0))}
async function aesKey(){const bytes=unb64(encKey);if(bytes.length!==32)throw Error('503|Criptografia da agenda não configurada');return crypto.subtle.importKey('raw',bytes,{name:'AES-GCM'},false,['encrypt','decrypt'])}
async function encrypt(s){const iv=crypto.getRandomValues(new Uint8Array(12));const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv},await aesKey(),new TextEncoder().encode(s));return b64(iv)+'.'+b64(new Uint8Array(cipher))}
async function decrypt(s){const [iv,cipher]=String(s).split('.');const raw=await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(iv)},await aesKey(),unb64(cipher));return new TextDecoder().decode(raw)}
async function googleToken(userId){
 const {data,error}=await admin.from('fcap_google_tokens').select('refresh_token_cipher').eq('user_id',userId).maybeSingle();
 if(error||!data)throw Error('409|Conecte seu Google Agenda primeiro');
 const refresh=await decrypt(data.refresh_token_cipher);
 const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:clientId,client_secret:clientSecret,refresh_token:refresh,grant_type:'refresh_token'})});
 const json=await r.json();if(!r.ok||!json.access_token)throw Error('409|Autorização Google expirada. Reconecte sua conta');return json.access_token;
}
async function googleFetch(path:string,token:string,method='GET',body?:unknown){const r=await fetch('https://www.googleapis.com/calendar/v3'+path,{method,headers:{'Authorization':'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const json=await r.json().catch(()=>({}));if(!r.ok)throw Error('502|Google Agenda recusou a operação');return json}
function toSite(suffix){return (site||'').replace(/\/$/,'')+'/gestao/#integracoes'+suffix}
Deno.serve(async req=>{
 const pf=preflight(req);if(pf)return pf;
 const url=new URL(req.url);
 // O callback recebe um código via GET sem JWT, protegido por estado aleatório de uso único.
 if(req.method==='GET'&&url.searchParams.has('state')){
  try{
   if(!clientId||!clientSecret||!redirect||!site||!encKey)return new Response('Integração não configurada',{status:503});
   const state=String(url.searchParams.get('state')||''),code=String(url.searchParams.get('code')||'');
   if(!state||!code)return Response.redirect(toSite('?google=erro'),303);
   const stateHash=await digest(state);
   const {data,error}=await admin.from('fcap_oauth_states').delete().eq('state_hash',stateHash).select('user_id,expires_at').maybeSingle();
   if(error||!data||new Date(data.expires_at).getTime()<Date.now())return Response.redirect(toSite('?google=expirado'),303);
   const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({code,client_id:clientId,client_secret:clientSecret,redirect_uri:redirect,grant_type:'authorization_code'})});
   const x=await r.json();if(!r.ok||!x.refresh_token)return Response.redirect(toSite('?google=sem_refresh'),303);
   const cipher=await encrypt(x.refresh_token);
   const {error:saveError}=await admin.from('fcap_google_tokens').upsert({user_id:data.user_id,refresh_token_cipher:cipher,connected_at:new Date().toISOString()});
   if(saveError)return Response.redirect(toSite('?google=erro'),303);
   return Response.redirect(toSite('?google=conectado'),303);
  }catch{return Response.redirect(toSite('?google=erro'),303)}
 }
 if(req.method!=='POST')return fail('Método não permitido',405);if(!originOK(req))return fail('Origem não autorizada',403);
 try{
  if(!clientId||!clientSecret||!redirect||!site||!encKey)throw Error('503|Google Agenda ainda não configurado');
  const {user,member}=await authMember(req);if(!hasPermission(member,'integrations.manage'))return fail('Sem permissão para Google Agenda',403);
  const body=await req.json();const action=String(body.action||'');
  if(action==='start'){
   const random=crypto.getRandomValues(new Uint8Array(32));const state=b64(random).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
   const {error}=await admin.from('fcap_oauth_states').insert({state_hash:await digest(state),user_id:user.id,expires_at:new Date(Date.now()+600000).toISOString()});
   if(error)throw Error('503|Não foi possível iniciar conexão');
   const params=new URLSearchParams({client_id:clientId,redirect_uri:redirect,response_type:'code',access_type:'offline',prompt:'consent',include_granted_scopes:'true',scope:'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly',state});
   return answer({url:'https://accounts.google.com/o/oauth2/v2/auth?'+params});
  }
  if(action==='list'){
   const token=await googleToken(user.id);const query=new URLSearchParams({timeMin:new Date().toISOString(),singleEvents:'true',orderBy:'startTime',maxResults:'25'});
   const items=await googleFetch('/calendars/primary/events?'+query,token);
   return answer({events:(items.items||[]).map(e=>({id:e.id,summary:e.summary,start:e.start,end:e.end}))});
  }
  if(action==='create'){
   if(!hasPermission(member,'agenda.edit'))return fail('Sem permissão para confirmar reunião',403);
   const id=String(body.meetingId||'');if(!/^[a-f0-9-]{36}$/i.test(id))return fail('Reunião inválida');
   const {data:m}=await admin.from('fcap_meetings').select('*').eq('id',id).maybeSingle();if(!m)return fail('Reunião não encontrada',404);
   if(m.assigned_to!==user.id)return fail('Você só pode adicionar reuniões atribuídas à sua própria agenda',403);
   if(m.status==='confirmada'||m.google_event_id)return fail('Reunião já confirmada',409);
   if(new Date(m.start_at).getTime()<Date.now())return fail('Reunião já passou',409);
   const token=await googleToken(user.id);
   const free=await googleFetch('/freeBusy',token,'POST',{timeMin:m.start_at,timeMax:m.end_at,items:[{id:'primary'}]});
   if((free.calendars?.primary?.busy||[]).length)return fail('Horário ocupado no Google Agenda. Ajuste a solicitação antes de confirmar',409);
   const lead=m.lead_id?(await admin.from('fcap_leads').select('company_name,contact_name,email').eq('id',m.lead_id).maybeSingle()).data:null;
   // ID determinístico: evita evento duplicado caso haja retry após falha de rede.
   // Google aceita 0-9 e a-v; UUID sem hífens respeita esta regra.
   const eventId='fcap'+id.replace(/-/g,'').toLowerCase();
   const event={id:eventId,summary:m.title,description:`FCAP Jr. · ${lead?.company_name||''}\n${m.notes||''}`,start:{dateTime:m.start_at,timeZone:'America/Recife'},end:{dateTime:m.end_at,timeZone:'America/Recife'}};
   const created=await googleFetch('/calendars/primary/events?sendUpdates=none',token,'POST',event);
   if(created.id!==eventId)throw Error('502|Google retornou um evento inesperado; reconcilie antes de repetir');
   const {data:updated,error}=await admin.from('fcap_meetings').update({status:'confirmada',google_event_id:created.id,google_calendar_owner:user.id}).eq('id',id).eq('status','solicitada').select('id').maybeSingle();
   if(error||!updated)throw Error('500|Evento criado no Google, mas confirmação no CRM não foi registrada; verifique os dois serviços antes de repetir');
   return answer({ok:true,message:'Reunião confirmada no Google Agenda e avisos gerados'});
  }
  return fail('Ação desconhecida');
 }catch(e){return errResponse(e)}
});
