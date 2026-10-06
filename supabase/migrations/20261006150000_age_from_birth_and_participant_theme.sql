-- 1. Age range follows the date of birth.
-- 2. Supports can add a birth year (optional).
-- 3. Participants get an accent colour.
--
-- Age ranges (the same six the app uses everywhere):
--   under 18 -> '18 and below', 18-24, 25-34, 35-44, 45-59, 60+ -> '60 and above'.
-- An 18-year-old is '18 - 24': the form's "Below 18" maps to '18 and below'
-- (FLOW_MAP rule 8).
--
-- A date of birth only counts when it is believable (age 5 to 100). Six
-- participants carry a placeholder year of 1904 from a day/month-only entry; they
-- keep their birthday, but their age range is left alone rather than turned
-- into "60 and above".
--
-- Participants: whenever a date of birth is set (insert, or the date or the age
-- range changes), the age range is corrected to match. The date of birth wins.
-- Supports: only when a birth year is added. With the birthday's day and month
-- the age is exact; with only the year it is this year minus the birth year.
-- A support with no birth year is never touched.
--
-- Rollback: DROP TRIGGER trg_participant_age_from_dob ON "Participant";
-- DROP TRIGGER trg_user_age_from_birth_year ON "User"; DROP FUNCTION
-- age_range_for_age, participant_age_from_dob, user_age_from_birth_year,
-- set_participant_theme, participant_theme;
-- ALTER TABLE "User" DROP COLUMN "birthYear"; ALTER TABLE "Participant" DROP COLUMN "themeColor".

CREATE OR REPLACE FUNCTION public.age_range_for_age(p_age INT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_age IS NULL OR p_age < 5 OR p_age > 100 THEN NULL
    WHEN p_age < 18 THEN '18 and below'
    WHEN p_age <= 24 THEN '18 - 24'
    WHEN p_age <= 34 THEN '25 - 34'
    WHEN p_age <= 44 THEN '35 - 44'
    WHEN p_age <= 59 THEN '45 - 59'
    ELSE '60 and above'
  END
$$;

-- ── Participants ─────────────────────────────────────────────────────────────
ALTER TABLE public."Participant" ADD COLUMN IF NOT EXISTS "themeColor" TEXT
  CHECK ("themeColor" IS NULL OR "themeColor" ~* '^#[0-9a-f]{6}$');

CREATE OR REPLACE FUNCTION public.participant_age_from_dob()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
DECLARE
  v_range TEXT;
BEGIN
  IF NEW."dateOfBirth" IS NOT NULL THEN
    v_range := public.age_range_for_age(date_part('year', age((NOW() AT TIME ZONE 'Africa/Lagos')::date, NEW."dateOfBirth"))::int);
    IF v_range IS NOT NULL THEN
      NEW."ageRange" := v_range;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_participant_age_from_dob ON public."Participant";
CREATE TRIGGER trg_participant_age_from_dob
  BEFORE INSERT OR UPDATE OF "dateOfBirth", "ageRange" ON public."Participant"
  FOR EACH ROW EXECUTE FUNCTION public.participant_age_from_dob();

-- Correct every existing mismatch (believable dates of birth only).
UPDATE public."Participant" p
SET "ageRange" = public.age_range_for_age(date_part('year', age((NOW() AT TIME ZONE 'Africa/Lagos')::date, p."dateOfBirth"))::int)
WHERE p."dateOfBirth" IS NOT NULL
  AND public.age_range_for_age(date_part('year', age((NOW() AT TIME ZONE 'Africa/Lagos')::date, p."dateOfBirth"))::int) IS NOT NULL
  AND replace(lower(COALESCE(p."ageRange", '')), ' ', '')
      <> replace(lower(public.age_range_for_age(date_part('year', age((NOW() AT TIME ZONE 'Africa/Lagos')::date, p."dateOfBirth"))::int)), ' ', '');

-- Participant accent colour (their own app).
CREATE OR REPLACE FUNCTION public.participant_theme(p_token TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  person_id UUID := public.app_participant_id(p_token);
  v_color TEXT;
BEGIN
  IF person_id IS NULL THEN
    RAISE EXCEPTION 'SESSION_EXPIRED';
  END IF;
  SELECT "themeColor" INTO v_color FROM "Participant" WHERE id = person_id;
  RETURN v_color;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_participant_theme(p_token TEXT, p_color TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  person_id UUID := public.app_participant_id(p_token);
BEGIN
  IF person_id IS NULL THEN
    RAISE EXCEPTION 'SESSION_EXPIRED';
  END IF;
  IF p_color IS NOT NULL AND p_color !~* '^#[0-9a-f]{6}$' THEN
    RAISE EXCEPTION 'INVALID_COLOUR';
  END IF;
  UPDATE "Participant" SET "themeColor" = lower(p_color), "updatedAt" = NOW() WHERE id = person_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.participant_theme(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_participant_theme(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.participant_theme(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_participant_theme(TEXT, TEXT) TO anon, authenticated;

-- ── Supports: optional birth year ────────────────────────────────────────────
ALTER TABLE public."User" ADD COLUMN IF NOT EXISTS "birthYear" SMALLINT
  CHECK ("birthYear" IS NULL OR "birthYear" BETWEEN 1900 AND 2100);
COMMENT ON COLUMN public."User"."birthYear" IS 'Optional. With birthday (MM-DD) it gives an exact age; when set, ageRange follows it.';
GRANT SELECT ("birthYear") ON public."User" TO anon, authenticated;
GRANT UPDATE ("birthYear") ON public."User" TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.user_age_from_birth_year()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
DECLARE
  v_today DATE := (NOW() AT TIME ZONE 'Africa/Lagos')::date;
  v_age INT;
  v_range TEXT;
  v_dob DATE;
BEGIN
  IF NEW."birthYear" IS NOT NULL THEN
    IF NEW.birthday ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$' THEN
      -- Exact: the day is capped so 02-30 or 29 Feb in a non-leap year still gives a date.
      v_dob := make_date(NEW."birthYear", substr(NEW.birthday, 1, 2)::int, 1)
               + (LEAST(substr(NEW.birthday, 4, 2)::int,
                        EXTRACT(DAY FROM (date_trunc('month', make_date(NEW."birthYear", substr(NEW.birthday, 1, 2)::int, 1)) + interval '1 month - 1 day'))::int) - 1);
      v_age := date_part('year', age(v_today, v_dob))::int;
    ELSE
      v_age := EXTRACT(YEAR FROM v_today)::int - NEW."birthYear";
    END IF;
    v_range := public.age_range_for_age(v_age);
    IF v_range IS NOT NULL THEN
      NEW."ageRange" := v_range;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_user_age_from_birth_year ON public."User";
CREATE TRIGGER trg_user_age_from_birth_year
  BEFORE INSERT OR UPDATE OF "birthYear", birthday, "ageRange" ON public."User"
  FOR EACH ROW EXECUTE FUNCTION public.user_age_from_birth_year();
