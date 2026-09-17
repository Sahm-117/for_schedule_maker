-- Phase C batch 3: follow-ups, the hub, and what the app puts in front of people.
--
-- FollowUpContact is the sensitive one here -- names, phone numbers and notes
-- on people who have not joined yet -- and the hub tables carry staff
-- conversation, which has no business being readable by strangers.
--
-- Same swap as the batches before: USING(true) out, app_is_staff() in.
--
-- Notification stays open, as in every batch. It is the only table in the
-- realtime publication and the bell's live feed depends on it.
--
-- Scripture is read by participants through participant_home, a SECURITY
-- DEFINER function owned by postgres, so locking the table does not take the
-- daily scripture away from them.

ALTER POLICY "Allow all operations" ON public."FollowUpContact"
  USING (public.app_is_staff()) WITH CHECK (public.app_is_staff());

ALTER POLICY "Allow all operations" ON public."FollowUpIssue"
  USING (public.app_is_staff()) WITH CHECK (public.app_is_staff());

ALTER POLICY "Allow all operations" ON public."HubTopic"
  USING (public.app_is_staff()) WITH CHECK (public.app_is_staff());

ALTER POLICY "Allow all operations" ON public."HubComment"
  USING (public.app_is_staff()) WITH CHECK (public.app_is_staff());

ALTER POLICY "Allow all operations" ON public."HubReply"
  USING (public.app_is_staff()) WITH CHECK (public.app_is_staff());

ALTER POLICY "Allow all operations" ON public."HubReaction"
  USING (public.app_is_staff()) WITH CHECK (public.app_is_staff());

ALTER POLICY "Allow all operations" ON public."Announcement"
  USING (public.app_is_staff()) WITH CHECK (public.app_is_staff());

ALTER POLICY "Allow all operations" ON public."Scripture"
  USING (public.app_is_staff()) WITH CHECK (public.app_is_staff());
