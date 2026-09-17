-- Phase C batch 5: settings and the app's own plumbing. Last of the batches.
--
-- Programme rules and thresholds, the profile questions and everyone's answers,
-- the schedule change queue, and the push/notification wiring. Less obviously
-- sensitive than names and phone numbers, but all of it was rewritable by
-- anyone holding the key in the browser bundle -- and AppSetting in particular
-- decides how the programme judges people.
--
-- Same swap as the batches before: USING(true) out, app_is_staff() in.
--
-- Checked before writing this:
--   push subscriptions are written by usePushNotifications, a hook in the page,
--     not by the service worker -- so they carry the session token like
--     everything else
--   PushReminderLog is only ever written by edge functions on service_role,
--     which bypasses RLS
--   push_subscriptions and notification_settings (lower case) are empty and
--     referenced nowhere in the app or the functions -- they look like
--     leftovers from an earlier naming, and are locked here rather than
--     removed, which is not this change's call to make

ALTER POLICY "Allow all operations" ON public."AppSetting"
  USING (public.app_is_staff()) WITH CHECK (public.app_is_staff());

ALTER POLICY "Allow all operations" ON public."ProfileField"
  USING (public.app_is_staff()) WITH CHECK (public.app_is_staff());

ALTER POLICY "Allow all operations" ON public."ProfileFieldAnswer"
  USING (public.app_is_staff()) WITH CHECK (public.app_is_staff());

ALTER POLICY "Allow all operations" ON public."PendingChange"
  USING (public.app_is_staff()) WITH CHECK (public.app_is_staff());

ALTER POLICY "Allow all operations" ON public."RejectedChange"
  USING (public.app_is_staff()) WITH CHECK (public.app_is_staff());

ALTER POLICY "Allow all operations" ON public."OnboardingEvent"
  USING (public.app_is_staff()) WITH CHECK (public.app_is_staff());

ALTER POLICY "Allow all operations" ON public."PushSubscription"
  USING (public.app_is_staff()) WITH CHECK (public.app_is_staff());

ALTER POLICY "Allow all operations" ON public."UserNotificationSetting"
  USING (public.app_is_staff()) WITH CHECK (public.app_is_staff());

ALTER POLICY "Allow all operations" ON public."PushReminderLog"
  USING (public.app_is_staff()) WITH CHECK (public.app_is_staff());

ALTER POLICY "Allow all operations" ON public.push_subscriptions
  USING (public.app_is_staff()) WITH CHECK (public.app_is_staff());

ALTER POLICY "Allow all operations" ON public.notification_settings
  USING (public.app_is_staff()) WITH CHECK (public.app_is_staff());
