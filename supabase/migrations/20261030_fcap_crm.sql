-- FCAP JR CRM | Banco de dados dedicado. REVISÃO E EXECUÇÃO MANUAL OBRIGATÓRIA.
-- Execute APENAS no novo projeto Supabase da FCAP JR. Nunca no Supabase do APROVUP/PURM.
begin;
create extension if not exists pgcrypto;

create table if not exists public.fcap_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (length(full_name) between 2 and 120),
  role text not null check (role in ('admin','gestor','vendedor','marketing')),
  phone text,
  notify_email boolean not null default true,
  notify_whatsapp boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create or replace function public.fcap_role() returns text language sql stable security definer set search_path = public as $$
  select role from public.fcap_members where user_id = (select auth.uid()) and active = true limit 1;
$$;
revoke all on function public.fcap_role() from public;
grant execute on function public.fcap_role() to anon,authenticated;
create or replace function public.fcap_sales_access() returns boolean language sql stable security definer set search_path = public as $$
  select public.fcap_role() in ('admin','gestor','vendedor');
$$;
revoke all on function public.fcap_sales_access() from public;
grant execute on function public.fcap_sales_access() to authenticated;

create table if not exists public.fcap_stages (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  position integer not null,
  kind text not null default 'open' check(kind in ('open','won','lost'))
);
insert into public.fcap_stages(name,position,kind) values
 ('Novo lead',1,'open'), ('Primeiro contato',2,'open'), ('Diagnóstico agendado',3,'open'),
 ('Proposta enviada',4,'open'), ('Negociação',5,'open'), ('Fechado',6,'won'), ('Perdido',7,'lost')
on conflict(name) do nothing;

create table if not exists public.fcap_leads (
  id uuid primary key default gen_random_uuid(),
  company_name text not null check (length(company_name) between 2 and 180),
  contact_name text not null default '', email text not null default '', phone text not null default '',
  segment text not null default '', role_title text not null default '', need text not null default '',
  source text not null default 'manual', notes text not null default '',
  stage_id uuid not null references public.fcap_stages(id),
  assigned_to uuid references public.fcap_members(user_id) on delete set null,
  priority text not null default 'media' check(priority in ('baixa','media','alta')),
  temperature text not null default 'morno' check(temperature in ('frio','morno','quente')),
  estimated_value numeric(14,2) not null default 0 check(estimated_value >= 0),
  requested_day date, requested_time time,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
-- Distribuição automática de solicitações do site entre vendedores ativos.
create or replace function public.fcap_assign_inbound() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.source='site_diagnostico' and new.assigned_to is null then
  select m.user_id into new.assigned_to
  from public.fcap_members m left join public.fcap_leads l on l.assigned_to=m.user_id
  where m.active and m.role='vendedor'
  group by m.user_id order by count(l.id),m.user_id limit 1;
 end if;
 return new;
end; $$;
create trigger fcap_assign_inbound before insert on public.fcap_leads for each row execute function public.fcap_assign_inbound();
create index if not exists fcap_leads_assignee_idx on public.fcap_leads(assigned_to,created_at desc);
create index if not exists fcap_leads_stage_idx on public.fcap_leads(stage_id);

create table if not exists public.fcap_interactions (
  id uuid primary key default gen_random_uuid(), lead_id uuid not null references public.fcap_leads(id) on delete cascade,
  author_id uuid references public.fcap_members(user_id), kind text not null default 'nota',
  body text not null check (length(body) between 1 and 5000), created_at timestamptz not null default now()
);
create table if not exists public.fcap_tasks (
  id uuid primary key default gen_random_uuid(), lead_id uuid references public.fcap_leads(id) on delete cascade,
  title text not null check (length(title) between 2 and 220), assigned_to uuid not null references public.fcap_members(user_id),
  due_at timestamptz not null, completed_at timestamptz, created_at timestamptz not null default now()
);
create index if not exists fcap_tasks_due_idx on public.fcap_tasks(assigned_to,due_at) where completed_at is null;

create table if not exists public.fcap_meetings (
  id uuid primary key default gen_random_uuid(), lead_id uuid references public.fcap_leads(id) on delete cascade,
  assigned_to uuid references public.fcap_members(user_id),
  title text not null, start_at timestamptz not null, end_at timestamptz not null,
  status text not null default 'solicitada' check(status in ('solicitada','confirmada','cancelada')),
  google_event_id text, google_calendar_owner uuid references public.fcap_members(user_id),
  notes text not null default '', created_at timestamptz not null default now(),
  constraint fcap_meeting_time_check check (end_at > start_at)
);
create index if not exists fcap_meetings_start_idx on public.fcap_meetings(start_at);

-- Somente API server-side service_role confirma uma reunião no calendário.
-- O usuário autenticado pode editar informações comuns da reunião, mas não simular
-- confirmação Google nem escrever IDs de eventos por acesso direto ao banco.
create or replace function public.fcap_protect_meeting_google() returns trigger
language plpgsql set search_path=public as $$
begin
 if auth.role() is distinct from 'service_role' then
   if (tg_op='INSERT' and (new.status='confirmada' or new.google_event_id is not null or new.google_calendar_owner is not null)) then
      raise exception 'Confirmacao do Google Agenda exige operacao protegida do servidor';
   elsif tg_op='UPDATE' and (
       new.google_event_id is distinct from old.google_event_id
       or new.google_calendar_owner is distinct from old.google_calendar_owner
       or (new.status='confirmada' and old.status is distinct from 'confirmada')
     ) then
      raise exception 'Confirmacao do Google Agenda exige operacao protegida do servidor';
   end if;
 end if;
 return new;
end; $$;
create trigger fcap_meeting_google_protected before insert or update on public.fcap_meetings
for each row execute function public.fcap_protect_meeting_google();


create table if not exists public.fcap_alerts (
  id uuid primary key default gen_random_uuid(), recipient_id uuid not null references public.fcap_members(user_id) on delete cascade,
  category text not null, message text not null, lead_id uuid references public.fcap_leads(id) on delete cascade,
  meeting_id uuid references public.fcap_meetings(id) on delete cascade,
  dedupe_key text,
  read_at timestamptz, created_at timestamptz not null default now(),
  unique(recipient_id,dedupe_key)
);
create index if not exists fcap_alerts_unread_idx on public.fcap_alerts(recipient_id,created_at desc) where read_at is null;

create table if not exists public.fcap_articles (
  id uuid primary key default gen_random_uuid(), slug text not null unique check(slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null check (length(title) between 5 and 200), excerpt text not null default '',
  category text not null default 'Gestão', cover_url text not null default '',
  body text not null default '', status text not null default 'rascunho' check(status in ('rascunho','publicado')),
  author_id uuid references public.fcap_members(user_id), published_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists fcap_articles_published_idx on public.fcap_articles(published_at desc) where status='publicado';

create table if not exists public.fcap_analyses (
  id uuid primary key default gen_random_uuid(), lead_id uuid not null references public.fcap_leads(id) on delete cascade,
  requested_by uuid not null references public.fcap_members(user_id),
  score integer not null check(score between 0 and 100),
  interest text not null default 'indeterminado', executive_summary text not null,
  next_action text not null, risks text not null default '',
  recommendations jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create table if not exists public.fcap_ai_usage (
  id bigint generated always as identity primary key,
  requested_by uuid not null references public.fcap_members(user_id) on delete cascade,
  action text not null check(action in ('prospect','analyse','secretary')),
  created_at timestamptz not null default now()
);
create index if not exists fcap_ai_usage_idx on public.fcap_ai_usage(requested_by,created_at desc);
create table if not exists public.fcap_prospect_runs (
  id uuid primary key default gen_random_uuid(), requested_by uuid not null references public.fcap_members(user_id),
  search_term text not null, region text not null default '', results jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create table if not exists public.fcap_prospect_blocklist (
  normalized_name text primary key, reason text not null default '',
  created_by uuid references public.fcap_members(user_id), created_at timestamptz not null default now()
);

-- Somente Edge Functions usando SERVICE_ROLE podem acessar tokens, states e fila de entrega.
create table if not exists public.fcap_oauth_states (
  state_hash text primary key, user_id uuid not null references public.fcap_members(user_id) on delete cascade,
  expires_at timestamptz not null, created_at timestamptz not null default now()
);
create table if not exists public.fcap_google_tokens (
  user_id uuid primary key references public.fcap_members(user_id) on delete cascade,
  refresh_token_cipher text not null, google_email text, connected_at timestamptz not null default now()
);
create table if not exists public.fcap_intake_attempts (
  id bigint generated always as identity primary key, ip_hash text not null,
  created_at timestamptz not null default now()
);
create index if not exists fcap_intake_attempts_idx on public.fcap_intake_attempts(ip_hash,created_at desc);
create table if not exists public.fcap_delivery_log (
  alert_id uuid not null references public.fcap_alerts(id) on delete cascade,
  channel text not null check(channel in ('email','whatsapp')),
  status text not null check(status in ('sent','failed')),
  attempts integer not null default 0, last_error text not null default '', updated_at timestamptz not null default now(),
  primary key (alert_id,channel)
);

create or replace function public.fcap_touch() returns trigger language plpgsql as $$
begin new.updated_at=now(); return new; end; $$;
create trigger fcap_leads_touch before update on public.fcap_leads for each row execute function public.fcap_touch();
create trigger fcap_articles_touch before update on public.fcap_articles for each row execute function public.fcap_touch();

-- Os alertas são produzidos no servidor. Nada de inserir alertas arbitrários via navegador.
create or replace function public.fcap_on_lead() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.source='importacao' then return new; end if;
  insert into public.fcap_alerts(recipient_id,category,message,lead_id,dedupe_key)
  select m.user_id,'novo_lead','Novo lead recebido: '||new.company_name,new.id,'lead:'||new.id::text
  from public.fcap_members m where m.active and m.role in ('admin','gestor','vendedor');
  return new;
end; $$;
create trigger fcap_lead_alert after insert on public.fcap_leads for each row execute function public.fcap_on_lead();
create or replace function public.fcap_make_requested_meeting() returns trigger language plpgsql security definer set search_path=public as $$
declare start_time timestamptz;
begin
  if new.requested_day is not null and new.requested_time is not null then
    start_time := ((new.requested_day::text || ' ' || new.requested_time::text)::timestamp at time zone 'America/Recife');
    insert into public.fcap_meetings(lead_id,assigned_to,title,start_at,end_at,status,notes)
    values(new.id,new.assigned_to,'Diagnóstico FCAP JR. · '||new.company_name,start_time,start_time + interval '60 minutes','solicitada','Horário solicitado via site. Necessita confirmação antes de criar evento no Google.');
  end if;
  return new;
end; $$;
create trigger fcap_lead_requested_meeting after insert on public.fcap_leads for each row execute function public.fcap_make_requested_meeting();

create or replace function public.fcap_on_meeting() returns trigger language plpgsql security definer set search_path=public as $$
declare kind text;
begin
 if tg_op='INSERT' then
   kind := case when new.status='confirmada' then 'reuniao_confirmada' else 'reuniao_solicitada' end;
 elsif new.status is distinct from old.status then
   kind := case when new.status='confirmada' then 'reuniao_confirmada' else 'reuniao_alterada' end;
 else
   return new;
 end if;
 insert into public.fcap_alerts(recipient_id,category,message,lead_id,meeting_id,dedupe_key)
 select m.user_id,kind,
   case when new.status='confirmada' then 'Reunião confirmada: ' else 'Solicitação de reunião: ' end ||new.title,
   new.lead_id,new.id,kind||':'||new.id::text
 from public.fcap_members m where m.active and (m.user_id=new.assigned_to or m.role in ('admin','gestor','vendedor'));
 return new;
end; $$;
create trigger fcap_meeting_alert after insert or update of status on public.fcap_meetings for each row execute function public.fcap_on_meeting();

alter table public.fcap_members enable row level security;
alter table public.fcap_stages enable row level security;
alter table public.fcap_leads enable row level security;
alter table public.fcap_interactions enable row level security;
alter table public.fcap_tasks enable row level security;
alter table public.fcap_meetings enable row level security;
alter table public.fcap_alerts enable row level security;
alter table public.fcap_articles enable row level security;
alter table public.fcap_analyses enable row level security;
alter table public.fcap_ai_usage enable row level security;
alter table public.fcap_prospect_runs enable row level security;
alter table public.fcap_prospect_blocklist enable row level security;
alter table public.fcap_oauth_states enable row level security;
alter table public.fcap_google_tokens enable row level security;
alter table public.fcap_intake_attempts enable row level security;
alter table public.fcap_delivery_log enable row level security;

create policy fcap_member_self on public.fcap_members for select to authenticated using(user_id=auth.uid() or public.fcap_role() in ('admin','gestor'));
create policy fcap_stage_read on public.fcap_stages for select to authenticated using(public.fcap_sales_access());
create policy fcap_stage_manage on public.fcap_stages for all to authenticated using(public.fcap_role() in ('admin','gestor')) with check(public.fcap_role() in ('admin','gestor'));
create policy fcap_lead_select on public.fcap_leads for select to authenticated using(public.fcap_sales_access() and (public.fcap_role() in ('admin','gestor') or assigned_to=auth.uid() or assigned_to is null));
create policy fcap_lead_insert on public.fcap_leads for insert to authenticated with check(public.fcap_sales_access() and (assigned_to is null or assigned_to=auth.uid() or public.fcap_role() in ('admin','gestor')));
create policy fcap_lead_update on public.fcap_leads for update to authenticated using(public.fcap_sales_access() and (public.fcap_role() in ('admin','gestor') or assigned_to=auth.uid() or assigned_to is null)) with check(public.fcap_sales_access() and (public.fcap_role() in ('admin','gestor') or assigned_to=auth.uid() or assigned_to is null));
create policy fcap_interact_select on public.fcap_interactions for select to authenticated using(exists(select 1 from public.fcap_leads l where l.id=lead_id));
create policy fcap_interact_insert on public.fcap_interactions for insert to authenticated with check(author_id=auth.uid() and exists(select 1 from public.fcap_leads l where l.id=lead_id));
create policy fcap_task_select on public.fcap_tasks for select to authenticated using(public.fcap_role() in ('admin','gestor') or (public.fcap_sales_access() and assigned_to=auth.uid()));
create policy fcap_task_insert on public.fcap_tasks for insert to authenticated with check(public.fcap_sales_access() and (assigned_to=auth.uid() or public.fcap_role() in ('admin','gestor')));
create policy fcap_task_update on public.fcap_tasks for update to authenticated using(public.fcap_role() in ('admin','gestor') or (public.fcap_sales_access() and assigned_to=auth.uid())) with check(public.fcap_role() in ('admin','gestor') or (public.fcap_sales_access() and assigned_to=auth.uid()));
create policy fcap_meeting_select on public.fcap_meetings for select to authenticated using(public.fcap_role() in ('admin','gestor') or (public.fcap_sales_access() and (assigned_to=auth.uid() or assigned_to is null)));
create policy fcap_meeting_insert on public.fcap_meetings for insert to authenticated with check(public.fcap_sales_access() and (assigned_to=auth.uid() or assigned_to is null or public.fcap_role() in ('admin','gestor')));
create policy fcap_meeting_update on public.fcap_meetings for update to authenticated using(public.fcap_role() in ('admin','gestor') or (public.fcap_sales_access() and assigned_to=auth.uid())) with check(public.fcap_role() in ('admin','gestor') or (public.fcap_sales_access() and assigned_to=auth.uid()));
create policy fcap_alert_select on public.fcap_alerts for select to authenticated using(recipient_id=auth.uid());
create policy fcap_alert_update on public.fcap_alerts for update to authenticated using(recipient_id=auth.uid()) with check(recipient_id=auth.uid());
create policy fcap_article_read on public.fcap_articles for select to anon,authenticated using(status='publicado' or public.fcap_role() in ('admin','gestor','marketing'));
create policy fcap_article_insert on public.fcap_articles for insert to authenticated with check(public.fcap_role() in ('admin','gestor','marketing') and author_id=auth.uid());
create policy fcap_article_update on public.fcap_articles for update to authenticated using(public.fcap_role() in ('admin','gestor','marketing')) with check(public.fcap_role() in ('admin','gestor','marketing'));
create policy fcap_article_delete on public.fcap_articles for delete to authenticated using(public.fcap_role() in ('admin','gestor'));
create policy fcap_analyses_read on public.fcap_analyses for select to authenticated using(exists(select 1 from public.fcap_leads l where l.id=lead_id));
create policy fcap_prospect_runs_read on public.fcap_prospect_runs for select to authenticated using(public.fcap_role() in ('admin','gestor') or requested_by=auth.uid());
create policy fcap_blocklist_read on public.fcap_prospect_blocklist for select to authenticated using(public.fcap_sales_access());
create policy fcap_blocklist_manage on public.fcap_prospect_blocklist for all to authenticated using(public.fcap_role() in ('admin','gestor')) with check(public.fcap_role() in ('admin','gestor'));

-- Biblioteca de capas do blog. Somente equipe editorial pode publicar imagens.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('fcap-blog','fcap-blog',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do nothing;
create policy fcap_blog_image_insert on storage.objects for insert to authenticated
with check(bucket_id='fcap-blog' and public.fcap_role() in ('admin','gestor','marketing'));
create policy fcap_blog_image_read on storage.objects for select to anon,authenticated
using(bucket_id='fcap-blog');
-- Somente leitura pública de artigos publicados. Nunca conceder acesso direto a tokens OAuth.
revoke all on public.fcap_oauth_states,public.fcap_google_tokens,public.fcap_intake_attempts,public.fcap_delivery_log,public.fcap_ai_usage from anon,authenticated;
revoke update on public.fcap_alerts from public,anon,authenticated;
grant update(read_at) on public.fcap_alerts to authenticated;
commit;
-- BOOTSTRAP MANUAL DEPOIS DE CRIAR UM USUÁRIO NO AUTH:
-- insert into public.fcap_members(user_id, full_name, role)
-- values ('UUID-DO-USUARIO-CRIADO-NO-AUTH','Responsável FCAP Jr.','admin');
