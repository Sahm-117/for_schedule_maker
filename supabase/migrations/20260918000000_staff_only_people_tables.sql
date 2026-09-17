-- Phase C batch 2: the people. This is the batch that closes the exposure that
-- actually matters -- names and phone numbers in Participant, and pastoral-care
-- notes in ParticipantNote, both of which anyone could read and rewrite with the
-- key that ships in the browser bundle.
--
-- Same swap as batches before it: USING(true) out, app_is_staff() in. Twelve
-- tables, all reached only from the support and admin screens.
--
-- "User" is deliberately NOT here. authApi.getMe() reads it directly when a
-- session is restored, so it is the one table whose lockdown touches the login
-- path. It gets its own migration and its own browser pass.
--
-- Notification stays open, as in every batch -- it is the only table in the
-- realtime publication and the notification bell's live feed depends on it.
--
-- Participants keep their own data: their app reads nothing directly, only
-- SECURITY DEFINER functions owned by postgres, which bypass RLS.

ALTER POLICY "Allow all operations" ON public."Participant"
  USING (public.app_is_staff()) WITH CHECK (public.app_is_staff());

ALTER POLICY "Allow all operations" ON public."ParticipantNote"
  USING (public.app_is_staff()) WITH CHECK (public.app_is_staff());

ALTER POLICY "Allow all operations" ON public."ParticipantFlag"
  USING (public.app_is_staff()) WITH CHECK (public.app_is_staff());

ALTER POLICY "Allow all operations" ON public."ParticipantHandover"
  USING (public.app_is_staff()) WITH CHECK (public.app_is_staff());

ALTER POLICY "Allow all operations" ON public."ParticipantCheckIn"
  USING (public.app_is_staff()) WITH CHECK (public.app_is_staff());

ALTER POLICY "Allow all operations" ON public."ParticipantOnboardingStatus"
  USING (public.app_is_staff()) WITH CHECK (public.app_is_staff());

ALTER POLICY "Allow all operations" ON public."ParticipantStageChange"
  USING (public.app_is_staff()) WITH CHECK (public.app_is_staff());

ALTER POLICY "Allow all operations" ON public."ParticipantWrapUp"
  USING (public.app_is_staff()) WITH CHECK (public.app_is_staff());

ALTER POLICY "Allow all operations" ON public."DepartmentReferral"
  USING (public.app_is_staff()) WITH CHECK (public.app_is_staff());

ALTER POLICY "Allow all operations" ON public."Group"
  USING (public.app_is_staff()) WITH CHECK (public.app_is_staff());

ALTER POLICY "Allow all operations" ON public."GroupParticipant"
  USING (public.app_is_staff()) WITH CHECK (public.app_is_staff());

ALTER POLICY "Allow all operations" ON public."GroupOnboardingStatus"
  USING (public.app_is_staff()) WITH CHECK (public.app_is_staff());
