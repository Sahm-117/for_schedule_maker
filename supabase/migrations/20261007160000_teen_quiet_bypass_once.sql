-- The quiet bypass for teen assignment (20261007150000) is only for the go-live placement.
-- It now lasts 48 hours from the moment teen handling is first switched on, then the normal
-- quiet check returns by itself: a Teen Support who has not opened the app for 7 days is skipped.
--
-- Rollback: re-apply assign_teen_contacts from 20261006180000_teen_assignment.sql and
--           teen_enable_move_trigger from 20261007140000_teen_enable_move.sql.

CREATE OR REPLACE FUNCTION public.teen_quiet_bypass()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT (value #>> '{}')::timestamptz > now() FROM "AppSetting" WHERE "settingKey" = 'teen_quiet_bypass_until'),
    FALSE
  );
$function$;
REVOKE ALL ON FUNCTION public.teen_quiet_bypass() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.teen_quiet_bypass() TO service_role;

DO $patch$
DECLARE
  v_def TEXT;
  v_new TEXT;
BEGIN
  SELECT pg_get_functiondef('public.assign_teen_contacts(uuid)'::regprocedure) INTO v_def;
  v_new := replace(v_def, 'AND TRUE /* quiet check off for teens, see 20261007150000 */',
                   'AND (public.teen_quiet_bypass() OR NOT public.followup_owner_is_quiet(u.id))');
  IF v_new = v_def THEN
    RAISE EXCEPTION 'assign_teen_contacts: bypass marker not found';
  END IF;
  EXECUTE v_new;
END
$patch$;

CREATE OR REPLACE FUNCTION public.teen_enable_move_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NEW."settingKey" <> 'teen_flow_enabled' OR NEW.value IS DISTINCT FROM to_jsonb(true) THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.value IS NOT DISTINCT FROM to_jsonb(true) THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM "AppSetting" WHERE "settingKey" = 'teen_move_done') THEN RETURN NEW; END IF;
  PERFORM public.teen_move_existing();
  INSERT INTO "AppSetting" ("settingKey", value, "updatedAt") VALUES ('teen_move_done', to_jsonb(true), now())
  ON CONFLICT ("settingKey") DO NOTHING;
  -- Quiet Teen Supports are accepted for the first 48 hours so the go-live placement is complete.
  INSERT INTO "AppSetting" ("settingKey", value, "updatedAt")
  VALUES ('teen_quiet_bypass_until', to_jsonb((now() + interval '48 hours')::text), now())
  ON CONFLICT ("settingKey") DO UPDATE SET value = EXCLUDED.value, "updatedAt" = now();
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.teen_enable_move_trigger() FROM PUBLIC, anon, authenticated;
