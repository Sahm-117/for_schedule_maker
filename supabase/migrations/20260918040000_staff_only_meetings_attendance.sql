-- Phase C batch 4: meetings, attendance and the support's own working records.
--
-- Who turned up, who missed, what was prayed about, what a support has left to
-- do this week, and the faith projects people are writing. All of it was
-- readable and rewritable with the key that ships in the browser bundle.
--
-- Same swap as the batches before: USING(true) out, app_is_staff() in.
--
-- Participants keep their side of this. They reach faith projects through
-- save_faith_project and participant_faith, and their recap through
-- participant_home -- all SECURITY DEFINER and owned by postgres, so none of
-- them are touched by a table policy. ParticipantThreadRead, which tracks what
-- a participant has read, is a different table and was already locked.

ALTER POLICY "Allow all operations" ON public."AttendanceRecord"
  USING (public.app_is_staff()) WITH CHECK (public.app_is_staff());

ALTER POLICY "Allow all operations" ON public."MeetingAttendance"
  USING (public.app_is_staff()) WITH CHECK (public.app_is_staff());

ALTER POLICY "Allow all operations" ON public."GroupPrayer"
  USING (public.app_is_staff()) WITH CHECK (public.app_is_staff());

ALTER POLICY "Allow all operations" ON public."GroupPrayerFocus"
  USING (public.app_is_staff()) WITH CHECK (public.app_is_staff());

ALTER POLICY "Allow all operations" ON public."GroupPrayerStatus"
  USING (public.app_is_staff()) WITH CHECK (public.app_is_staff());

ALTER POLICY "Allow all operations" ON public."RecapRelease"
  USING (public.app_is_staff()) WITH CHECK (public.app_is_staff());

ALTER POLICY "Allow all operations" ON public."FaithProject"
  USING (public.app_is_staff()) WITH CHECK (public.app_is_staff());

ALTER POLICY "Allow all operations" ON public."FaithThreadRead"
  USING (public.app_is_staff()) WITH CHECK (public.app_is_staff());

ALTER POLICY "Allow all operations" ON public."CoverRequest"
  USING (public.app_is_staff()) WITH CHECK (public.app_is_staff());

ALTER POLICY "Allow all operations" ON public."SupportChecklistItem"
  USING (public.app_is_staff()) WITH CHECK (public.app_is_staff());

ALTER POLICY "Allow all operations" ON public."SupportActivityCompletion"
  USING (public.app_is_staff()) WITH CHECK (public.app_is_staff());
