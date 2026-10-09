-- Class card follow-up: manualReleasesAt is only given while a manual document exists and has not been released yet,
-- so the card never promises a manual that was never uploaded. Whole function, same as 20261009110000 plus that one condition.
-- Idempotent.

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
        'teacher', CASE WHEN btrim(COALESCE(w."teacherName", '')) <> '' THEN json_build_object(
          'name', btrim(w."teacherName"), 'role', NULLIF(btrim(COALESCE(w."teacherRole", '')), ''),
          'bio', NULLIF(btrim(COALESCE(w."teacherBio", '')), ''), 'photoUrl', w."teacherPhotoUrl"
        ) END,
        'classGraphicUrl', w."classGraphicUrl",
        'manualReleasesAt', CASE WHEN NOT manual_rel.released AND w."manualDocumentUrl" IS NOT NULL
          THEN public.recap_release_at(public.week_class_date(cohort."startDate", w."weekNumber", w."classDate"), 'manual') END,
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
            OR COALESCE(cohort."isPractice", FALSE)
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
      FROM "Resource" r WHERE r."visibleToParticipants" AND (r."cohortId" IS NULL OR r."cohortId" = person."cohortId")
    ), '[]'::json),
    'announcement', (
      SELECT json_build_object('id', a.id, 'subject', a.subject, 'body', a.body, 'linkUrl', a."linkUrl", 'linkLabel', a."linkLabel", 'homeLabel', a."homeLabel")
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
