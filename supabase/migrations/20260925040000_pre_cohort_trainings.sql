-- Phase 4 — pre-cohort trainings & get-togethers: admin creates/edits/deletes
-- SupportSession rows of these two types directly (mark_support_attendance,
-- from 20260924000000_support_hubs.sql, already handles marking attendance on
-- them — a hub lead or admin can mark any session whose hubId is NULL, which
-- is what these sessions have). Sunday-recap sessions stay RPC-only: this
-- policy explicitly excludes them, same lockdown as before.
--
-- SupportNote already allows noteType 'ELIGIBILITY_OVERRIDE' (Phase 3), so no
-- change needed there.

GRANT INSERT, UPDATE, DELETE ON public."SupportSession" TO anon, authenticated;

DROP POLICY IF EXISTS "Admins manage training sessions" ON public."SupportSession";
CREATE POLICY "Admins manage training sessions" ON public."SupportSession" FOR ALL
  USING (public.app_is_admin() AND type <> 'SUNDAY_RECAP')
  WITH CHECK (public.app_is_admin() AND type <> 'SUNDAY_RECAP');
