import {readFileSync,existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const get=x=>readFileSync(path.join(root,x),'utf8');
let failed=0;
function check(name,good){console.log(`${good?'OK':'ERRO'} ${name}`);if(!good)failed++}
for(const p of ['dist/gestao/index.html','dist/gestao/app.js','dist/gestao/style.css','dist/fcap-config.js','dist/fcap-public.js','dist/fcap-blog.js','dist/artigo.html','supabase/migrations/20261030_fcap_crm.sql','supabase/functions/fcap-public-lead/index.ts','supabase/functions/fcap-ai/index.ts','supabase/functions/fcap-calendar/index.ts','supabase/functions/fcap-notify/index.ts'])check('Arquivo '+p,existsSync(path.join(root,p)));
if(existsSync(path.join(root,'dist/index.html')))check('Home integrável ao CRM',get('dist/index.html').includes('fcap-public.js'));
if(existsSync(path.join(root,'dist/blog.html')))check('Blog integrável',get('dist/blog.html').includes('fcap-blog.js')&&get('dist/blog.html').includes('fcap-dynamic-articles'));
if(existsSync(path.join(root,'dist/contato.html')))check('Contato integrável',get('dist/contato.html').includes('fcap-public.js'));
const sql=get('supabase/migrations/20261030_fcap_crm.sql');check('RLS habilitada',sql.includes('enable row level security'));check('Separação de banco',sql.includes('FCAP JR CRM'));
const publicJS=get('dist/gestao/app.js')+get('dist/fcap-config.js')+get('dist/fcap-public.js');
check('Sem referência explícita a chave service_role no código público',!publicJS.includes('SUPABASE_SERVICE_ROLE_KEY')&&!publicJS.includes('GOOGLE_CLIENT_SECRET'));
if(failed)process.exitCode=1;
