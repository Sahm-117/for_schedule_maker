-- Per-person records the programme rules are judged on, for one cohort:
-- each participant's Sunday and group-meeting marks, and each group's
-- onboarding timeline. The app applies the rules (thresholds live in
-- AppSetting 'programme_rules') so they can change without a migration.
-- Read-only; runs with the caller's permissions.

CREATE OR REPLACE FUNCTION public.cohort_people(p_cohort_id UUID)
RETURNS JSON
LANGUAGE sql
STABLE
AS $$
  WITH
  people AS (
    SELECT p.id, p."fullName", p.status, p.departments, p."createdAt",
           (SELECT gp."groupId" FROM "GroupParticipant" gp
              JOIN "Group" g ON g.id = gp."groupId" AND g."cohortId" = p_cohort_id
             WHERE gp."participantId" = p.id LIMIT 1) AS "groupId",
           COALESCE(o.contacted AND o."addedToGroup" AND o."introductionDone" AND o."venueAcknowledged", false) AS onboarded
    FROM "Participant" p
    LEFT JOIN "ParticipantOnboardingStatus" o ON o."participantId" = p.id
    WHERE p."cohortId" = p_cohort_id
  ),
  weeks AS (
    SELECT id FROM "Week" WHERE "cohortId" = p_cohort_id
  ),
  onboarding AS (
    SELECT g.id AS "groupId", g."supportId",
           s."groupCreated", s."completedAt",
           -- The latest time the group was handed to a support before it finished
           -- onboarding, so a reassignment restarts the clock.
           (SELECT max(e."createdAt") FROM "OnboardingEvent" e
             WHERE e."groupId" = g.id AND e.type = 'GROUP_ASSIGNED'
               AND e."createdAt" <= COALESCE(s."completedAt", now())) AS "assignedAt"
    FROM "Group" g
    LEFT JOIN "GroupOnboardingStatus" s ON s."groupId" = g.id
    WHERE g."cohortId" = p_cohort_id
  )
  SELECT json_build_object(
    'participants', COALESCE((SELECT json_agg(p ORDER BY p."fullName") FROM people p), '[]'::json),
    'sunday', COALESCE((
      SELECT json_agg(json_build_object('participantId', a."participantId", 'weekId', a."weekId", 'status', a.status))
      FROM "AttendanceRecord" a
      JOIN people p ON p.id = a."participantId"
      JOIN weeks w ON w.id = a."weekId"
    ), '[]'::json),
    'meeting', COALESCE((
      SELECT json_agg(json_build_object('participantId', m."participantId", 'weekId', m."weekId", 'status', m.status))
      FROM "MeetingAttendance" m
      JOIN people p ON p.id = m."participantId"
      JOIN weeks w ON w.id = m."weekId"
    ), '[]'::json),
    'onboarding', COALESCE((SELECT json_agg(o) FROM onboarding o), '[]'::json)
  );
$$;

GRANT EXECUTE ON FUNCTION public.cohort_people(UUID) TO anon, authenticated;
