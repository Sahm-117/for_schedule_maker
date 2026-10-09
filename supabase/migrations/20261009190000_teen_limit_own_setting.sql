-- The most teens one Teen Support holds is its own setting again, per gender, and no longer follows the group builder's sizes.
--
-- 20261009160000 made teen_cap_for read the group builder's per-gender group sizes, so pressing "Save rules & build" in the builder
-- changed how many teens a Teen Support may hold even when no groups were created. The limit now lives with the other programme
-- rules (Settings > Programme rules): maxTeensPerFemaleTeenSupport and maxTeensPerMaleTeenSupport, where 0 or missing means the same
-- as maxTeensPerTeenSupport (default 4). admin_move_teen, admin_teen_move_targets and assign_teen_contacts already call teen_cap_for.
--
-- Rollback: re-apply teen_cap_for from 20261009160000_teen_group_sizes_and_admin_move.sql.
-- Idempotent.

CREATE OR REPLACE FUNCTION public.teen_cap_for(p_cohort uuid, p_gender text)
RETURNS int
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
  SELECT COALESCE(
    (SELECT NULLIF(NULLIF(value->>(CASE p_gender WHEN 'Female' THEN 'maxTeensPerFemaleTeenSupport' WHEN 'Male' THEN 'maxTeensPerMaleTeenSupport' END), '')::int, 0)
       FROM "AppSetting" WHERE "settingKey" = 'programme_rules'),
    (SELECT NULLIF(value->>'maxTeensPerTeenSupport', '')::int FROM "AppSetting" WHERE "settingKey" = 'programme_rules'),
    4
  )
$function$;
