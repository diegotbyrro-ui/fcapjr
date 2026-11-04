-- FCAP Jr. R21 - isolamento entre carteiras comerciais.
-- Ja aplicado no Supabase FCAP Jr. em 2026-11-04 (migration 20261104162829).
-- Este arquivo e SOMENTE para historico no Git: o instalador nao executa SQL.
-- Vendedores acessam apenas suas atribuicoes; admin e gestor podem consultar todas.
-- Leads/reunioes sem responsavel permanecem disponiveis somente para diretoria.

DROP POLICY IF EXISTS fcap_lead_select ON public.fcap_leads;
CREATE POLICY fcap_lead_select ON public.fcap_leads FOR SELECT TO authenticated USING (
 (fcap_internal.fcap_permit('leads.view') OR fcap_internal.fcap_permit('pipeline.view')
  OR fcap_internal.fcap_permit('reports.view') OR fcap_internal.fcap_permit('dashboard.view')
  OR fcap_internal.fcap_permit('analyst.use') OR fcap_internal.fcap_permit('prospector.use')
  OR fcap_internal.fcap_permit('secretary.use'))
 AND (fcap_internal.fcap_role() IN ('admin','gestor') OR assigned_to = (SELECT auth.uid()))
);
DROP POLICY IF EXISTS fcap_lead_insert ON public.fcap_leads;
CREATE POLICY fcap_lead_insert ON public.fcap_leads FOR INSERT TO authenticated WITH CHECK (
 fcap_internal.fcap_permit('leads.edit')
 AND (fcap_internal.fcap_role() IN ('admin','gestor') OR assigned_to = (SELECT auth.uid()))
);
DROP POLICY IF EXISTS fcap_lead_update ON public.fcap_leads;
CREATE POLICY fcap_lead_update ON public.fcap_leads FOR UPDATE TO authenticated USING (
 fcap_internal.fcap_permit('leads.edit')
 AND (fcap_internal.fcap_role() IN ('admin','gestor') OR assigned_to = (SELECT auth.uid()))
) WITH CHECK (
 fcap_internal.fcap_permit('leads.edit')
 AND (fcap_internal.fcap_role() IN ('admin','gestor') OR assigned_to = (SELECT auth.uid()))
);

DROP POLICY IF EXISTS fcap_meeting_select ON public.fcap_meetings;
CREATE POLICY fcap_meeting_select ON public.fcap_meetings FOR SELECT TO authenticated USING (
 (fcap_internal.fcap_permit('agenda.view') OR fcap_internal.fcap_permit('secretary.use')
  OR fcap_internal.fcap_permit('dashboard.view'))
 AND (fcap_internal.fcap_role() IN ('admin','gestor') OR (
  assigned_to = (SELECT auth.uid())
  AND (lead_id IS NULL OR EXISTS (
   SELECT 1 FROM public.fcap_leads l WHERE l.id = lead_id AND l.assigned_to = (SELECT auth.uid())
  ))
 ))
);
DROP POLICY IF EXISTS fcap_meeting_insert ON public.fcap_meetings;
CREATE POLICY fcap_meeting_insert ON public.fcap_meetings FOR INSERT TO authenticated WITH CHECK (
 fcap_internal.fcap_permit('agenda.edit')
 AND (fcap_internal.fcap_role() IN ('admin','gestor') OR (
  assigned_to = (SELECT auth.uid())
  AND (lead_id IS NULL OR EXISTS (
   SELECT 1 FROM public.fcap_leads l WHERE l.id = lead_id AND l.assigned_to = (SELECT auth.uid())
  ))
 ))
);
DROP POLICY IF EXISTS fcap_meeting_update ON public.fcap_meetings;
CREATE POLICY fcap_meeting_update ON public.fcap_meetings FOR UPDATE TO authenticated USING (
 fcap_internal.fcap_permit('agenda.edit')
 AND (fcap_internal.fcap_role() IN ('admin','gestor') OR (
  assigned_to = (SELECT auth.uid())
  AND (lead_id IS NULL OR EXISTS (
   SELECT 1 FROM public.fcap_leads l WHERE l.id = lead_id AND l.assigned_to = (SELECT auth.uid())
  ))
 ))
) WITH CHECK (
 fcap_internal.fcap_permit('agenda.edit')
 AND (fcap_internal.fcap_role() IN ('admin','gestor') OR (
  assigned_to = (SELECT auth.uid())
  AND (lead_id IS NULL OR EXISTS (
   SELECT 1 FROM public.fcap_leads l WHERE l.id = lead_id AND l.assigned_to = (SELECT auth.uid())
  ))
 ))
);

DROP POLICY IF EXISTS fcap_task_select ON public.fcap_tasks;
CREATE POLICY fcap_task_select ON public.fcap_tasks FOR SELECT TO authenticated USING (
 (fcap_internal.fcap_permit('agenda.view') OR fcap_internal.fcap_permit('secretary.use')
  OR fcap_internal.fcap_permit('dashboard.view'))
 AND (fcap_internal.fcap_role() IN ('admin','gestor') OR (
  assigned_to = (SELECT auth.uid())
  AND (lead_id IS NULL OR EXISTS (
   SELECT 1 FROM public.fcap_leads l WHERE l.id = lead_id AND l.assigned_to = (SELECT auth.uid())
  ))
 ))
);
DROP POLICY IF EXISTS fcap_task_insert ON public.fcap_tasks;
CREATE POLICY fcap_task_insert ON public.fcap_tasks FOR INSERT TO authenticated WITH CHECK (
 fcap_internal.fcap_permit('agenda.edit')
 AND (fcap_internal.fcap_role() IN ('admin','gestor') OR (
  assigned_to = (SELECT auth.uid())
  AND (lead_id IS NULL OR EXISTS (
   SELECT 1 FROM public.fcap_leads l WHERE l.id = lead_id AND l.assigned_to = (SELECT auth.uid())
  ))
 ))
);
DROP POLICY IF EXISTS fcap_task_update ON public.fcap_tasks;
CREATE POLICY fcap_task_update ON public.fcap_tasks FOR UPDATE TO authenticated USING (
 fcap_internal.fcap_permit('agenda.edit')
 AND (fcap_internal.fcap_role() IN ('admin','gestor') OR (
  assigned_to = (SELECT auth.uid())
  AND (lead_id IS NULL OR EXISTS (
   SELECT 1 FROM public.fcap_leads l WHERE l.id = lead_id AND l.assigned_to = (SELECT auth.uid())
  ))
 ))
) WITH CHECK (
 fcap_internal.fcap_permit('agenda.edit')
 AND (fcap_internal.fcap_role() IN ('admin','gestor') OR (
  assigned_to = (SELECT auth.uid())
  AND (lead_id IS NULL OR EXISTS (
   SELECT 1 FROM public.fcap_leads l WHERE l.id = lead_id AND l.assigned_to = (SELECT auth.uid())
  ))
 ))
);

DROP POLICY IF EXISTS fcap_member_directory ON public.fcap_members;
CREATE POLICY fcap_member_directory ON public.fcap_members FOR SELECT TO authenticated USING (
 fcap_internal.fcap_role() IN ('admin','gestor') OR user_id = (SELECT auth.uid())
);
