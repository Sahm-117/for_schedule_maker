-- Participant app, step 2: faith project, my group, resources, profile and
-- reminders. Additive and idempotent. Builds on 20260917120000_participant_app_core.sql.

-- ── Columns ──────────────────────────────────────────────────────────────────

-- A faith project conversation entry written by the participant themselves
-- (their submitted project), not by a support.
ALTER TABLE "ParticipantNote" ADD COLUMN IF NOT EXISTS "byParticipant" BOOLEAN NOT NULL DEFAULT FALSE;

-- Admins choose which resources participants can see.
ALTER TABLE "Resource" ADD COLUMN IF NOT EXISTS "visibleToParticipants" BOOLEAN NOT NULL DEFAULT FALSE;

-- A participant's own profile photo.
ALTER TABLE "Participant" ADD COLUMN IF NOT EXISTS "avatarUrl" TEXT;

-- ── Tables (locked: reached only through the functions below or edge functions) ──

-- When the participant last read their faith project conversation (for the dot).
CREATE TABLE IF NOT EXISTS "ParticipantThreadRead" (
  "participantId" UUID PRIMARY KEY REFERENCES "Participant"(id) ON DELETE CASCADE,
  "coachLastReadAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "ParticipantPushSubscription" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "participantId" UUID NOT NULL REFERENCES "Participant"(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("participantId", endpoint)
);

-- What the participant wants a nudge about. Sunday class nudges are always on.
CREATE TABLE IF NOT EXISTS "ParticipantReminderSetting" (
  "participantId" UUID PRIMARY KEY REFERENCES "Participant"(id) ON DELETE CASCADE,
  "meetingRemindMinutes" JSONB NOT NULL DEFAULT '[60]'::jsonb,
  "recapReleased" BOOLEAN NOT NULL DEFAULT TRUE,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One row per reminder sent, so the 10-minute reminder job never sends twice.
CREATE TABLE IF NOT EXISTS "ParticipantReminderLog" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL,
  "targetKey" TEXT NOT NULL,
  "participantId" UUID NOT NULL REFERENCES "Participant"(id) ON DELETE CASCADE,
  occurrence TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (kind, "targetKey", "participantId", occurrence)
);

ALTER TABLE "ParticipantThreadRead" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ParticipantPushSubscription" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ParticipantReminderSetting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ParticipantReminderLog" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "ParticipantThreadRead", "ParticipantPushSubscription", "ParticipantReminderSetting", "ParticipantReminderLog" FROM anon, authenticated;

-- ── Participant: home (adds group members, profile, faith dot, reminders, resources) ──

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
    'lastCheckIn', (
      SELECT json_build_object('response', c.response, 'sundayMisses', c."sundayMisses", 'meetingMisses', c."meetingMisses", 'createdAt', c."createdAt")
      FROM "ParticipantCheckIn" c WHERE c."participantId" = person_id
      ORDER BY c."createdAt" DESC LIMIT 1
    )
  );
END;
$$;

-- ── Participant: faith project ───────────────────────────────────────────────

-- Their latest faith project and the conversation with their support (never the
-- notes between the support and the back office). Opening it marks it read.
CREATE OR REPLACE FUNCTION public.participant_faith(p_token TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  person_id UUID := public.app_participant_id(p_token);
  result JSON;
BEGIN
  IF person_id IS NULL THEN
    RAISE EXCEPTION 'SESSION_EXPIRED';
  END IF;

  result := json_build_object(
    'project', (
      SELECT json_build_object('id', f.id, 'body', f.body, 'status', f.status, 'updatedAt', f."updatedAt")
      FROM "FaithProject" f WHERE f."participantId" = person_id
      ORDER BY f."updatedAt" DESC LIMIT 1
    ),
    'trail', COALESCE((
      SELECT json_agg(json_build_object(
        'id', n.id, 'body', n.body, 'createdAt', n."createdAt", 'byParticipant', n."byParticipant", 'authorName', u.name
      ) ORDER BY n."createdAt")
      FROM "ParticipantNote" n LEFT JOIN "User" u ON u.id = n."authorId"
      WHERE n."participantId" = person_id AND n."noteType" = 'FAITH_COACH'
    ), '[]'::json)
  );

  INSERT INTO "ParticipantThreadRead" ("participantId", "coachLastReadAt") VALUES (person_id, NOW())
  ON CONFLICT ("participantId") DO UPDATE SET "coachLastReadAt" = NOW();

  RETURN result;
END;
$$;

-- Save the draft, or submit it to their support. Only while it is theirs to work
-- on (not started, or sent back for a change). Returns who to tell on submit.
CREATE OR REPLACE FUNCTION public.save_faith_project(p_token TEXT, p_body TEXT, p_submit BOOLEAN)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  person_id UUID := public.app_participant_id(p_token);
  project "FaithProject";
  support_id UUID;
  cleaned TEXT := NULLIF(trim(COALESCE(p_body, '')), '');
BEGIN
  IF person_id IS NULL THEN
    RAISE EXCEPTION 'SESSION_EXPIRED';
  END IF;
  IF p_submit AND cleaned IS NULL THEN
    RAISE EXCEPTION 'PROJECT_REQUIRED';
  END IF;

  SELECT * INTO project FROM "FaithProject" WHERE "participantId" = person_id ORDER BY "updatedAt" DESC LIMIT 1;
  IF project.id IS NOT NULL AND project.status NOT IN ('NOT_DRAFTED', 'AWAITING_DRAFT') THEN
    RAISE EXCEPTION 'PROJECT_LOCKED';
  END IF;

  IF project.id IS NULL THEN
    INSERT INTO "FaithProject" ("participantId", body, status)
    VALUES (person_id, cleaned, CASE WHEN p_submit THEN 'NEEDS_REFINEMENT' ELSE 'NOT_DRAFTED' END)
    RETURNING * INTO project;
  ELSE
    UPDATE "FaithProject"
    SET body = cleaned,
        status = CASE WHEN p_submit THEN 'NEEDS_REFINEMENT' ELSE status END,
        "updatedById" = NULL,
        "updatedAt" = NOW()
    WHERE id = project.id
    RETURNING * INTO project;
  END IF;

  SELECT g."supportId" INTO support_id
  FROM "GroupParticipant" gp
  JOIN "Group" g ON g.id = gp."groupId"
  JOIN "Participant" p ON p.id = gp."participantId" AND g."cohortId" = p."cohortId"
  WHERE gp."participantId" = person_id
  LIMIT 1;

  IF p_submit THEN
    INSERT INTO "ParticipantNote" ("participantId", body, "noteType", "byParticipant", "groupId")
    VALUES (person_id, cleaned, 'FAITH_COACH', TRUE,
      (SELECT gp."groupId" FROM "GroupParticipant" gp JOIN "Group" g ON g.id = gp."groupId" AND g."supportId" = support_id WHERE gp."participantId" = person_id LIMIT 1));
  END IF;

  RETURN json_build_object(
    'project', json_build_object('id', project.id, 'body', project.body, 'status', project.status, 'updatedAt', project."updatedAt"),
    'supportId', support_id
  );
END;
$$;

-- ── Participant: profile and reminders ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.save_participant_reminders(p_token TEXT, p_meeting_minutes JSONB, p_recap_released BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  person_id UUID := public.app_participant_id(p_token);
BEGIN
  IF person_id IS NULL THEN
    RAISE EXCEPTION 'SESSION_EXPIRED';
  END IF;
  IF jsonb_typeof(COALESCE(p_meeting_minutes, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'Invalid reminder timings';
  END IF;
  INSERT INTO "ParticipantReminderSetting" ("participantId", "meetingRemindMinutes", "recapReleased", "updatedAt")
  VALUES (person_id, COALESCE(p_meeting_minutes, '[]'::jsonb), COALESCE(p_recap_released, TRUE), NOW())
  ON CONFLICT ("participantId") DO UPDATE SET
    "meetingRemindMinutes" = EXCLUDED."meetingRemindMinutes",
    "recapReleased" = EXCLUDED."recapReleased",
    "updatedAt" = NOW();
END;
$$;

CREATE OR REPLACE FUNCTION public.save_participant_push(p_token TEXT, p_endpoint TEXT, p_p256dh TEXT, p_auth TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  person_id UUID := public.app_participant_id(p_token);
BEGIN
  IF person_id IS NULL THEN
    RAISE EXCEPTION 'SESSION_EXPIRED';
  END IF;
  IF COALESCE(p_endpoint, '') = '' OR COALESCE(p_p256dh, '') = '' OR COALESCE(p_auth, '') = '' THEN
    RAISE EXCEPTION 'Invalid push subscription';
  END IF;
  INSERT INTO "ParticipantPushSubscription" ("participantId", endpoint, p256dh, auth)
  VALUES (person_id, p_endpoint, p_p256dh, p_auth)
  ON CONFLICT ("participantId", endpoint) DO UPDATE SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_participant_avatar(p_token TEXT, p_url TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  person_id UUID := public.app_participant_id(p_token);
BEGIN
  IF person_id IS NULL THEN
    RAISE EXCEPTION 'SESSION_EXPIRED';
  END IF;
  UPDATE "Participant" SET "avatarUrl" = NULLIF(trim(COALESCE(p_url, '')), ''), "updatedAt" = NOW() WHERE id = person_id;
END;
$$;

-- Change password later on (the current password must be right).
CREATE OR REPLACE FUNCTION public.change_participant_password(p_token TEXT, p_current TEXT, p_new TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  person_id UUID := public.app_participant_id(p_token);
  current_hash TEXT;
BEGIN
  IF person_id IS NULL THEN
    RAISE EXCEPTION 'SESSION_EXPIRED';
  END IF;
  IF p_new IS NULL OR length(p_new) < 8 THEN
    RAISE EXCEPTION 'Password must be at least 8 characters';
  END IF;
  SELECT password_hash INTO current_hash FROM "ParticipantAccount" WHERE "participantId" = person_id;
  IF current_hash IS NULL OR current_hash <> crypt(COALESCE(p_current, ''), current_hash) THEN
    RETURN FALSE;
  END IF;
  UPDATE "ParticipantAccount"
  SET password_hash = crypt(p_new, gen_salt('bf', 10)), "passwordSetAt" = NOW(), "updatedAt" = NOW()
  WHERE "participantId" = person_id;
  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.participant_faith(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_faith_project(TEXT, TEXT, BOOLEAN) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_participant_reminders(TEXT, JSONB, BOOLEAN) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_participant_push(TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_participant_avatar(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.change_participant_password(TEXT, TEXT, TEXT) TO anon, authenticated;
