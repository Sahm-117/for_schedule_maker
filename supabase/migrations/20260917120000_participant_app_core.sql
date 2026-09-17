-- Participant app, step 1: recap sharing and release, weekly expectations,
-- daily scriptures, "are you okay?" check-ins, and the participant's own data
-- (home, reflections) through session-checked functions.
-- Additive and idempotent. Builds on 20260917110000_participant_accounts.sql.

-- ── Weeks ────────────────────────────────────────────────────────────────────

-- Admins choose per week whether the recap goes to participants (on by default),
-- and list what participants should do that week (one item per line).
ALTER TABLE "Week"
  ADD COLUMN IF NOT EXISTS "shareWithParticipants" BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS "expectations" TEXT;

-- A support releases the week's recap to their group. If they don't, it releases
-- on its own one hour after the group's meeting (see recap_auto_release_at).
CREATE TABLE IF NOT EXISTS "RecapRelease" (
  "groupId" UUID NOT NULL REFERENCES "Group"(id) ON DELETE CASCADE,
  "weekId" INTEGER NOT NULL REFERENCES "Week"(id) ON DELETE CASCADE,
  "releasedById" UUID REFERENCES "User"(id) ON DELETE SET NULL,
  "releasedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("groupId", "weekId")
);

-- ── Scriptures ───────────────────────────────────────────────────────────────

-- One design per day of FOF. Day N shows from 2:00 PM on day N of the cohort and
-- the set loops when the cohort runs longer than the designs.
CREATE TABLE IF NOT EXISTS "Scripture" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "dayNumber" INTEGER NOT NULL UNIQUE CHECK ("dayNumber" > 0),
  "imageUrl" TEXT NOT NULL,
  "storagePath" TEXT,
  "createdById" UUID REFERENCES "User"(id) ON DELETE SET NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Check-ins ────────────────────────────────────────────────────────────────

-- A participant's answer to the "are you okay?" popup. Supports and admins read
-- these; only the participant's own session can write one.
CREATE TABLE IF NOT EXISTS "ParticipantCheckIn" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "participantId" UUID NOT NULL REFERENCES "Participant"(id) ON DELETE CASCADE,
  response TEXT NOT NULL CHECK (response IN ('OKAY', 'NEED_HELP')),
  "sundayMisses" INTEGER NOT NULL DEFAULT 0,
  "meetingMisses" INTEGER NOT NULL DEFAULT 0,
  "handledAt" TIMESTAMPTZ,
  "handledById" UUID REFERENCES "User"(id) ON DELETE SET NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_checkin_participant ON "ParticipantCheckIn"("participantId", "createdAt" DESC);

-- Same model as the other operational tables (custom auth, anon key).
ALTER TABLE "RecapRelease" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all operations" ON "RecapRelease";
CREATE POLICY "Allow all operations" ON "RecapRelease" FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE "Scripture" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all operations" ON "Scripture";
CREATE POLICY "Allow all operations" ON "Scripture" FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE "ParticipantCheckIn" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all operations" ON "ParticipantCheckIn";
CREATE POLICY "Allow all operations" ON "ParticipantCheckIn" FOR ALL USING (true) WITH CHECK (true);

-- ── Helpers ──────────────────────────────────────────────────────────────────

-- When a week's recap releases on its own for a group: one hour after the group's
-- meeting that week (Lagos time). Groups without a meeting slot get it at the end
-- of the week (the following Sunday, 00:00).
CREATE OR REPLACE FUNCTION public.recap_auto_release_at(
  p_start_date DATE,
  p_week_number INTEGER,
  p_meeting_day TEXT,
  p_meeting_time TEXT
)
RETURNS TIMESTAMPTZ
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN p_start_date IS NULL THEN NULL
    WHEN p_meeting_day IS NOT NULL AND p_meeting_time ~ '^[0-9]{1,2}:[0-9]{2}$' THEN
      ((p_start_date + (p_week_number - 1) * 7
          + (array_position(ARRAY['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'], upper(p_meeting_day)) - 1)
       )::TIMESTAMP + p_meeting_time::TIME) AT TIME ZONE 'Africa/Lagos' + INTERVAL '1 hour'
    ELSE (p_start_date + p_week_number * 7)::TIMESTAMP AT TIME ZONE 'Africa/Lagos'
  END;
$$;

-- ── Participant: home ────────────────────────────────────────────────────────

-- Everything the participant app needs, for the signed-in participant only.
-- Recap content is included only once released to them.
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
          WHERE d."weekId" = w.id AND d."dayName" = 'Sunday' AND a.description ~* '^\s*class\s*[0-9]'
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
    'lastCheckIn', (
      SELECT json_build_object('response', c.response, 'sundayMisses', c."sundayMisses", 'meetingMisses', c."meetingMisses", 'createdAt', c."createdAt")
      FROM "ParticipantCheckIn" c WHERE c."participantId" = person_id
      ORDER BY c."createdAt" DESC LIMIT 1
    )
  );
END;
$$;

-- ── Participant: reflections ─────────────────────────────────────────────────

-- Save the week's reflection. Only for a recap already released to them; a saved
-- reflection can be changed for seven days after it was first written.
CREATE OR REPLACE FUNCTION public.save_reflection(
  p_token TEXT,
  p_week_id INTEGER,
  p_stood_out TEXT,
  p_goal TEXT,
  p_goal_check TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  person_id UUID := public.app_participant_id(p_token);
  existing "Reflection";
  week_released BOOLEAN;
  saved "Reflection";
BEGIN
  IF person_id IS NULL THEN
    RAISE EXCEPTION 'SESSION_EXPIRED';
  END IF;
  IF NULLIF(trim(COALESCE(p_goal, '')), '') IS NULL THEN
    RAISE EXCEPTION 'GOAL_REQUIRED';
  END IF;

  SELECT (w->>'released')::BOOLEAN INTO week_released
  FROM json_array_elements(public.participant_home(p_token)->'weeks') w
  WHERE (w->>'id')::INTEGER = p_week_id;
  IF week_released IS NOT TRUE THEN
    RAISE EXCEPTION 'RECAP_NOT_RELEASED';
  END IF;

  SELECT * INTO existing FROM "Reflection" WHERE "participantId" = person_id AND "weekId" = p_week_id;
  IF existing.id IS NOT NULL AND existing."createdAt" < NOW() - INTERVAL '7 days' THEN
    RAISE EXCEPTION 'REFLECTION_LOCKED';
  END IF;

  INSERT INTO "Reflection" ("participantId", "weekId", "stoodOut", goal, "goalCheck")
  VALUES (person_id, p_week_id, NULLIF(trim(COALESCE(p_stood_out, '')), ''), trim(p_goal), NULLIF(trim(COALESCE(p_goal_check, '')), ''))
  ON CONFLICT ("participantId", "weekId") DO UPDATE SET
    "stoodOut" = EXCLUDED."stoodOut",
    goal = EXCLUDED.goal,
    "goalCheck" = EXCLUDED."goalCheck",
    "updatedAt" = NOW()
  RETURNING * INTO saved;

  RETURN json_build_object(
    'weekId', saved."weekId", 'stoodOut', saved."stoodOut", 'goal', saved.goal, 'goalCheck', saved."goalCheck",
    'goalDoneAt', saved."goalDoneAt", 'createdAt', saved."createdAt", 'updatedAt', saved."updatedAt"
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.set_reflection_goal_done(p_token TEXT, p_week_id INTEGER, p_done BOOLEAN)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  person_id UUID := public.app_participant_id(p_token);
  saved "Reflection";
BEGIN
  IF person_id IS NULL THEN
    RAISE EXCEPTION 'SESSION_EXPIRED';
  END IF;
  UPDATE "Reflection"
  SET "goalDoneAt" = CASE WHEN p_done THEN NOW() END
  WHERE "participantId" = person_id AND "weekId" = p_week_id
  RETURNING * INTO saved;
  IF saved.id IS NULL THEN
    RAISE EXCEPTION 'REFLECTION_NOT_FOUND';
  END IF;
  RETURN json_build_object(
    'weekId', saved."weekId", 'stoodOut', saved."stoodOut", 'goal', saved.goal, 'goalCheck', saved."goalCheck",
    'goalDoneAt', saved."goalDoneAt", 'createdAt', saved."createdAt", 'updatedAt', saved."updatedAt"
  );
END;
$$;

-- ── Participant: check-in ────────────────────────────────────────────────────

-- Records "I'm okay" / "I need help" and returns who to tell (their support).
CREATE OR REPLACE FUNCTION public.record_check_in(
  p_token TEXT,
  p_response TEXT,
  p_sunday_misses INTEGER,
  p_meeting_misses INTEGER
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  person_id UUID := public.app_participant_id(p_token);
  support_id UUID;
BEGIN
  IF person_id IS NULL THEN
    RAISE EXCEPTION 'SESSION_EXPIRED';
  END IF;
  IF p_response NOT IN ('OKAY', 'NEED_HELP') THEN
    RAISE EXCEPTION 'Unknown response';
  END IF;

  INSERT INTO "ParticipantCheckIn" ("participantId", response, "sundayMisses", "meetingMisses")
  VALUES (person_id, p_response, GREATEST(COALESCE(p_sunday_misses, 0), 0), GREATEST(COALESCE(p_meeting_misses, 0), 0));

  SELECT g."supportId" INTO support_id
  FROM "GroupParticipant" gp
  JOIN "Group" g ON g.id = gp."groupId"
  JOIN "Participant" p ON p.id = gp."participantId" AND g."cohortId" = p."cohortId"
  WHERE gp."participantId" = person_id
  LIMIT 1;

  RETURN json_build_object('supportId', support_id, 'cohortId', (SELECT "cohortId" FROM "Participant" WHERE id = person_id));
END;
$$;

-- ── Staff: when participants reflected (never what they wrote) ───────────────

CREATE OR REPLACE FUNCTION public.reflection_activity(p_token TEXT, p_cohort_id UUID)
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
  RETURN COALESCE((
    SELECT json_agg(json_build_object(
      'participantId', r."participantId", 'weekId', r."weekId", 'createdAt', r."createdAt", 'updatedAt', r."updatedAt"
    ))
    FROM "Reflection" r
    JOIN "Week" w ON w.id = r."weekId"
    WHERE w."cohortId" = p_cohort_id
  ), '[]'::json);
END;
$$;

REVOKE ALL ON FUNCTION public.recap_auto_release_at(DATE, INTEGER, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.participant_home(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_reflection(TEXT, INTEGER, TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_reflection_goal_done(TEXT, INTEGER, BOOLEAN) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_check_in(TEXT, TEXT, INTEGER, INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reflection_activity(TEXT, UUID) TO anon, authenticated;
