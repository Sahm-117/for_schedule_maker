-- Participants can choose any password of 5 or more characters (it was 8).
-- Only the two participant functions change: set_participant_password (first
-- password) and change_participant_password (from the profile). Staff and admin
-- passwords keep their 8-character minimum.
--
-- Rollback: put "< 8" and "at least 8 characters" back in both functions
-- (20260917110000_participant_accounts.sql, 20260917130000_participant_app_group_faith_profile.sql).
DO $m$
DECLARE
  v_def TEXT;
  v_fn REGPROCEDURE;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY['public.set_participant_password(text,text)'::regprocedure, 'public.change_participant_password(text,text,text)'::regprocedure] LOOP
    SELECT pg_get_functiondef(v_fn) INTO v_def;
    IF v_def ~ '< 8 THEN' THEN
      v_def := replace(v_def, '< 8 THEN', '< 5 THEN');
      v_def := replace(v_def, 'at least 8 characters', 'at least 5 characters');
      EXECUTE v_def;
    END IF;
  END LOOP;
END
$m$;
