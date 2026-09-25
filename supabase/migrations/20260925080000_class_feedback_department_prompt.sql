-- Post-class feedback + department choice (roadmap step 3).
--
-- Supports answer one question a week ("Anything from today's class to
-- flag?"), with a note or None. Participants answer a 1-5 rating with an
-- optional comment, anonymous unless they tick "Show my name with this".
-- Participants also get a one-off "which department would you like to join"
-- prompt from a week the admin chooses, reusing submit_wrap_up so "Finish
-- FOF" already has the answer.
--
-- Additive and idempotent. Builds on 20260925060000_recap_release_times.sql
-- (latest live participant_home -- no later migration redefines it) and the
-- same auth helpers (app_is_staff/app_is_admin from
-- 20260917260000_session_token_header_helpers.sql and
-- 20260920100000_faith_project_settings_categories.sql).
--
-- Not yet applied to the live database or deployed.

-- 1. Settings: class_feedback_times. Same day-offset-from-class-Sunday
--    vocabulary as recap_release_times. departmentWeek is the week number the
--    department prompt opens from; NULL means the prompt is off.
INSERT INTO "AppSetting" ("settingKey", value)
VALUES ('class_feedback_times', '{"supportDay":"SUNDAY","supportTime":"12:00","participantDay":"SUNDAY","participantTime":"12:00","departmentWeek":null}'::jsonb)
ON CONFLICT ("settingKey") DO NOTHING;

-- 2. Support answers: one row per support per week. Staff-readable/writable
--    table, same shape as SupportHub/HubMembership (20260924000000_support_hubs.sql).
CREATE TABLE IF NOT EXISTS "SupportClassFeedback" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "supportId" UUID NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "cohortId" UUID NOT NULL REFERENCES "Cohort"(id) ON DELETE CASCADE,
  "weekId" INTEGER NOT NULL REFERENCES "Week"(id) ON DELETE CASCADE,
  note TEXT,
  "isNone" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("supportId", "weekId")
);

ALTER TABLE "SupportClassFeedback" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff can manage class feedback" ON "SupportClassFeedback";
CREATE POLICY "Staff can manage class feedback" ON "SupportClassFeedback"
  FOR ALL USING (public.app_is_staff()) WITH CHECK (public.app_is_staff());
GRANT SELECT, INSERT, UPDATE, DELETE ON "SupportClassFeedback" TO anon, authenticated;

-- 3. Participant answers: born locked like ParticipantPushSubscription
--    (20260917130000_participant_app_group_faith_profile.sql) -- no policy, no
--    grant, so nothing reaches it except SECURITY DEFINER functions owned by
--    postgres. "participantId" is only set when the participant ticked "Show
--    my name with this"; an anonymous answer stores NULL there, so no row in
--    this table is ever linkable to a person unless they chose to be named.
CREATE TABLE IF NOT EXISTS "ParticipantClassFeedback" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "cohortId" UUID NOT NULL REFERENCES "Cohort"(id) ON DELETE CASCADE,
  "weekId" INTEGER NOT NULL REFERENCES "Week"(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  "participantId" UUID REFERENCES "Participant"(id) ON DELETE SET NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE "ParticipantClassFeedback" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "ParticipantClassFeedback" FROM anon, authenticated;

-- 4. Who has answered which week -- kept separate from the answer itself (no
--    shared id, no join key) so "the prompt stops asking" never links an
--    anonymous answer back to a participant.
CREATE TABLE IF NOT EXISTS "ParticipantClassFeedbackDone" (
  "participantId" UUID NOT NULL REFERENCES "Participant"(id) ON DELETE CASCADE,
  "weekId" INTEGER NOT NULL REFERENCES "Week"(id) ON DELETE CASCADE,
  -- No timestamp on purpose: it would equal the answer row's "createdAt"
  -- (same transaction NOW()) and let the two be matched up.
  PRIMARY KEY ("participantId", "weekId")
);

ALTER TABLE "ParticipantClassFeedbackDone" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "ParticipantClassFeedbackDone" FROM anon, authenticated;

-- ── Helpers ──────────────────────────────────────────────────────────────────

-- When a given audience ('support' or 'participant') gets asked about a
-- week's class, in Africa/Lagos. Identical shape to recap_release_at()
-- (20260925060000_recap_release_times.sql) but reads class_feedback_times.
CREATE OR REPLACE FUNCTION public.class_feedback_release_at(
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
    (p_start_date + (p_week_number - 1) * 7 + v_offset)::TIMESTAMP + v_time::TIME
  ) AT TIME ZONE 'Africa/Lagos';
END;
$function$;

REVOKE ALL ON FUNCTION public.class_feedback_release_at(DATE, INTEGER, TEXT) FROM PUBLIC, anon, authenticated;

-- ── Participant: home ────────────────────────────────────────────────────────

-- Identical to 20260925060000_recap_release_times.sql's participant_home
-- except: 'classFeedbackDue' (the most recent unanswered week, and whether
-- its participant feedback time has passed) and 'departmentPromptDue' (true
-- from the chosen week's class Sunday onward, until a ParticipantWrapUp row
-- exists), and 'wrapUp' now also carries the department, so "Finish FOF"
-- reads as already answered once the department prompt has been sent.
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
    -- The latest week whose class Sunday has arrived, unless already answered
    -- (older unanswered weeks are never re-asked); 'open' is whether its
    -- participant feedback time has passed.
    'classFeedbackDue', (
      SELECT json_build_object(
        'weekId', w3.id,
        'weekNumber', w3."weekNumber",
        'open', NOW() >= public.class_feedback_release_at(cohort."startDate", w3."weekNumber", 'participant')
      )
      FROM (
        SELECT wk.* FROM "Week" wk
        WHERE wk."cohortId" = person."cohortId"
          AND cohort."startDate" IS NOT NULL
          AND ((cohort."startDate" + (wk."weekNumber" - 1) * 7)::TIMESTAMP AT TIME ZONE 'Africa/Lagos') <= NOW()
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
            AND NOW() >= ((cohort."startDate" + (dwk."weekNumber" - 1) * 7)::TIMESTAMP AT TIME ZONE 'Africa/Lagos')
        )
    ), FALSE)
  );
END;
$function$
;

-- ── Participant: submit class feedback ──────────────────────────────────────

-- Anonymous unless p_show_name is true, in which case "participantId" is set
-- on the answer row (never on the "done" row, so the two can't be joined to
-- work out who answered anonymously).
CREATE OR REPLACE FUNCTION public.submit_class_feedback(
  p_token TEXT,
  p_week_id INTEGER,
  p_rating INTEGER,
  p_comment TEXT,
  p_show_name BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  person_id UUID := public.app_participant_id(p_token);
  cohort_id UUID;
BEGIN
  IF person_id IS NULL THEN
    RAISE EXCEPTION 'SESSION_EXPIRED';
  END IF;
  IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN
    RAISE EXCEPTION 'RATING_REQUIRED';
  END IF;
  IF EXISTS (SELECT 1 FROM "ParticipantClassFeedbackDone" WHERE "participantId" = person_id AND "weekId" = p_week_id) THEN
    RAISE EXCEPTION 'ALREADY_ANSWERED';
  END IF;

  SELECT "cohortId" INTO cohort_id FROM "Participant" WHERE id = person_id;
  IF cohort_id IS NULL THEN
    RAISE EXCEPTION 'FEEDBACK_NO_COHORT';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "Week" w WHERE w.id = p_week_id AND w."cohortId" = cohort_id) THEN
    RAISE EXCEPTION 'INVALID_WEEK';
  END IF;

  -- "Done" first and without ON CONFLICT: a double-tap's second call fails on
  -- the primary key and rolls back, so it can't leave a second answer.
  INSERT INTO "ParticipantClassFeedbackDone" ("participantId", "weekId")
  VALUES (person_id, p_week_id);

  INSERT INTO "ParticipantClassFeedback" ("cohortId", "weekId", rating, comment, "participantId")
  VALUES (cohort_id, p_week_id, p_rating, NULLIF(trim(COALESCE(p_comment, '')), ''), CASE WHEN p_show_name THEN person_id END);
END;
$$;

REVOKE ALL ON FUNCTION public.submit_class_feedback(TEXT, INTEGER, INTEGER, TEXT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_class_feedback(TEXT, INTEGER, INTEGER, TEXT, BOOLEAN) TO anon, authenticated;

-- ── Admin: class feedback results ───────────────────────────────────────────

-- Per week: every support's note (plus who hasn't answered yet), and the
-- participant rating/comments -- shown once at least five participants have
-- answered that week, same rule as feedback_results
-- (20260917170000_anonymous_feedback_only.sql). Named answers carry the name.
CREATE OR REPLACE FUNCTION public.class_feedback_results(p_cohort_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT public.app_is_admin() THEN
    RAISE EXCEPTION 'NOT_ALLOWED';
  END IF;

  RETURN COALESCE((
    SELECT json_agg(json_build_object(
      'weekId', w.id,
      'weekNumber', w."weekNumber",
      'title', w.title,
      'supports', COALESCE((
        SELECT json_agg(json_build_object(
          'supportId', u.id,
          'supportName', u.name,
          'note', scf.note,
          'isNone', scf."isNone",
          'answeredAt', scf."createdAt"
        ) ORDER BY u.name)
        FROM "SupportClassFeedback" scf
        JOIN "User" u ON u.id = scf."supportId"
        WHERE scf."weekId" = w.id AND scf."cohortId" = p_cohort_id
      ), '[]'::json),
      'supportsMissing', COALESCE((
        SELECT json_agg(u.name ORDER BY u.name)
        FROM (SELECT DISTINCT g."supportId" FROM "Group" g WHERE g."cohortId" = p_cohort_id AND g."supportId" IS NOT NULL) gs
        JOIN "User" u ON u.id = gs."supportId"
        WHERE NOT EXISTS (
          SELECT 1 FROM "SupportClassFeedback" scf WHERE scf."weekId" = w.id AND scf."supportId" = gs."supportId"
        )
      ), '[]'::json),
      'participants', (
        SELECT json_build_object(
          'count', count(*),
          'visible', count(*) >= 5,
          'average', CASE WHEN count(*) >= 5 THEN round(avg(pcf.rating)::numeric, 1) END,
          'answers', CASE WHEN count(*) >= 5 THEN (
            SELECT json_agg(json_build_object('rating', pcf2.rating, 'comment', pcf2.comment, 'name', p2."fullName") ORDER BY md5(pcf2.id::text))
            FROM "ParticipantClassFeedback" pcf2
            LEFT JOIN "Participant" p2 ON p2.id = pcf2."participantId"
            WHERE pcf2."weekId" = w.id AND pcf2."cohortId" = p_cohort_id
          ) END
        )
        FROM "ParticipantClassFeedback" pcf WHERE pcf."weekId" = w.id AND pcf."cohortId" = p_cohort_id
      )
    ) ORDER BY w."weekNumber" DESC)
    FROM "Week" w WHERE w."cohortId" = p_cohort_id
  ), '[]'::json);
END;
$$;

REVOKE ALL ON FUNCTION public.class_feedback_results(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.class_feedback_results(UUID) TO anon, authenticated;
