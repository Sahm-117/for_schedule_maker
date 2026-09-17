-- Feedback is anonymous feedback only: no mid/end survey rounds in the app.
-- Surveys go out as Google Form links (e.g. in a participant announcement).
-- Participants can send anonymous feedback at any time; admins see the answers
-- for a cohort once at least five have come in. Additive: the round-based
-- function, table and column from 20260917140000 are left in place, unused.

ALTER TABLE "FeedbackResponse" DROP CONSTRAINT IF EXISTS "FeedbackResponse_round_check";
ALTER TABLE "FeedbackResponse" ADD CONSTRAINT "FeedbackResponse_round_check" CHECK (round IN ('MID', 'END', 'GENERAL'));
ALTER TABLE "FeedbackResponse" ALTER COLUMN round SET DEFAULT 'GENERAL';

ALTER TABLE "FeedbackThemes" DROP CONSTRAINT IF EXISTS "FeedbackThemes_round_check";
ALTER TABLE "FeedbackThemes" ADD CONSTRAINT "FeedbackThemes_round_check" CHECK (round IN ('MID', 'END', 'GENERAL'));

-- The round-based submit is no longer used by the app.
REVOKE EXECUTE ON FUNCTION public.submit_feedback(TEXT, TEXT, JSONB) FROM anon, authenticated;

-- ── Participant: home (no feedback round) ────────────────────────────────────

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

-- ── Participant: anonymous feedback ──────────────────────────────────────────

-- Stored with the cohort and date only: no participant, account or time.
CREATE OR REPLACE FUNCTION public.submit_feedback(p_token TEXT, p_answers JSONB)
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
  IF jsonb_typeof(p_answers) <> 'object' OR COALESCE(p_answers->>'rating', '') NOT IN ('NOT_GREAT', 'OKAY', 'GREAT') THEN
    RAISE EXCEPTION 'FEEDBACK_RATING_REQUIRED';
  END IF;
  SELECT "cohortId" INTO cohort_id FROM "Participant" WHERE id = person_id;
  IF cohort_id IS NULL THEN
    RAISE EXCEPTION 'FEEDBACK_NO_COHORT';
  END IF;
  INSERT INTO "FeedbackResponse" ("cohortId", round, answers)
  VALUES (cohort_id, 'GENERAL', jsonb_build_object(
    'rating', p_answers->>'rating',
    'workingWell', NULLIF(trim(COALESCE(p_answers->>'workingWell', '')), ''),
    'needsAttention', NULLIF(trim(COALESCE(p_answers->>'needsAttention', '')), '')
  ));
END;
$$;

-- ── Admin: anonymous feedback for a cohort ───────────────────────────────────

-- The count always; the answers once at least five have come in, in a shuffled
-- order and without dates, so nobody can be picked out.
CREATE OR REPLACE FUNCTION public.feedback_results(p_token TEXT, p_cohort_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  staff "User" := public.app_staff(p_token);
  total INTEGER;
BEGIN
  IF staff.id IS NULL THEN
    RAISE EXCEPTION 'SESSION_EXPIRED';
  END IF;
  IF staff.role <> 'ADMIN' THEN
    RAISE EXCEPTION 'NOT_ALLOWED';
  END IF;
  SELECT count(*) INTO total FROM "FeedbackResponse" r WHERE r."cohortId" = p_cohort_id AND r.round = 'GENERAL';
  RETURN json_build_object(
    'count', total,
    'visible', total >= 5,
    'answers', CASE WHEN total >= 5 THEN (
      SELECT json_agg(r.answers ORDER BY md5(r.id::text))
      FROM "FeedbackResponse" r WHERE r."cohortId" = p_cohort_id AND r.round = 'GENERAL'
    ) END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_feedback(TEXT, JSONB) TO anon, authenticated;
