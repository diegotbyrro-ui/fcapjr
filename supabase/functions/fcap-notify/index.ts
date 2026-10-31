import {admin,answer,fail} from '../_shared/common.ts';

const safePhone=p=>String(p||'').replace(/\D/g,'');
async function email(to,subject,body){const key=Deno.env.get('RESEND_API_KEY'),from=Deno.env.get('FCAP_EMAIL_FROM');if(!key||!from)throw Error('E-mail não configurado');const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{'Authorization':'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({from,to,subject,text:body})});if(!r.ok)throw Error('Falha no provedor de e-mail')}
async function whatsapp(to,message){const token=Deno.env.get('META_WA_TOKEN'),id=Deno.env.get('META_PHONE_NUMBER_ID'),template=Deno.env.get('META_WA_TEMPLATE'),version=Deno.env.get('META_GRAPH_VERSION')||'v23.0';if(!token||!id||!template)throw Error('WhatsApp não configurado');const phone=safePhone(to);if(phone.length<12||phone.length>15)throw Error('Telefone internacional inválido');const r=await fetch(`https://graph.facebook.com/${version}/${id}/messages`,{method:'POST',headers:{'Authorization':'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({messaging_product:'whatsapp',to:phone,type:'template',template:{name:template,language:{code:'pt_BR'},components:[{type:'body',parameters:[{type:'text',text:message.slice(0,900)}]}]}})});if(!r.ok)throw Error('WhatsApp não aceitou o template')}
Deno.serve(async req=>{
 if(req.method!=='POST')return fail('Método não permitido',405);
 const secret=Deno.env.get('FCAP_CRON_SECRET')||'';
 if(secret.length<32||req.headers.get('x-fcap-cron-secret')!==secret)return fail('Não autorizado',401);
 try{
  const now=Date.now(),oneHour=new Date(now+3600000).toISOString(),past=new Date(now-300000).toISOString();
  const [{data:tasks},{data:meetings}]=await Promise.all([
   admin.from('fcap_tasks').select('id,title,assigned_to').is('completed_at',null).gte('due_at',past).lte('due_at',oneHour),
   admin.from('fcap_meetings').select('id,title,assigned_to,lead_id').eq('status','confirmada').gte('start_at',past).lte('start_at',oneHour)
  ]);
  const queue=[];
  for(const t of tasks||[])if(t.assigned_to)queue.push({recipient_id:t.assigned_to,category:'lembrete_tarefa',message:'Tarefa próxima do prazo: '+t.title,dedupe_key:'task_due:'+t.id});
  for(const m of meetings||[])if(m.assigned_to)queue.push({recipient_id:m.assigned_to,category:'lembrete_reuniao',message:'Reunião próxima: '+m.title,meeting_id:m.id,lead_id:m.lead_id,dedupe_key:'meeting_due:'+m.id});
  for(const entry of queue)await admin.from('fcap_alerts').upsert(entry,{onConflict:'recipient_id,dedupe_key',ignoreDuplicates:true});
  const {data:alerts,error}=await admin.from('fcap_alerts').select('id,recipient_id,category,message,created_at').order('created_at',{ascending:true}).limit(100);
  if(error)throw error;
  const userIds=[...new Set((alerts||[]).map(a=>a.recipient_id))];const {data:members}=await admin.from('fcap_members').select('user_id,notify_email,notify_whatsapp,phone,active').in('user_id',userIds.length?userIds:['00000000-0000-0000-0000-000000000000']);
  const memberById=new Map<string,{user_id:string;active:boolean;notify_email:boolean;notify_whatsapp:boolean;phone:string|null}>((members||[]).map(m=>[m.user_id,m]));let sent=0,failed=0;
  for(const alert of alerts||[]){const m=memberById.get(alert.recipient_id);if(!m?.active)continue;
   const channels=[...(m.notify_email?['email']:[]),...(m.notify_whatsapp?['whatsapp']:[])];
   for(const channel of channels){
    const {data:prev}=await admin.from('fcap_delivery_log').select('status,attempts').eq('alert_id',alert.id).eq('channel',channel).maybeSingle();
    if(prev?.status==='sent'||(prev?.attempts||0)>=3)continue;
    try{
     if(channel==='email'){const {data:u,error:e}=await admin.auth.admin.getUserById(m.user_id);if(e||!u.user?.email)throw Error('E-mail do usuário não encontrado');await email(u.user.email,'FCAP Jr. · '+alert.category,alert.message)}
     else await whatsapp(m.phone,alert.message);
     await admin.from('fcap_delivery_log').upsert({alert_id:alert.id,channel,status:'sent',attempts:(prev?.attempts||0)+1,last_error:'',updated_at:new Date().toISOString()});sent++;
    }catch(e){await admin.from('fcap_delivery_log').upsert({alert_id:alert.id,channel,status:'failed',attempts:(prev?.attempts||0)+1,last_error:String(e?.message||'Erro').slice(0,190),updated_at:new Date().toISOString()});failed++}
   }
  }
  return answer({ok:true,alerts:(alerts||[]).length,sent,failed});
 }catch{return fail('Falha na rotina de notificações',500)}
});
