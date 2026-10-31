-- FCAP Jr. R7 - Permissoes granulares por funcionario.
-- ATENCAO: executar manualmente SOMENTE no Supabase exclusivo da FCAP Jr.
-- Nao executar junto do instalador offline. Revisar e efetuar backup do banco antes.
begin;

alter table public.fcap_members add column if not exists email text;
alter table public.fcap_members add column if not exists permissions text[] not null default '{}'::text[];
alter table public.fcap_members add column if not exists updated_at timestamptz not null default now();
create unique index if not exists fcap_members_email_unique on public.fcap_members (lower(email)) where email is not null;

-- Presets apenas para registros antigos; novos cadastros usam escolhas explicitas.
update public.fcap_members set permissions = case role
 when 'admin' then array['dashboard.view','pipeline.view','leads.view','leads.edit','leads.export','reports.view','agenda.view','agenda.edit','alerts.view','secretary.use','integrations.manage','prospector.use','analyst.use','blog.view','blog.edit','team.manage']::text[]
 when 'gestor' then array['dashboard.view','pipeline.view','leads.view','leads.edit','leads.export','reports.view','agenda.view','agenda.edit','alerts.view','secretary.use','integrations.manage','prospector.use','analyst.use']::text[]
 when 'vendedor' then array['dashboard.view','pipeline.view','leads.view','leads.edit','agenda.view','agenda.edit','alerts.view','secretary.use','integrations.manage','prospector.use','analyst.use']::text[]
 when 'marketing' then array['blog.view','blog.edit','alerts.view']::text[]
 else '{}'::text[] end
where cardinality(permissions)=0;

-- E-mails em auth.users: podem ser copiados no bootstrap, em ambiente autorizado.
update public.fcap_members m set email=lower(u.email)
from auth.users u where m.user_id=u.id and m.email is null and u.email is not null;

create or replace function public.fcap_permit(capability text) returns boolean
language sql stable security definer set search_path=public as $$
 select exists(
  select 1 from public.fcap_members m
  where m.user_id=(select auth.uid()) and m.active=true
    and (m.role='admin' or capability=any(m.permissions))
 );
$$;
revoke all on function public.fcap_permit(text) from public;
grant execute on function public.fcap_permit(text) to anon,authenticated;

-- RLS e tambem aplicada no banco. Ocultar menu nao equivale a autorizar dados.
drop policy if exists fcap_member_self on public.fcap_members;
create policy fcap_member_directory on public.fcap_members for select to authenticated
using(public.fcap_permit('team.manage') or public.fcap_permit('leads.view') or public.fcap_permit('pipeline.view') or public.fcap_permit('agenda.view') or user_id=auth.uid());
-- Nao conceder INSERT/UPDATE/DELETE para client: usa apenas fcap-members Edge Function.

drop policy if exists fcap_stage_read on public.fcap_stages;
create policy fcap_stage_read on public.fcap_stages for select to authenticated
using(public.fcap_permit('pipeline.view') or public.fcap_permit('leads.view') or public.fcap_permit('prospector.use') or public.fcap_permit('analyst.use') or public.fcap_permit('dashboard.view') or public.fcap_permit('reports.view'));
drop policy if exists fcap_stage_manage on public.fcap_stages;
create policy fcap_stage_manage on public.fcap_stages for all to authenticated
using(public.fcap_permit('leads.edit') and public.fcap_role() in ('admin','gestor'))
with check(public.fcap_permit('leads.edit') and public.fcap_role() in ('admin','gestor'));

drop policy if exists fcap_lead_select on public.fcap_leads;
create policy fcap_lead_select on public.fcap_leads for select to authenticated
using(
 (public.fcap_permit('leads.view') or public.fcap_permit('pipeline.view') or public.fcap_permit('reports.view') or public.fcap_permit('dashboard.view') or public.fcap_permit('analyst.use') or public.fcap_permit('prospector.use') or public.fcap_permit('secretary.use'))
 and (public.fcap_role() in ('admin','gestor') or assigned_to=auth.uid() or assigned_to is null)
);
drop policy if exists fcap_lead_insert on public.fcap_leads;
create policy fcap_lead_insert on public.fcap_leads for insert to authenticated
with check(public.fcap_permit('leads.edit') and (public.fcap_role() in ('admin','gestor') or assigned_to=auth.uid() or assigned_to is null));
drop policy if exists fcap_lead_update on public.fcap_leads;
create policy fcap_lead_update on public.fcap_leads for update to authenticated
using(public.fcap_permit('leads.edit') and (public.fcap_role() in ('admin','gestor') or assigned_to=auth.uid() or assigned_to is null))
with check(public.fcap_permit('leads.edit') and (public.fcap_role() in ('admin','gestor') or assigned_to=auth.uid() or assigned_to is null));

drop policy if exists fcap_interact_select on public.fcap_interactions;
create policy fcap_interact_select on public.fcap_interactions for select to authenticated
using(public.fcap_permit('leads.view') and exists(select 1 from public.fcap_leads l where l.id=lead_id));
drop policy if exists fcap_interact_insert on public.fcap_interactions;
create policy fcap_interact_insert on public.fcap_interactions for insert to authenticated
with check(public.fcap_permit('leads.edit') and author_id=auth.uid() and exists(select 1 from public.fcap_leads l where l.id=lead_id));

drop policy if exists fcap_task_select on public.fcap_tasks;
create policy fcap_task_select on public.fcap_tasks for select to authenticated
using((public.fcap_permit('agenda.view') or public.fcap_permit('secretary.use') or public.fcap_permit('dashboard.view')) and (public.fcap_role() in ('admin','gestor') or assigned_to=auth.uid()));
drop policy if exists fcap_task_insert on public.fcap_tasks;
create policy fcap_task_insert on public.fcap_tasks for insert to authenticated
with check(public.fcap_permit('agenda.edit') and (public.fcap_role() in ('admin','gestor') or assigned_to=auth.uid()));
drop policy if exists fcap_task_update on public.fcap_tasks;
create policy fcap_task_update on public.fcap_tasks for update to authenticated
using(public.fcap_permit('agenda.edit') and (public.fcap_role() in ('admin','gestor') or assigned_to=auth.uid()))
with check(public.fcap_permit('agenda.edit') and (public.fcap_role() in ('admin','gestor') or assigned_to=auth.uid()));

drop policy if exists fcap_meeting_select on public.fcap_meetings;
create policy fcap_meeting_select on public.fcap_meetings for select to authenticated
using((public.fcap_permit('agenda.view') or public.fcap_permit('secretary.use') or public.fcap_permit('dashboard.view')) and (public.fcap_role() in ('admin','gestor') or assigned_to=auth.uid() or assigned_to is null));
drop policy if exists fcap_meeting_insert on public.fcap_meetings;
create policy fcap_meeting_insert on public.fcap_meetings for insert to authenticated
with check(public.fcap_permit('agenda.edit') and (public.fcap_role() in ('admin','gestor') or assigned_to=auth.uid() or assigned_to is null));
drop policy if exists fcap_meeting_update on public.fcap_meetings;
create policy fcap_meeting_update on public.fcap_meetings for update to authenticated
using(public.fcap_permit('agenda.edit') and (public.fcap_role() in ('admin','gestor') or assigned_to=auth.uid()))
with check(public.fcap_permit('agenda.edit') and (public.fcap_role() in ('admin','gestor') or assigned_to=auth.uid()));

drop policy if exists fcap_article_read on public.fcap_articles;
create policy fcap_article_read on public.fcap_articles for select to anon,authenticated
using(status='publicado' or public.fcap_permit('blog.view'));
drop policy if exists fcap_article_insert on public.fcap_articles;
create policy fcap_article_insert on public.fcap_articles for insert to authenticated
with check(public.fcap_permit('blog.edit') and author_id=auth.uid());
drop policy if exists fcap_article_update on public.fcap_articles;
create policy fcap_article_update on public.fcap_articles for update to authenticated
using(public.fcap_permit('blog.edit')) with check(public.fcap_permit('blog.edit'));
drop policy if exists fcap_article_delete on public.fcap_articles;
create policy fcap_article_delete on public.fcap_articles for delete to authenticated
using(public.fcap_permit('blog.edit') and public.fcap_role() in ('admin','gestor'));

drop policy if exists fcap_analyses_read on public.fcap_analyses;
create policy fcap_analyses_read on public.fcap_analyses for select to authenticated
using(public.fcap_permit('analyst.use') and exists(select 1 from public.fcap_leads l where l.id=lead_id));
drop policy if exists fcap_prospect_runs_read on public.fcap_prospect_runs;
create policy fcap_prospect_runs_read on public.fcap_prospect_runs for select to authenticated
using(public.fcap_permit('prospector.use') and (public.fcap_role() in ('admin','gestor') or requested_by=auth.uid()));
drop policy if exists fcap_blocklist_read on public.fcap_prospect_blocklist;
create policy fcap_blocklist_read on public.fcap_prospect_blocklist for select to authenticated using(public.fcap_permit('prospector.use'));
drop policy if exists fcap_blocklist_manage on public.fcap_prospect_blocklist;
create policy fcap_blocklist_manage on public.fcap_prospect_blocklist for all to authenticated
using(public.fcap_permit('prospector.use') and public.fcap_role() in ('admin','gestor'))
with check(public.fcap_permit('prospector.use') and public.fcap_role() in ('admin','gestor'));

drop policy if exists fcap_alert_select on public.fcap_alerts;
create policy fcap_alert_select on public.fcap_alerts for select to authenticated
using(recipient_id=auth.uid() and public.fcap_permit('alerts.view'));
drop policy if exists fcap_alert_update on public.fcap_alerts;
create policy fcap_alert_update on public.fcap_alerts for update to authenticated
using(recipient_id=auth.uid() and public.fcap_permit('alerts.view'))
with check(recipient_id=auth.uid() and public.fcap_permit('alerts.view'));

drop policy if exists fcap_blog_image_insert on storage.objects;
create policy fcap_blog_image_insert on storage.objects for insert to authenticated
with check(bucket_id='fcap-blog' and public.fcap_permit('blog.edit'));

-- Reforco: apenas JWT autenticado consulta permissoes; funcoes administrativas so no servidor.
revoke insert,update,delete on public.fcap_members from anon,authenticated;

commit;
