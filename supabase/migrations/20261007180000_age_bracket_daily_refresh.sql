-- Age brackets keep up with the calendar. The date-of-birth triggers (20261006150000) only
-- correct a bracket when a record is edited, so someone who turns 18 or 25 kept the old one.
-- This refreshes them every night (01:30 Lagos), for:
--   * participants with a believable date of birth, and
--   * supports with a birth year (exact when the birthday's day and month are known, otherwise
--     this year minus the birth year), same rule as the trigger.
-- A teen stays "18 and below" until their cohort ends: a participant whose bracket is
-- "18 and below" and whose cohort has not finished is left alone, so they keep their Teen Support
-- and teen group for the programme. People without a date of birth or birth year are never touched.
--
-- Rollback: SELECT cron.unschedule('refresh_age_brackets_daily');
--           DROP FUNCTION public.refresh_age_brackets(), public.support_age_range(int, text);

CREATE OR REPLACE FUNCTION public.support_age_range(p_year int, p_birthday text)
RETURNS text
LANGUAGE plpgsql
STABLE
AS $function$
DECLARE
  v_today DATE := (NOW() AT TIME ZONE 'Africa/Lagos')::date;
  v_dob DATE;
  v_age INT;
BEGIN
  IF p_year IS NULL THEN RETURN NULL; END IF;
  IF p_birthday ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$' THEN
    v_dob := make_date(p_year, substr(p_birthday, 1, 2)::int, 1)
             + (LEAST(substr(p_birthday, 4, 2)::int,
                      EXTRACT(DAY FROM (date_trunc('month', make_date(p_year, substr(p_birthday, 1, 2)::int, 1)) + interval '1 month - 1 day'))::int) - 1);
    v_age := date_part('year', age(v_today, v_dob))::int;
  ELSE
    v_age := EXTRACT(YEAR FROM v_today)::int - p_year;
  END IF;
  RETURN public.age_range_for_age(v_age);
END;
$function$;

CREATE OR REPLACE FUNCTION public.refresh_age_brackets()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_today DATE := (NOW() AT TIME ZONE 'Africa/Lagos')::date;
  v_people INT;
  v_supports INT;
BEGIN
  WITH due AS (
    SELECT p.id,
           public.age_range_for_age(date_part('year', age(v_today, p."dateOfBirth"))::int) AS wanted
    FROM "Participant" p
    LEFT JOIN "Cohort" c ON c.id = p."cohortId"
    WHERE p."dateOfBirth" IS NOT NULL
      -- A teen stays a teen until their cohort has ended.
      AND NOT (
        replace(lower(COALESCE(p."ageRange", '')), ' ', '') = '18andbelow'
        AND c.id IS NOT NULL AND c.status::text <> 'COMPLETED' AND (c."endDate" IS NULL OR c."endDate" >= v_today)
      )
  ), changed AS (
    UPDATE "Participant" p
    SET "ageRange" = due.wanted, "updatedAt" = now()
    FROM due
    WHERE p.id = due.id AND due.wanted IS NOT NULL
      AND replace(lower(COALESCE(p."ageRange", '')), ' ', '') <> replace(lower(due.wanted), ' ', '')
    RETURNING p.id
  )
  SELECT count(*) INTO v_people FROM changed;

  WITH changed AS (
    UPDATE "User" u
    SET "ageRange" = public.support_age_range(u."birthYear", u.birthday)
    WHERE u."birthYear" IS NOT NULL
      AND public.support_age_range(u."birthYear", u.birthday) IS NOT NULL
      AND replace(lower(COALESCE(u."ageRange", '')), ' ', '') <> replace(lower(public.support_age_range(u."birthYear", u.birthday)), ' ', '')
    RETURNING u.id
  )
  SELECT count(*) INTO v_supports FROM changed;

  RETURN jsonb_build_object('participants', v_people, 'supports', v_supports);
END;
$function$;
REVOKE ALL ON FUNCTION public.refresh_age_brackets() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_age_brackets() TO service_role;

-- 00:30 UTC is 01:30 in Lagos.
DO $cron$
BEGIN
  PERFORM cron.unschedule('refresh_age_brackets_daily') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'refresh_age_brackets_daily');
  PERFORM cron.schedule('refresh_age_brackets_daily', '30 0 * * *', 'select public.refresh_age_brackets();');
END
$cron$;
