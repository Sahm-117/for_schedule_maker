-- Require an admin session for the two user-administration functions.
--
-- create_user and set_user_password are SECURITY DEFINER with EXECUTE granted
-- to anon, and neither checks who is calling. The anon key ships in the browser
-- bundle, so anyone reading it could mint themselves an ADMIN account or reset
-- any account's password, including an admin's.
--
-- These overloads take a session token and require an active ADMIN, using the
-- same app_staff(p_token) convention as the participant-app functions. The old
-- signatures are left callable so the deployed frontend keeps working; the
-- follow-up migration revokes and drops them once the new build is live.

CREATE OR REPLACE FUNCTION public.create_user(
  p_token TEXT,
  p_name TEXT,
  p_password TEXT,
  p_email TEXT DEFAULT NULL::TEXT,
  p_phone TEXT DEFAULT NULL::TEXT,
  p_role TEXT DEFAULT 'SUPPORT'::TEXT
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  actor "User" := public.app_staff(p_token);
  created "User";
  normalized_email TEXT := NULLIF(lower(trim(COALESCE(p_email, ''))), '');
  normalized_phone TEXT := NULLIF(trim(COALESCE(p_phone, '')), '');
BEGIN
  IF actor.id IS NULL OR actor.role <> 'ADMIN'::"Role" THEN
    RAISE EXCEPTION 'NOT_AUTHORISED';
  END IF;

  IF p_name IS NULL OR trim(p_name) = '' THEN
    RAISE EXCEPTION 'A name is required';
  END IF;
  IF p_password IS NULL OR length(p_password) < 8 THEN
    RAISE EXCEPTION 'Password must be at least 8 characters';
  END IF;
  IF normalized_email IS NULL AND normalized_phone IS NULL THEN
    RAISE EXCEPTION 'An email address or phone number is required';
  END IF;
  IF p_role NOT IN ('ADMIN', 'SOP_PREPARER', 'SUPPORT') THEN
    RAISE EXCEPTION 'Unknown role';
  END IF;

  INSERT INTO "User" (email, phone, name, role, password_hash)
  VALUES (
    normalized_email,
    normalized_phone,
    trim(p_name),
    p_role::"Role",
    crypt(p_password, gen_salt('bf', 10))
  )
  RETURNING * INTO created;

  RETURN public.safe_user_json(created);
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_user_password(
  p_token TEXT,
  target_user UUID,
  new_password TEXT,
  force_change BOOLEAN DEFAULT TRUE
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  actor "User" := public.app_staff(p_token);
BEGIN
  IF actor.id IS NULL OR actor.role <> 'ADMIN'::"Role" THEN
    RAISE EXCEPTION 'NOT_AUTHORISED';
  END IF;

  IF new_password IS NULL OR length(new_password) < 8 THEN
    RAISE EXCEPTION 'Password must be at least 8 characters';
  END IF;

  UPDATE "User"
  SET password_hash = crypt(new_password, gen_salt('bf', 10)),
      "mustChangePassword" = force_change,
      "updatedAt" = NOW()
  WHERE id = target_user;

  RETURN FOUND;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_user(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_user_password(TEXT, UUID, TEXT, BOOLEAN) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_user(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_user_password(TEXT, UUID, TEXT, BOOLEAN) TO anon, authenticated;
