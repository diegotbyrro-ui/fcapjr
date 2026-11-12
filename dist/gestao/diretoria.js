// FCAP JR R36 - primeiro cadastro pelo convite gerado no CRM, sem envio de email.
// Regras de perfil e permissao estao SEMPRE no servidor (fcap-members).
'use strict';
const EMAIL='diretoria.marketing@fcapjr.com.br';
const cfg=window.FCAP_CONFIG||{};
const configured=/^https:\/\/[a-z0-9.-]+\/?$/i.test(cfg.supabaseUrl||'')&&typeof cfg.supabaseAnonKey==='string'&&cfg.supabaseAnonKey.length>10;
const $=id=>document.getElementById(id);
let auth=null,member=null,working=false;
const nodes={loading:$('loading'),access:$('access'),activation:$('activation-form'),profile:$('profile-form'),success:$('success'),msg:$('message')};
function notice(txt,bad=false){nodes.msg.hidden=false;nodes.msg.className='message'+(bad?' error':'');nodes.msg.textContent=txt}
function screen(key){for(const k of ['loading','access','activation','profile','success'])nodes[k].hidden=k!==key}
function phone(value){const d=String(value||'').replace(/\D/g,'');const n=d.startsWith('55')&&[12,13].includes(d.length)?d.slice(2):d;return /^\d{10,11}$/.test(n)?'+55'+n:null}
function nameValid(s){return s.length>=2&&s.length<=120&&!/[<>\u0000-\u001f]/.test(s)}
function isInitial(m){return m.full_name==='Diretoria FCAP Jr.'&&!String(m.phone||'').trim()}
async function authenticatedDirector(){
 const r=await auth.auth.getUser();if(r.error||!r.data?.user||String(r.data.user.email||'').toLowerCase()!==EMAIL)return null;
 const x=await auth.from('fcap_members').select('user_id,full_name,phone,email,role,active').eq('user_id',r.data.user.id).maybeSingle();
 if(x.error||!x.data||x.data.role!=='diretor'||String(x.data.email||'').toLowerCase()!==EMAIL||!(x.data.active===true||(x.data.active===false&&isInitial(x.data))))return null;
 return x.data;
}
async function invoke(body){const r=await auth.functions.invoke('fcap-director-portal',{body});if(r.error)throw new Error('Falha ao comunicar com o servidor da Diretoria.');if(r.data?.error)throw new Error(r.data.error);if(r.data?.ok!==true)throw new Error('O servidor nao confirmou a alteracao.');return r.data}
function activateForm(m){
 member=m;nodes.msg.hidden=true;
 if(isInitial(m)){screen('activation');return}
 $('profile-name').value=m.full_name||'';$('profile-phone').value=m.phone||'';screen('profile')
}
async function init(){
 screen('loading');if(!configured){screen('access');notice('Supabase nao configurado. Avise o Administrador.',true);return}
 // O link do WhatsApp leva primeiro a esta pagina; a confirmacao e voluntaria.
 // Evita que um robo de previa de links consuma o token do Supabase Auth.
 const invite=new URLSearchParams(location.hash.replace(/^#/, '')).get('convite');
 if(invite){
  try{
   const u=new URL(invite),supabaseURL=new URL(cfg.supabaseUrl);
   if(u.protocol!=='https:'||u.origin!==supabaseURL.origin||!/\/auth\/v1\/verify$/.test(u.pathname))throw Error('Link de convite invalido.');
   $('claim-invite').hidden=false;screen('access');notice('Seu convite foi recebido. Clique em Confirmar meu convite para abrir o cadastro.');
   $('claim-invite').addEventListener('click',()=>{window.location.assign(u.href)},{once:true});
   return;
  }catch{screen('access');notice('O link nao e um convite valido. Solicite outro ao Administrador.',true);return}
 }
 try{
  const lib=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.0/+esm');
  auth=lib.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  // A verificacao do convite e o processamento de URL ficam por conta do Auth oficial.
  const m=await authenticatedDirector();
  if(!m){screen('access');if(new URLSearchParams(location.hash.slice(1)).get('error_description'))notice('O link expirou ou nao foi aceito. Solicite um novo link ao Administrador.',true);return}
  activateForm(m);
 }catch{screen('access');notice('Nao foi possivel validar sua identidade. Tente abrir o convite novamente.',true)}
}
$('activation-form').addEventListener('submit',async e=>{
 e.preventDefault();if(working||!auth||!member||!isInitial(member))return;
 const f=new FormData(e.currentTarget),full_name=String(f.get('full_name')||'').trim(),p=phone(f.get('phone'));
 const password=String(f.get('password')||''),confirm=String(f.get('confirm_password')||'');
 if(!nameValid(full_name)||!p)return notice('Confira seu nome e telefone com DDD.',true);
 if(password.length<12||password.length>128||password!==confirm)return notice('A senha deve ter 12 a 128 caracteres e corresponder a confirmacao.',true);
 working=true;$('activation-submit').disabled=true;nodes.msg.hidden=true;
 try{
  const check=await authenticatedDirector();if(!check||!isInitial(check))throw Error('Este cadastro ja foi concluido ou nao esta autorizado.');
  await invoke({action:'complete_director_activation',full_name,phone:p,password});
  await auth.auth.signOut({scope:'global'});screen('success');notice('Cadastro concluido com sucesso. Entre usando seu e-mail institucional e nova senha.');
 }catch(err){notice(err.message||'Erro ao concluir cadastro.',true)}
 finally{working=false;$('activation-submit').disabled=false}
});
$('profile-form').addEventListener('submit',async e=>{
 e.preventDefault();if(working||!auth||!member||isInitial(member))return;
 const f=new FormData(e.currentTarget),full_name=String(f.get('full_name')||'').trim(),p=phone(f.get('phone'));
 const current_password=String(f.get('current_password')||''),new_password=String(f.get('new_password')||''),confirmation=String(f.get('confirm_password')||'');
 if(!nameValid(full_name)||!p)return notice('Informe nome e telefone validos.',true);
 if(!current_password)return notice('Informe sua senha atual para autorizar a alteracao.',true);
 if(new_password&&(new_password.length<12||new_password.length>128||new_password!==confirmation))return notice('Nova senha invalida ou sem confirmacao correspondente.',true);
 if(!new_password&&confirmation)return notice('Preencha a nova senha antes de confirmar.',true);
 working=true;$('profile-submit').disabled=true;nodes.msg.hidden=true;
 try{
  await invoke({action:'update_self_secure',full_name,phone:p,current_password,new_password});
  await auth.auth.signOut({scope:'global'});screen('success');notice('Seus dados foram salvos. Entre novamente para continuar.');
 }catch(err){notice(err.message||'Nao foi possivel salvar os dados.',true)}
 finally{working=false;$('profile-submit').disabled=false; $('current-password').value=''; $('new-password').value=''; $('confirm-password').value=''}
});
init();
