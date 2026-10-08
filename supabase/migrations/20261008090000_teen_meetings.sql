-- Teens meet on their own, on a Saturday (Teen Supports record it on My Group). That meeting
-- reuses MeetingAttendance and GroupPrayerStatus, so keep it out of the dashboards:
--   * cohort_health no longer lists teen groups, so they are not counted as groups that owe
--     a meeting report (meeting rate, group engagement, supports behind).
--   * cohort_people no longer lists teen groups for onboarding (teen groups have none, rule 22)
--     and no longer sends teen meeting attendance, so a missed Saturday is never a
--     red flag. Sunday class attendance for teens is untouched.
-- Both are the LIVE definitions with only those conditions added.
-- The meeting record also needs the day they met and the Teen Support's own notes.
ALTER TABLE public."GroupPrayerStatus"
  ADD COLUMN IF NOT EXISTS "metOn" date,
  ADD COLUMN IF NOT EXISTS "notes" text;

CREATE OR REPLACE FUNCTION public.cohort_health(p_cohort_id uuid)
 RETURNS json
 LANGUAGE sql
 STABLE
AS $function$
  WITH
  cohort AS (
    SELECT id, name, "startDate", "endDate", status, "schedulePublished"
    FROM "Cohort" WHERE id = p_cohort_id
  ),
  weeks AS (
    SELECT id, "weekNumber", "classDate", ("recapDocumentUrl" IS NOT NULL) AS "recapUploaded"
    FROM "Week" WHERE "cohortId" = p_cohort_id
  ),
  people AS (
    SELECT id, status FROM "Participant" WHERE "cohortId" = p_cohort_id AND NOT "isTest"
  ),
  membership AS (
    SELECT gp."groupId", gp."participantId"
    FROM "GroupParticipant" gp
    JOIN "Group" g ON g.id = gp."groupId" AND g."cohortId" = p_cohort_id
    JOIN people p ON p.id = gp."participantId" AND p.status = 'ACTIVE'
  ),
  groups AS (
    SELECT g.id, g.name, g."supportId", u.name AS "supportName",
           (SELECT count(*) FROM membership m WHERE m."groupId" = g.id) AS members
    FROM "Group" g
    LEFT JOIN "User" u ON u.id = g."supportId"
    WHERE g."cohortId" = p_cohort_id
      AND NOT g."isTeenGroup"
  ),
  attendance AS (
    SELECT a."weekId", m."groupId",
           count(*) AS marked,
           count(*) FILTER (WHERE a.status = 'PRESENT') AS present,
           count(*) FILTER (WHERE a.status = 'LATE') AS late,
           count(*) FILTER (WHERE a.status = 'LEFT_EARLY') AS "leftEarly",
           count(*) FILTER (WHERE a.status = 'ABSENT') AS absent,
           count(*) FILTER (
             WHERE a.status = 'PRESENT' OR (a.status IN ('LATE', 'LEFT_EARLY') AND a."lateExcused")
           ) AS attended
    FROM "AttendanceRecord" a
    JOIN membership m ON m."participantId" = a."participantId"
    JOIN weeks w ON w.id = a."weekId"
    GROUP BY a."weekId", m."groupId"
  ),
  meetings AS (
    SELECT s."weekId", s."groupId"
    FROM "GroupPrayerStatus" s
    JOIN weeks w ON w.id = s."weekId"
    WHERE s.done
  ),
  contacts AS (
    SELECT * FROM "FollowUpContact" WHERE "cohortId" = p_cohort_id
  )
  SELECT json_build_object(
    'cohort', (SELECT row_to_json(c) FROM cohort c),
    'weeks', COALESCE((SELECT json_agg(w ORDER BY w."weekNumber") FROM weeks w), '[]'::json),
    'participants', json_build_object(
      'active', (SELECT count(*) FROM people WHERE status = 'ACTIVE'),
      'archived', (SELECT count(*) FROM people WHERE status <> 'ACTIVE'),
      'inGroups', (SELECT count(DISTINCT "participantId") FROM membership)
    ),
    'groups', COALESCE((SELECT json_agg(g ORDER BY g.name) FROM groups g), '[]'::json),
    'attendance', COALESCE((SELECT json_agg(a) FROM attendance a), '[]'::json),
    'meetings', COALESCE((SELECT json_agg(m) FROM meetings m), '[]'::json),
    'faithProjects', COALESCE((
      SELECT json_object_agg(status, n) FROM (
        SELECT f.status, count(*) AS n
        FROM "FaithProject" f JOIN people p ON p.id = f."participantId" AND p.status = 'ACTIVE'
        GROUP BY f.status
      ) x
    ), '{}'::json),
    'followUps', json_build_object(
      'total', (SELECT count(*) FROM contacts),
      'contacted', (SELECT count(*) FROM contacts
                    WHERE "messageStatus" = 'SENT'
                       OR "callStatus" IN ('CALLED', 'CALL_BACK_LATER', 'MISSED_CALL')
                       OR ("replyStatus" <> 'NO_REPLY' AND source IS DISTINCT FROM 'Google Form')),
      'replied', (SELECT count(*) FROM contacts
                  WHERE "replyStatus" = 'REPLIED'
                    AND (source IS DISTINCT FROM 'Google Form'
                         OR "messageStatus" = 'SENT'
                         OR "callStatus" IN ('CALLED', 'CALL_BACK_LATER', 'MISSED_CALL'))),
      'registered', (SELECT count(*) FROM contacts WHERE "registrationStatus" IN ('REGISTERED', 'TEENAGER', 'TEEN_ONBOARDED')),
      'open', (SELECT count(*) FROM contacts WHERE "archivedAt" IS NULL)
    ),
    'nextCohortPeople', (SELECT count(*) FROM "FollowUpContact"
                         WHERE "registrationStatus" = 'NEXT_COHORT' AND "archivedAt" IS NULL
                           AND "cohortId" IS DISTINCT FROM p_cohort_id),
    'openFlags', (SELECT count(*) FROM "ParticipantFlag" f JOIN people p ON p.id = f."participantId" WHERE f."clearedAt" IS NULL),
    'pendingCover', (SELECT count(*) FROM "CoverRequest" WHERE status = 'PENDING' AND "endsAt" >= now()),
    'sheetSyncProblems', (SELECT count(*) FROM "FollowUpContact"
                          WHERE "createdAt" >= now() - interval '7 days'
                            AND (("sheetSyncError" IS NOT NULL AND "sheetSyncedAt" IS NULL) OR "sheetSyncWarning" IS NOT NULL))
  );
$function$;

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
