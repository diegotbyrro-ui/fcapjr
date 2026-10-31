-- FCAP Jr. R11 | DISTRIBUICAO DE LEADS EXTERNOS
-- PREPARADO PARA EXECUCAO MANUAL EM SUPABASE EXCLUSIVO DA FCAP JR.
-- NUNCA EXECUTAR AUTOMATICAMENTE EM INSTALACAO OFFLINE.
-- Requer previamente 20261030_fcap_crm.sql e 20261031_fcap_permissions.sql.
-- REVISAR permissao de origem e esquema antes de producao.
begin;

-- Recepcao de lead do site / redes: atribuir entre vendedores ativos habilitados.
-- Criterio: menor numero de leads externos acumulados, sorteio aleatorio em empate.
-- Para evitar concorrencia de varias captacoes simultaneas, bloquear a transacao
-- de atribuicao antes de contar leads. Nao bloqueia insercoes manuais.
create or replace function public.fcap_assign_inbound()
returns trigger
language plpgsql
security definer
set search_path=public, pg_temp
as $$
declare
  chosen_user uuid;
begin
  -- Atribuicao explicita sempre prevalece (cadastro feito pela equipe).
  if new.assigned_to is not null then return new; end if;

  if not (
      lower(coalesce(new.source,'')) like 'site\_%' escape '\'
      or lower(coalesce(new.source,'')) like 'social\_%' escape '\'
      or lower(coalesce(new.source,'')) in
      ('site','formulario_site','instagram','facebook','meta_facebook','tiktok','linkedin')
    ) then return new; end if;

  perform pg_advisory_xact_lock(9211067001::bigint);

  select m.user_id into chosen_user
  from public.fcap_members as m
  left join (
    select l.assigned_to, count(*)::integer as lead_count
    from public.fcap_leads as l
    where
      lower(coalesce(l.source,'')) like 'site\_%' escape '\'
      or lower(coalesce(l.source,'')) like 'social\_%' escape '\'
      or lower(coalesce(l.source,'')) in
      ('site','formulario_site','instagram','facebook','meta_facebook','tiktok','linkedin')
    group by l.assigned_to
  ) as tally on tally.assigned_to=m.user_id
  where m.active=true and m.role='vendedor'
    and 'leads.edit'=any(coalesce(m.permissions,'{}'::text[]))
  order by coalesce(tally.lead_count,0) asc, random()
  limit 1;

  -- Sem vendedor ativo: preserva lead sem responsavel, sem descartá-lo.
  new.assigned_to=chosen_user;
  return new;
end;
$$;

revoke all on function public.fcap_assign_inbound() from public, anon, authenticated;
-- Trigger fcap_assign_inbound ja existe desde a migracao inicial; esta migracao
-- substitui apenas a funcao, sem criar triggers duplicados.

-- Direcionar o aviso ao responsavel sorteado (e a gestores/administradores).
-- Se nao houver vendedor elegivel, a gestao recebe o aviso de novo lead.
create or replace function public.fcap_on_lead()
returns trigger language plpgsql security definer set search_path=public, pg_temp as $$
begin
  if new.source='importacao' then return new; end if;
  insert into public.fcap_alerts(recipient_id,category,message,lead_id,dedupe_key)
  select m.user_id,'novo_lead',
    case when new.assigned_to is null then 'LEAD SEM RESPONSAVEL: ' else 'Novo lead atribuido: ' end
      || new.company_name,
    new.id,'lead:'||new.id::text
  from public.fcap_members m
  where m.active and (m.user_id=new.assigned_to or m.role in ('admin','gestor'))
  on conflict (recipient_id,dedupe_key) do nothing;
  return new;
end;
$$;
revoke all on function public.fcap_on_lead() from public, anon, authenticated;
commit;
