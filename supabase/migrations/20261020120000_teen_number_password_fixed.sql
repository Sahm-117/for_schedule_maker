-- A teen who signs in with their own number shares their guardian's password, and cannot change it.
-- The guardian (guardian's number) chooses the password and can change it; a Teen Support or admin
-- issues a new code when it is lost (participant_login_details).
--
-- 1. change_participant_password and set_participant_password refuse a session that came in through a
--    teen's own number (AppSession."viaTeenNumber", 20261017100000) with TEEN_PASSWORD_FIXED. Both
--    functions are patched in place, as 20261003120000 did, so the rest of their live definition is kept.
-- 2. participant_session_via_teen_number: the app reads it to hide "Change password".
--
-- Rollback: remove the TEEN_PASSWORD_FIXED block from both functions (pg_get_functiondef, replace,
-- EXECUTE) and DROP FUNCTION public.participant_session_via_teen_number(TEXT).

DO $m$
DECLARE
  v_def TEXT;
  v_new TEXT;
  v_fn REGPROCEDURE;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY['public.set_participant_password(text,text)'::regprocedure, 'public.change_participant_password(text,text,text)'::regprocedure] LOOP
    SELECT pg_get_functiondef(v_fn) INTO v_def;
    IF position('TEEN_PASSWORD_FIXED' IN v_def) = 0 THEN
      v_new := regexp_replace(
        v_def,
        '(RAISE EXCEPTION ''SESSION_EXPIRED'';\s*END IF;)',
        E'\\1\n  IF (public.app_session(p_token))."viaTeenNumber" THEN\n    RAISE EXCEPTION ''TEEN_PASSWORD_FIXED'';\n  END IF;'
      );
      IF v_new = v_def THEN
        RAISE EXCEPTION 'Could not patch %: SESSION_EXPIRED check not found', v_fn;
      END IF;
      EXECUTE v_new;
    END IF;
  END LOOP;
END
$m$;

CREATE OR REPLACE FUNCTION public.participant_session_via_teen_number(p_token TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT COALESCE((public.app_session(p_token))."viaTeenNumber", FALSE);
$$;
REVOKE ALL ON FUNCTION public.participant_session_via_teen_number(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.participant_session_via_teen_number(TEXT) TO anon, authenticated;
