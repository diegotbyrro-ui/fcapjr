-- FCAP Jr R16 | aplicado no Supabase FCAP Jr em 03/11/2026.
-- Este arquivo versiona o SQL ja executado. O instalador GitHub NAO executa SQL.
-- Nova tabela de destinatarios, protegida com RLS restrito a admins.
create table if not exists public.fcap_notification_contacts (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (char_length(trim(full_name)) between 2 and 120),
  phone_e164 text not null unique check (phone_e164 ~ '^\+[1-9][0-9]{10,14}$'),
  notify_meetings boolean not null default true,
  notify_changes boolean not null default true,
  receive_director_report boolean not null default false,
  consent_confirmed boolean not null default false,
  active boolean not null default true,
  created_by uuid references public.fcap_members(user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.fcap_notification_contacts enable row level security;
revoke all on table public.fcap_notification_contacts from public, anon;
grant select,insert,update,delete on table public.fcap_notification_contacts to authenticated;
create policy fcap_notification_contacts_read on public.fcap_notification_contacts
  for select to authenticated using (fcap_internal.fcap_role()='admin');
create policy fcap_notification_contacts_insert on public.fcap_notification_contacts
  for insert to authenticated with check (fcap_internal.fcap_role()='admin' and created_by=auth.uid());
create policy fcap_notification_contacts_update on public.fcap_notification_contacts
  for update to authenticated using (fcap_internal.fcap_role()='admin')
  with check (fcap_internal.fcap_role()='admin');
create policy fcap_notification_contacts_delete on public.fcap_notification_contacts
  for delete to authenticated using (fcap_internal.fcap_role()='admin');
create trigger fcap_notification_contacts_touch
before update on public.fcap_notification_contacts
for each row execute function public.fcap_touch();

-- Impede divergencias entre agendamento no CRM e evento Google ja criado.
create or replace function public.fcap_r16_guard_synced_meeting()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  if old.google_event_id is not null and (
    new.title is distinct from old.title or
    new.start_at is distinct from old.start_at or
    new.end_at is distinct from old.end_at or
    new.assigned_to is distinct from old.assigned_to or
    new.lead_id is distinct from old.lead_id
  ) then
    raise exception 'Reuniao ja sincronizada com Google Agenda; edite somente apos fluxo de sincronizacao';
  end if;
  return new;
end; $$;
revoke execute on function public.fcap_r16_guard_synced_meeting() from public,anon,authenticated;
create trigger fcap_r16_guard_synced_meeting
  before update of title,start_at,end_at,assigned_to,lead_id on public.fcap_meetings
  for each row execute function public.fcap_r16_guard_synced_meeting();

-- Alerta interno ao editar reunioes; NAO envia WhatsApp ou e-mail.
create or replace function public.fcap_r16_meeting_changed()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.title is distinct from old.title
     or new.start_at is distinct from old.start_at
     or new.end_at is distinct from old.end_at
     or new.assigned_to is distinct from old.assigned_to then
    insert into public.fcap_alerts(recipient_id,category,message,lead_id,meeting_id,dedupe_key)
    select m.user_id,'reuniao_alterada',
      'Reuniao atualizada: ' || left(new.title,120),
      new.lead_id,new.id,
      'meeting_edit:'||new.id::text||':'||
      md5(coalesce(new.title,'')||new.start_at::text||new.end_at::text||coalesce(new.assigned_to::text,''))
    from public.fcap_members m
    where m.active and (m.role in ('admin','gestor')
      or m.user_id=new.assigned_to or m.user_id=old.assigned_to)
    on conflict(recipient_id,dedupe_key) do nothing;
  end if;
  return new;
end; $$;
revoke execute on function public.fcap_r16_meeting_changed() from public,anon,authenticated;
create trigger fcap_r16_meeting_changed
  after update of title,start_at,end_at,assigned_to on public.fcap_meetings
  for each row execute function public.fcap_r16_meeting_changed();
