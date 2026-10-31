// FCAP Jr. | Cadastro e configuracao de funcionarios.
// Invocacao autorizada: admin ativo. Sem senha ou service role no navegador.
import {admin,answer,fail,preflight,originOK,authMember,errResponse} from '../_shared/common.ts';

const roles=['admin','gestor','vendedor','marketing'];
const capabilities=[
 'dashboard.view','pipeline.view','leads.view','leads.edit','leads.export',
 'reports.view','agenda.view','agenda.edit','alerts.view','secretary.use',
 'integrations.manage','prospector.use','analyst.use','blog.view','blog.edit','team.manage'
];
const emailPattern=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
function cleanPermissions(v:unknown,role:string){
 if(!Array.isArray(v) || v.length>capabilities.length)return null;
 const requested=[...new Set(v.map(x=>String(x)))];
 if(requested.some(x=>!capabilities.includes(x)))return null;
 // Unico papel que pode alterar contas e conceder acesso administrativo.
 if(role!=='admin' && requested.includes('team.manage'))return null;
 return role==='admin'?capabilities:requested;
}
function normalize(input:Record<string,unknown>){
 const full_name=String(input.full_name||'').trim().slice(0,120);
 const email=String(input.email||'').trim().toLowerCase().slice(0,254);
 const phone=String(input.phone||'').trim().slice(0,35);
 const role=String(input.role||'');
 const active=input.active===true;
 const permissions=cleanPermissions(input.permissions,role);
 if(full_name.length<2||full_name.length>120)throw Error('400|Informe nome com 2 a 120 caracteres');
 if(!emailPattern.test(email))throw Error('400|Informe um e-mail valido');
 if(!roles.includes(role)||!permissions)throw Error('400|Cargo ou permissoes invalidas');
 return {full_name,email,phone,role,active,permissions};
}
async function findAuthUserByEmail(email:string){
 // A API administrativa nao fornece busca direta por e-mail em todas as versoes.
 // Pesquisa paginada e limitada, sempre no servidor (nunca no browser).
 for(let page=1;page<=20;page++){
  const {data,error}=await admin.auth.admin.listUsers({page,perPage:200});
  if(error)throw Error('503|Nao foi possivel consultar contas existentes');
  const user=(data.users||[]).find(u=>u.email?.toLowerCase()===email);
  if(user)return user;
  if((data.users||[]).length<200)break;
 }
 return null;
}
Deno.serve(async req=>{
 const pf=preflight(req);if(pf)return pf;
 if(req.method!=='POST')return fail('Metodo nao permitido',405);
 if(!originOK(req))return fail('Origem nao autorizada',403);
 try{
  const {user,member}=await authMember(req);
  if(member.role!=='admin')return fail('Somente administradores podem gerenciar funcionarios',403);
  const body=await req.json() as Record<string,unknown>;
  const action=String(body.action||'');
  if(!['invite','update'].includes(action))return fail('Acao desconhecida',400);
  const value=normalize(body);
  if(action==='update'){
   const user_id=String(body.user_id||'');
   if(!uuid.test(user_id))return fail('Identificador invalido',400);
   if(user_id===user.id)return fail('Alteracoes na propria conta exigem outro administrador',403);
   const {data:target,error}=await admin.from('fcap_members').select('user_id,email,role,active').eq('user_id',user_id).maybeSingle();
   if(error||!target)return fail('Funcionario nao encontrado',404);
   if(String(target.email||'').toLowerCase()!==value.email)return fail('O email nao pode ser alterado nessa tela',400);
   if(target.role==='admin' && (value.role!=='admin'||!value.active)){
    const {count,error:countError}=await admin.from('fcap_members').select('user_id',{count:'exact',head:true}).eq('role','admin').eq('active',true);
    if(countError||count===null)return fail('Nao foi possivel conferir administradores',503);
    if(count<=1)return fail('E obrigatorio manter ao menos um administrador ativo',409);
   }
   const {error:saveError}=await admin.from('fcap_members').update({...value,updated_at:new Date().toISOString()}).eq('user_id',user_id);
   if(saveError)throw Error('500|Falha ao atualizar permissoes');
   return answer({ok:true,operation:'updated'});
  }
  if(!value.active)return fail('O primeiro cadastro deve estar ativo. Desative depois de convidar',400);
  const {data:duplicate,error:dupeError}=await admin.from('fcap_members').select('user_id').eq('email',value.email).maybeSingle();
  if(dupeError)throw Error('503|Falha ao consultar e-mails');
  if(duplicate)return fail('Este e-mail ja esta cadastrado',409);
  let authUser=await findAuthUserByEmail(value.email),invitationSent=false;
  if(!authUser){
   // Gera convite de ativacao; nao inventa senha nem cadastra usuario no front-end.
   const result=await admin.auth.admin.inviteUserByEmail(value.email,{data:{full_name:value.full_name}});
   if(result.error||!result.data.user)throw Error('502|Falha ao criar convite. Verifique configuracao de e-mail do Auth');
   authUser=result.data.user;invitationSent=true;
  }
  const {error:insertError}=await admin.from('fcap_members').insert({user_id:authUser.id,...value});
  if(insertError)throw Error('500|Conta de autenticacao localizada, mas nao foi possivel criar membro. Revise e tente novamente.');
  return answer({ok:true,operation:'invited',invitationSent});
 }catch(e){return errResponse(e)}
});
