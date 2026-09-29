-- Planner step 1: each week can carry its own class date.
--
-- "Week"."classDate" is NULL by default, meaning "the cohort's first class
-- Sunday + (weekNumber - 1) weeks", exactly as before. The Planner sets it
-- only when a class is moved, so nothing changes for any cohort today, and
-- editing a cohort's start date still moves every unmoved week with it.
-- Every place that worked out a class date from the start date now goes
-- through week_class_date(), so a moved class is followed everywhere.

ALTER TABLE public."Week" ADD COLUMN IF NOT EXISTS "classDate" DATE;

CREATE OR REPLACE FUNCTION public.week_class_date(p_start_date date, p_week_number integer, p_class_date date)
 RETURNS date
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  SELECT COALESCE(p_class_date, p_start_date + (p_week_number - 1) * 7);
$function$;

-- Release times from a class date. The old (start date, week number) forms
-- stay, delegating here, so nothing that still calls them breaks.
CREATE OR REPLACE FUNCTION public.recap_release_at(p_class_date date, p_audience text)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_settings JSONB;
  v_day TEXT;
  v_time TEXT;
  v_offset INTEGER;
BEGIN
  IF p_class_date IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT value INTO v_settings FROM "AppSetting" WHERE "settingKey" = 'recap_release_times';

  IF p_audience = 'support' THEN
    v_day := COALESCE(v_settings->>'supportDay', 'SUNDAY');
    v_time := COALESCE(v_settings->>'supportTime', '16:00');
  ELSIF p_audience = 'manual' THEN
    v_day := COALESCE(v_settings->>'manualDay', 'THURSDAY');
    v_time := COALESCE(v_settings->>'manualTime', '18:00');
  ELSE
    v_day := COALESCE(v_settings->>'participantDay', 'MONDAY');
    v_time := COALESCE(v_settings->>'participantTime', '18:00');
  END IF;

  v_offset := GREATEST(0, array_position(
    ARRAY['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'],
    upper(v_day)
  ) - 1);

  IF v_time !~ '^[0-9]{1,2}:[0-9]{2}$' THEN
    v_time := '00:00';
  END IF;

  -- The manual goes out before class: the chosen weekday on or before that
  -- week's class Sunday (Thursday = 3 days before). Recaps come after class.
  IF p_audience = 'manual' THEN
    RETURN (
      (p_class_date - ((7 - v_offset) % 7))::TIMESTAMP + v_time::TIME
    ) AT TIME ZONE 'Africa/Lagos';
  END IF;

  RETURN (
    (p_class_date + v_offset)::TIMESTAMP + v_time::TIME
  ) AT TIME ZONE 'Africa/Lagos';
END;
$function$;

CREATE OR REPLACE FUNCTION public.recap_release_at(p_start_date date, p_week_number integer, p_audience text)
 RETURNS timestamp with time zone
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT public.recap_release_at(p_start_date + (p_week_number - 1) * 7, p_audience);
$function$;

CREATE OR REPLACE FUNCTION public.class_feedback_release_at(p_class_date date, p_audience text)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_settings JSONB;
  v_day TEXT;
  v_time TEXT;
  v_offset INTEGER;
BEGIN
  IF p_class_date IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT value INTO v_settings FROM "AppSetting" WHERE "settingKey" = 'class_feedback_times';

  IF p_audience = 'support' THEN
    v_day := COALESCE(v_settings->>'supportDay', 'SUNDAY');
    v_time := COALESCE(v_settings->>'supportTime', '12:00');
  ELSE
    v_day := COALESCE(v_settings->>'participantDay', 'SUNDAY');
    v_time := COALESCE(v_settings->>'participantTime', '12:00');
  END IF;

  v_offset := GREATEST(0, array_position(
    ARRAY['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'],
    upper(v_day)
  ) - 1);

  IF v_time !~ '^[0-9]{1,2}:[0-9]{2}$' THEN
    v_time := '00:00';
  END IF;

  RETURN (
    (p_class_date + v_offset)::TIMESTAMP + v_time::TIME
  ) AT TIME ZONE 'Africa/Lagos';
END;
$function$;

CREATE OR REPLACE FUNCTION public.class_feedback_release_at(p_start_date date, p_week_number integer, p_audience text)
 RETURNS timestamp with time zone
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT public.class_feedback_release_at(p_start_date + (p_week_number - 1) * 7, p_audience);
$function$;

-- Callers switched to the week's class date (bodies taken from production).
-- cohort_health also returns each week's classDate for the dashboards.
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
      'registered', (SELECT count(*) FROM contacts WHERE "registrationStatus" = 'REGISTERED'),
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

CREATE OR REPLACE FUNCTION public.auto_finalize_sunday_attendance()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_week_id INTEGER;
BEGIN
  FOR v_week_id IN
    SELECT w.id
    FROM public."Week" w
    JOIN public."Cohort" c ON c.id = w."cohortId"
    LEFT JOIN public."AttendanceSession" s ON s."weekId" = w.id
    WHERE COALESCE(s."autoFinalizeAtNoon", TRUE) AND s."finalizedAt" IS NULL
      AND (timezone('Africa/Lagos', NOW()))::date = public.week_class_date(c."startDate", w."weekNumber", w."classDate")
      AND (timezone('Africa/Lagos', NOW()))::time >= TIME '12:00'
      AND EXISTS (SELECT 1 FROM public."Participant" p WHERE p."cohortId" = c.id AND p.status = 'ACTIVE')
      AND NOT EXISTS (
        SELECT 1 FROM public."Participant" p
        WHERE p."cohortId" = c.id AND p.status = 'ACTIVE'
          AND NOT EXISTS (SELECT 1 FROM public."AttendanceRecord" a WHERE a."weekId" = w.id AND a."participantId" = p.id)
      )
  LOOP
    INSERT INTO public."AttendanceSession" ("weekId") VALUES (v_week_id) ON CONFLICT ("weekId") DO NOTHING;
    UPDATE public."AttendanceSession"
    SET "finalizedAt" = NOW(), "finalizationMethod" = 'AUTO', "updatedAt" = NOW()
    WHERE "weekId" = v_week_id AND "finalizedAt" IS NULL;
    IF FOUND THEN
      PERFORM public.sync_attendance_follow_up_tasks(v_week_id);
      PERFORM public.notify_attendance_report(v_week_id);
    END IF;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_attendance_follow_up_tasks(p_week_id integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_cohort_id UUID;
  v_sunday_date DATE;
  v_due_at TIMESTAMPTZ;
  v_absence RECORD;
  v_support_id UUID;
BEGIN
  SELECT w."cohortId", public.week_class_date(c."startDate", w."weekNumber", w."classDate")
  INTO v_cohort_id, v_sunday_date
  FROM public."Week" w
  JOIN public."Cohort" c ON c.id = w."cohortId"
  WHERE w.id = p_week_id;
  IF v_cohort_id IS NULL THEN
    RAISE EXCEPTION 'Attendance week was not found';
  END IF;

  -- Monday morning gives the assigned support a clear, actionable follow-up
  -- slot after Sunday class without depending on a browser's timezone.
  v_due_at := ((v_sunday_date + 1)::timestamp + TIME '09:00') AT TIME ZONE 'Africa/Lagos';

  UPDATE public."AttendanceFollowUpTask"
  SET status = 'CANCELLED', "updatedAt" = NOW()
  WHERE "weekId" = p_week_id AND status = 'OPEN';

  FOR v_absence IN
    SELECT a.id AS attendance_record_id, a."participantId"
    FROM public."AttendanceRecord" a
    JOIN public."Participant" p ON p.id = a."participantId"
    WHERE a."weekId" = p_week_id
      AND a.status = 'ABSENT'
      AND p."cohortId" = v_cohort_id
      AND p.status = 'ACTIVE'
  LOOP
    SELECT g."supportId" INTO v_support_id
    FROM public."GroupParticipant" gp
    JOIN public."Group" g ON g.id = gp."groupId" AND g."cohortId" = v_cohort_id
    JOIN public."User" u ON u.id = g."supportId" AND u."isActive" IS NOT FALSE
    WHERE gp."participantId" = v_absence."participantId"
    LIMIT 1;

    IF v_support_id IS NOT NULL THEN
      INSERT INTO public."AttendanceFollowUpTask" (
        "attendanceRecordId", "participantId", "weekId", "supportId", "dueAt"
      ) VALUES (
        v_absence.attendance_record_id, v_absence."participantId", p_week_id, v_support_id, v_due_at
      )
      ON CONFLICT ("attendanceRecordId") DO UPDATE
        SET "supportId" = EXCLUDED."supportId",
            "dueAt" = EXCLUDED."dueAt",
            status = CASE
              WHEN public."AttendanceFollowUpTask".status = 'DONE' THEN 'DONE'
              ELSE 'OPEN'
            END,
            "updatedAt" = NOW();
    END IF;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.participant_summary(p_token text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  person_id UUID := public.app_participant_id(p_token);
  person "Participant";
BEGIN
  IF person_id IS NULL THEN
    RAISE EXCEPTION 'SESSION_EXPIRED';
  END IF;
  SELECT * INTO person FROM "Participant" WHERE id = person_id;
  RETURN json_build_object(
    'optedIn', (SELECT a."aiOptInAt" IS NOT NULL FROM "ParticipantAccount" a WHERE a."participantId" = person_id),
    'unlocked', COALESCE((
      SELECT NOW() >= (max(public.week_class_date(c."startDate", w."weekNumber", w."classDate"))::TIMESTAMP AT TIME ZONE 'Africa/Lagos')
      FROM "Cohort" c JOIN "Week" w ON w."cohortId" = c.id
      WHERE c.id = person."cohortId" AND c."startDate" IS NOT NULL
      GROUP BY c."startDate"
    ), FALSE),
    'summary', (
      SELECT json_build_object('text', s.summary, 'createdAt', s."createdAt")
      FROM "ReflectionSummary" s WHERE s."participantId" = person_id AND s."cohortId" = person."cohortId"
    )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.support_recaps(p_cohort_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  cohort "Cohort";
  v_actor_id UUID;
  v_is_admin BOOLEAN;
BEGIN
  IF NOT public.app_is_staff() THEN
    RAISE EXCEPTION 'You must be signed in as a support or admin';
  END IF;

  SELECT * INTO cohort FROM "Cohort" WHERE id = p_cohort_id;
  IF cohort.id IS NULL THEN
    RAISE EXCEPTION 'Cohort was not found';
  END IF;

  v_actor_id := public.app_current_user_id();
  v_is_admin := public.app_is_admin();

  RETURN COALESCE((
    SELECT json_agg(json_build_object(
      'weekId', w.id,
      'weekNumber', w."weekNumber",
      'classDate', public.week_class_date(cohort."startDate", w."weekNumber", w."classDate"),
      'title', w.title,
      'released', rel.released,
      'releasedAt', rel."releasedAt",
      'recapSummary', w."recapSummary",
      'discussionPrompt', w."discussionPrompt",
      'recapDocumentUrl', w."recapDocumentUrl",
      'recapDocumentName', w."recapDocumentName",
      'manual', CASE WHEN manual_rel.released AND w."manualDocumentUrl" IS NOT NULL THEN json_build_object(
        'documentUrl', w."manualDocumentUrl", 'documentName', w."manualDocumentName",
        'summary', w."manualSummary", 'discussionPrompt', w."manualDiscussionPrompt"
      ) END,
      'manualReleased', manual_rel.released,
      'manualReleasedAt', manual_rel."releasedAt",
      'unreadQuestionCount', (
        SELECT COUNT(*) FROM "ManualQuestion" mq
        WHERE mq."weekId" = w.id AND mq.status = 'NEW'
          AND (v_is_admin OR EXISTS (SELECT 1 FROM "Group" sg WHERE sg.id = mq."groupId" AND sg."supportId" = v_actor_id))
      )
    ) ORDER BY w."weekNumber" DESC)
    FROM "Week" w
    CROSS JOIN LATERAL (
      SELECT
        NOW() >= public.recap_release_at(public.week_class_date(cohort."startDate", w."weekNumber", w."classDate"), 'support') AS released,
        public.recap_release_at(public.week_class_date(cohort."startDate", w."weekNumber", w."classDate"), 'support') AS "releasedAt"
    ) rel
    CROSS JOIN LATERAL (
      SELECT
        COALESCE(w."manualReleasedEarlyAt" IS NOT NULL OR NOW() >= public.recap_release_at(public.week_class_date(cohort."startDate", w."weekNumber", w."classDate"), 'manual'), FALSE) AS released,
        COALESCE(w."manualReleasedEarlyAt", public.recap_release_at(public.week_class_date(cohort."startDate", w."weekNumber", w."classDate"), 'manual')) AS "releasedAt"
    ) manual_rel
    WHERE w."cohortId" = p_cohort_id
      AND (
        btrim(COALESCE(w."recapSummary", '')) <> '' OR w."recapDocumentUrl" IS NOT NULL
        OR w."manualDocumentUrl" IS NOT NULL
      )
  ), '[]'::json);
END;
$function$;

CREATE OR REPLACE FUNCTION public.participant_home(p_token text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  person_id UUID := public.app_participant_id(p_token);
  person "Participant";
  cohort "Cohort";
  grp "Group";
  support "User";
BEGIN
  IF person_id IS NULL THEN
    RAISE EXCEPTION 'SESSION_EXPIRED';
  END IF;

  SELECT * INTO person FROM "Participant" WHERE id = person_id;
  SELECT * INTO cohort FROM "Cohort" WHERE id = person."cohortId";
  SELECT g.* INTO grp
  FROM "GroupParticipant" gp
  JOIN "Group" g ON g.id = gp."groupId" AND g."cohortId" = person."cohortId"
  WHERE gp."participantId" = person_id
  LIMIT 1;
  SELECT * INTO support FROM "User" WHERE id = grp."supportId";

  RETURN json_build_object(
    'now', NOW(),
    'participant', json_build_object('id', person.id, 'name', person."fullName", 'phone', person.phone),
    'cohort', CASE WHEN cohort.id IS NULL THEN NULL ELSE json_build_object(
      'id', cohort.id, 'name', cohort.name, 'startDate', cohort."startDate", 'endDate', cohort."endDate",
      'status', cohort.status, 'venue', cohort.venue
    ) END,
    'group', CASE WHEN grp.id IS NULL THEN NULL ELSE json_build_object(
      'id', grp.id, 'name', grp.name, 'meetingDay', grp."meetingDay", 'meetingTime', grp."meetingTime",
      'meetingDurationMins', grp."meetingDurationMins", 'callPlatform', grp."callPlatform", 'callLink', grp."callLink",
      'supportName', support.name, 'supportPhone', support.phone, 'supportAvatarUrl', support."avatarUrl"
    ) END,
    'groupMeetingLive', (
      SELECT json_build_object('weekId', gm."weekId", 'startedAt', gm.started, 'prayerFinished', gps."prayerFinishedAt" IS NOT NULL, 'recapFinished', gps."recapFinishedAt" IS NOT NULL,
        'recap', CASE WHEN gps."prayerFinishedAt" IS NOT NULL
          AND COALESCE(lw."shareWithParticipants", FALSE)
          AND (btrim(COALESCE(lw."recapSummary", '')) <> '' OR lw."recapDocumentUrl" IS NOT NULL)
          THEN json_build_object(
            'recapSummary', lw."recapSummary", 'discussionPrompt', lw."discussionPrompt",
            'recapDocumentUrl', lw."recapDocumentUrl", 'recapDocumentName', lw."recapDocumentName"
          ) END)
      FROM (
        SELECT m."weekId" AS "weekId", MIN(m."markedAt") AS started
        FROM "MeetingAttendance" m
        WHERE m."groupId" = grp.id
        GROUP BY m."weekId"
      ) gm
      LEFT JOIN "GroupPrayerStatus" gps ON gps."groupId" = grp.id AND gps."weekId" = gm."weekId"
      LEFT JOIN "Week" lw ON lw.id = gm."weekId"
      WHERE gm.started > NOW() - INTERVAL '3 hours'
        AND COALESCE(gps.done, FALSE) = FALSE
      ORDER BY gm.started DESC
      LIMIT 1
    ),
    'groupPrayerFocus', (
      SELECT json_build_object(
        'weekId', f."weekId",
        'participantName', fp_person."fullName",
        'projectText', (
          SELECT fp.body FROM "FaithProject" fp
          WHERE fp."participantId" = fp_person.id AND fp.status = 'APPROVED' AND fp."sharedForPrayer" IS TRUE
          ORDER BY fp."updatedAt" DESC LIMIT 1
        )
      )
      FROM "GroupPrayerFocus" f
      JOIN "Participant" fp_person ON fp_person.id = f."participantId"
      WHERE f."groupId" = grp.id
        AND f."weekId" = (
          SELECT gm."weekId"
          FROM (
            SELECT m."weekId" AS "weekId", MIN(m."markedAt") AS started
            FROM "MeetingAttendance" m
            WHERE m."groupId" = grp.id
            GROUP BY m."weekId"
          ) gm
          LEFT JOIN "GroupPrayerStatus" gps ON gps."groupId" = grp.id AND gps."weekId" = gm."weekId"
          WHERE gm.started > NOW() - INTERVAL '3 hours'
            AND COALESCE(gps.done, FALSE) = FALSE
          ORDER BY gm.started DESC
          LIMIT 1
        )
    ),
    'weeks', COALESCE((
      SELECT json_agg(json_build_object(
        'id', w.id,
        'weekNumber', w."weekNumber",
        'classDate', public.week_class_date(cohort."startDate", w."weekNumber", w."classDate"),
        'title', w.title,
        'classTime', (
          SELECT a.time FROM "Day" d JOIN "Activity" a ON a."dayId" = d.id
          WHERE d."weekId" = w.id AND d."dayName" = 'Sunday' AND a.description ~* '^\s*class\s*[0-9]|introductory class'
          ORDER BY a.time LIMIT 1
        ),
        'expectations', w.expectations,
        'shared', w."shareWithParticipants",
        'released', rel.released,
        'releasedAt', rel."releasedAt",
        'recapSummary', CASE WHEN rel.released THEN w."recapSummary" END,
        'discussionPrompt', CASE WHEN rel.released THEN w."discussionPrompt" END,
        'recapDocumentUrl', CASE WHEN rel.released THEN w."recapDocumentUrl" END,
        'recapDocumentName', CASE WHEN rel.released THEN w."recapDocumentName" END,
        'manual', CASE WHEN manual_rel.released AND w."manualDocumentUrl" IS NOT NULL THEN json_build_object(
          'documentUrl', w."manualDocumentUrl", 'documentName', w."manualDocumentName",
          'summary', w."manualSummary", 'discussionPrompt', w."manualDiscussionPrompt"
        ) END,
        'manualQuestions', COALESCE((
          SELECT json_agg(json_build_object(
            'id', mq.id, 'body', mq.body, 'status', mq.status, 'reply', mq.reply, 'createdAt', mq."createdAt"
          ) ORDER BY mq."createdAt")
          FROM "ManualQuestion" mq WHERE mq."weekId" = w.id AND mq."participantId" = person_id
        ), '[]'::json),
        'manualNote', (SELECT n.body FROM "ManualNote" n WHERE n."weekId" = w.id AND n."participantId" = person_id)
      ) ORDER BY w."weekNumber")
      FROM "Week" w
      CROSS JOIN LATERAL (
        SELECT
          COALESCE(w."shareWithParticipants" AND (
            btrim(COALESCE(w."recapSummary", '')) <> ''
            OR w."recapDocumentUrl" IS NOT NULL
          ) AND (
            w."participantReleasedEarlyAt" IS NOT NULL
            OR NOW() >= public.recap_release_at(public.week_class_date(cohort."startDate", w."weekNumber", w."classDate"), 'participant')
          ), FALSE) AS released,
          COALESCE(w."participantReleasedEarlyAt", public.recap_release_at(public.week_class_date(cohort."startDate", w."weekNumber", w."classDate"), 'participant')) AS "releasedAt"
        FROM (SELECT 1) one
      ) rel
      CROSS JOIN LATERAL (
        SELECT COALESCE(
          w."manualReleasedEarlyAt" IS NOT NULL
          OR NOW() >= public.recap_release_at(public.week_class_date(cohort."startDate", w."weekNumber", w."classDate"), 'manual'),
          FALSE
        ) AS released
      ) manual_rel
      WHERE w."cohortId" = person."cohortId"
    ), '[]'::json),
    'reflections', COALESCE((
      SELECT json_agg(json_build_object(
        'weekId', r."weekId", 'stoodOut', r."stoodOut", 'goal', r.goal, 'goalCheck', r."goalCheck",
        'goalDoneAt', r."goalDoneAt", 'createdAt', r."createdAt", 'updatedAt', r."updatedAt"
      ))
      FROM "Reflection" r WHERE r."participantId" = person_id
    ), '[]'::json),
    'sunday', COALESCE((
      SELECT json_agg(json_build_object('weekId', a."weekId", 'status', a.status, 'lateExcused', a."lateExcused"))
      FROM "AttendanceRecord" a JOIN "Week" w ON w.id = a."weekId" AND w."cohortId" = person."cohortId"
      WHERE a."participantId" = person_id
    ), '[]'::json),
    'meeting', COALESCE((
      SELECT json_agg(json_build_object('weekId', m."weekId", 'status', m.status))
      FROM "MeetingAttendance" m JOIN "Week" w ON w.id = m."weekId" AND w."cohortId" = person."cohortId"
      WHERE m."participantId" = person_id
    ), '[]'::json),
    'openWindow', (
      SELECT jsonb_build_object(
        'weekId', s."weekId",
        'closesAt', s."closesAt",
        'myStatus', (SELECT a.status FROM "AttendanceRecord" a WHERE a."weekId" = s."weekId" AND a."participantId" = person_id)
      )
      FROM "AttendanceSession" s
      JOIN "Week" w2 ON w2.id = s."weekId" AND w2."cohortId" = person."cohortId"
      WHERE s."startedAt" IS NOT NULL AND s."closesAt" > NOW() AND s."finalizedAt" IS NULL
      ORDER BY s."startedAt" DESC LIMIT 1
    ),
    'faithProjectStatus', (SELECT f.status FROM "FaithProject" f WHERE f."participantId" = person_id ORDER BY f."updatedAt" DESC LIMIT 1),
    'rules', (SELECT value FROM "AppSetting" WHERE "settingKey" = 'programme_rules'),
    'scriptures', CASE WHEN COALESCE((SELECT (value #>> '{}')::boolean FROM "AppSetting" WHERE "settingKey" = 'scriptures_enabled'), TRUE)
      THEN COALESCE((
        SELECT json_agg(json_build_object('dayNumber', sc."dayNumber", 'imageUrl', sc."imageUrl") ORDER BY sc."dayNumber")
        FROM "Scripture" sc
      ), '[]'::json)
      ELSE '[]'::json
    END,
    'scriptureStartDay', COALESCE((SELECT (value #>> '{}')::int FROM "AppSetting" WHERE "settingKey" = 'scripture_start_day'), 1),
    'members', COALESCE((
      SELECT json_agg(json_build_object('name', m."fullName", 'avatarUrl', m."avatarUrl") ORDER BY m."fullName")
      FROM "GroupParticipant" gp JOIN "Participant" m ON m.id = gp."participantId"
      WHERE gp."groupId" = grp.id AND m.id <> person_id AND m.status = 'ACTIVE'
    ), '[]'::json),
    'profile', json_build_object(
      'email', person.email,
      'avatarUrl', person."avatarUrl",
      'gender', person.gender,
      'ageRange', person."ageRange",
      'dateOfBirth', person."dateOfBirth",
      'occupation', COALESCE(person.occupation, (SELECT f.occupation FROM "FollowUpContact" f WHERE f.id = person."followUpContactId"))
    ),
    'faithUnread', EXISTS (
      SELECT 1 FROM "ParticipantNote" n
      WHERE n."participantId" = person_id AND n."noteType" = 'FAITH_COACH' AND NOT n."byParticipant"
        AND n."createdAt" > GREATEST(
          COALESCE((SELECT t."coachLastReadAt" FROM "ParticipantThreadRead" t WHERE t."participantId" = person_id), '-infinity'::timestamptz),
          '2026-09-17T02:00:00Z'::timestamptz)
    ),
    'reminders', (
      SELECT json_build_object(
        'meetingRemindMinutes', COALESCE(rs."meetingRemindMinutes", '[60]'::jsonb),
        'recapReleased', COALESCE(rs."recapReleased", TRUE)
      )
      FROM (SELECT 1) one LEFT JOIN "ParticipantReminderSetting" rs ON rs."participantId" = person_id
    ),
    'resources', COALESCE((
      SELECT json_agg(json_build_object('id', r.id, 'title', r.title, 'description', r.description, 'type', r.type, 'url', r.url, 'fileName', r."fileName") ORDER BY r.title)
      FROM "Resource" r WHERE r."visibleToParticipants"
    ), '[]'::json),
    'announcement', (
      SELECT json_build_object('id', a.id, 'subject', a.subject, 'body', a.body, 'linkUrl', a."linkUrl", 'linkLabel', a."linkLabel")
      FROM "Announcement" a
      WHERE a."showOnHome" AND a."homeUntil" > NOW() AND a.audience IN ('PARTICIPANTS', 'EVERYONE')
        AND (a.scope = 'ALL_USERS' OR a."cohortId" IS NULL OR a."cohortId" = person."cohortId")
        AND a."targetUserId" IS NULL
        AND (a."targetParticipantId" IS NULL OR a."targetParticipantId" = person_id)
      ORDER BY a."sentAt" DESC LIMIT 1
    ),
    'wrapUp', (
      SELECT json_build_object('submitted', w."participantId" IS NOT NULL, 'department', w.department)
      FROM (SELECT 1) one
      LEFT JOIN "ParticipantWrapUp" w ON w."participantId" = person_id AND w."cohortId" = person."cohortId"
    ),
    'profileFields', public.participant_profile_fields(person_id),
    'profileCompletion', public.profile_completion_for(person_id),
    'lastCheckIn', (
      SELECT json_build_object('response', c.response, 'sundayMisses', c."sundayMisses", 'meetingMisses', c."meetingMisses", 'createdAt', c."createdAt")
      FROM "ParticipantCheckIn" c WHERE c."participantId" = person_id
      ORDER BY c."createdAt" DESC LIMIT 1
    ),
    'classFeedbackDue', (
      SELECT json_build_object(
        'weekId', w3.id,
        'weekNumber', w3."weekNumber",
        'open', NOW() >= public.class_feedback_release_at(public.week_class_date(cohort."startDate", w3."weekNumber", w3."classDate"), 'participant')
      )
      FROM (
        SELECT wk.* FROM "Week" wk
        WHERE wk."cohortId" = person."cohortId"
          AND cohort."startDate" IS NOT NULL
          AND (public.week_class_date(cohort."startDate", wk."weekNumber", wk."classDate")::TIMESTAMP AT TIME ZONE 'Africa/Lagos') <= NOW()
        ORDER BY wk."weekNumber" DESC
        LIMIT 1
      ) w3
      WHERE NOT EXISTS (SELECT 1 FROM "ParticipantClassFeedbackDone" d WHERE d."participantId" = person_id AND d."weekId" = w3.id)
    ),
    'departmentPromptDue', COALESCE((
      SELECT TRUE
      FROM "AppSetting" cft
      WHERE cft."settingKey" = 'class_feedback_times'
        AND (cft.value->>'departmentWeek') IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM "ParticipantWrapUp" ww WHERE ww."participantId" = person_id AND ww."cohortId" = person."cohortId")
        AND EXISTS (
          SELECT 1 FROM "Week" dwk
          WHERE dwk."cohortId" = person."cohortId"
            AND dwk."weekNumber" >= (cft.value->>'departmentWeek')::int
            AND NOW() >= (public.week_class_date(cohort."startDate", dwk."weekNumber", dwk."classDate")::TIMESTAMP AT TIME ZONE 'Africa/Lagos')
        )
    ), FALSE)
  );
END;
$function$;
