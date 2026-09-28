-- Last time a staff/support account used the app, for the admin profile window.
-- Sign-in sessions refresh "lastSeenAt" at most once an hour, so this is accurate
-- to the hour. Admin-only: anyone else gets NULL. Login records stay unreadable.
CREATE OR REPLACE FUNCTION public.user_last_active(p_user_id UUID)
RETURNS TIMESTAMPTZ
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
  SELECT CASE WHEN public.app_is_admin() THEN (
    SELECT GREATEST(
      (SELECT MAX(s."lastSeenAt") FROM "AppSession" s WHERE s."userId" = p_user_id),
      (SELECT u."hubLastSeenAt" FROM "User" u WHERE u.id = p_user_id)
    )
  ) END;
$function$;

REVOKE ALL ON FUNCTION public.user_last_active(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_last_active(UUID) TO anon, authenticated;
