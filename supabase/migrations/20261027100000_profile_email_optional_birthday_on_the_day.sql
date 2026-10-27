-- Two small changes asked for together.
--
-- 1. Email is optional on a participant's profile and no longer counts towards completion
--    (some people do not have one). Completion is now: photo, gender, age range, date of
--    birth, occupation (the lead's occupation counts), and every required requested field
--    that applies.
-- 2. Birthday alerts to admins also go out on the day itself (0 days), as well as 2 days and
--    1 day before.

CREATE OR REPLACE FUNCTION public.profile_completion_for(p_participant_id UUID)
RETURNS JSON
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  WITH p AS (
    SELECT pa.*, (SELECT f.occupation FROM "FollowUpContact" f WHERE f.id = pa."followUpContactId") AS lead_occupation
    FROM "Participant" pa WHERE pa.id = p_participant_id
  ),
  checks AS (
    SELECT unnest(ARRAY[
      NULLIF(trim(COALESCE(p."avatarUrl", '')), '') IS NOT NULL,
      NULLIF(trim(COALESCE(p.gender, '')), '') IS NOT NULL,
      NULLIF(trim(COALESCE(p."ageRange", '')), '') IS NOT NULL,
      p."dateOfBirth" IS NOT NULL,
      NULLIF(trim(COALESCE(p.occupation, p.lead_occupation, '')), '') IS NOT NULL
    ]) AS done
    FROM p
    UNION ALL
    SELECT NULLIF(trim(COALESCE(a.value, '')), '') IS NOT NULL
    FROM "ProfileField" f
    LEFT JOIN "ProfileFieldAnswer" a ON a."fieldId" = f.id AND a."participantId" = p_participant_id
    WHERE f.required AND public.profile_field_applies(f, p_participant_id)
  )
  SELECT json_build_object(
    'percent', CASE WHEN count(*) = 0 THEN 100 ELSE round(100.0 * count(*) FILTER (WHERE done) / count(*))::int END,
    'missing', count(*) FILTER (WHERE NOT done)
  )
  FROM checks;
$$;

-- Birthdays today, tomorrow and in 2 days that admins have not been told about yet.
-- Supports who are active, and participants currently in a running (non-practice) cohort.
CREATE OR REPLACE FUNCTION public.birthday_alerts_due()
RETURNS TABLE (subject_key TEXT, person_name TEXT, kind TEXT, birthday_date DATE, days_before INT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  WITH t AS (SELECT (now() AT TIME ZONE 'Africa/Lagos')::DATE AS today),
  people AS (
    SELECT 'u:' || u.id::TEXT AS k, u.name AS n, 'SUPPORT'::TEXT AS kind,
           substr(u.birthday, 1, 2)::INT AS m, substr(u.birthday, 4, 2)::INT AS d
    FROM "User" u
    WHERE u."isActive" IS NOT FALSE AND COALESCE(u."isTest", FALSE) = FALSE
      AND ('SUPPORT'::"Role" = ANY(u.roles) OR u.role = 'SUPPORT'::"Role")
      AND u.birthday ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'
    UNION ALL
    SELECT 'p:' || p.id::TEXT, p."fullName", 'PARTICIPANT',
           EXTRACT(MONTH FROM p."dateOfBirth")::INT, EXTRACT(DAY FROM p."dateOfBirth")::INT
    FROM "Participant" p JOIN "Cohort" c ON c.id = p."cohortId"
    WHERE p.status = 'ACTIVE' AND COALESCE(p."isTest", FALSE) = FALSE
      AND COALESCE(c."isPractice", FALSE) = FALSE AND c.status = 'ACTIVE' AND p."dateOfBirth" IS NOT NULL
  )
  SELECT pe.k, pe.n, pe.kind, public.birthday_next(pe.m, pe.d, t.today), (public.birthday_next(pe.m, pe.d, t.today) - t.today)
  FROM people pe CROSS JOIN t
  WHERE (public.birthday_next(pe.m, pe.d, t.today) - t.today) IN (0, 1, 2)
    AND NOT EXISTS (
      SELECT 1 FROM "BirthdayAlertLog" l
      WHERE l."subjectKey" = pe.k AND l."birthdayDate" = public.birthday_next(pe.m, pe.d, t.today)
        AND l."daysBefore" = (public.birthday_next(pe.m, pe.d, t.today) - t.today)
    )
  ORDER BY 5 DESC, 2;
$$;
