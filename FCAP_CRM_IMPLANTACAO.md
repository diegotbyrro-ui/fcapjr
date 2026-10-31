# FCAP JR. | CRM + Prospector IA + IA Analítica + Secretária IA + Blog

**Pacote técnico V1 · 30/10/2026 · implementação aditiva ao site aprovado**

## O que o pacote entrega

- **Central interna** em `/gestao/` com login Supabase Auth (usuários autorizados apenas), acesso por função e sessão segura. Dashboard com KPIs, contatos, histórico, tarefas, agenda de reuniões, funil Kanban arrastável, filtros, responsáveis, temperaturas, valores, relatórios, importação JSON controlada, exportação CSV e avisos.
- **Prospector IA**: pesquisa de empresas em fontes públicas com OpenAI Responses/Web Search, até 10 por pesquisa, exibe fontes e pontuação estimada, verifica duplicados e permite salvar leads após revisão humana.
- **IA Analítica**: diagnóstico comercial de um lead com score orientativo, riscos, resumo e próximo passo, registra histórico da análise no banco.
- **Secretária IA**: chat interno somente leitura, com contexto dos leads, tarefas e reuniões; notificações automáticas em app para novos leads, solicitações de reunião, confirmação e prazos; opção de envio e-mail (Resend) e WhatsApp (Meta Cloud API, template aprovado e opt-in) por rotina programada.
- **Google Agenda**: OAuth 2.0 individual por vendedor, estado de uso único, refresh token cifrado AES-GCM, leitura dos próximos eventos, checagem de conflito e confirmação de reunião com criação de evento.
- **Site público**: solicitações de diagnóstico integradas ao CRM por Edge Function com Turnstile + limite por IP; vendedor atribuído automaticamente se existir vendedor ativo; a reunião fica como **solicitada**, nunca reservada sem confirmação. Se o backend ainda não estiver configurado, mantém o WhatsApp anterior.
- **Blog**: o marketing cria, edita, salva rascunhos e publica artigos, com upload controlado de capas JPG/PNG/WEBP até 5 MB; a página pública busca novos artigos no Supabase e os apresenta sem inserir HTML não confiável. Artigos antigos permanecem como estão.
- **Banco dedicado** com RLS e funções privadas para tokens OAuth e entregas externas.

## O que NÃO foi executado

**NENHUMA** migração SQL, seed no banco real, credencial, conexão Google, publicação de Edge Function, assinatura de domínio Hostinger, envio de WhatsApp/e-mail ou alteração em produção. O pacote contém código e um instalador local que prepara uma branch Git para revisão e push, nunca atualiza a `main` automaticamente. Sem URL/chave pública do novo Supabase o painel mostra configuração pendente, em vez de inventar dados.

Não é um transplante literal de toda a aplicação APROVUP: a versão V1 implementa os módulos comerciais solicitados adaptados à consultoria FCAP Jr. Não inclui funcionalidades específicas de produção de conteúdo do AprovUp, nem sincronização cruzada entre bancos.

## Instalar e validar apenas no computador (OFFLINE)

1. Baixe e extraia `FCAPJR_CRM_IA_BLOG_V1_OFFLINE.zip`.
2. Abra o PowerShell e use o comando enviado no chat, ou execute `INSTALAR_OFFLINE_FCAPJR.bat` dentro da pasta extraida.
3. O instalador verifica integridade, encontra/solicita a pasta do site local, registra o estado Git **somente em leitura**, cria backup integral e aplica apenas os novos arquivos e os 3 patches HTML previstos.
4. Os testes JS e de estrutura rodam localmente quando o Node.js esta disponivel.
5. Ao final, copie o relatorio entre `INICIO DO RELATORIO COMPLETO` e `FIM DO RELATORIO COMPLETO`.

**O instalador OFFLINE nao faz branch, git add, commit, push, pull, reset, stash nem acessa remoto.** Publicacao no GitHub so sera preparada em uma etapa separada apos o usuario validar.

## Ativar banco e serviços depois da revisão

1. Crie **um novo projeto Supabase exclusivo da FCAP Jr.**, separado dos projetos AprovUp e PURM. Configure HTTPS, segurança da autenticação e políticas de backup.
2. Leia e revise `supabase/migrations/20261030_fcap_crm.sql`; execute manualmente **uma única vez** no SQL Editor do banco novo. Não execute esse SQL no AprovUp.
3. Crie um usuário administrador no Supabase Auth (cadastro público desabilitado) e insira seu UUID na tabela `fcap_members`, com papel `admin`, conforme exemplo comentado no final do SQL. Cadastre os demais colaboradores como `gestor`, `vendedor` ou `marketing`.
4. Configure em `dist/fcap-config.js` somente `supabaseUrl`, `supabaseAnonKey` (ou chave publishable) e `turnstileSiteKey`, que são valores **públicos**. NÃO coloque chaves privadas nesse arquivo nem no Git.
5. No painel Supabase, adicione os secrets de Edge Functions: `FCAP_SITE_ORIGIN`, `FCAP_RATE_SALT`, `TURNSTILE_SECRET`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `FCAP_GOOGLE_REDIRECT_URI`, `FCAP_TOKEN_ENCRYPTION_KEY` (32 bytes aleatórios em base64), `FCAP_CRON_SECRET` (32+ caracteres), e, se houver envio externo, `RESEND_API_KEY`, `FCAP_EMAIL_FROM`, `META_WA_TOKEN`, `META_PHONE_NUMBER_ID`, `META_WA_TEMPLATE`, `META_GRAPH_VERSION`.
6. Configure Cloudflare Turnstile para o domínio temporário da Hostinger. O hostname da validação precisa corresponder ao domínio real e à variável `FCAP_SITE_ORIGIN`. Sem Turnstile/servidor configurados, não ativar automaticamente a gravação pública; o site mantém o WhatsApp como canal alternativo.
7. Configure o projeto OAuth no Google Cloud para a **conta usada pela FCAP Jr.**, habilite Google Calendar API, crie credenciais Web e registre **exatamente** o redirect `https://SEU-PROJETO.supabase.co/functions/v1/fcap-calendar`. A URL precisa coincidir com o segredo `FCAP_GOOGLE_REDIRECT_URI`. Faça consentimento/testes de acesso conforme política Google; obtenha tokens somente após autorização dos vendedores.
8. Execute manualmente no terminal Supabase CLI (instalado e conectado no projeto **correto**):

   ```sh
   supabase link --project-ref SEU_PROJETO_FCAP
   supabase functions deploy fcap-public-lead
   supabase functions deploy fcap-ai
   supabase functions deploy fcap-calendar
   supabase functions deploy fcap-notify
   ```

   O bucket `fcap-blog` é preparado pela migração. Revise os limites de armazenamento e a exposição pública das imagens antes de publicar.

   O arquivo `supabase/config.toml` contém as configurações de autenticação: `fcap-calendar` exige verificação manual JWT para ações e estado único para callback; `fcap-notify` exige header secreto; `fcap-public-lead` exige Turnstile. **Não mudar isso para liberar erros 401**.
9. Configure agendamento do `fcap-notify` de 15 em 15 minutos por serviço de cron seguro, fazendo POST com header `x-fcap-cron-secret`; **não agende antes de configurar as permissões de contato e testar a rotina**. E-mail requer domínio verificado, WhatsApp requer template de utilidade aprovado pela Meta e consentimento do destinatário. `notify_whatsapp` nasce desabilitado.
10. Publique os arquivos do diretório `dist/` no subdomínio temporário da Hostinger, preservando a hierarquia de subpastas. As páginas administrativas estarão em `/gestao/`. Você pode servir o site como hospedagem estática; o banco/IA/agenda funcionam via Supabase, sem precisar de Node na Hostinger.

**Atenção:** as páginas do blog carregadas pelo JavaScript não geram SEO estático completo; para indexação editorial avançada será preciso prerender/SSR em uma etapa posterior. Capas podem ser enviadas no editor ou referenciadas por URL HTTPS. O upload utiliza um bucket público de imagens com permissão de escrita restrita a Marketing/Gestor/Admin; não há transformação automática de imagens nem otimização avançada.

## Checklist de homologação (antes do domínio principal)

- Conferir visual/responsividade da Home, Blog, Contato, Serviços e Cases antes e depois da instalação.
- Criar usuários de cada função e validar RLS (marketing não vê vendas; vendedor não vê leads atribuídos a outro vendedor; anon só vê artigos publicados).
- Preencher diagnóstico com Turnstile em domínio teste: verificar lead, responsável automático, reunião solicitada e alertas sem enviar dados duplicados.
- Criar lead manual, editar, arrastar entre etapas, registrar interação, criar/concluir tarefa, fechar oportunidade.
- Prospector retorna apenas empresas com fontes, evita duplicatas e falha com erro legível se API não estiver configurada.
- IA Analítica grava score e recomendações, respeita carteira do vendedor.
- Conectar Google Agenda de vendedor teste, consultar eventos, confirmar reunião livre, recusar horário ocupado e impedir confirmação em outra agenda.
- Criar artigo como Marketing, salvar rascunho (invisível publicamente), publicar, revisar imagem e texto, e voltar a rascunho.
- Validar lembretes internos e depois testar e-mail/WhatsApp com destinatários de teste opt-in, template aprovado e cron ainda isolado.
- Inspecionar audit/logs, orçamento de IA, limites de chamadas, LGPD, política de privacidade, consentimento, tratamento de dados e backup.

## Estrutura

- `dist/gestao/`: central interna (sem build)
- `dist/fcap-public.js`: interceptador de solicitações do site
- `dist/fcap-blog.js` + `dist/artigo.html`: publicação dinâmica de artigos
- `dist/fcap-config.js`: **somente configuração pública** (inicialmente vazia)
- `supabase/migrations/`: schema PostgreSQL com RLS
- `supabase/functions/`: APIs seguras de lead, IA, calendário e notificações
- `tests/smoke.mjs`: teste estático da instalação

## Observações de segurança e continuidade

O instalador OFFLINE nao publica arquivos nem cria branches. Ele modifica apenas uma copia local do projeto apos backup. O push e a publicacao na Hostinger serao realizados somente apos validacao e autorizacao separadas.
