// Entrada exclusiva por Supabase Auth. Nunca incluir tokens privados nesta pagina.
const form=document.querySelector('#login-form');
const message=document.querySelector('#message');
const submit=document.querySelector('#submit');
const password=document.querySelector('#password');
const toggle=document.querySelector('#toggle-password');
const cfg=window.FCAP_CONFIG||{};
let auth=null;
const isConfigured=/^https:\/\/[a-z0-9.-]+\/?$/i.test(cfg.supabaseUrl||'')&&typeof cfg.supabaseAnonKey==='string'&&cfg.supabaseAnonKey.length>10;
function notice(text,info=false){message.textContent=text;message.className='message'+(info?' info':'');message.hidden=false}
function goToPanel(){window.location.replace('./')}
toggle.addEventListener('click',()=>{const shown=password.type==='text';password.type=shown?'password':'text';toggle.textContent=shown?'Mostrar':'Ocultar';toggle.setAttribute('aria-pressed',String(!shown));toggle.setAttribute('aria-label',shown?'Mostrar senha':'Ocultar senha')});
// FCAPJR_R30_AUTH - convite e recuperacao de senha pela sessao verificada do Supabase.
const recoveryForm=document.querySelector('#recovery-form');
const setPasswordForm=document.querySelector('#set-password-form');
const recoveryReturn=document.querySelector('#password-recovery-return');
const requestPasswordButton=document.querySelector('#request-password-link');
const recoverySubmit=document.querySelector('#recovery-submit');
const setPasswordSubmit=document.querySelector('#set-password-submit');
const tokenParameters=new URLSearchParams(window.location.hash.replace(/^#/,''));
const authMode=new URLSearchParams(window.location.search).get('mode');
let needsPassword=authMode==='reset'||['recovery','invite'].includes(tokenParameters.get('type'));
function showAuthMode(mode){
 form.hidden=mode!=='login';
 recoveryForm.hidden=mode!=='recovery';
 setPasswordForm.hidden=mode!=='set';
 requestPasswordButton.parentElement.hidden=mode!=='login';
 recoveryReturn.hidden=mode==='login';
}
function loginButtonReady(){submit.disabled=false;submit.textContent='Entrar no painel'}
requestPasswordButton.addEventListener('click',()=>{
 message.hidden=true;
 const existing=String(form.querySelector('[name=email]')?.value||'').trim();
 recoveryForm.querySelector('[name=email]').value=existing;
 showAuthMode('recovery');
});
document.querySelector('#back-to-login').addEventListener('click',()=>{
 needsPassword=false;
 message.hidden=true;
 window.history.replaceState(null,'',window.location.pathname);
 showAuthMode('login');
 loginButtonReady();
});
recoveryForm.addEventListener('submit',async e=>{
 e.preventDefault();if(!auth||recoverySubmit.disabled)return;
 recoverySubmit.disabled=true;message.hidden=true;
 try{
  const email=String(new FormData(recoveryForm).get('email')||'').trim().toLowerCase();
  // URL sempre fixa no proprio dominio da plataforma, sem redirecionamento arbitrario.
  const redirectTo=new URL('./login.html?mode=reset',window.location.href).href;
  const {error}=await auth.auth.resetPasswordForEmail(email,{redirectTo});
  if(error)throw error;
  notice('Se este e-mail estiver autorizado, voce recebera um link para definir sua senha. Confira tambem o spam.',true);
 }catch(err){notice('Nao foi possivel enviar o link. Verifique as configuracoes de e-mail e URLs permitidas do Auth.');}
 finally{recoverySubmit.disabled=false;}
});
setPasswordForm.addEventListener('submit',async e=>{
 e.preventDefault();if(!auth||setPasswordSubmit.disabled)return;
 const payload=new FormData(setPasswordForm),next=String(payload.get('password')||''),confirm=String(payload.get('confirm_password')||'');
 if(next.length<12||next.length>128){notice('Crie uma senha de 12 a 128 caracteres.');return}
 if(next!==confirm){notice('As senhas nao conferem.');return}
 setPasswordSubmit.disabled=true;message.hidden=true;
 try{
  const {data:userData,error:sessionError}=await auth.auth.getUser();
  if(sessionError||!userData?.user)throw Error('Sessao de verificacao ausente. Solicite novo link.');
  const {error}=await auth.auth.updateUser({password:next});
  if(error)throw error;
  // Revogar refresh tokens de outras sessoes da mesma conta, importante na troca anual.
  const out=await auth.auth.signOut({scope:'global'});
  setPasswordForm.reset();needsPassword=false;
  window.history.replaceState(null,'',window.location.pathname);
  showAuthMode('login');loginButtonReady();
  notice(out?.error?'Senha alterada. Por seguranca, encerre quaisquer outras sessoes ativas e entre novamente.':'Senha definida. Entre com o e-mail corporativo e sua nova senha.',true);
 }catch(err){notice('Nao foi possivel concluir a alteracao. Se o link tiver expirado, solicite outro.');}
 finally{setPasswordSubmit.disabled=false;}
});

async function initLogin(){
  const state=new URLSearchParams(window.location.search).get('status');
  if(state==='unauthorized')notice('Seu usuário não está habilitado na gestão. Solicite acesso ao administrador.');
  if(!isConfigured){notice('Login ainda não ativado. Configure a URL e a chave pública do Supabase da FCAP Jr. em fcap-config.js.',true);return}
  try{
    const lib=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.0/+esm');
    auth=lib.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey,{auth:{persistSession:true,autoRefreshToken:true}});
    auth.auth.onAuthStateChange((event,s)=>{
      if(event==='PASSWORD_RECOVERY'){needsPassword=true;showAuthMode('set');notice('Link validado. Agora escolha sua nova senha.',true)}
      else if(event==='SIGNED_IN'&&needsPassword&&s){showAuthMode('set');}
    });
    const {data:{user},error}=await auth.auth.getUser();
    if(needsPassword){
      if(!error&&user){showAuthMode('set');notice('Sua identidade foi confirmada. Defina sua senha.',true)}
      else{showAuthMode('recovery');notice('O link pode estar expirado. Solicite novo e-mail de verificacao.',true)}
      loginButtonReady();return;
    }
    if(!error&&user){const {data}=await auth.from('fcap_members').select('user_id').eq('user_id',user.id).eq('active',true).maybeSingle();if(data){goToPanel();return}}
    showAuthMode('login');loginButtonReady();
  }catch{notice('Não foi possível conectar ao serviço de autenticação. Tente novamente.');submit.disabled=true}
}
form.addEventListener('submit',async event=>{
  event.preventDefault();if(!auth||submit.disabled)return;
  submit.disabled=true;submit.textContent='Verificando acesso...';message.hidden=true;
  try{
    const email=String(new FormData(form).get('email')||'').trim();
    const pass=String(new FormData(form).get('password')||'');
    const {data,error}=await auth.auth.signInWithPassword({email,password:pass});
    if(error||!data?.user){notice('E-mail ou senha inválidos.');return}
    const {data:member,error:memberError}=await auth.from('fcap_members').select('user_id').eq('user_id',data.user.id).eq('active',true).maybeSingle();
    if(memberError||!member){await auth.auth.signOut();notice('Seu usuário ainda não está habilitado no CRM. Solicite liberação ao administrador.');return}
    goToPanel();
  }catch{notice('Não foi possível concluir o login. Confira sua conexão e tente novamente.')}
  finally{submit.disabled=false;submit.textContent='Entrar no painel'}
});
initLogin();
