-- First table off USING(true). MessageTemplate is the pilot: staff-only, small,
-- and exercised by a page a support actually opens (Mobilisation), so the change
-- can be checked in the browser rather than only at the API.
--
-- 20260917260000 added app_is_staff(), which reads the session token the client
-- now sends on every request. Swapping the predicate in means a caller holding
-- nothing but the public anon key sees no rows and can write none.
--
-- ALTER, not DROP + CREATE: the policy object stays put, and one ALTER back to
-- USING(true) undoes this if anything misbehaves. Grants are untouched here --
-- those come off separately once every table is on a real predicate.
--
-- Unaffected by this change:
--   service_role has BYPASSRLS, so all 14 edge functions keep working.
--   SECURITY DEFINER RPCs are owned by postgres and no table forces RLS, so
--   the participant app (which never touches a table directly) is untouched.

ALTER POLICY "Allow all operations" ON public."MessageTemplate"
  USING (public.app_is_staff())
  WITH CHECK (public.app_is_staff());
