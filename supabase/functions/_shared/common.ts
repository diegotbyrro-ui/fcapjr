import { createClient } from 'npm:@supabase/supabase-js@2';

const url=Deno.env.get('SUPABASE_URL')||'';
const anon=Deno.env.get('SUPABASE_ANON_KEY')||Deno.env.get('SUPABASE_PUBLISHABLE_KEY')||'';
const service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||Deno.env.get('SUPABASE_SECRET_KEY')||'';
export const admin=createClient(url,service,{auth:{autoRefreshToken:false,persistSession:false}});
export const origin=Deno.env.get('FCAP_SITE_ORIGIN')||'';
export const cors={
 'Access-Control-Allow-Origin':origin,
 'Access-Control-Allow-Methods':'POST, GET, OPTIONS',
 'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
 'Vary':'Origin', 'Content-Type':'application/json; charset=utf-8'
};
export function answer(value,status=200){return new Response(JSON.stringify(value),{status,headers:cors})}
export function preflight(req){if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});return null}
export function originOK(req){return !!origin && req.headers.get('origin')===origin}
export function fail(message,status=400){return answer({error:message},status)}
export async function authMember(req){
 const token=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
 if(!token)throw new Error('401|Sessão ausente');
 const client=createClient(url,anon,{global:{headers:{Authorization:'Bearer '+token}},auth:{autoRefreshToken:false,persistSession:false}});
 const {data,error}=await client.auth.getUser(token);
 if(error||!data.user)throw new Error('401|Sessão inválida');
 const {data:member,error:err}=await admin.from('fcap_members').select('user_id,full_name,role,active,phone,email,permissions,notify_email,notify_whatsapp').eq('user_id',data.user.id).eq('active',true).maybeSingle();
 if(err||!member)throw new Error('403|Acesso não autorizado');
 return {user:data.user,member};
}
export function hasPermission(m,p){return !!m&&(m.role==='admin'||(Array.isArray(m.permissions)?m.permissions:[]).includes(p))}
export function canSales(m){return hasPermission(m,'leads.view')||hasPermission(m,'pipeline.view')}
export function errResponse(e){const msg=String(e?.message||e||'Falha interna');const match=msg.match(/^(\d{3})\|(.+)$/);return fail(match?match[2]:'Falha ao processar a solicitação',match?Number(match[1]):500)}
export async function digest(text){const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));return [...new Uint8Array(buf)].map(x=>x.toString(16).padStart(2,'0')).join('')}
export function safeHttps(url){try{const u=new URL(url);return u.protocol==='https:'?u.href:''}catch{return ''}}
export function extractResponseText(payload){if(typeof payload.output_text==='string')return payload.output_text;for(const item of payload.output||[])for(const part of item.content||[])if(typeof part.text==='string')return part.text;return ''}
export async function openai(instructions,input,web=false,maxTokens=1600){
 const key=Deno.env.get('OPENAI_API_KEY');if(!key)throw new Error('503|OpenAI não configurada');
 const r=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{'Authorization':'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({model:Deno.env.get('OPENAI_MODEL')||'gpt-5-mini',instructions,input,tools:web?[{type:'web_search'}]:undefined,max_output_tokens:Math.max(800,Math.min(4000,Number(maxTokens)||1600))})});
 const data=await r.json();if(!r.ok)throw new Error('502|Falha no serviço de IA');
 return extractResponseText(data);
}
export function parseJSON(text){try{return JSON.parse(text)}catch{const block=text.match(/```(?:json)?\s*([\s\S]*?)```/);if(block)return JSON.parse(block[1]);const start=text.indexOf('{'),end=text.lastIndexOf('}');if(start!==-1&&end>start)return JSON.parse(text.slice(start,end+1));throw new Error('502|Resposta inválida da IA')}}
