-- Recap release times: supports get the week's recap at a configured day/time
-- (default Sunday 4pm), participants at their own configured day/time (default
-- Monday 6pm). Both are editable in Settings > Programme > Timings.
--
-- Additive and idempotent. Builds on 20260917120000_participant_app_core.sql
-- (shareWithParticipants) and 20260925050000_scripture_order_start_day.sql
-- (latest participant_home).
--
-- Verified against the live database before writing this:
--   - Both real cohorts' Cohort."startDate" fall on a Sunday
--     (to_char("startDate", 'Day') = 'Sunday' for both ZZ Demo Cohort and
--     Cohort 9), so "class Sunday = startDate + (weekNumber-1)*7" holds.
--   - The live public.participant_home(text) definition is byte-for-byte the
--     one in 20260925050000_scripture_order_start_day.sql (pg_get_functiondef
--     diffed against that file, only cosmetic whitespace differs), so it is
--     safe to copy whole and adjust only the release logic below.

-- 1. Settings: supportDay/supportTime/participantDay/participantTime. Days are
--    counted 0..6 from the week's class Sunday (SUNDAY = that Sunday itself,
--    MONDAY = the day after, etc.) -- same "day of the week" vocabulary as
--    Group.meetingDay elsewhere in this schema.
INSERT INTO "AppSetting" ("settingKey", value)
VALUES ('recap_release_times', '{"supportDay":"SUNDAY","supportTime":"16:00","participantDay":"MONDAY","participantTime":"18:00"}'::jsonb)
ON CONFLICT ("settingKey") DO NOTHING;

-- 2. When a support used "Send to participants now" to release a week early.
--    NULL means no early release; once set, participants see it regardless of
--    the configured participant time.
ALTER TABLE "Week"
  ADD COLUMN IF NOT EXISTS "participantReleasedEarlyAt" TIMESTAMPTZ;

-- 3. recap_release_at: when a given audience ('support' or 'participant') gets
--    a week's recap, in Africa/Lagos. Reads recap_release_times the same way
--    start_attendance_window reads programme_rules.attendanceWindowMinutes
--    (20260923000000_sunday_attendance_late_rule.sql:189-191) -- COALESCE onto
--    the agreed default when the setting row (or a key in it) is missing, so
--    this never breaks if Settings hasn't been opened yet. Not granted to
--    anon/authenticated: it's an internal helper called from participant_home
--    and support_recaps, same as recap_auto_release_at.
CREATE OR REPLACE FUNCTION public.recap_release_at(
  p_start_date DATE,
  p_week_number INTEGER,
  p_audience TEXT
)
RETURNS TIMESTAMPTZ
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
  IF p_start_date IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT value INTO v_settings FROM "AppSetting" WHERE "settingKey" = 'recap_release_times';

  IF p_audience = 'support' THEN
    v_day := COALESCE(v_settings->>'supportDay', 'SUNDAY');
    v_time := COALESCE(v_settings->>'supportTime', '16:00');
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

  RETURN (
    (p_start_date + (p_week_number - 1) * 7 + v_offset)::TIMESTAMP + v_time::TIME
  ) AT TIME ZONE 'Africa/Lagos';
END;
$function$;

REVOKE ALL ON FUNCTION public.recap_release_at(DATE, INTEGER, TEXT) FROM PUBLIC, anon, authenticated;

-- 4. participant_home: identical to 20260925050000_scripture_order_start_day.sql
--    except the 'weeks' release logic, which now also checks the participant
--    release time (or an early release), and 'releasedAt' is the effective
--    time instead of always NULL.
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
      'supportName', support.name, 'supportPhone', support.phone
    ) END,
    'weeks', COALESCE((
      SELECT json_agg(json_build_object(
        'id', w.id,
        'weekNumber', w."weekNumber",
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
        'recapDocumentName', CASE WHEN rel.released THEN w."recapDocumentName" END
      ) ORDER BY w."weekNumber")
      FROM "Week" w
      CROSS JOIN LATERAL (
        SELECT
          COALESCE(w."shareWithParticipants" AND (
            btrim(COALESCE(w."recapSummary", '')) <> ''
            OR w."recapDocumentUrl" IS NOT NULL
          ) AND (
            w."participantReleasedEarlyAt" IS NOT NULL
            OR NOW() >= public.recap_release_at(cohort."startDate", w."weekNumber", 'participant')
          ), FALSE) AS released,
          COALESCE(w."participantReleasedEarlyAt", public.recap_release_at(cohort."startDate", w."weekNumber", 'participant')) AS "releasedAt"
        FROM (SELECT 1) one
      ) rel
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
    'scriptures', COALESCE((
      SELECT json_agg(json_build_object('dayNumber', sc."dayNumber", 'imageUrl', sc."imageUrl") ORDER BY sc."dayNumber")
      FROM "Scripture" sc
    ), '[]'::json),
    'scriptureStartDay', COALESCE((SELECT (value #>> '{}')::int FROM "AppSetting" WHERE "settingKey" = 'scripture_start_day'), 1),
    'members', COALESCE((
      SELECT json_agg(json_build_object('name', m."fullName") ORDER BY m."fullName")
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
    'wrapUp', json_build_object(
      'submitted', EXISTS (SELECT 1 FROM "ParticipantWrapUp" w WHERE w."participantId" = person_id AND w."cohortId" = person."cohortId")
    ),
    'profileFields', public.participant_profile_fields(person_id),
    'profileCompletion', public.profile_completion_for(person_id),
    'lastCheckIn', (
      SELECT json_build_object('response', c.response, 'sundayMisses', c."sundayMisses", 'meetingMisses', c."meetingMisses", 'createdAt', c."createdAt")
      FROM "ParticipantCheckIn" c WHERE c."participantId" = person_id
      ORDER BY c."createdAt" DESC LIMIT 1
    )
  );
END;
$function$
;

-- 5. support_recaps: a support's (or admin's) cohort weeks that have recap
--    content, with the content itself only included once the support release
--    time has passed -- same shape/pattern as participant_home's 'weeks'
--    block, but gated on the 'support' audience and not on shareWithParticipants
--    (that switch only ever affected participants; supports always got the
--    recap once it existed). Ordered newest week first so "this week's recap"
--    reads at the top, older weeks below.
--
--    Auth: same as get_my_hub/mark_support_attendance/post_hub_message
--    (20260924000000_support_hubs.sql) -- app_is_staff() reads the
--    x-session-token header the client already sends on every request
--    (frontend/src/lib/supabase.ts), no token parameter needed.
CREATE OR REPLACE FUNCTION public.support_recaps(p_cohort_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  cohort "Cohort";
BEGIN
  IF NOT public.app_is_staff() THEN
    RAISE EXCEPTION 'You must be signed in as a support or admin';
  END IF;

  SELECT * INTO cohort FROM "Cohort" WHERE id = p_cohort_id;
  IF cohort.id IS NULL THEN
    RAISE EXCEPTION 'Cohort was not found';
  END IF;

  RETURN COALESCE((
    SELECT json_agg(json_build_object(
      'weekId', w.id,
      'weekNumber', w."weekNumber",
      'title', w.title,
      'released', rel.released,
      'releasedAt', rel."releasedAt",
      'recapSummary', CASE WHEN rel.released THEN w."recapSummary" END,
      'discussionPrompt', CASE WHEN rel.released THEN w."discussionPrompt" END,
      'recapDocumentUrl', CASE WHEN rel.released THEN w."recapDocumentUrl" END,
      'recapDocumentName', CASE WHEN rel.released THEN w."recapDocumentName" END
    ) ORDER BY w."weekNumber" DESC)
    FROM "Week" w
    CROSS JOIN LATERAL (
      SELECT
        NOW() >= public.recap_release_at(cohort."startDate", w."weekNumber", 'support') AS released,
        public.recap_release_at(cohort."startDate", w."weekNumber", 'support') AS "releasedAt"
    ) rel
    WHERE w."cohortId" = p_cohort_id
      AND (btrim(COALESCE(w."recapSummary", '')) <> '' OR w."recapDocumentUrl" IS NOT NULL)
  ), '[]'::json);
END;
$function$;

REVOKE ALL ON FUNCTION public.support_recaps(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.support_recaps(UUID) TO anon, authenticated;
