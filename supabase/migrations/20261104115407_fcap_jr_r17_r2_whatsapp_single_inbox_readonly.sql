-- FCAP Jr R17 R2: canal unico, threads e mensagens somente-leitura no CRM.
-- Integracao oficial Meta/WhatsApp NAO ativada neste passo.
create table if not exists public.fcap_wa_threads (
 id uuid primary key default gen_random_uuid(),
 lead_id uuid not null unique references public.fcap_leads(id) on delete cascade,
 demo_agent_name text,
 status text not null default 'aberta' check (status in ('aberta','em_atendimento','encerrada')),
 is_demo boolean not null default false,
 created_at timestamptz not null default now()
);
create table if not exists public.fcap_wa_messages (
 id uuid primary key default gen_random_uuid(),
 thread_id uuid not null references public.fcap_wa_threads(id) on delete cascade,
 direction text not null check (direction in ('inbound','outbound')),
 body text not null check (char_length(body) between 1 and 5000),
 source text not null default 'demo' check (source in ('demo','provider')),
 provider_message_id text unique,
 sent_at timestamptz not null default now(),
 created_at timestamptz not null default now(),
 constraint fcap_wa_provider_id_check check (source='demo' or provider_message_id is not null)
);
create index if not exists fcap_wa_messages_thread_time_idx on public.fcap_wa_messages(thread_id,sent_at desc);
create index if not exists fcap_wa_threads_demo_idx on public.fcap_wa_threads(is_demo);
alter table public.fcap_wa_threads enable row level security;
alter table public.fcap_wa_messages enable row level security;
-- A consulta ao lead passa pelas politicas RLS ja vigentes, e o vendedor ve somente a sua carteira.
create policy fcap_wa_threads_select on public.fcap_wa_threads for select to authenticated
 using (fcap_internal.fcap_permit('leads.view') and exists (
   select 1 from public.fcap_leads l where l.id=lead_id and
   (fcap_internal.fcap_role() in ('admin','gestor') or l.assigned_to=(select auth.uid()))
 ));
create policy fcap_wa_messages_select on public.fcap_wa_messages for select to authenticated
 using (fcap_internal.fcap_permit('leads.view') and exists (
   select 1 from public.fcap_wa_threads t where t.id=thread_id
 ));
revoke all on public.fcap_wa_threads,public.fcap_wa_messages from anon;
grant select on public.fcap_wa_threads,public.fcap_wa_messages to authenticated;
-- Nenhuma policy de insert/update/delete para usuarios do navegador.
-- A futura Edge Function server-side devera autenticar webhooks e inserir com service_role.
