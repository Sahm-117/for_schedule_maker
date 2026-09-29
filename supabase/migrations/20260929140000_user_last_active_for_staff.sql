-- Last active for everyone on support profiles, not just admins.
--
-- Supports used to see "Last active in Community" (hubLastSeenAt) on a
-- profile, while admins saw real app activity. Now any signed-in staff
-- account (admin or support) gets the same "Last active". It is still one
-- timestamp: the latest sign-in session refresh or Community visit. Login
-- records themselves stay unreadable.
--
-- Same as 20260928110000_user_last_active.sql, with app_is_staff() in place
-- of app_is_admin(). Rollback: re-apply that migration.

CREATE OR REPLACE FUNCTION public.user_last_active(p_user_id UUID)
RETURNS TIMESTAMPTZ
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
  SELECT CASE WHEN public.app_is_staff() THEN (
    SELECT GREATEST(
      (SELECT MAX(s."lastSeenAt") FROM "AppSession" s WHERE s."userId" = p_user_id),
      (SELECT u."hubLastSeenAt" FROM "User" u WHERE u.id = p_user_id)
    )
  ) END;
$function$;

REVOKE ALL ON FUNCTION public.user_last_active(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_last_active(UUID) TO anon, authenticated;
