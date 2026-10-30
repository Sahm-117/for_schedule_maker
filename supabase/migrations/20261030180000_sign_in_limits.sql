-- Sign-in attempt limits (FLOW_MAP rule 128).
--
-- After 10 wrong passwords for one login (an email, or a phone number however it is written) within 15 minutes,
-- that login is paused for 15 minutes: sign_in raises TOO_MANY_ATTEMPTS and the app says to wait. A correct
-- password clears the count. The same limit covers change_own_password, per account.
--
-- The checks themselves are unchanged: the old functions are renamed (sign_in_check, change_own_password_check),
-- closed to the app's roles, and wrapped by the public names. login_user, which only sign_in uses, is closed to
-- the app's roles too, so a password can only be tried through the limited door.
--
-- Rollback: DROP FUNCTION public.sign_in(text, text), public.change_own_password(uuid, text, text);
-- ALTER FUNCTION public.sign_in_check(text, text) RENAME TO sign_in;
-- ALTER FUNCTION public.change_own_password_check(uuid, text, text) RENAME TO change_own_password;
-- GRANT EXECUTE ON FUNCTION public.sign_in(text, text), public.change_own_password(uuid, text, text),
--   public.login_user(text, text) TO anon, authenticated; DROP TABLE public."SignInThrottle", and the two helpers.

CREATE TABLE IF NOT EXISTS public."SignInThrottle" (
  key TEXT PRIMARY KEY,
  failures INTEGER NOT NULL DEFAULT 0,
  "firstFailAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "lockedUntil" TIMESTAMPTZ
);
ALTER TABLE public."SignInThrottle" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."SignInThrottle" FROM anon, authenticated;

-- Raises TOO_MANY_ATTEMPTS while the login is paused.
CREATE OR REPLACE FUNCTION public.sign_in_guard(p_key TEXT)
 RETURNS VOID
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF EXISTS (SELECT 1 FROM public."SignInThrottle" WHERE key = p_key AND "lockedUntil" > NOW()) THEN
    RAISE EXCEPTION 'TOO_MANY_ATTEMPTS';
  END IF;
END;
$function$;

-- A correct password clears the count; a wrong one adds to it, and the tenth within 15 minutes pauses the login.
CREATE OR REPLACE FUNCTION public.sign_in_record(p_key TEXT, p_ok BOOLEAN)
 RETURNS VOID
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF p_key IS NULL THEN RETURN; END IF;
  IF p_ok THEN
    DELETE FROM public."SignInThrottle" WHERE key = p_key;
    RETURN;
  END IF;
  INSERT INTO public."SignInThrottle" AS t (key, failures, "firstFailAt")
  VALUES (p_key, 1, NOW())
  ON CONFLICT (key) DO UPDATE SET
    failures = CASE WHEN t."firstFailAt" < NOW() - INTERVAL '15 minutes' THEN 1 ELSE t.failures + 1 END,
    "firstFailAt" = CASE WHEN t."firstFailAt" < NOW() - INTERVAL '15 minutes' THEN NOW() ELSE t."firstFailAt" END,
    "lockedUntil" = CASE
      WHEN t."firstFailAt" >= NOW() - INTERVAL '15 minutes' AND t.failures + 1 >= 10 THEN NOW() + INTERVAL '15 minutes'
      ELSE t."lockedUntil" END;
  -- Old rows are no use once their window and pause are over.
  DELETE FROM public."SignInThrottle"
  WHERE "firstFailAt" < NOW() - INTERVAL '1 day' AND ("lockedUntil" IS NULL OR "lockedUntil" < NOW());
END;
$function$;

ALTER FUNCTION public.sign_in(text, text) RENAME TO sign_in_check;
ALTER FUNCTION public.change_own_password(uuid, text, text) RENAME TO change_own_password_check;

CREATE FUNCTION public.sign_in(identifier TEXT, password TEXT)
 RETURNS JSON
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  -- One login, however it is typed: the phone number's key, or the email in lower case.
  v_key TEXT := 'login:' || COALESCE(public.fof_phone_key(identifier), lower(trim(COALESCE(identifier, ''))));
  v_result JSON;
BEGIN
  IF identifier IS NULL OR trim(identifier) = '' THEN
    RETURN NULL;
  END IF;
  PERFORM public.sign_in_guard(v_key);
  v_result := public.sign_in_check(identifier, password);
  PERFORM public.sign_in_record(v_key, v_result IS NOT NULL);
  RETURN v_result;
END;
$function$;

CREATE FUNCTION public.change_own_password(target_user UUID, current_password TEXT, new_password TEXT)
 RETURNS BOOLEAN
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_key TEXT := 'user:' || COALESCE(target_user::TEXT, '');
  v_ok BOOLEAN;
BEGIN
  PERFORM public.sign_in_guard(v_key);
  v_ok := public.change_own_password_check(target_user, current_password, new_password);
  PERFORM public.sign_in_record(v_key, COALESCE(v_ok, FALSE));
  RETURN v_ok;
END;
$function$;

REVOKE ALL ON FUNCTION public.sign_in_check(text, text), public.change_own_password_check(uuid, text, text),
  public.login_user(text, text), public.sign_in_guard(text), public.sign_in_record(text, boolean)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sign_in(text, text), public.change_own_password(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sign_in(text, text), public.change_own_password(uuid, text, text) TO anon, authenticated;
