-- Phase C batch 1 of the lockdown: the programme structure.
--
-- Same swap the MessageTemplate pilot proved in 20260917270000 -- USING(true)
-- out, app_is_staff() in -- applied to the tables that describe the schedule
-- and who is assigned to it. These are read constantly by Home and My Schedule,
-- so a bad predicate here shows up immediately in the browser.
--
-- Batched rather than swept in one go: ten tables is small enough that if
-- something misbehaves it is obvious which change caused it, and one ALTER per
-- table puts any of them back.
--
-- Notification is deliberately left open in every batch. It is the only table
-- in the supabase_realtime publication, and locking it would cut the live feed
-- the notification bell depends on.
--
-- Participants are unaffected: their app never reads a table directly, only
-- SECURITY DEFINER functions owned by postgres, which bypass RLS. Edge
-- functions are unaffected too -- service_role carries BYPASSRLS.

ALTER POLICY "Allow all operations" ON public."Cohort"
  USING (public.app_is_staff()) WITH CHECK (public.app_is_staff());

ALTER POLICY "Allow all operations" ON public."Week"
  USING (public.app_is_staff()) WITH CHECK (public.app_is_staff());

ALTER POLICY "Allow all operations" ON public."Day"
  USING (public.app_is_staff()) WITH CHECK (public.app_is_staff());

ALTER POLICY "Allow all operations" ON public."Activity"
  USING (public.app_is_staff()) WITH CHECK (public.app_is_staff());

ALTER POLICY "Allow all operations" ON public."ActivityLabel"
  USING (public.app_is_staff()) WITH CHECK (public.app_is_staff());

ALTER POLICY "Allow all operations" ON public."ActivityTeam"
  USING (public.app_is_staff()) WITH CHECK (public.app_is_staff());

ALTER POLICY "Allow all operations" ON public."Label"
  USING (public.app_is_staff()) WITH CHECK (public.app_is_staff());

ALTER POLICY "Allow all operations" ON public."UserLabel"
  USING (public.app_is_staff()) WITH CHECK (public.app_is_staff());

ALTER POLICY "Allow all operations" ON public."UserCohort"
  USING (public.app_is_staff()) WITH CHECK (public.app_is_staff());

ALTER POLICY "Allow all operations" ON public."Team"
  USING (public.app_is_staff()) WITH CHECK (public.app_is_staff());
