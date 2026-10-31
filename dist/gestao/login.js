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
async function initLogin(){
  const state=new URLSearchParams(window.location.search).get('status');
  if(state==='unauthorized')notice('Seu usuário não está habilitado na gestão. Solicite acesso ao administrador.');
  if(!isConfigured){notice('Login ainda não ativado. Configure a URL e a chave pública do Supabase da FCAP Jr. em fcap-config.js.',true);return}
  try{
    const lib=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.0/+esm');
    auth=lib.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey,{auth:{persistSession:true,autoRefreshToken:true}});
    const {data:{user},error}=await auth.auth.getUser();
    if(!error&&user){const {data}=await auth.from('fcap_members').select('user_id').eq('user_id',user.id).eq('active',true).maybeSingle();if(data){goToPanel();return}}
    submit.disabled=false;
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
