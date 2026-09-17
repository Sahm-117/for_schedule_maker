-- Stop anon from granting itself ADMIN by writing "User".role directly.
--
-- 20260916130000 granted anon column-level UPDATE and INSERT on "User",
-- including the role column, and the table's policy is USING(true). With the
-- anon key in the browser bundle, a single PATCH could promote any account to
-- ADMIN -- which bypasses the admin gate added in 20260917220000.
--
-- Role changes move to an admin-gated function. This migration only adds it;
-- the grants come off in the follow-up once the new frontend is live.

CREATE OR REPLACE FUNCTION public.set_user_role(
  p_token TEXT,
  target_user UUID,
  p_role TEXT
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  actor "User" := public.app_staff(p_token);
  updated "User";
BEGIN
  IF actor.id IS NULL OR actor.role <> 'ADMIN'::"Role" THEN
    RAISE EXCEPTION 'NOT_AUTHORISED';
  END IF;

  IF p_role NOT IN ('ADMIN', 'SOP_PREPARER', 'SUPPORT') THEN
    RAISE EXCEPTION 'Unknown role';
  END IF;

  -- An admin removing their own admin rights could lock the last one out.
  IF actor.id = target_user AND p_role <> 'ADMIN' THEN
    RAISE EXCEPTION 'CANNOT_DEMOTE_SELF';
  END IF;

  UPDATE "User"
  SET role = p_role::"Role",
      "updatedAt" = NOW()
  WHERE id = target_user
  RETURNING * INTO updated;

  IF updated.id IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  RETURN public.safe_user_json(updated);
END;
$function$;

REVOKE ALL ON FUNCTION public.set_user_role(TEXT, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_user_role(TEXT, UUID, TEXT) TO anon, authenticated;
