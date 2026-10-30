-- Last active for many staff at once (the Supports page asked once per support, 49 requests a load).
-- Same rule as user_last_active: staff only, the later of the newest session and the hub's last-seen time.
--
-- Rollback: DROP FUNCTION public.users_last_active(uuid[]);

CREATE OR REPLACE FUNCTION public.users_last_active(p_user_ids UUID[])
 RETURNS JSONB
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT CASE WHEN public.app_is_staff() THEN COALESCE((
    SELECT jsonb_object_agg(u.id, GREATEST(
      (SELECT MAX(s."lastSeenAt") FROM "AppSession" s WHERE s."userId" = u.id),
      u."hubLastSeenAt"))
    FROM "User" u WHERE u.id = ANY (COALESCE(p_user_ids, '{}'))
  ), '{}'::jsonb) END;
$function$;

REVOKE ALL ON FUNCTION public.users_last_active(UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.users_last_active(UUID[]) TO anon, authenticated;
