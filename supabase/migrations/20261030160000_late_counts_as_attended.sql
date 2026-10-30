-- Late and Left early count as attended; only Absent is a miss (FLOW_MAP rule 12; owner's decision, 30 Oct 2026).
--
-- Before this, Late or Left early counted as attended only once an admin excused it on appeal. The same rule now
-- holds everywhere: the frontend (utils/programmeRules.ts sundayMarkAttended / sundayMarkMissed), the cohort health
-- figures, the hub group overview, the attendance report notification and the public API's programme counts.
-- Excused is neither attended nor missed. The "lateExcused" column and excuse_lateness stay (old records keep their
-- appeal note), but no longer change any count, and the admin screen no longer offers the appeal.
--
-- Rollback: re-apply these four functions from before this file (their last definitions in earlier migrations).

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
             WHERE a.status = 'PRESENT' OR a.status IN ('LATE', 'LEFT_EARLY')
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
    'nextCohortPeople', (SELECT count(*) FROM "FollowUpContact" f
                         -- Someone who could not be reached (No response) is offered for the next cohort too,
                         -- whether or not they had signed up for this one.
                         WHERE f."registrationStatus" IN ('NEXT_COHORT', 'NO_RESPONSE')
                           AND f."archivedAt" IS NULL
                           AND f."cohortId" IS DISTINCT FROM p_cohort_id),
    'openFlags', (SELECT count(*) FROM "ParticipantFlag" f JOIN people p ON p.id = f."participantId" WHERE f."clearedAt" IS NULL),
    'pendingCover', (SELECT count(*) FROM "CoverRequest" WHERE status = 'PENDING' AND "endsAt" >= now()),
    'sheetSyncProblems', (SELECT count(*) FROM "FollowUpContact"
                          WHERE "createdAt" >= now() - interval '7 days'
                            AND (("sheetSyncError" IS NOT NULL AND "sheetSyncedAt" IS NULL) OR "sheetSyncWarning" IS NOT NULL))
  );
$function$;

CREATE OR REPLACE FUNCTION public.hub_group_overview(p_group_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_group public."Group";
BEGIN
  IF public.discussion_staff_access(p_group_id) IS NULL THEN
    RAISE EXCEPTION 'You can''t see this group''s overview';
  END IF;

  SELECT * INTO v_group FROM public."Group" WHERE id = p_group_id;

  RETURN (
    WITH j AS (
      SELECT w.id AS "weekId", w."weekNumber"
      FROM public."Week" w
      JOIN public."AttendanceSession" s ON s."weekId" = w.id AND s."finalizedAt" IS NOT NULL
      WHERE w."cohortId" = v_group."cohortId"
    )
    SELECT json_build_object(
      'groupId', v_group.id,
      'groupName', v_group.name,
      'support', (
        SELECT json_build_object(
          'id', u.id,
          'name', u.name,
          'hasPhoto', NULLIF(btrim(COALESCE(u."avatarUrl", '')), '') IS NOT NULL,
          'hasGender', NULLIF(btrim(COALESCE(u.gender, '')), '') IS NOT NULL,
          'hasAgeRange', NULLIF(btrim(COALESCE(u."ageRange", '')), '') IS NOT NULL,
          'hasPhone', NULLIF(btrim(COALESCE(u.phone, '')), '') IS NOT NULL,
          'hasPush', EXISTS (SELECT 1 FROM public."PushSubscription" ps WHERE ps."userId" = u.id)
        )
        FROM public."User" u WHERE u.id = v_group."supportId"
      ),
      'classesRun', (SELECT count(*) FROM j),
      'participants', COALESCE((
        SELECT json_agg(json_build_object(
          'participantId', p.id,
          'name', p."fullName",
          'avatarUrl', p."avatarUrl",
          'isTeen', t.teen,
          'phone', CASE WHEN t.teen THEN NULL ELSE NULLIF(btrim(COALESCE(p.phone, '')), '') END,
          'onboarding', public.participant_onboarding_state(p.id),
          'faithProjectStatus', (
            SELECT fp.status FROM public."FaithProject" fp
            WHERE fp."participantId" = p.id ORDER BY fp."updatedAt" DESC LIMIT 1),
          'hasPush', EXISTS (SELECT 1 FROM public."ParticipantPushSubscription" ps WHERE ps."participantId" = p.id),
          'classesAttended', (
            SELECT count(*) FROM public."AttendanceRecord" r JOIN j ON j."weekId" = r."weekId"
            WHERE r."participantId" = p.id
              AND (r.status = 'PRESENT' OR r.status IN ('LATE', 'LEFT_EARLY'))),
          'recent', COALESCE((
            SELECT json_agg(x ORDER BY x."weekNumber" DESC) FROM (
              SELECT j2."weekNumber", COALESCE(r.status, 'NONE') AS status,
                     (r.status = 'PRESENT' OR r.status IN ('LATE', 'LEFT_EARLY')) AS attended
              FROM j j2
              LEFT JOIN public."AttendanceRecord" r ON r."weekId" = j2."weekId" AND r."participantId" = p.id
              ORDER BY j2."weekNumber" DESC LIMIT 4
            ) x
          ), '[]'::json)
        ) ORDER BY p."fullName")
        FROM public."GroupParticipant" gp
        JOIN public."Participant" p ON p.id = gp."participantId"
        CROSS JOIN LATERAL (
          SELECT COALESCE(
            v_group."isTeenGroup"
            OR replace(lower(COALESCE(p."ageRange", '')), ' ', '') IN ('10-17', '18andbelow', 'below18', 'under18')
            OR EXISTS (
              SELECT 1 FROM public."FollowUpContact" fc
              WHERE fc.id = p."followUpContactId" AND fc."registrationStatus"::text IN ('TEENAGER', 'TEEN_ONBOARDED')),
            FALSE) AS teen
        ) t
        WHERE gp."groupId" = v_group.id AND p.status = 'ACTIVE' AND p."isTest" IS NOT TRUE
      ), '[]'::json)
    )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.notify_attendance_report(p_week_id integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_cohort_id UUID;
  v_week_number INTEGER;
  v_attended_count INTEGER;
  v_absent_count INTEGER;
  v_already_notified_at TIMESTAMPTZ;
  v_title TEXT;
  v_body TEXT;
  v_user_ids UUID[];
  v_url text;
  v_key text;
BEGIN
  SELECT w."cohortId", w."weekNumber", s."reportNotifiedAt"
  INTO v_cohort_id, v_week_number, v_already_notified_at
  FROM public."Week" w
  JOIN public."AttendanceSession" s ON s."weekId" = w.id
  WHERE w.id = p_week_id
  FOR UPDATE OF s;

  IF v_cohort_id IS NULL OR v_already_notified_at IS NOT NULL THEN RETURN; END IF;

  SELECT
    COUNT(*) FILTER (WHERE a.status = 'PRESENT' OR a.status IN ('LATE', 'LEFT_EARLY')),
    COUNT(*) FILTER (WHERE a.status = 'ABSENT')
  INTO v_attended_count, v_absent_count
  FROM public."AttendanceRecord" a
  JOIN public."Participant" p ON p.id = a."participantId"
  WHERE a."weekId" = p_week_id AND p."cohortId" = v_cohort_id AND p.status = 'ACTIVE';

  UPDATE public."AttendanceSession"
  SET "reportNotifiedAt" = NOW(), "updatedAt" = NOW()
  WHERE "weekId" = p_week_id;

  SELECT array_agg(DISTINCT u.id) INTO v_user_ids
  FROM public."Group" g
  JOIN public."User" u ON u.id = g."supportId"
  WHERE g."cohortId" = v_cohort_id
    AND (u.role = 'SUPPORT' OR 'SUPPORT'::public."Role" = ANY(u.roles))
    AND u."isActive" IS NOT FALSE;

  IF v_user_ids IS NULL OR array_length(v_user_ids, 1) IS NULL THEN RETURN; END IF;

  v_title := format('Attendance report · Week %s', v_week_number);
  v_body := format('%s attended · %s absent. Open your schedule for any follow-up assigned to you.', v_attended_count, v_absent_count);

  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'project_url';
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'push_reminders_service_key';

  IF v_url IS NULL OR v_key IS NULL THEN
    -- No push possible: still write the bell rows so nobody misses the report.
    RAISE NOTICE 'notify_attendance_report: vault secrets missing; bell only';
    INSERT INTO public."Notification" ("userId", title, body, path, type)
    SELECT uid, v_title, v_body, '/support/attendance', 'ATTENDANCE_REPORT' FROM unnest(v_user_ids) AS uid;
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := v_url || '/functions/v1/notify-users',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', v_key,
      'Authorization', 'Bearer ' || v_key
    ),
    body := jsonb_build_object(
      'userIds', to_jsonb(v_user_ids),
      'title', v_title,
      'body', v_body,
      'path', '/support/attendance',
      'type', 'ATTENDANCE_REPORT'
    ),
    timeout_milliseconds := 25000
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.api_person_programme(p_participant_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  person public."Participant";
  cohort public."Cohort";
  today DATE := (timezone('Africa/Lagos', now()))::date;
BEGIN
  SELECT * INTO person FROM public."Participant"
  WHERE id = p_participant_id AND COALESCE("isTest", FALSE) = FALSE;
  IF person.id IS NULL OR NOT public.api_real_cohort(person."cohortId") THEN
    RETURN NULL;
  END IF;
  SELECT * INTO cohort FROM public."Cohort" WHERE id = person."cohortId";

  RETURN jsonb_build_object(
    'id', person.id,
    'cohort', jsonb_build_object('id', cohort.id, 'name', cohort.name, 'startDate', cohort."startDate", 'endDate', cohort."endDate"),
    'cohortFinished', cohort."endDate" IS NOT NULL AND cohort."endDate" < today,
    'weeksInProgramme', (SELECT count(*) FROM public."Week" w WHERE w."cohortId" = cohort.id),
    -- A finished cohort held every week. Otherwise a week without a class date (older cohorts, and week 1) is taken
    -- as falling weekly from the cohort's start date.
    'weeksHeld', (SELECT count(*) FROM public."Week" w WHERE w."cohortId" = cohort.id
                  AND (cohort."endDate" < today
                    OR COALESCE(w."classDate", cohort."startDate" + (w."weekNumber" - 1) * 7) <= today)),
    -- Same counting as FOF's own attendance figures: late or leaving early counts as present (lateOrLeftEarly says how many).
    'sundayClass', jsonb_build_object(
      'present', (SELECT count(*) FROM public."AttendanceRecord" a JOIN public."Week" w ON w.id = a."weekId"
                  WHERE a."participantId" = person.id AND w."cohortId" = cohort.id
                    AND (a.status = 'PRESENT' OR a.status IN ('LATE', 'LEFT_EARLY'))),
      'lateOrLeftEarly', (SELECT count(*) FROM public."AttendanceRecord" a JOIN public."Week" w ON w.id = a."weekId"
                  WHERE a."participantId" = person.id AND w."cohortId" = cohort.id
                    AND a.status IN ('LATE', 'LEFT_EARLY')),
      'excused', (SELECT count(*) FROM public."AttendanceRecord" a JOIN public."Week" w ON w.id = a."weekId"
                  WHERE a."participantId" = person.id AND w."cohortId" = cohort.id AND a.status = 'EXCUSED'),
      'absent', (SELECT count(*) FROM public."AttendanceRecord" a JOIN public."Week" w ON w.id = a."weekId"
                 WHERE a."participantId" = person.id AND w."cohortId" = cohort.id AND a.status = 'ABSENT')),
    'groupMeetings', jsonb_build_object(
      'joined', (SELECT count(*) FROM public."MeetingAttendance" m JOIN public."Week" w ON w.id = m."weekId"
                 WHERE m."participantId" = person.id AND w."cohortId" = cohort.id AND m.status = 'JOINED'),
      'excused', (SELECT count(*) FROM public."MeetingAttendance" m JOIN public."Week" w ON w.id = m."weekId"
                  WHERE m."participantId" = person.id AND w."cohortId" = cohort.id AND m.status = 'EXCUSED'),
      'missed', (SELECT count(*) FROM public."MeetingAttendance" m JOIN public."Week" w ON w.id = m."weekId"
                 WHERE m."participantId" = person.id AND w."cohortId" = cohort.id AND m.status = 'MISSED'))
  );
END;
$function$;
