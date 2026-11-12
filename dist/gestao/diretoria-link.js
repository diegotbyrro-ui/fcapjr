// FCAP Jr. R36 — link de convite exclusivo do Administrador, sem envio de e-mail.
'use strict';
const cfg=window.FCAP_CONFIG||{};
const $=id=>document.getElementById(id);
const EMAIL='diretoria.marketing@fcapjr.com.br';
let auth=null,action=null,secretLink=null,submitting=false;
function message(text,error=false){const e=$('message');e.hidden=false;e.textContent=text;e.className='message'+(error?' error':'')}
function showTools(){ $('loading').hidden=true;$('tools').hidden=false }
async function start(){
 if(!/^https:\/\/[a-z0-9.-]+\/?$/i.test(cfg.supabaseUrl||'')||!cfg.supabaseAnonKey){$('loading').hidden=true;message('Configuração do Supabase não encontrada.',true);return}
 try{
  const lib=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.0/+esm');
  auth=lib.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey,{auth:{persistSession:true,autoRefreshToken:true}});
  const u=await auth.auth.getUser();if(u.error||!u.data?.user)throw Error('Entre no CRM como Administrador antes de gerar um convite.');
  const r=await auth.from('fcap_members').select('role,active').eq('user_id',u.data.user.id).maybeSingle();
  if(r.error||!r.data||r.data.role!=='admin'||r.data.active!==true)throw Error('Somente a conta Administrador pode emitir o convite.');
  const d=await auth.from('fcap_members').select('user_id,full_name,phone,email,active').eq('role','diretor').limit(2);
  if(d.error)throw Error('Não foi possível conferir a conta da Diretoria.');
  if((d.data||[]).length>1)throw Error('Inconsistência: existe mais de um Diretor. Não será criado convite.');
  const person=d.data?.[0];
  if(!person){action='generate_director_link';$('stage-title').textContent='Primeiro cadastro da Diretoria';$('stage-note').textContent='Gere um link único e encaminhe diretamente ao Diretor. Ele informará nome, telefone e senha.';$('generate').disabled=false}
  else if(person.full_name==='Diretoria FCAP Jr.'&&!String(person.phone||'').trim()&&String(person.email||'').toLowerCase()===EMAIL){action='reissue_director_link';$('stage-title').textContent='Cadastro ainda não concluído';$('stage-note').textContent='Já existe uma conta institucional reservada. Você pode gerar outro link temporário para concluir o primeiro cadastro.';$('generate').textContent='Gerar outro link de cadastro';$('generate').disabled=false}
  else{action=null;$('stage-title').textContent='Diretor já cadastrado';$('stage-note').textContent='O Diretor já ocupa a conta institucional. Somente ele pode mudar nome, telefone e senha pelo próprio portal.';$('generate').hidden=true}
  showTools();
 }catch(e){$('loading').hidden=true;message(e.message||'Não foi possível verificar o acesso.',true)}
}
$('generate').addEventListener('click',async()=>{
 if(!auth||!action||submitting)return;
 submitting=true;$('generate').disabled=true;$('message').hidden=true;$('link-panel').hidden=true;secretLink=null;
 try{
  const out=await auth.functions.invoke('fcap-director-portal',{body:{action}});
  if(out.error||out.data?.ok!==true||typeof out.data?.link!=='string')throw Error(out.data?.error||'O servidor não conseguiu gerar o link.');
  const u=new URL(out.data.link),project=new URL(cfg.supabaseUrl);if(u.protocol!=='https:'||u.origin!==project.origin||!/\/auth\/v1\/verify$/.test(u.pathname))throw Error('O servidor forneceu um link inválido.');
  const share=new URL('./diretoria.html',window.location.href);share.hash='convite='+encodeURIComponent(u.href);
  secretLink=share.href;$('director-link').value=secretLink;$('link-panel').hidden=false;
  message('Link criado. Copie e envie ao Diretor em uma conversa privada.');
  action='reissue_director_link';$('stage-title').textContent='Convite emitido';$('stage-note').textContent='Este link é sensível e temporário. Se expirar antes do cadastro, você poderá gerar outro.';
  $('generate').textContent='Gerar outro link';
 }catch(e){message(e.message||'Falha ao gerar o convite.',true)}
 finally{submitting=false;$('generate').disabled=false}
});
$('copy-link').addEventListener('click',async()=>{
 if(!secretLink)return;
 try{await navigator.clipboard.writeText(secretLink);message('Link copiado. Envie somente ao Diretor autorizado.');}
 catch{$('director-link').focus();$('director-link').select();message('Selecione e copie o link exibido. Não compartilhe em público.')}
});
start();
