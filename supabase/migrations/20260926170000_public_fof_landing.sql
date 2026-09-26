-- Public FOF landing page (fof.tcnikorodu.org). Anonymous visitors load "/"
-- signed out and need read-only, non-PII values: the registration link, the
-- next upcoming cohort's name + start date, the Sunday class start time, and
-- the admin-uploaded landing photos. AppSetting rows are staff-only under
-- RLS, so this is a SECURITY DEFINER function exposing only those fields —
-- never a broader grant on AppSetting/Cohort themselves.
--
-- Demo cohorts are named with a "ZZ" prefix (see AdminCohortsPage) and are
-- excluded so the public site never advertises a fake cohort.

CREATE OR REPLACE FUNCTION public.public_fof_landing()
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_registration_link TEXT;
  v_class_start_time TEXT;
  v_landing_images JSONB;
  v_cohort RECORD;
BEGIN
  SELECT value #>> '{}' INTO v_registration_link
  FROM public."AppSetting"
  WHERE "settingKey" = 'registration_link';

  SELECT value #>> '{}' INTO v_class_start_time
  FROM public."AppSetting"
  WHERE "settingKey" = 'class_start_time';

  -- {hero, group, class} public storage URLs (Settings > Programme >
  -- Website photos); any/all may be absent, the landing page falls back to
  -- a gradient wherever a slot is missing.
  SELECT value INTO v_landing_images
  FROM public."AppSetting"
  WHERE "settingKey" = 'landing_images';

  SELECT id, name, "startDate" INTO v_cohort
  FROM public."Cohort"
  WHERE "startDate" IS NOT NULL
    AND "startDate" > NOW()
    AND name NOT LIKE 'ZZ%'
  ORDER BY "startDate" ASC
  LIMIT 1;

  RETURN json_build_object(
    'registrationLink', COALESCE(v_registration_link, ''),
    'nextCohort', CASE WHEN v_cohort.id IS NULL THEN NULL
      ELSE json_build_object('name', v_cohort.name, 'startDate', v_cohort."startDate")
    END,
    'classStartTime', v_class_start_time,
    'landingImages', COALESCE(v_landing_images, '{}'::jsonb)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.public_fof_landing() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_fof_landing() TO anon, authenticated;
