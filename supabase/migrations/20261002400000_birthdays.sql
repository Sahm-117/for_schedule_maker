-- Birthdays: a page for admins (supports and participants, filterable by cohort)
-- and alerts to every admin two days and one day before someone's birthday.
-- Supports keep "MM-DD" text on their profile; participants have a full date of
-- birth. Only the day and month ever leave the database, never the year.

-- The next time a day/month comes round, counting today. 29 Feb falls on 28 Feb
-- in years without one.
CREATE OR REPLACE FUNCTION public.birthday_next(p_month INT, p_day INT, p_today DATE)
RETURNS DATE
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  y INT := EXTRACT(YEAR FROM p_today)::INT;
  d DATE;
BEGIN
  FOR i IN 0..1 LOOP
    BEGIN
      d := make_date(y + i, p_month, p_day);
    EXCEPTION WHEN OTHERS THEN
      d := make_date(y + i, p_month, p_day - 1);
    END;
    IF d >= p_today THEN RETURN d; END IF;
  END LOOP;
  RETURN make_date(y + 1, p_month, LEAST(p_day, 28));
END;
$$;

CREATE OR REPLACE FUNCTION public.birthdays_list(p_token TEXT, p_cohort_id UUID DEFAULT NULL)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  staff "User" := public.app_staff(p_token);
  today DATE := (now() AT TIME ZONE 'Africa/Lagos')::DATE;
BEGIN
  IF staff.id IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  IF staff.role <> 'ADMIN' THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;

  RETURN json_build_object(
    'today', today,
    'supports', COALESCE((
      SELECT json_agg(r ORDER BY (r ->> 'daysUntil')::INT, r ->> 'name')
      FROM (
        SELECT json_build_object(
          'id', u.id, 'name', u.name,
          'month', substr(u.birthday, 1, 2)::INT, 'day', substr(u.birthday, 4, 2)::INT,
          'daysUntil', public.birthday_next(substr(u.birthday, 1, 2)::INT, substr(u.birthday, 4, 2)::INT, today) - today,
          'cohorts', COALESCE((SELECT json_agg(c.name ORDER BY c."startDate" DESC) FROM "UserCohort" uc JOIN "Cohort" c ON c.id = uc."cohortId" WHERE uc."userId" = u.id AND COALESCE(c."isPractice", FALSE) = FALSE), '[]'::JSON)
        ) AS r
        FROM "User" u
        WHERE u."isActive" IS NOT FALSE AND COALESCE(u."isTest", FALSE) = FALSE
          AND ('SUPPORT'::"Role" = ANY(u.roles) OR u.role = 'SUPPORT'::"Role")
          AND u.birthday ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'
          AND (p_cohort_id IS NULL OR EXISTS (SELECT 1 FROM "UserCohort" uc WHERE uc."userId" = u.id AND uc."cohortId" = p_cohort_id))
      ) s
    ), '[]'::JSON),
    'participants', COALESCE((
      SELECT json_agg(r ORDER BY (r ->> 'daysUntil')::INT, r ->> 'name')
      FROM (
        SELECT json_build_object(
          'id', p.id, 'name', p."fullName",
          'month', EXTRACT(MONTH FROM p."dateOfBirth")::INT, 'day', EXTRACT(DAY FROM p."dateOfBirth")::INT,
          'daysUntil', public.birthday_next(EXTRACT(MONTH FROM p."dateOfBirth")::INT, EXTRACT(DAY FROM p."dateOfBirth")::INT, today) - today,
          'cohorts', json_build_array(c.name)
        ) AS r
        FROM "Participant" p
        JOIN "Cohort" c ON c.id = p."cohortId"
        WHERE p.status = 'ACTIVE' AND COALESCE(p."isTest", FALSE) = FALSE AND COALESCE(c."isPractice", FALSE) = FALSE
          AND p."dateOfBirth" IS NOT NULL
          AND (p_cohort_id IS NULL OR p."cohortId" = p_cohort_id)
      ) s
    ), '[]'::JSON),
    'missing', json_build_object(
      'supports', (
        SELECT count(*) FROM "User" u
        WHERE u."isActive" IS NOT FALSE AND COALESCE(u."isTest", FALSE) = FALSE
          AND ('SUPPORT'::"Role" = ANY(u.roles) OR u.role = 'SUPPORT'::"Role")
          AND (u.birthday IS NULL OR u.birthday !~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$')
          AND (p_cohort_id IS NULL OR EXISTS (SELECT 1 FROM "UserCohort" uc WHERE uc."userId" = u.id AND uc."cohortId" = p_cohort_id))
      ),
      'participants', (
        SELECT count(*) FROM "Participant" p JOIN "Cohort" c ON c.id = p."cohortId"
        WHERE p.status = 'ACTIVE' AND COALESCE(p."isTest", FALSE) = FALSE AND COALESCE(c."isPractice", FALSE) = FALSE
          AND p."dateOfBirth" IS NULL AND (p_cohort_id IS NULL OR p."cohortId" = p_cohort_id)
      )
    )
  );
END;
$$;

-- One alert per person, birthday and lead time, so a reminder never repeats.
CREATE TABLE IF NOT EXISTS "BirthdayAlertLog" (
  "subjectKey" TEXT NOT NULL,
  "birthdayDate" DATE NOT NULL,
  "daysBefore" INTEGER NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("subjectKey", "birthdayDate", "daysBefore")
);
ALTER TABLE "BirthdayAlertLog" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "BirthdayAlertLog" FROM anon, authenticated;

-- Birthdays exactly 2 days and 1 day away that admins have not been told about yet.
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
  WHERE (public.birthday_next(pe.m, pe.d, t.today) - t.today) IN (1, 2)
    AND NOT EXISTS (
      SELECT 1 FROM "BirthdayAlertLog" l
      WHERE l."subjectKey" = pe.k AND l."birthdayDate" = public.birthday_next(pe.m, pe.d, t.today)
        AND l."daysBefore" = (public.birthday_next(pe.m, pe.d, t.today) - t.today)
    )
  ORDER BY 5 DESC, 2;
$$;

CREATE OR REPLACE FUNCTION public.birthday_alerts_mark(p_alerts JSONB)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  INSERT INTO "BirthdayAlertLog" ("subjectKey", "birthdayDate", "daysBefore")
  SELECT a ->> 'subjectKey', (a ->> 'birthdayDate')::DATE, (a ->> 'daysBefore')::INT
  FROM jsonb_array_elements(p_alerts) a
  ON CONFLICT DO NOTHING;
$$;

REVOKE ALL ON FUNCTION public.birthday_next(INT, INT, DATE) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.birthday_alerts_due() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.birthday_alerts_mark(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.birthdays_list(TEXT, UUID) TO anon, authenticated;
