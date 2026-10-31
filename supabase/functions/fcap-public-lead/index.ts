import {admin,answer,fail,preflight,originOK,digest} from '../_shared/common.ts';

Deno.serve(async req=>{
 const pf=preflight(req);if(pf)return pf;
 if(req.method!=='POST')return fail('Método não permitido',405);
 if(!originOK(req))return fail('Origem não autorizada',403);
 try{
  const body=await req.json();
  if(body.website)return answer({ok:true}); // honeypot: não informa ao robô
  const name=String(body.nome||'').trim().slice(0,120),company=String(body.empresa||'').trim().slice(0,180);
  const email=String(body.email||'').trim().slice(0,180),phone=String(body.celular||'').trim().slice(0,40);
  const need=String(body.necessidade||'').trim().slice(0,2000),segment=String(body.setor||'').trim().slice(0,100);
  const role=String(body.cargo||'').trim().slice(0,100);
  const day=String(body.data||''),time=String(body.horario||'');
  if(name.length<2||company.length<2||need.length<3||!/^\S+@\S+\.\S+$/.test(email)||phone.replace(/\D/g,'').length<10||body.consentimento!==true)return fail('Verifique os campos e o consentimento');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!/^\d{2}:\d{2}$/.test(time)||!['09:00','10:30','14:00','15:30','17:00'].includes(time))return fail('Data ou horário inválido');
  const chosen=new Date(`${day}T${time}:00-03:00`);
  if(!Number.isFinite(chosen.getTime())||chosen.getTime()<Date.now()+15*60000||chosen.getTime()>Date.now()+90*86400000)return fail('Escolha uma data futura válida');
  const secret=Deno.env.get('TURNSTILE_SECRET');
  if(!secret)return fail('Proteção anti-spam não configurada',503);
  const token=String(body.turnstileToken||'');if(!token)return fail('Confirme o desafio de segurança',400);
  const verify=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({secret,response:token,remoteip:(req.headers.get('cf-connecting-ip')||'')})});
  const result=await verify.json();if(!result.success)return fail('Verificação de segurança recusada',403);
  const host=new URL(Deno.env.get('FCAP_SITE_ORIGIN')||'https://example.com').hostname;
  if(result.hostname && result.hostname!==host)return fail('Domínio de validação incorreto',403);
  const ip=req.headers.get('cf-connecting-ip')||req.headers.get('x-forwarded-for')?.split(',')[0]||'unknown';
  const hash=await digest(ip+'|'+(Deno.env.get('FCAP_RATE_SALT')||'FCAP'));const since=new Date(Date.now()-3600000).toISOString();
  const {count,error:countError}=await admin.from('fcap_intake_attempts').select('*',{count:'exact',head:true}).eq('ip_hash',hash).gte('created_at',since);
  if(countError)return fail('Verificação de limite indisponível',503);
  if((count||0)>=5)return fail('Limite temporário de solicitações atingido',429);
  const {error:rateError}=await admin.from('fcap_intake_attempts').insert({ip_hash:hash});if(rateError)return fail('Não foi possível validar solicitação',503);
  const {data:stage,error:stageError}=await admin.from('fcap_stages').select('id').eq('name','Novo lead').single();
  if(stageError||!stage)return fail('CRM ainda não preparado',503);
  const {error}=await admin.from('fcap_leads').insert({company_name:company,contact_name:name,email,phone,segment,role_title:role,need,source:'site_diagnostico',stage_id:stage.id,requested_day:day,requested_time:time});
  if(error)return fail('Não foi possível registrar sua solicitação',503);
  return answer({ok:true,status:'recebida'});
 }catch{return fail('Dados inválidos',400)}
});
