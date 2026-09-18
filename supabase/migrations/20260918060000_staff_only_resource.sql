-- Resource, the last table on USING(true) apart from Notification.
--
-- It carries four policies rather than the one the batches shared, so it could
-- not ride along with them:
--
--   resource_open      ALL     true / true
--   Resource: read     SELECT  true
--   Resource: insert   INSERT  EXISTS (SELECT 1 FROM "User" WHERE role = 'ADMIN')
--   Resource: delete   DELETE  EXISTS (SELECT 1 FROM "User" WHERE role = 'ADMIN')
--
-- Permissive policies are OR'd together, so every one of them has to require a
-- session or the table stays open through whichever is loosest.
--
-- The two EXISTS checks do not do what they look like they do. They ask whether
-- ANY admin exists in the "User" table, not whether the caller is one, so they
-- are true for everybody -- including an anonymous caller. They are left in
-- place here, tightened to a signed-in session like the rest, because fixing
-- them properly means narrowing or removing resource_open (which grants writes
-- to everyone regardless) and that decides who on the team may add or delete a
-- resource. The app already hides those buttons behind isAdmin, so the UI and
-- the database disagree today -- worth settling deliberately, not as a side
-- effect of the lockdown.
--
-- Participants still see resources: they read them through participant_home,
-- which is SECURITY DEFINER and owned by postgres.

ALTER POLICY resource_open ON public."Resource"
  USING (public.app_is_staff()) WITH CHECK (public.app_is_staff());

ALTER POLICY "Resource: read" ON public."Resource"
  USING (public.app_is_staff());

ALTER POLICY "Resource: insert" ON public."Resource"
  WITH CHECK (
    public.app_is_staff()
    AND EXISTS (SELECT 1 FROM "User" WHERE "User".role = 'ADMIN'::"Role")
  );

ALTER POLICY "Resource: delete" ON public."Resource"
  USING (
    public.app_is_staff()
    AND EXISTS (SELECT 1 FROM "User" WHERE "User".role = 'ADMIN'::"Role")
  );
