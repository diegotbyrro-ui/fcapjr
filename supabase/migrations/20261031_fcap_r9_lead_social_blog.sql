-- FCAP Jr. R9. EXECUCAO MANUAL, somente apos validacao em ambiente separado.
-- Depende das migrations R1 e R7. Faca backup do Supabase antes.
begin;

alter table public.fcap_leads add column if not exists website_url text not null default '';
alter table public.fcap_leads add column if not exists instagram_url text not null default '';
alter table public.fcap_leads add column if not exists linkedin_url text not null default '';
alter table public.fcap_leads add column if not exists tiktok_url text not null default '';

alter table public.fcap_analyses add column if not exists first_message text not null default '';
alter table public.fcap_analyses add column if not exists service_quality text not null default '';
alter table public.fcap_analyses add column if not exists research_sources jsonb not null default '[]'::jsonb;

alter table public.fcap_articles add column if not exists seo_tags text[] not null default '{}'::text[];

-- Protege a ultima coluna tambem pelo banco.
create or replace function public.fcap_r9_guard_last_stage() returns trigger
language plpgsql set search_path=public as $$
begin
  perform pg_advisory_xact_lock(9012601);
  if (select count(*) from public.fcap_stages) <= 1 then
    raise exception 'Nao e permitido excluir a ultima etapa do funil';
  end if;
  return old;
end; $$;
drop trigger if exists fcap_r9_guard_last_stage on public.fcap_stages;
create trigger fcap_r9_guard_last_stage before delete on public.fcap_stages
for each row execute function public.fcap_r9_guard_last_stage();

-- O banco ja protege exclusao de etapas usadas: fcap_leads.stage_id possui FK sem ON DELETE CASCADE.
-- Gerenciamento de colunas exige leads.edit e cargo admin/gestor na policy R7.
-- Evitar exclusao da ultima coluna e tarefa de validacao da interface; revisar RLS e regras
-- em producao antes de habilitar APIs publicas.

commit;
