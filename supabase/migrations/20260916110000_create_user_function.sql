-- Account creation also hashes in the database.
--
-- "User".password_hash is NOT NULL, and the browser must never compute a hash,
-- so creation goes through one function that validates, hashes and inserts.

CREATE OR REPLACE FUNCTION public.create_user(
  p_name TEXT,
  p_password TEXT,
  p_email TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL,
  p_role TEXT DEFAULT 'SUPPORT'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  created "User";
  normalized_email TEXT := NULLIF(lower(trim(COALESCE(p_email, ''))), '');
  normalized_phone TEXT := NULLIF(trim(COALESCE(p_phone, '')), '');
BEGIN
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
$$;

GRANT EXECUTE ON FUNCTION public.create_user(TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
