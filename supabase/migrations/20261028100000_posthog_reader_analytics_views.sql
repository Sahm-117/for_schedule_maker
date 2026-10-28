-- A read-only door for PostHog's data warehouse.
--
-- PostHog syncs a Postgres schema into its warehouse. Pointing it at `public` would copy password hashes,
-- login tokens, phone numbers, emails, dates of birth and teens' guardian numbers to a third party. Instead:
--   * the `analytics` schema holds a handful of views with no names, phones, emails or birthdays;
--   * people are a pseudonym (a salted hash of their id), never the id itself;
--   * `posthog_reader` can read that schema and nothing in `public`.
-- Scope: Cohort 10 onwards (start date on or after Cohort 10's), not Practice, not archived, no test accounts.
-- The role is created without a password and without LOGIN here; the owner sets both live (never in a file).

CREATE SCHEMA IF NOT EXISTS analytics;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'posthog_reader') THEN
    CREATE ROLE posthog_reader NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION analytics.pid(p_id UUID)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$ SELECT encode(sha256(convert_to(p_id::text || ':fof-analytics-v1', 'UTF8')), 'hex') $$;

CREATE OR REPLACE VIEW analytics.cohorts AS
SELECT c.id AS cohort_id, c.name AS cohort, c."startDate" AS start_date, c."endDate" AS end_date, c.status
FROM "Cohort" c
WHERE COALESCE(c."isPractice", FALSE) = FALSE
  AND c.status <> 'ARCHIVED'
  AND c."startDate" >= (SELECT x."startDate" FROM "Cohort" x WHERE x.name = 'Cohort 10' LIMIT 1);

CREATE OR REPLACE VIEW analytics.weeks AS
SELECT w.id AS week_id, c.cohort, w."weekNumber" AS week_number, w."classDate" AS class_date
FROM "Week" w
JOIN analytics.cohorts c ON c.cohort_id = w."cohortId";

CREATE OR REPLACE VIEW analytics.participants AS
SELECT
  analytics.pid(p.id) AS participant,
  c.cohort,
  p.status,
  p.source,
  EXISTS (
    SELECT 1 FROM "GroupParticipant" gp JOIN "Group" g ON g.id = gp."groupId"
    WHERE gp."participantId" = p.id AND g."cohortId" = p."cohortId" AND g."archivedAt" IS NULL
  ) AS in_group,
  (COALESCE(p."ageRange", '') ~ '^\s*10\s*-\s*17' OR EXISTS (
    SELECT 1 FROM "GroupParticipant" gp JOIN "Group" g ON g.id = gp."groupId"
    WHERE gp."participantId" = p.id AND g."isTeenGroup"
  )) AS is_teen,
  p.gender,
  p."ageRange" AS age_range,
  p."createdAt"::date AS added_on,
  (public.profile_completion_for(p.id) ->> 'percent')::int AS profile_percent,
  (NULLIF(trim(COALESCE(p."avatarUrl", '')), '') IS NOT NULL) AS has_photo,
  (p."dateOfBirth" IS NOT NULL) AS has_date_of_birth,
  (NULLIF(trim(COALESCE(p.occupation, '')), '') IS NOT NULL) AS has_occupation
FROM "Participant" p
JOIN analytics.cohorts c ON c.cohort_id = p."cohortId"
WHERE COALESCE(p."isTest", FALSE) = FALSE;

CREATE OR REPLACE VIEW analytics.class_attendance AS
SELECT analytics.pid(a."participantId") AS participant, w.cohort, w.week_number, a.status, COALESCE(a."lateExcused", FALSE) AS late_excused
FROM "AttendanceRecord" a
JOIN analytics.weeks w ON w.week_id = a."weekId"
JOIN "Participant" p ON p.id = a."participantId" AND COALESCE(p."isTest", FALSE) = FALSE;

CREATE OR REPLACE VIEW analytics.group_meeting_attendance AS
SELECT analytics.pid(m."participantId") AS participant, w.cohort, w.week_number, m.status
FROM "MeetingAttendance" m
JOIN analytics.weeks w ON w.week_id = m."weekId"
JOIN "Participant" p ON p.id = m."participantId" AND COALESCE(p."isTest", FALSE) = FALSE;

CREATE OR REPLACE VIEW analytics.hub_meetings AS
SELECT h.name AS hub, w.cohort, w.week_number, s."startedAt" AS started_at, s."submittedAt" AS submitted_at,
       (SELECT count(*) FROM "SupportSessionAttendance" a WHERE a."sessionId" = s.id) AS attendance_marks
FROM "SupportSession" s
JOIN "SupportHub" h ON h.id = s."hubId"
JOIN analytics.weeks w ON w.week_id = s."weekId"
WHERE s.type = 'SUNDAY_RECAP';

-- The role reads this schema and nothing else.
REVOKE ALL ON SCHEMA analytics FROM PUBLIC;
GRANT USAGE ON SCHEMA analytics TO posthog_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA analytics TO posthog_reader;
GRANT EXECUTE ON FUNCTION analytics.pid(UUID) TO posthog_reader;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM posthog_reader;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM posthog_reader;
ALTER ROLE posthog_reader SET default_transaction_read_only = on;
ALTER ROLE posthog_reader SET statement_timeout = '60s';
ALTER ROLE posthog_reader CONNECTION LIMIT 3;
