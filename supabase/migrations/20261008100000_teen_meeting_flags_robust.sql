-- Teen meeting attendance must never reach the red-flag counts, even if the teen group it was
-- recorded against is later deleted (the row then has no group). Also skip anyone who is
-- currently in a teen group. Live definition plus that one condition.
CREATE OR REPLACE FUNCTION public.cohort_people(p_cohort_id uuid)
 RETURNS json
 LANGUAGE sql
 STABLE
AS $function$
  WITH
  people AS (
    SELECT p.id, p."fullName", p.status, p.departments, p."createdAt",
           (SELECT gp."groupId" FROM "GroupParticipant" gp
              JOIN "Group" g ON g.id = gp."groupId" AND g."cohortId" = p_cohort_id
             WHERE gp."participantId" = p.id LIMIT 1) AS "groupId",
           COALESCE(o.contacted AND o."addedToGroup" AND o."introductionDone" AND o."venueAcknowledged", false) AS onboarded
    FROM "Participant" p
    LEFT JOIN "ParticipantOnboardingStatus" o ON o."participantId" = p.id
    WHERE p."cohortId" = p_cohort_id AND NOT p."isTest"
  ),
  weeks AS (
    SELECT id FROM "Week" WHERE "cohortId" = p_cohort_id
  ),
  onboarding AS (
    SELECT g.id AS "groupId", g."supportId",
           s."groupCreated", s."completedAt",
           (SELECT max(e."createdAt") FROM "OnboardingEvent" e
             WHERE e."groupId" = g.id AND e.type = 'GROUP_ASSIGNED'
               AND e."createdAt" <= COALESCE(s."completedAt", now())) AS "assignedAt"
    FROM "Group" g
    LEFT JOIN "GroupOnboardingStatus" s ON s."groupId" = g.id
    WHERE g."cohortId" = p_cohort_id
      AND NOT g."isTeenGroup"
  )
  SELECT json_build_object(
    'participants', COALESCE((SELECT json_agg(p ORDER BY p."fullName") FROM people p), '[]'::json),
    'sunday', COALESCE((
      SELECT json_agg(json_build_object(
        'participantId', a."participantId", 'weekId', a."weekId", 'status', a.status, 'lateExcused', a."lateExcused"
      ))
      FROM "AttendanceRecord" a
      JOIN people p ON p.id = a."participantId"
      JOIN weeks w ON w.id = a."weekId"
    ), '[]'::json),
    'meeting', COALESCE((
      SELECT json_agg(json_build_object('participantId', m."participantId", 'weekId', m."weekId", 'status', m.status))
      FROM "MeetingAttendance" m
      JOIN people p ON p.id = m."participantId"
      JOIN weeks w ON w.id = m."weekId"
      WHERE NOT EXISTS (SELECT 1 FROM "Group" tg WHERE tg.id = m."groupId" AND tg."isTeenGroup")
        AND NOT EXISTS (
          SELECT 1 FROM "GroupParticipant" tgp JOIN "Group" tg2 ON tg2.id = tgp."groupId"
          WHERE tgp."participantId" = m."participantId" AND tg2."isTeenGroup"
        )
    ), '[]'::json),
    'onboarding', COALESCE((SELECT json_agg(o) FROM onboarding o), '[]'::json),
    'supportRecap', COALESCE((
      SELECT json_agg(json_build_object('userId', a."userId", 'weekId', s."weekId", 'status', a.status))
      FROM "SupportSessionAttendance" a
      JOIN "SupportSession" s ON s.id = a."sessionId"
      WHERE s."cohortId" = p_cohort_id AND s.type = 'SUNDAY_RECAP' AND s."weekId" IS NOT NULL
    ), '[]'::json)
  );
$function$;
