-- Accounts an admin creates start with the password the admin chose (shared in the
-- invite message), so the person must pick their own at first sign-in, the same
-- ForcePasswordChangeModal step a password reset uses. Only the admin variant changes.
CREATE OR REPLACE FUNCTION public.create_user(p_token text, p_name text, p_password text, p_email text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_role text DEFAULT 'SUPPORT'::text)
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

  INSERT INTO "User" (email, phone, name, role, password_hash, "mustChangePassword")
  VALUES (
    normalized_email,
    normalized_phone,
    trim(p_name),
    p_role::"Role",
    crypt(p_password, gen_salt('bf', 10)),
    TRUE
  )
  RETURNING * INTO created;

  RETURN public.safe_user_json(created);
END;
$function$;
