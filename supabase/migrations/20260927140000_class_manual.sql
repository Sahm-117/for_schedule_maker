-- Class manual: a per-week document (with optional summary + discussion
-- prompt) separate from the recap, released to supports and participants at
-- its own configured day/time (default Thursday 18:00 Africa/Lagos, same
-- timezone handling as recap_release_times). Participants can ask a question
-- about it (answered live in class or by a written reply) and keep a private
-- note. Additive and idempotent throughout.
--
-- Builds on 20260925060000_recap_release_times.sql (recap_release_at,
-- recap_release_times setting) and 20260927130000_support_recaps_always_content.sql
-- (latest support_recaps) / 20260927120000_group_meeting_live_recap.sql
-- (latest participant_home) -- both CREATE OR REPLACE'd verbatim below plus
-- additive fields only, per house rule.
--
-- Notifications on a new question, same mechanism as the testimony alert
-- (20260926090000_faith_help_testimonies.sql submit_testimony/notify): the
-- RPC returns the assigned support's userId, and the frontend calls notify()
-- to that support plus notifyAdmins() after the RPC succeeds. Nothing here
-- needs a function deploy for that part.

-- ── 1. Week columns ─────────────────────────────────────────────────────────
ALTER TABLE "Week"
  ADD COLUMN IF NOT EXISTS "manualDocumentUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "manualDocumentName" TEXT,
  ADD COLUMN IF NOT EXISTS "manualSummary" TEXT,
  ADD COLUMN IF NOT EXISTS "manualDiscussionPrompt" TEXT,
  ADD COLUMN IF NOT EXISTS "manualReleasedEarlyAt" TIMESTAMPTZ;

-- ── 2. Manual release time: one day/time for both audiences ────────────────
-- Merge manualDay/manualTime into the existing recap_release_times row
-- without touching supportDay/supportTime/participantDay/participantTime.
UPDATE "AppSetting"
SET value = value || '{"manualDay":"THURSDAY","manualTime":"18:00"}'::jsonb
WHERE "settingKey" = 'recap_release_times'
  AND NOT (value ? 'manualDay');

-- In case the row doesn't exist yet (fresh environment), seed it with the
-- full agreed default shape.
INSERT INTO "AppSetting" ("settingKey", value)
VALUES ('recap_release_times', '{"supportDay":"SUNDAY","supportTime":"16:00","participantDay":"MONDAY","participantTime":"18:00","manualDay":"THURSDAY","manualTime":"18:00"}'::jsonb)
ON CONFLICT ("settingKey") DO NOTHING;

-- recap_release_at: identical to 20260925060000_recap_release_times.sql
-- except a new 'manual' branch (one day/time shared by both audiences).
-- 'support'/'participant' behaviour is untouched.
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
      (p_start_date + (p_week_number - 1) * 7 - ((7 - v_offset) % 7))::TIMESTAMP + v_time::TIME
    ) AT TIME ZONE 'Africa/Lagos';
  END IF;

  RETURN (
    (p_start_date + (p_week_number - 1) * 7 + v_offset)::TIMESTAMP + v_time::TIME
  ) AT TIME ZONE 'Africa/Lagos';
END;
$function$;

-- ── 3. ManualQuestion / ManualNote ──────────────────────────────────────────
-- Same staff-tier shape as FaithHelpRequest/Testimony: support and admin read
-- and write directly through supabase.from(), gated by app_is_staff(); the
-- participant never touches either table directly, only via the SECURITY
-- DEFINER RPCs below.
CREATE TABLE IF NOT EXISTS "ManualQuestion" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "participantId" UUID NOT NULL REFERENCES "Participant"(id) ON DELETE CASCADE,
  "weekId" INTEGER NOT NULL REFERENCES "Week"(id) ON DELETE CASCADE,
  "cohortId" UUID NOT NULL REFERENCES "Cohort"(id) ON DELETE CASCADE,
  "groupId" UUID REFERENCES "Group"(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW', 'IN_CLASS', 'REPLIED')),
  reply TEXT,
  "repliedById" UUID REFERENCES "User"(id),
  "repliedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_manualquestion_week ON "ManualQuestion"("weekId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_manualquestion_participant ON "ManualQuestion"("participantId", "weekId");
CREATE INDEX IF NOT EXISTS idx_manualquestion_group_new ON "ManualQuestion"("groupId", status) WHERE status = 'NEW';

ALTER TABLE "ManualQuestion" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff can manage manual questions" ON "ManualQuestion";
CREATE POLICY "Staff can manage manual questions" ON "ManualQuestion"
  FOR ALL USING (public.app_is_staff()) WITH CHECK (public.app_is_staff());

-- One private note per participant per week. Nobody else -- support, admin,
-- or another participant -- can read it: no staff RLS policy at all, and it
-- is written/read only through the participant-token RPCs below (SECURITY
-- DEFINER, owned by postgres, so they bypass RLS deliberately and only for
-- the calling participant's own rows).
CREATE TABLE IF NOT EXISTS "ManualNote" (
  "participantId" UUID NOT NULL REFERENCES "Participant"(id) ON DELETE CASCADE,
  "weekId" INTEGER NOT NULL REFERENCES "Week"(id) ON DELETE CASCADE,
  body TEXT NOT NULL DEFAULT '',
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("participantId", "weekId")
);
ALTER TABLE "ManualNote" ENABLE ROW LEVEL SECURITY;

-- ── 4. Participant RPCs ──────────────────────────────────────────────────────

-- Ask a question about a week's manual. Returns the assigned support's
-- userId (may be null if ungrouped) so the frontend can notify() same as
-- submit_testimony/submit_faith_help_request do.
CREATE OR REPLACE FUNCTION public.ask_manual_question(
  p_token TEXT,
  p_week_id INTEGER,
  p_body TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  person_id UUID := public.app_participant_id(p_token);
  v_cohort_id UUID;
  v_group_id UUID;
  v_support_id UUID;
  v_body TEXT := NULLIF(btrim(COALESCE(p_body, '')), '');
  v_row "ManualQuestion";
BEGIN
  IF person_id IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  IF v_body IS NULL THEN RAISE EXCEPTION 'BODY_REQUIRED'; END IF;

  SELECT "cohortId" INTO v_cohort_id FROM "Participant" WHERE id = person_id;
  IF NOT EXISTS (SELECT 1 FROM "Week" WHERE id = p_week_id AND "cohortId" = v_cohort_id) THEN
    RAISE EXCEPTION 'Week was not found';
  END IF;

  SELECT g.id, g."supportId" INTO v_group_id, v_support_id
  FROM "GroupParticipant" gp
  JOIN "Group" g ON g.id = gp."groupId" AND g."cohortId" = v_cohort_id
  WHERE gp."participantId" = person_id
  LIMIT 1;

  INSERT INTO "ManualQuestion" ("participantId", "weekId", "cohortId", "groupId", body)
  VALUES (person_id, p_week_id, v_cohort_id, v_group_id, v_body)
  RETURNING * INTO v_row;

  RETURN json_build_object(
    'id', v_row.id, 'weekId', v_row."weekId", 'body', v_row.body, 'status', v_row.status,
    'reply', v_row.reply, 'createdAt', v_row."createdAt", 'supportId', v_support_id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.ask_manual_question(TEXT, INTEGER, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ask_manual_question(TEXT, INTEGER, TEXT) TO anon, authenticated;

-- Save (upsert) the participant's own private note for a week's manual.
CREATE OR REPLACE FUNCTION public.save_manual_note(
  p_token TEXT,
  p_week_id INTEGER,
  p_body TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  person_id UUID := public.app_participant_id(p_token);
  v_cohort_id UUID;
  v_row "ManualNote";
BEGIN
  IF person_id IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;

  SELECT "cohortId" INTO v_cohort_id FROM "Participant" WHERE id = person_id;
  IF NOT EXISTS (SELECT 1 FROM "Week" WHERE id = p_week_id AND "cohortId" = v_cohort_id) THEN
    RAISE EXCEPTION 'Week was not found';
  END IF;

  INSERT INTO "ManualNote" ("participantId", "weekId", body, "updatedAt")
  VALUES (person_id, p_week_id, COALESCE(p_body, ''), NOW())
  ON CONFLICT ("participantId", "weekId") DO UPDATE SET body = EXCLUDED.body, "updatedAt" = NOW()
  RETURNING * INTO v_row;

  RETURN json_build_object('weekId', v_row."weekId", 'body', v_row.body, 'updatedAt', v_row."updatedAt");
END;
$function$;

REVOKE ALL ON FUNCTION public.save_manual_note(TEXT, INTEGER, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_manual_note(TEXT, INTEGER, TEXT) TO anon, authenticated;

-- ── 5. Staff RPCs ─────────────────────────────────────────────────────────
-- Same session-token staff auth as get_my_hub/mark_support_attendance
-- (20260924000000_support_hubs.sql): app_is_staff()/app_current_user_id()
-- read the x-session-token header the client already sends, no token param.

-- Admin sees every question in the cohort (optionally filtered by week/
-- group); a support only ever sees their own groups' participants'
-- questions, even if they pass a different p_group_id.
CREATE OR REPLACE FUNCTION public.list_manual_questions(
  p_cohort_id UUID,
  p_week_id INTEGER DEFAULT NULL,
  p_group_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_id UUID;
BEGIN
  IF NOT public.app_is_staff() THEN
    RAISE EXCEPTION 'You must be signed in as a support or admin';
  END IF;
  v_actor_id := public.app_current_user_id();

  RETURN COALESCE((
    SELECT json_agg(json_build_object(
      'id', q.id, 'weekId', q."weekId", 'weekNumber', w."weekNumber",
      'groupId', q."groupId", 'groupName', g.name,
      'participantId', q."participantId", 'participantName', p."fullName",
      'body', q.body, 'status', q.status, 'reply', q.reply, 'repliedAt', q."repliedAt", 'createdAt', q."createdAt"
    ) ORDER BY q."createdAt" DESC)
    FROM public."ManualQuestion" q
    JOIN public."Week" w ON w.id = q."weekId"
    JOIN public."Participant" p ON p.id = q."participantId"
    LEFT JOIN public."Group" g ON g.id = q."groupId"
    WHERE q."cohortId" = p_cohort_id
      AND (p_week_id IS NULL OR q."weekId" = p_week_id)
      AND (p_group_id IS NULL OR q."groupId" = p_group_id)
      AND (
        public.app_is_admin()
        OR EXISTS (SELECT 1 FROM public."Group" sg WHERE sg.id = q."groupId" AND sg."supportId" = v_actor_id)
      )
  ), '[]'::json);
END;
$function$;

REVOKE ALL ON FUNCTION public.list_manual_questions(UUID, INTEGER, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_manual_questions(UUID, INTEGER, UUID) TO anon, authenticated;

-- "To be answered in class" -- move a question to IN_CLASS. Support only for
-- their own groups' participants; admin can for any.
CREATE OR REPLACE FUNCTION public.mark_manual_question_in_class(p_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_id UUID;
  v_row public."ManualQuestion";
BEGIN
  IF NOT public.app_is_staff() THEN
    RAISE EXCEPTION 'You must be signed in as a support or admin';
  END IF;
  v_actor_id := public.app_current_user_id();

  SELECT * INTO v_row FROM public."ManualQuestion" WHERE id = p_id;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'Question was not found'; END IF;

  IF NOT public.app_is_admin() AND NOT EXISTS (
    SELECT 1 FROM public."Group" g WHERE g.id = v_row."groupId" AND g."supportId" = v_actor_id
  ) THEN
    RAISE EXCEPTION 'Only this participant''s support or an admin can update this question';
  END IF;

  UPDATE public."ManualQuestion" SET status = 'IN_CLASS' WHERE id = p_id RETURNING * INTO v_row;
  RETURN json_build_object('id', v_row.id, 'status', v_row.status);
END;
$function$;

REVOKE ALL ON FUNCTION public.mark_manual_question_in_class(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_manual_question_in_class(UUID) TO anon, authenticated;

-- Write a short reply. Same ownership rule as mark_manual_question_in_class.
CREATE OR REPLACE FUNCTION public.reply_manual_question(p_id UUID, p_reply TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_id UUID;
  v_row public."ManualQuestion";
  v_reply TEXT := NULLIF(btrim(COALESCE(p_reply, '')), '');
BEGIN
  IF NOT public.app_is_staff() THEN
    RAISE EXCEPTION 'You must be signed in as a support or admin';
  END IF;
  IF v_reply IS NULL THEN RAISE EXCEPTION 'REPLY_REQUIRED'; END IF;
  v_actor_id := public.app_current_user_id();

  SELECT * INTO v_row FROM public."ManualQuestion" WHERE id = p_id;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'Question was not found'; END IF;

  IF NOT public.app_is_admin() AND NOT EXISTS (
    SELECT 1 FROM public."Group" g WHERE g.id = v_row."groupId" AND g."supportId" = v_actor_id
  ) THEN
    RAISE EXCEPTION 'Only this participant''s support or an admin can reply to this question';
  END IF;

  UPDATE public."ManualQuestion"
  SET status = 'REPLIED', reply = v_reply, "repliedById" = v_actor_id, "repliedAt" = NOW()
  WHERE id = p_id
  RETURNING * INTO v_row;

  RETURN json_build_object('id', v_row.id, 'status', v_row.status, 'reply', v_row.reply, 'repliedAt', v_row."repliedAt");
END;
$function$;

REVOKE ALL ON FUNCTION public.reply_manual_question(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reply_manual_question(UUID, TEXT) TO anon, authenticated;

-- "Choose an earlier file" picker: every distinct manual/recap document ever
-- uploaded in another cohort, newest first, with the cohort name + week
-- number it came from.
CREATE OR REPLACE FUNCTION public.list_earlier_class_documents(p_exclude_cohort_id UUID DEFAULT NULL)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NOT public.app_is_staff() THEN
    RAISE EXCEPTION 'You must be signed in as a support or admin';
  END IF;

  RETURN COALESCE((
    SELECT json_agg(json_build_object(
      'kind', d.kind, 'url', d.url, 'name', d.name, 'cohortName', d."cohortName", 'weekNumber', d."weekNumber"
    ) ORDER BY d."sortDate" DESC)
    FROM (
      SELECT DISTINCT ON (docs.url, docs.name)
        docs.url, docs.name, docs.kind, docs."cohortName", docs."weekNumber", docs."sortDate"
      FROM (
        SELECT w."recapDocumentUrl" AS url, w."recapDocumentName" AS name, 'RECAP' AS kind,
          c.name AS "cohortName", w."weekNumber" AS "weekNumber", c."startDate" AS "sortDate", c.id AS "cohortId"
        FROM public."Week" w JOIN public."Cohort" c ON c.id = w."cohortId"
        WHERE w."recapDocumentUrl" IS NOT NULL
        UNION ALL
        SELECT w."manualDocumentUrl", w."manualDocumentName", 'MANUAL',
          c.name, w."weekNumber", c."startDate", c.id
        FROM public."Week" w JOIN public."Cohort" c ON c.id = w."cohortId"
        WHERE w."manualDocumentUrl" IS NOT NULL
      ) docs
      WHERE p_exclude_cohort_id IS NULL OR docs."cohortId" <> p_exclude_cohort_id
      ORDER BY docs.url, docs.name, docs."sortDate" DESC
    ) d
  ), '[]'::json);
END;
$function$;

REVOKE ALL ON FUNCTION public.list_earlier_class_documents(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_earlier_class_documents(UUID) TO anon, authenticated;

-- ── 6. participant_home: additive manual fields ─────────────────────────────
-- CREATE OR REPLACE'd verbatim from 20260927120000_group_meeting_live_recap.sql
-- (the latest definition), except each week in 'weeks' also carries:
--   'manual': {documentUrl, documentName, summary, discussionPrompt} | null
--     -- only once released (manualReleasedEarlyAt, or now >= recap_release_at
--     (...,'manual')) and only when a document exists.
--   'manualQuestions': this participant's own questions for that week
--     (always visible to them, regardless of release -- it's their own data).
--   'manualNote': this participant's own private note body for that week, or
--     null if they haven't written one.
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
            OR NOW() >= public.recap_release_at(cohort."startDate", w."weekNumber", 'participant')
          ), FALSE) AS released,
          COALESCE(w."participantReleasedEarlyAt", public.recap_release_at(cohort."startDate", w."weekNumber", 'participant')) AS "releasedAt"
        FROM (SELECT 1) one
      ) rel
      CROSS JOIN LATERAL (
        SELECT COALESCE(
          w."manualReleasedEarlyAt" IS NOT NULL
          OR NOW() >= public.recap_release_at(cohort."startDate", w."weekNumber", 'manual'),
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

-- ── 7. support_recaps: additive manual + unread question count ─────────────
-- CREATE OR REPLACE'd verbatim from 20260927130000_support_recaps_always_content.sql
-- (the latest definition), plus:
--   'manual': released the same way as participant_home's manual block
--     (supports get it at the same manual release time as participants).
--   'manualReleased' / 'manualReleasedAt': timing, same shape as
--     released/releasedAt above.
--   'unreadQuestionCount': NEW-status ManualQuestion rows for that week,
--     scoped to the caller's own groups (admin sees the whole cohort).
CREATE OR REPLACE FUNCTION public.support_recaps(p_cohort_id UUID)
RETURNS JSON
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
        NOW() >= public.recap_release_at(cohort."startDate", w."weekNumber", 'support') AS released,
        public.recap_release_at(cohort."startDate", w."weekNumber", 'support') AS "releasedAt"
    ) rel
    CROSS JOIN LATERAL (
      SELECT
        COALESCE(w."manualReleasedEarlyAt" IS NOT NULL OR NOW() >= public.recap_release_at(cohort."startDate", w."weekNumber", 'manual'), FALSE) AS released,
        COALESCE(w."manualReleasedEarlyAt", public.recap_release_at(cohort."startDate", w."weekNumber", 'manual')) AS "releasedAt"
    ) manual_rel
    WHERE w."cohortId" = p_cohort_id
      AND (
        btrim(COALESCE(w."recapSummary", '')) <> '' OR w."recapDocumentUrl" IS NOT NULL
        OR w."manualDocumentUrl" IS NOT NULL
      )
  ), '[]'::json);
END;
$function$;

REVOKE ALL ON FUNCTION public.support_recaps(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.support_recaps(UUID) TO anon, authenticated;
