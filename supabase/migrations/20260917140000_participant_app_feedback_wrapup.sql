-- Participant app, step 3: anonymous feedback rounds, wrapping up (department
-- interest and referral), and announcements aimed at participants.
-- Additive and idempotent. Builds on 20260917130000_participant_app_group_faith_profile.sql.

-- ── Announcements ────────────────────────────────────────────────────────────

-- Who an announcement is for. Existing announcements stay with supports.
ALTER TABLE "Announcement" ADD COLUMN IF NOT EXISTS audience TEXT NOT NULL DEFAULT 'SUPPORTS';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Announcement_audience_check') THEN
    ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_audience_check" CHECK (audience IN ('SUPPORTS', 'PARTICIPANTS', 'EVERYONE'));
  END IF;
END $$;

-- ── Feedback ─────────────────────────────────────────────────────────────────

-- The week the mid-programme feedback opens (it stays open for two weeks).
-- The end-of-cohort survey opens in the cohort's last week.
ALTER TABLE "Cohort" ADD COLUMN IF NOT EXISTS "midFeedbackWeek" INTEGER NOT NULL DEFAULT 5;

-- Answers carry no participant id and no time, only the date, so nobody can be
-- matched to what they wrote.
CREATE TABLE IF NOT EXISTS "FeedbackResponse" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "cohortId" UUID NOT NULL REFERENCES "Cohort"(id) ON DELETE CASCADE,
  round TEXT NOT NULL CHECK (round IN ('MID', 'END')),
  answers JSONB NOT NULL,
  "submittedOn" DATE NOT NULL DEFAULT CURRENT_DATE
);

-- Only who has answered (to stop repeats and show the response rate).
CREATE TABLE IF NOT EXISTS "FeedbackSubmission" (
  "participantId" UUID NOT NULL REFERENCES "Participant"(id) ON DELETE CASCADE,
  "cohortId" UUID NOT NULL REFERENCES "Cohort"(id) ON DELETE CASCADE,
  round TEXT NOT NULL CHECK (round IN ('MID', 'END')),
  PRIMARY KEY ("participantId", "cohortId", round)
);

ALTER TABLE "FeedbackResponse" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FeedbackSubmission" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "FeedbackResponse", "FeedbackSubmission" FROM anon, authenticated;

-- ── Wrapping up ──────────────────────────────────────────────────────────────

-- The participant's own answer at the end: which department, and whether they
-- want a referral. Staff read it like the other operational tables.
CREATE TABLE IF NOT EXISTS "ParticipantWrapUp" (
  "participantId" UUID NOT NULL REFERENCES "Participant"(id) ON DELETE CASCADE,
  "cohortId" UUID NOT NULL REFERENCES "Cohort"(id) ON DELETE CASCADE,
  department TEXT,
  "wantsReferral" BOOLEAN NOT NULL DEFAULT FALSE,
  note TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("participantId", "cohortId")
);

ALTER TABLE "ParticipantWrapUp" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all operations" ON "ParticipantWrapUp";
CREATE POLICY "Allow all operations" ON "ParticipantWrapUp" FOR ALL USING (true) WITH CHECK (true);

-- ── Helpers ──────────────────────────────────────────────────────────────────

-- The two feedback rounds of a cohort with when they open and close (Lagos time).
--   MID: from the start of week midFeedbackWeek, for two weeks (closing when END opens).
--   END: from the start of the last week until a week after the cohort ends.
CREATE OR REPLACE FUNCTION public.feedback_rounds(p_cohort_id UUID)
RETURNS TABLE (round TEXT, "opensAt" TIMESTAMPTZ, "closesAt" TIMESTAMPTZ)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  WITH c AS (
    SELECT co."startDate", co."endDate", co."midFeedbackWeek",
           (SELECT max(w."weekNumber") FROM "Week" w WHERE w."cohortId" = co.id) AS last_week
    FROM "Cohort" co WHERE co.id = p_cohort_id AND co."startDate" IS NOT NULL
  )
  SELECT 'MID',
         ((c."startDate" + (c."midFeedbackWeek" - 1) * 7)::TIMESTAMP AT TIME ZONE 'Africa/Lagos'),
         ((c."startDate" + LEAST(c."midFeedbackWeek" + 1, c.last_week - 1) * 7)::TIMESTAMP AT TIME ZONE 'Africa/Lagos')
  FROM c WHERE c.last_week IS NOT NULL AND c."midFeedbackWeek" < c.last_week
  UNION ALL
  SELECT 'END',
         ((c."startDate" + (c.last_week - 1) * 7)::TIMESTAMP AT TIME ZONE 'Africa/Lagos'),
         ((GREATEST(COALESCE(c."endDate", c."startDate" + c.last_week * 7), c."startDate" + c.last_week * 7) + 7)::TIMESTAMP AT TIME ZONE 'Africa/Lagos')
  FROM c WHERE c.last_week IS NOT NULL;
$$;

-- ── Participant: home (adds open feedback round, home announcement, wrap-up) ──

CREATE OR REPLACE FUNCTION public.participant_home(p_token TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
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
            r."releasedAt" IS NOT NULL
            OR NOW() >= public.recap_auto_release_at(cohort."startDate", w."weekNumber", grp."meetingDay", grp."meetingTime")
          ), FALSE) AS released,
          COALESCE(r."releasedAt", public.recap_auto_release_at(cohort."startDate", w."weekNumber", grp."meetingDay", grp."meetingTime")) AS "releasedAt"
        FROM (SELECT 1) one
        LEFT JOIN "RecapRelease" r ON r."groupId" = grp.id AND r."weekId" = w.id
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
      SELECT json_agg(json_build_object('weekId', a."weekId", 'status', a.status))
      FROM "AttendanceRecord" a JOIN "Week" w ON w.id = a."weekId" AND w."cohortId" = person."cohortId"
      WHERE a."participantId" = person_id
    ), '[]'::json),
    'meeting', COALESCE((
      SELECT json_agg(json_build_object('weekId', m."weekId", 'status', m.status))
      FROM "MeetingAttendance" m JOIN "Week" w ON w.id = m."weekId" AND w."cohortId" = person."cohortId"
      WHERE m."participantId" = person_id
    ), '[]'::json),
    'faithProjectStatus', (SELECT f.status FROM "FaithProject" f WHERE f."participantId" = person_id ORDER BY f."updatedAt" DESC LIMIT 1),
    'rules', (SELECT value FROM "AppSetting" WHERE "settingKey" = 'programme_rules'),
    'scriptures', COALESCE((
      SELECT json_agg(json_build_object('dayNumber', sc."dayNumber", 'imageUrl', sc."imageUrl") ORDER BY sc."dayNumber")
      FROM "Scripture" sc
    ), '[]'::json),
    'members', COALESCE((
      SELECT json_agg(json_build_object('name', m."fullName") ORDER BY m."fullName")
      FROM "GroupParticipant" gp JOIN "Participant" m ON m.id = gp."participantId"
      WHERE gp."groupId" = grp.id AND m.id <> person_id AND m.status = 'ACTIVE'
    ), '[]'::json),
    'profile', json_build_object('email', person.email, 'avatarUrl', person."avatarUrl"),
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
    'feedback', (
      SELECT json_build_object('round', fr.round, 'opensAt', fr."opensAt", 'closesAt', fr."closesAt",
        'submitted', EXISTS (SELECT 1 FROM "FeedbackSubmission" fs WHERE fs."participantId" = person_id AND fs."cohortId" = person."cohortId" AND fs.round = fr.round))
      FROM public.feedback_rounds(person."cohortId") fr
      WHERE NOW() >= fr."opensAt" AND NOW() < fr."closesAt"
      LIMIT 1
    ),
    'announcement', (
      SELECT json_build_object('id', a.id, 'subject', a.subject, 'body', a.body, 'linkUrl', a."linkUrl", 'linkLabel', a."linkLabel")
      FROM "Announcement" a
      WHERE a."showOnHome" AND a."homeUntil" > NOW() AND a.audience IN ('PARTICIPANTS', 'EVERYONE')
        AND (a.scope = 'ALL_USERS' OR a."cohortId" IS NULL OR a."cohortId" = person."cohortId")
      ORDER BY a."sentAt" DESC LIMIT 1
    ),
    'wrapUp', json_build_object(
      'submitted', EXISTS (SELECT 1 FROM "ParticipantWrapUp" w WHERE w."participantId" = person_id AND w."cohortId" = person."cohortId")
    ),
    'lastCheckIn', (
      SELECT json_build_object('response', c.response, 'sundayMisses', c."sundayMisses", 'meetingMisses', c."meetingMisses", 'createdAt', c."createdAt")
      FROM "ParticipantCheckIn" c WHERE c."participantId" = person_id
      ORDER BY c."createdAt" DESC LIMIT 1
    )
  );
END;
$$;

-- ── Participant: feedback and wrapping up ────────────────────────────────────

CREATE OR REPLACE FUNCTION public.submit_feedback(p_token TEXT, p_round TEXT, p_answers JSONB)
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
  SELECT "cohortId" INTO cohort_id FROM "Participant" WHERE id = person_id;
  IF NOT EXISTS (
    SELECT 1 FROM public.feedback_rounds(cohort_id) fr
    WHERE fr.round = p_round AND NOW() >= fr."opensAt" AND NOW() < fr."closesAt"
  ) THEN
    RAISE EXCEPTION 'FEEDBACK_CLOSED';
  END IF;
  IF jsonb_typeof(p_answers) <> 'object' OR COALESCE(p_answers->>'rating', '') NOT IN ('NOT_GREAT', 'OKAY', 'GREAT') THEN
    RAISE EXCEPTION 'FEEDBACK_RATING_REQUIRED';
  END IF;

  INSERT INTO "FeedbackSubmission" ("participantId", "cohortId", round) VALUES (person_id, cohort_id, p_round);
  INSERT INTO "FeedbackResponse" ("cohortId", round, answers) VALUES (cohort_id, p_round, p_answers);
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'FEEDBACK_ALREADY_SENT';
END;
$$;

-- Department interest at the end. Wanting a referral logs it for their support
-- to confirm, like the department handoff on the participant profile.
CREATE OR REPLACE FUNCTION public.submit_wrap_up(p_token TEXT, p_department TEXT, p_wants_referral BOOLEAN, p_note TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  person_id UUID := public.app_participant_id(p_token);
  person "Participant";
  support_id UUID;
  cleaned_department TEXT := NULLIF(trim(COALESCE(p_department, '')), '');
BEGIN
  IF person_id IS NULL THEN
    RAISE EXCEPTION 'SESSION_EXPIRED';
  END IF;
  IF cleaned_department IS NULL THEN
    RAISE EXCEPTION 'DEPARTMENT_REQUIRED';
  END IF;
  SELECT * INTO person FROM "Participant" WHERE id = person_id;

  INSERT INTO "ParticipantWrapUp" ("participantId", "cohortId", department, "wantsReferral", note)
  VALUES (person_id, person."cohortId", cleaned_department, COALESCE(p_wants_referral, FALSE), NULLIF(trim(COALESCE(p_note, '')), ''))
  ON CONFLICT ("participantId", "cohortId") DO UPDATE SET
    department = EXCLUDED.department, "wantsReferral" = EXCLUDED."wantsReferral", note = EXCLUDED.note, "createdAt" = NOW();

  IF p_wants_referral AND NOT EXISTS (
    SELECT 1 FROM "DepartmentReferral" r WHERE r."participantId" = person_id AND lower(r.department) = lower(cleaned_department)
  ) THEN
    INSERT INTO "DepartmentReferral" ("participantId", department, status, note)
    VALUES (person_id, cleaned_department, 'LOGGED', 'Asked for a referral in the participant app.');
  END IF;

  SELECT g."supportId" INTO support_id
  FROM "GroupParticipant" gp JOIN "Group" g ON g.id = gp."groupId" AND g."cohortId" = person."cohortId"
  WHERE gp."participantId" = person_id LIMIT 1;

  RETURN json_build_object('supportId', support_id);
END;
$$;

-- ── Admin: feedback results ──────────────────────────────────────────────────

-- Response rates always; the answers only once a round has closed and at least
-- five people answered, so nobody can be identified by timing or a small count.
CREATE OR REPLACE FUNCTION public.feedback_results(p_token TEXT, p_cohort_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  staff "User" := public.app_staff(p_token);
BEGIN
  IF staff.id IS NULL THEN
    RAISE EXCEPTION 'SESSION_EXPIRED';
  END IF;
  IF staff.role <> 'ADMIN' THEN
    RAISE EXCEPTION 'NOT_ALLOWED';
  END IF;

  RETURN json_build_object(
    'eligible', (SELECT count(*) FROM "Participant" p WHERE p."cohortId" = p_cohort_id AND p.status = 'ACTIVE'),
    'withApp', (SELECT count(*) FROM "Participant" p JOIN "ParticipantAccount" a ON a."participantId" = p.id WHERE p."cohortId" = p_cohort_id AND p.status = 'ACTIVE'),
    'rounds', COALESCE((
      SELECT json_agg(json_build_object(
        'round', fr.round,
        'opensAt', fr."opensAt",
        'closesAt', fr."closesAt",
        'responses', (SELECT count(*) FROM "FeedbackSubmission" s WHERE s."cohortId" = p_cohort_id AND s.round = fr.round),
        'visible', NOW() >= fr."closesAt" AND (SELECT count(*) FROM "FeedbackResponse" r WHERE r."cohortId" = p_cohort_id AND r.round = fr.round) >= 5,
        'answers', CASE
          WHEN NOW() >= fr."closesAt" AND (SELECT count(*) FROM "FeedbackResponse" r WHERE r."cohortId" = p_cohort_id AND r.round = fr.round) >= 5
          THEN (SELECT json_agg(r.answers ORDER BY md5(r.id::text)) FROM "FeedbackResponse" r WHERE r."cohortId" = p_cohort_id AND r.round = fr.round)
        END
      ) ORDER BY fr."opensAt")
      FROM public.feedback_rounds(p_cohort_id) fr
    ), '[]'::json)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.feedback_rounds(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_feedback(TEXT, TEXT, JSONB) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_wrap_up(TEXT, TEXT, BOOLEAN, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.feedback_results(TEXT, UUID) TO anon, authenticated;
