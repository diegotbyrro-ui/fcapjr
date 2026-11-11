// FCAPJR_R33_PORTAL_DIRETORIA
// Portal institucional. Nao cria contas, nao inclui service_role e nao altera permissoes.
'use strict';
const DIRECTOR_EMAIL='diretoria.marketing@fcapjr.com.br';
const cfg=window.FCAP_CONFIG||{};
const readyConfig=/^https:\/\/[a-z0-9.-]+\/?$/i.test(cfg.supabaseUrl||'')&&typeof cfg.supabaseAnonKey==='string'&&cfg.supabaseAnonKey.length>10;
const $=(id)=>document.getElementById(id);
const notice=$('message'),access=$('access-section'),profile=$('profile-form'),success=$('success-section');
const requestButton=$('request-link'),handoverButton=$('handover-link'),saveButton=$('save-profile');
let client=null,verifiedDirector=false,submitting=false;
function report(message,error=false){notice.hidden=false;notice.textContent=message;notice.className='message'+(error?' error':'')}
function show(which){access.hidden=which!=='access';profile.hidden=which!=='profile';success.hidden=which!=='success';}
function phoneNational(input){
 const digits=String(input||'').replace(/\D/g,'');
 const n=digits.startsWith('55')&&(digits.length===12||digits.length===13)?digits.slice(2):digits;
 return /^\d{10,11}$/.test(n)?n:null;
}
function safeRecoverUrl(){return new URL('./login.html?mode=reset',window.location.href).href}
async function sendLink(){
 if(!client)return report('Conexao nao inicializada.',true);
 requestButton.disabled=true;handoverButton.disabled=true;notice.hidden=true;
 try{
  // O link apenas comprova o controle do e-mail reservado. Nunca cria usuarios.
  const {error}=await client.auth.resetPasswordForEmail(DIRECTOR_EMAIL,{redirectTo:safeRecoverUrl()});
  if(error)throw error;
  report('Se a Diretoria ja estiver autorizada, um link seguro sera enviado ao e-mail institucional. Acesse esse e-mail e conclua o cadastro.',false);
 }catch{
  report('Nao foi possivel solicitar o link. Confira as configuracoes de Auth e os URLs autorizados. Tente novamente mais tarde.',true);
 }finally{requestButton.disabled=false;handoverButton.disabled=false;}
}
async function getInstitutionalAccount(){
 const {data:userData,error:authError}=await client.auth.getUser();
 if(authError||!userData?.user)return null;
 const user=userData.user;
 if(String(user.email||'').toLowerCase()!==DIRECTOR_EMAIL)return null;
 const {data:member,error}=await client.from('fcap_members')
  .select('user_id,full_name,email,role,active,phone')
  .eq('user_id',user.id).maybeSingle();
 if(error||!member||member.active!==true||member.role!=='diretor'||String(member.email||'').toLowerCase()!==DIRECTOR_EMAIL)return null;
 return member;
}
async function saveProfile(event){
 event.preventDefault();if(submitting||!client||!verifiedDirector)return;
 const name=String($('full-name').value||'').trim();
 const phone=phoneNational($('phone').value);
 const password=$('new-password').value,confirm=$('confirm-password').value;
 if(name.length<2||name.length>120)return report('Informe o nome completo (2 a 120 caracteres).',true);
 if(!phone)return report('Informe um telefone brasileiro com DDD (10 ou 11 digitos).',true);
 if(password.length<12||password.length>128)return report('A senha deve ter entre 12 e 128 caracteres.',true);
 if(password!==confirm)return report('As senhas informadas nao sao iguais.',true);
 submitting=true;saveButton.disabled=true;notice.hidden=true;
 try{
  const member=await getInstitutionalAccount();
  if(!member)throw Error('Conta institucional sem autorizacao ativa. Solicite acesso ao Administrador.');
  const {error:passError}=await client.auth.updateUser({password});
  if(passError)throw Error('Nao foi possivel definir a senha. Solicite um novo link de verificacao.');
  const response=await client.functions.invoke('fcap-members',{body:{action:'update_self_profile',full_name:name,phone}});
  if(response.error||response.data?.ok!==true){
   await client.auth.signOut({scope:'global'});
   verifiedDirector=false;show('access');
   throw Error('A senha foi alterada, mas o nome ou telefone nao foi salvo. Peca ao Administrador para conferir a conta e solicite um novo link.');
  }
  const logout=await client.auth.signOut({scope:'global'});
  verifiedDirector=false;
  profile.reset();
  window.history.replaceState(null,'',window.location.pathname);
  show('success');
  report(logout.error?'Dados e senha atualizados. Por seguranca, encerre sessoes anteriores em outros dispositivos.':'Dados, telefone e senha atualizados. As sessoes renovaveis foram encerradas.',false);
 }catch(e){report(e instanceof Error?e.message:'Falha na atualizacao institucional.',true)}
 finally{submitting=false;saveButton.disabled=false;}
}
async function init(){
 $('fixed-email').textContent=DIRECTOR_EMAIL;
 show('access');
 if(!readyConfig){report('Conexao do CRM ainda nao configurada. Procure o Administrador.',true);return}
 try{
  const {createClient}=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.0/+esm');
  client=createClient(cfg.supabaseUrl,cfg.supabaseAnonKey,{auth:{persistSession:true,autoRefreshToken:true}});
  requestButton.disabled=false;
  const member=await getInstitutionalAccount();
  if(!member){
   // Nao expor dados ou oferecer cadastro a contas sem perfil de Diretor ativo.
   const {data}=await client.auth.getUser();
   if(data?.user)report('Esta pagina e exclusiva da Diretoria autorizada. Entre com o e-mail institucional ou solicite liberacao ao Administrador.',true);
   return;
  }
  verifiedDirector=true;
  $('full-name').value=member.full_name==='Diretoria FCAP Jr.'?'':String(member.full_name||'');
  $('phone').value=String(member.phone||'');
  show('profile');
  if(new URLSearchParams(location.search).get('mode')==='complete')report('E-mail institucional confirmado. Informe o nome e telefone do Diretor atual e crie sua nova senha.');
 }catch{report('Nao foi possivel conectar ao serviço de autenticacao. Tente novamente.',true)}
}
requestButton.addEventListener('click',sendLink);
handoverButton.addEventListener('click',sendLink);
profile.addEventListener('submit',saveProfile);
init();
