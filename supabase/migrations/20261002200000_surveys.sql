-- Surveys: admins build them (text, text area, number, rating, image/file),
-- pick who answers, and read the results. The "Your cohort is wrapping up"
-- card on the participant Home is the built-in WRAPUP survey, so its card text,
-- timing and questions are editable like any other.
--
-- Everything goes through SECURITY DEFINER functions; the tables are closed to
-- direct access (same pattern as FeedbackResponse).

CREATE TABLE IF NOT EXISTS "Survey" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "builtinKey" TEXT UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  audience TEXT NOT NULL DEFAULT 'PARTICIPANTS' CHECK (audience IN ('PARTICIPANTS', 'SUPPORTS', 'EVERYONE')),
  scope TEXT NOT NULL DEFAULT 'COHORT' CHECK (scope IN ('COHORT', 'GENERAL')),
  "cohortId" UUID REFERENCES "Cohort"(id) ON DELETE CASCADE,
  "targetGroupId" UUID REFERENCES "Group"(id) ON DELETE SET NULL,
  anonymous BOOLEAN NOT NULL DEFAULT FALSE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED')),
  "timingMode" TEXT NOT NULL DEFAULT 'DATES' CHECK ("timingMode" IN ('DATES', 'WEEKS_BEFORE_END')),
  "opensAt" TIMESTAMPTZ,
  "closesAt" TIMESTAMPTZ,
  "weeksBeforeEnd" INTEGER,
  "closeDaysAfterEnd" INTEGER,
  "notifyOnOpen" BOOLEAN NOT NULL DEFAULT FALSE,
  "homeHeading" TEXT,
  "homeLine" TEXT,
  "homeButton" TEXT,
  "aiSummary" TEXT,
  "aiSummaryAt" TIMESTAMPTZ,
  "createdBy" UUID,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (scope = 'GENERAL' OR "cohortId" IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS "SurveyQuestion" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "surveyId" UUID NOT NULL REFERENCES "Survey"(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  kind TEXT NOT NULL CHECK (kind IN ('TEXT', 'TEXTAREA', 'NUMBER', 'RATING', 'FILE', 'DEPARTMENT', 'YESNO')),
  prompt TEXT NOT NULL,
  required BOOLEAN NOT NULL DEFAULT TRUE,
  config JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS "SurveyQuestion_survey_idx" ON "SurveyQuestion" ("surveyId", position);

-- Who has answered (stops repeats, drives the "who answered" list). For an
-- anonymous survey this is the only place a person appears.
CREATE TABLE IF NOT EXISTS "SurveySubmission" (
  "surveyId" UUID NOT NULL REFERENCES "Survey"(id) ON DELETE CASCADE,
  "respondentKey" TEXT NOT NULL,
  "submittedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("surveyId", "respondentKey")
);

-- The answers. respondentKey and the time are left out when the survey is
-- anonymous, so nobody can be matched to what they wrote.
CREATE TABLE IF NOT EXISTS "SurveyAnswerSet" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "surveyId" UUID NOT NULL REFERENCES "Survey"(id) ON DELETE CASCADE,
  "respondentKey" TEXT,
  "cohortId" UUID,
  answers JSONB NOT NULL,
  "submittedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "submittedOn" DATE NOT NULL DEFAULT CURRENT_DATE
);
CREATE INDEX IF NOT EXISTS "SurveyAnswerSet_survey_idx" ON "SurveyAnswerSet" ("surveyId");

-- One notification per survey and cohort when it opens.
CREATE TABLE IF NOT EXISTS "SurveyNotified" (
  "surveyId" UUID NOT NULL REFERENCES "Survey"(id) ON DELETE CASCADE,
  "cohortKey" TEXT NOT NULL,
  "notifiedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("surveyId", "cohortKey")
);

ALTER TABLE "Survey" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SurveyQuestion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SurveySubmission" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SurveyAnswerSet" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SurveyNotified" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "Survey", "SurveyQuestion", "SurveySubmission", "SurveyAnswerSet", "SurveyNotified" FROM anon, authenticated;

-- ── Helpers ──────────────────────────────────────────────────────────────────

-- When a survey is open for a cohort. WEEKS_BEFORE_END counts back from that
-- cohort's end date, so the same survey follows each cohort.
CREATE OR REPLACE FUNCTION public.survey_window(s "Survey", p_end DATE, p_practice BOOLEAN)
RETURNS TABLE (opens TIMESTAMPTZ, closes TIMESTAMPTZ)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  IF s."timingMode" = 'WEEKS_BEFORE_END' THEN
    IF p_practice OR p_end IS NULL THEN
      RETURN QUERY SELECT NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ;
    ELSE
      RETURN QUERY SELECT
        ((p_end - COALESCE(s."weeksBeforeEnd", 1) * 7)::TIMESTAMP AT TIME ZONE 'Africa/Lagos'),
        ((p_end + COALESCE(s."closeDaysAfterEnd", 14) + 1)::TIMESTAMP AT TIME ZONE 'Africa/Lagos');
    END IF;
  ELSE
    RETURN QUERY SELECT s."opensAt", s."closesAt";
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.survey_open_for_participant(s "Survey", person "Participant", c "Cohort")
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  w RECORD;
BEGIN
  IF NOT s.enabled OR s.status <> 'PUBLISHED' THEN RETURN FALSE; END IF;
  IF s.audience NOT IN ('PARTICIPANTS', 'EVERYONE') THEN RETURN FALSE; END IF;
  IF s.scope = 'COHORT' AND s."cohortId" IS DISTINCT FROM person."cohortId" THEN RETURN FALSE; END IF;
  IF s."targetGroupId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "GroupParticipant" gp WHERE gp."groupId" = s."targetGroupId" AND gp."participantId" = person.id
  ) THEN RETURN FALSE; END IF;
  SELECT * INTO w FROM public.survey_window(s, c."endDate", COALESCE(c."isPractice", FALSE));
  RETURN NOW() >= COALESCE(w.opens, '-infinity'::TIMESTAMPTZ) AND NOW() < COALESCE(w.closes, 'infinity'::TIMESTAMPTZ);
END;
$$;

CREATE OR REPLACE FUNCTION public.survey_open_for_staff(s "Survey", uid UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT s.enabled OR s.status <> 'PUBLISHED' THEN RETURN FALSE; END IF;
  IF s.audience NOT IN ('SUPPORTS', 'EVERYONE') THEN RETURN FALSE; END IF;
  IF s.scope = 'COHORT' AND NOT EXISTS (
    SELECT 1 FROM "UserCohort" uc WHERE uc."userId" = uid AND uc."cohortId" = s."cohortId"
  ) THEN RETURN FALSE; END IF;
  RETURN NOW() >= COALESCE(s."opensAt", '-infinity'::TIMESTAMPTZ) AND NOW() < COALESCE(s."closesAt", 'infinity'::TIMESTAMPTZ);
END;
$$;

-- Everyone a survey is for (optionally within one cohort).
CREATE OR REPLACE FUNCTION public.survey_people(s "Survey", p_cohort UUID)
RETURNS TABLE (respondent_key TEXT, person_name TEXT, kind TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF s.audience IN ('PARTICIPANTS', 'EVERYONE') THEN
    RETURN QUERY
    SELECT 'p:' || p.id::TEXT, p."fullName", 'PARTICIPANT'::TEXT
    FROM "Participant" p
    WHERE p.status = 'ACTIVE'
      AND (CASE WHEN s.scope = 'COHORT' THEN p."cohortId" = s."cohortId" ELSE (p_cohort IS NULL OR p."cohortId" = p_cohort) END)
      AND (s."targetGroupId" IS NULL OR EXISTS (SELECT 1 FROM "GroupParticipant" gp WHERE gp."groupId" = s."targetGroupId" AND gp."participantId" = p.id));
  END IF;
  IF s.audience IN ('SUPPORTS', 'EVERYONE') THEN
    RETURN QUERY
    SELECT 'u:' || u.id::TEXT, u.name, 'SUPPORT'::TEXT
    FROM "User" u
    WHERE u."isActive" IS NOT FALSE
      AND COALESCE(u."isTest", FALSE) = FALSE
      AND ('SUPPORT'::"Role" = ANY(u.roles) OR u.role = 'SUPPORT'::"Role")
      AND (CASE
             WHEN s.scope = 'COHORT' THEN EXISTS (SELECT 1 FROM "UserCohort" uc WHERE uc."userId" = u.id AND uc."cohortId" = s."cohortId")
             WHEN p_cohort IS NOT NULL THEN EXISTS (SELECT 1 FROM "UserCohort" uc WHERE uc."userId" = u.id AND uc."cohortId" = p_cohort)
             ELSE TRUE
           END);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.survey_questions_json(p_survey UUID)
RETURNS JSON
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT COALESCE(json_agg(json_build_object(
    'id', q.id, 'position', q.position, 'kind', q.kind, 'prompt', q.prompt, 'required', q.required, 'config', q.config
  ) ORDER BY q.position, q.id), '[]'::JSON)
  FROM "SurveyQuestion" q WHERE q."surveyId" = p_survey;
$$;

-- ── Participants and supports: what's waiting, open one, send it ─────────────

CREATE OR REPLACE FUNCTION public.survey_pending(p_token TEXT)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  pid UUID := public.app_participant_id(p_token);
  staff "User" := public.app_staff(p_token);
  person "Participant";
  c "Cohort";
BEGIN
  IF pid IS NOT NULL THEN
    SELECT * INTO person FROM "Participant" WHERE id = pid;
    SELECT * INTO c FROM "Cohort" WHERE id = person."cohortId";
    RETURN COALESCE((
      SELECT json_agg(json_build_object(
        'id', s.id, 'title', s.title, 'description', s.description, 'builtinKey', s."builtinKey",
        'homeHeading', s."homeHeading", 'homeLine', s."homeLine", 'homeButton', s."homeButton"
      ) ORDER BY s."createdAt")
      FROM "Survey" s
      WHERE public.survey_open_for_participant(s, person, c)
        AND NOT EXISTS (SELECT 1 FROM "SurveySubmission" x WHERE x."surveyId" = s.id AND x."respondentKey" = 'p:' || pid::TEXT)
        AND NOT (s."builtinKey" = 'WRAPUP' AND EXISTS (
          SELECT 1 FROM "ParticipantWrapUp" w WHERE w."participantId" = pid AND w."cohortId" = person."cohortId"
        ))
    ), '[]'::JSON);
  END IF;
  IF staff.id IS NOT NULL THEN
    RETURN COALESCE((
      SELECT json_agg(json_build_object(
        'id', s.id, 'title', s.title, 'description', s.description, 'builtinKey', s."builtinKey",
        'homeHeading', s."homeHeading", 'homeLine', s."homeLine", 'homeButton', s."homeButton"
      ) ORDER BY s."createdAt")
      FROM "Survey" s
      WHERE public.survey_open_for_staff(s, staff.id)
        AND NOT EXISTS (SELECT 1 FROM "SurveySubmission" x WHERE x."surveyId" = s.id AND x."respondentKey" = 'u:' || staff.id::TEXT)
    ), '[]'::JSON);
  END IF;
  RAISE EXCEPTION 'SESSION_EXPIRED';
END;
$$;

CREATE OR REPLACE FUNCTION public.survey_get(p_token TEXT, p_id UUID)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  pid UUID := public.app_participant_id(p_token);
  staff "User" := public.app_staff(p_token);
  person "Participant";
  c "Cohort";
  s "Survey";
  rkey TEXT;
  ok BOOLEAN := FALSE;
BEGIN
  IF pid IS NULL AND staff.id IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  SELECT * INTO s FROM "Survey" WHERE id = p_id;
  IF s.id IS NULL THEN RAISE EXCEPTION 'SURVEY_NOT_AVAILABLE'; END IF;
  IF pid IS NOT NULL THEN
    rkey := 'p:' || pid::TEXT;
    SELECT * INTO person FROM "Participant" WHERE id = pid;
    SELECT * INTO c FROM "Cohort" WHERE id = person."cohortId";
    ok := public.survey_open_for_participant(s, person, c);
  ELSE
    rkey := 'u:' || staff.id::TEXT;
    ok := public.survey_open_for_staff(s, staff.id);
  END IF;
  IF EXISTS (SELECT 1 FROM "SurveySubmission" x WHERE x."surveyId" = s.id AND x."respondentKey" = rkey) THEN
    RETURN json_build_object('id', s.id, 'title', s.title, 'submitted', TRUE, 'anonymous', s.anonymous);
  END IF;
  IF s."builtinKey" = 'WRAPUP' AND pid IS NOT NULL AND EXISTS (
    SELECT 1 FROM "ParticipantWrapUp" w WHERE w."participantId" = pid AND w."cohortId" = person."cohortId"
  ) THEN
    RETURN json_build_object('id', s.id, 'title', s.title, 'submitted', TRUE, 'anonymous', s.anonymous);
  END IF;
  IF NOT ok THEN RAISE EXCEPTION 'SURVEY_NOT_AVAILABLE'; END IF;
  RETURN json_build_object(
    'id', s.id, 'title', s.title, 'description', s.description, 'anonymous', s.anonymous,
    'builtinKey', s."builtinKey", 'submitted', FALSE, 'questions', public.survey_questions_json(s.id)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.survey_submit(p_token TEXT, p_id UUID, p_answers JSONB)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  pid UUID := public.app_participant_id(p_token);
  staff "User" := public.app_staff(p_token);
  person "Participant";
  c "Cohort";
  s "Survey";
  q RECORD;
  rkey TEXT;
  ok BOOLEAN := FALSE;
  cohort_id UUID;
  val TEXT;
  num NUMERIC;
  clean JSONB := '{}'::JSONB;
  dept TEXT;
  referral BOOLEAN := FALSE;
  note TEXT;
  wrap JSON;
BEGIN
  IF pid IS NULL AND staff.id IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  SELECT * INTO s FROM "Survey" WHERE id = p_id;
  IF s.id IS NULL THEN RAISE EXCEPTION 'SURVEY_NOT_AVAILABLE'; END IF;
  IF pid IS NOT NULL THEN
    rkey := 'p:' || pid::TEXT;
    SELECT * INTO person FROM "Participant" WHERE id = pid;
    SELECT * INTO c FROM "Cohort" WHERE id = person."cohortId";
    ok := public.survey_open_for_participant(s, person, c);
    cohort_id := person."cohortId";
  ELSE
    rkey := 'u:' || staff.id::TEXT;
    ok := public.survey_open_for_staff(s, staff.id);
  END IF;
  IF NOT ok THEN RAISE EXCEPTION 'SURVEY_NOT_AVAILABLE'; END IF;
  IF p_answers IS NULL OR jsonb_typeof(p_answers) <> 'object' THEN RAISE EXCEPTION 'ANSWERS_INVALID'; END IF;

  FOR q IN SELECT * FROM "SurveyQuestion" WHERE "surveyId" = s.id ORDER BY position LOOP
    val := NULLIF(trim(COALESCE(p_answers ->> q.id::TEXT, '')), '');
    IF val IS NULL THEN
      IF q.required THEN RAISE EXCEPTION 'ANSWER_REQUIRED: %', q.prompt; END IF;
      CONTINUE;
    END IF;
    IF q.kind = 'RATING' THEN
      BEGIN num := val::NUMERIC; EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'ANSWER_INVALID: %', q.prompt; END;
      IF num < 1 OR num > COALESCE((q.config ->> 'scale')::NUMERIC, 5) OR num <> trunc(num) THEN RAISE EXCEPTION 'ANSWER_INVALID: %', q.prompt; END IF;
      clean := clean || jsonb_build_object(q.id::TEXT, num::INTEGER);
    ELSIF q.kind = 'NUMBER' THEN
      BEGIN num := val::NUMERIC; EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'ANSWER_INVALID: %', q.prompt; END;
      IF (q.config ? 'min' AND num < (q.config ->> 'min')::NUMERIC) OR (q.config ? 'max' AND num > (q.config ->> 'max')::NUMERIC) THEN
        RAISE EXCEPTION 'ANSWER_INVALID: %', q.prompt;
      END IF;
      clean := clean || jsonb_build_object(q.id::TEXT, num);
    ELSIF q.kind = 'YESNO' THEN
      IF val NOT IN ('Yes', 'No') THEN RAISE EXCEPTION 'ANSWER_INVALID: %', q.prompt; END IF;
      clean := clean || jsonb_build_object(q.id::TEXT, val);
    ELSIF q.kind = 'FILE' THEN
      IF val !~ '^https://' OR length(val) > 1000 THEN RAISE EXCEPTION 'ANSWER_INVALID: %', q.prompt; END IF;
      clean := clean || jsonb_build_object(q.id::TEXT, jsonb_build_object('url', val, 'name', left(COALESCE(p_answers -> q.id::TEXT ->> 'name', ''), 200)));
    ELSE
      clean := clean || jsonb_build_object(q.id::TEXT, left(val, CASE WHEN q.kind = 'TEXT' THEN 500 ELSE 5000 END));
    END IF;
  END LOOP;

  BEGIN
    INSERT INTO "SurveySubmission" ("surveyId", "respondentKey") VALUES (s.id, rkey);
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'SURVEY_ALREADY_SENT';
  END;

  IF s.anonymous THEN
    INSERT INTO "SurveyAnswerSet" ("surveyId", "respondentKey", "cohortId", answers, "submittedAt", "submittedOn")
    VALUES (s.id, NULL, cohort_id, clean, date_trunc('day', NOW()), CURRENT_DATE);
  ELSE
    INSERT INTO "SurveyAnswerSet" ("surveyId", "respondentKey", "cohortId", answers) VALUES (s.id, rkey, cohort_id, clean);
  END IF;

  -- The wrap-up answers still feed the department list and referrals.
  IF s."builtinKey" = 'WRAPUP' AND pid IS NOT NULL THEN
    SELECT clean ->> q2.id::TEXT INTO dept FROM "SurveyQuestion" q2 WHERE q2."surveyId" = s.id AND q2.config ->> 'feeds' = 'department' LIMIT 1;
    SELECT (clean ->> q2.id::TEXT) = 'Yes' INTO referral FROM "SurveyQuestion" q2 WHERE q2."surveyId" = s.id AND q2.config ->> 'feeds' = 'referral' LIMIT 1;
    SELECT clean ->> q2.id::TEXT INTO note FROM "SurveyQuestion" q2 WHERE q2."surveyId" = s.id AND q2.config ->> 'feeds' = 'note' LIMIT 1;
    IF dept IS NOT NULL THEN
      wrap := public.submit_wrap_up(p_token, dept, COALESCE(referral, FALSE), COALESCE(note, ''));
      RETURN json_build_object('ok', TRUE, 'supportId', wrap ->> 'supportId', 'wantsReferral', COALESCE(referral, FALSE), 'department', dept);
    END IF;
  END IF;
  RETURN json_build_object('ok', TRUE);
END;
$$;

-- ── Admin ────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.survey_admin_list(p_token TEXT, p_cohort_id UUID)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  staff "User" := public.app_staff(p_token);
  c "Cohort";
BEGIN
  IF staff.id IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  IF staff.role <> 'ADMIN' THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  SELECT * INTO c FROM "Cohort" WHERE id = p_cohort_id;
  RETURN COALESCE((
    SELECT json_agg(item ORDER BY (item ->> 'sortKey')) FROM (
      SELECT json_build_object(
        'id', s.id, 'builtinKey', s."builtinKey", 'title', s.title, 'audience', s.audience, 'scope', s.scope,
        'cohortId', s."cohortId", 'cohortName', (SELECT name FROM "Cohort" WHERE id = s."cohortId"),
        'anonymous', s.anonymous, 'enabled', s.enabled, 'status', s.status, 'timingMode', s."timingMode",
        'weeksBeforeEnd', s."weeksBeforeEnd", 'closeDaysAfterEnd', s."closeDaysAfterEnd",
        'opensAt', w.opens, 'closesAt', w.closes,
        'state', CASE
          WHEN s.status = 'DRAFT' THEN 'DRAFT'
          WHEN NOT s.enabled THEN 'OFF'
          WHEN NOW() < COALESCE(w.opens, '-infinity'::TIMESTAMPTZ) THEN 'SCHEDULED'
          WHEN NOW() >= COALESCE(w.closes, 'infinity'::TIMESTAMPTZ) THEN 'CLOSED'
          ELSE 'OPEN' END,
        'eligible', (SELECT count(*) FROM public.survey_people(s, p_cohort_id)),
        'answered', (SELECT count(*) FROM "SurveySubmission" x JOIN public.survey_people(s, p_cohort_id) pp ON pp.respondent_key = x."respondentKey" WHERE x."surveyId" = s.id),
        'sortKey', (CASE WHEN s."builtinKey" IS NULL THEN '1' ELSE '0' END) || to_char(s."createdAt", 'YYYYMMDDHH24MISS')
      ) AS item
      FROM "Survey" s
      CROSS JOIN LATERAL public.survey_window(s, c."endDate", COALESCE(c."isPractice", FALSE)) w
      WHERE s.scope = 'GENERAL' OR s."cohortId" = p_cohort_id
    ) t
  ), '[]'::JSON);
END;
$$;

CREATE OR REPLACE FUNCTION public.survey_admin_get(p_token TEXT, p_id UUID)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  staff "User" := public.app_staff(p_token);
  s "Survey";
BEGIN
  IF staff.id IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  IF staff.role <> 'ADMIN' THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  SELECT * INTO s FROM "Survey" WHERE id = p_id;
  IF s.id IS NULL THEN RAISE EXCEPTION 'SURVEY_NOT_FOUND'; END IF;
  RETURN json_build_object('survey', to_json(s), 'questions', public.survey_questions_json(s.id));
END;
$$;

-- Create or update a survey with its questions in one go. Questions keep their
-- ids so earlier answers stay attached; ones left out are removed.
CREATE OR REPLACE FUNCTION public.survey_admin_save(p_token TEXT, p_survey JSONB, p_questions JSONB)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  staff "User" := public.app_staff(p_token);
  sid UUID := NULLIF(p_survey ->> 'id', '')::UUID;
  existing "Survey";
  q JSONB;
  qid UUID;
  kept UUID[] := ARRAY[]::UUID[];
  idx INTEGER := 0;
  kind TEXT;
  scale INTEGER;
  title_text TEXT := NULLIF(trim(COALESCE(p_survey ->> 'title', '')), '');
  new_status TEXT := COALESCE(NULLIF(p_survey ->> 'status', ''), 'DRAFT');
BEGIN
  IF staff.id IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  IF staff.role <> 'ADMIN' THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  IF title_text IS NULL THEN RAISE EXCEPTION 'TITLE_REQUIRED'; END IF;
  IF p_questions IS NULL OR jsonb_typeof(p_questions) <> 'array' THEN RAISE EXCEPTION 'QUESTIONS_INVALID'; END IF;
  IF new_status = 'PUBLISHED' AND jsonb_array_length(p_questions) = 0 THEN RAISE EXCEPTION 'ADD_A_QUESTION'; END IF;

  FOR q IN SELECT * FROM jsonb_array_elements(p_questions) LOOP
    kind := q ->> 'kind';
    IF kind NOT IN ('TEXT', 'TEXTAREA', 'NUMBER', 'RATING', 'FILE', 'DEPARTMENT', 'YESNO') THEN RAISE EXCEPTION 'QUESTIONS_INVALID'; END IF;
    IF NULLIF(trim(COALESCE(q ->> 'prompt', '')), '') IS NULL THEN RAISE EXCEPTION 'QUESTION_TEXT_REQUIRED'; END IF;
    IF kind = 'RATING' THEN
      scale := COALESCE((q -> 'config' ->> 'scale')::INTEGER, 5);
      IF scale < 2 OR scale > 10 THEN RAISE EXCEPTION 'SCALE_INVALID'; END IF;
    END IF;
  END LOOP;

  IF sid IS NOT NULL THEN
    SELECT * INTO existing FROM "Survey" WHERE id = sid;
    IF existing.id IS NULL THEN RAISE EXCEPTION 'SURVEY_NOT_FOUND'; END IF;
  END IF;

  IF existing.id IS NULL THEN
    sid := gen_random_uuid();
    INSERT INTO "Survey" (
      id, title, description, audience, scope, "cohortId", "targetGroupId", anonymous, enabled, status, "timingMode",
      "opensAt", "closesAt", "weeksBeforeEnd", "closeDaysAfterEnd", "notifyOnOpen", "homeHeading", "homeLine", "homeButton", "createdBy"
    ) VALUES (
      sid, title_text, NULLIF(trim(COALESCE(p_survey ->> 'description', '')), ''),
      COALESCE(NULLIF(p_survey ->> 'audience', ''), 'PARTICIPANTS'), COALESCE(NULLIF(p_survey ->> 'scope', ''), 'COHORT'),
      NULLIF(p_survey ->> 'cohortId', '')::UUID, NULLIF(p_survey ->> 'targetGroupId', '')::UUID,
      COALESCE((p_survey ->> 'anonymous')::BOOLEAN, FALSE), COALESCE((p_survey ->> 'enabled')::BOOLEAN, TRUE), new_status,
      COALESCE(NULLIF(p_survey ->> 'timingMode', ''), 'DATES'),
      NULLIF(p_survey ->> 'opensAt', '')::TIMESTAMPTZ, NULLIF(p_survey ->> 'closesAt', '')::TIMESTAMPTZ,
      NULLIF(p_survey ->> 'weeksBeforeEnd', '')::INTEGER, NULLIF(p_survey ->> 'closeDaysAfterEnd', '')::INTEGER,
      COALESCE((p_survey ->> 'notifyOnOpen')::BOOLEAN, FALSE),
      NULLIF(trim(COALESCE(p_survey ->> 'homeHeading', '')), ''), NULLIF(trim(COALESCE(p_survey ->> 'homeLine', '')), ''),
      NULLIF(trim(COALESCE(p_survey ->> 'homeButton', '')), ''), staff.id
    );
  ELSE
    UPDATE "Survey" SET
      title = CASE WHEN existing."builtinKey" IS NULL THEN title_text ELSE existing.title END,
      description = NULLIF(trim(COALESCE(p_survey ->> 'description', '')), ''),
      audience = CASE WHEN existing."builtinKey" IS NULL THEN COALESCE(NULLIF(p_survey ->> 'audience', ''), audience) ELSE audience END,
      scope = CASE WHEN existing."builtinKey" IS NULL THEN COALESCE(NULLIF(p_survey ->> 'scope', ''), scope) ELSE scope END,
      "cohortId" = CASE WHEN existing."builtinKey" IS NULL THEN NULLIF(p_survey ->> 'cohortId', '')::UUID ELSE "cohortId" END,
      "targetGroupId" = CASE WHEN existing."builtinKey" IS NULL THEN NULLIF(p_survey ->> 'targetGroupId', '')::UUID ELSE "targetGroupId" END,
      anonymous = CASE WHEN existing."builtinKey" IS NULL AND NOT EXISTS (SELECT 1 FROM "SurveySubmission" x WHERE x."surveyId" = sid)
                       THEN COALESCE((p_survey ->> 'anonymous')::BOOLEAN, anonymous) ELSE anonymous END,
      enabled = COALESCE((p_survey ->> 'enabled')::BOOLEAN, enabled),
      status = new_status,
      "timingMode" = COALESCE(NULLIF(p_survey ->> 'timingMode', ''), "timingMode"),
      "opensAt" = NULLIF(p_survey ->> 'opensAt', '')::TIMESTAMPTZ,
      "closesAt" = NULLIF(p_survey ->> 'closesAt', '')::TIMESTAMPTZ,
      "weeksBeforeEnd" = NULLIF(p_survey ->> 'weeksBeforeEnd', '')::INTEGER,
      "closeDaysAfterEnd" = NULLIF(p_survey ->> 'closeDaysAfterEnd', '')::INTEGER,
      "notifyOnOpen" = COALESCE((p_survey ->> 'notifyOnOpen')::BOOLEAN, "notifyOnOpen"),
      "homeHeading" = NULLIF(trim(COALESCE(p_survey ->> 'homeHeading', '')), ''),
      "homeLine" = NULLIF(trim(COALESCE(p_survey ->> 'homeLine', '')), ''),
      "homeButton" = NULLIF(trim(COALESCE(p_survey ->> 'homeButton', '')), ''),
      "createdBy" = COALESCE("createdBy", staff.id),
      "updatedAt" = NOW()
    WHERE id = sid;
  END IF;

  FOR q IN SELECT * FROM jsonb_array_elements(p_questions) LOOP
    idx := idx + 1;
    qid := COALESCE(NULLIF(q ->> 'id', '')::UUID, gen_random_uuid());
    INSERT INTO "SurveyQuestion" (id, "surveyId", position, kind, prompt, required, config)
    VALUES (qid, sid, idx, q ->> 'kind', trim(q ->> 'prompt'), COALESCE((q ->> 'required')::BOOLEAN, TRUE), COALESCE(q -> 'config', '{}'::JSONB))
    ON CONFLICT (id) DO UPDATE SET
      position = EXCLUDED.position, kind = EXCLUDED.kind, prompt = EXCLUDED.prompt,
      required = EXCLUDED.required, config = EXCLUDED.config
    WHERE "SurveyQuestion"."surveyId" = sid;
    kept := kept || qid;
  END LOOP;
  DELETE FROM "SurveyQuestion" WHERE "surveyId" = sid AND id <> ALL (kept);
  RETURN sid;
END;
$$;

CREATE OR REPLACE FUNCTION public.survey_admin_delete(p_token TEXT, p_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  staff "User" := public.app_staff(p_token);
BEGIN
  IF staff.id IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  IF staff.role <> 'ADMIN' THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  IF EXISTS (SELECT 1 FROM "Survey" WHERE id = p_id AND "builtinKey" IS NOT NULL) THEN RAISE EXCEPTION 'BUILTIN_CANNOT_DELETE'; END IF;
  DELETE FROM "Survey" WHERE id = p_id;
END;
$$;

-- Results. An anonymous survey shows its answers only once five or more people
-- have answered, shuffled and with no names or times, so nobody can be picked
-- out. The "who answered" list is always available.
CREATE OR REPLACE FUNCTION public.survey_admin_results(p_token TEXT, p_id UUID, p_cohort_id UUID)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  staff "User" := public.app_staff(p_token);
  s "Survey";
  total INTEGER;
  show_answers BOOLEAN;
BEGIN
  IF staff.id IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  IF staff.role <> 'ADMIN' THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  SELECT * INTO s FROM "Survey" WHERE id = p_id;
  IF s.id IS NULL THEN RAISE EXCEPTION 'SURVEY_NOT_FOUND'; END IF;
  SELECT count(*) INTO total FROM "SurveyAnswerSet" a
    WHERE a."surveyId" = s.id AND (a."cohortId" IS NULL OR p_cohort_id IS NULL OR a."cohortId" = p_cohort_id);
  show_answers := NOT s.anonymous OR total >= 5;
  RETURN json_build_object(
    'survey', to_json(s),
    'questions', public.survey_questions_json(s.id),
    'eligible', (SELECT count(*) FROM public.survey_people(s, p_cohort_id)),
    'answered', total,
    'visible', show_answers,
    'answers', CASE WHEN NOT show_answers THEN NULL WHEN s.anonymous THEN (
        SELECT COALESCE(json_agg(json_build_object('answers', a.answers) ORDER BY md5(a.id::TEXT)), '[]'::JSON)
        FROM "SurveyAnswerSet" a WHERE a."surveyId" = s.id AND (a."cohortId" IS NULL OR p_cohort_id IS NULL OR a."cohortId" = p_cohort_id)
      ) ELSE (
        SELECT COALESCE(json_agg(json_build_object(
          'name', COALESCE(p."fullName", u.name, 'Unknown'), 'submittedAt', a."submittedAt", 'answers', a.answers
        ) ORDER BY a."submittedAt"), '[]'::JSON)
        FROM "SurveyAnswerSet" a
        LEFT JOIN "Participant" p ON a."respondentKey" = 'p:' || p.id::TEXT
        LEFT JOIN "User" u ON a."respondentKey" = 'u:' || u.id::TEXT
        WHERE a."surveyId" = s.id AND (a."cohortId" IS NULL OR p_cohort_id IS NULL OR a."cohortId" = p_cohort_id)
      ) END,
    'people', (
      SELECT COALESCE(json_agg(json_build_object('name', pp.person_name, 'kind', pp.kind, 'answered', x."respondentKey" IS NOT NULL) ORDER BY pp.person_name), '[]'::JSON)
      FROM public.survey_people(s, p_cohort_id) pp
      LEFT JOIN "SurveySubmission" x ON x."surveyId" = s.id AND x."respondentKey" = pp.respondent_key
    )
  );
END;
$$;

-- Saved by the ai-assist function (service role).
CREATE OR REPLACE FUNCTION public.survey_admin_save_summary(p_token TEXT, p_id UUID, p_text TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  staff "User" := public.app_staff(p_token);
BEGIN
  IF staff.id IS NULL OR staff.role <> 'ADMIN' THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  UPDATE "Survey" SET "aiSummary" = p_text, "aiSummaryAt" = NOW() WHERE id = p_id;
END;
$$;

-- ── Opening notifications (called by the push-reminders job) ─────────────────

CREATE OR REPLACE FUNCTION public.survey_notifications_due()
RETURNS TABLE (survey_id UUID, cohort_id UUID, title TEXT, audience TEXT, created_by UUID)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  RETURN QUERY
  -- Dated surveys: once, to their cohort (or everyone when general).
  SELECT s.id, s."cohortId", COALESCE(s."homeHeading", s.title), s.audience, s."createdBy"
  FROM "Survey" s
  WHERE s."notifyOnOpen" AND s.enabled AND s.status = 'PUBLISHED' AND s."timingMode" = 'DATES'
    AND NOW() >= COALESCE(s."opensAt", '-infinity'::TIMESTAMPTZ)
    AND NOW() < COALESCE(s."closesAt", 'infinity'::TIMESTAMPTZ)
    AND NOT EXISTS (SELECT 1 FROM "SurveyNotified" n WHERE n."surveyId" = s.id AND n."cohortKey" = COALESCE(s."cohortId"::TEXT, 'ALL'))
  UNION ALL
  -- Weeks-before-end surveys: once per cohort, when that cohort's window opens.
  SELECT s.id, c.id, COALESCE(s."homeHeading", s.title), s.audience, s."createdBy"
  FROM "Survey" s
  JOIN "Cohort" c ON (s.scope = 'GENERAL' OR s."cohortId" = c.id) AND COALESCE(c."isPractice", FALSE) = FALSE
  CROSS JOIN LATERAL public.survey_window(s, c."endDate", FALSE) w
  WHERE s."notifyOnOpen" AND s.enabled AND s.status = 'PUBLISHED' AND s."timingMode" = 'WEEKS_BEFORE_END'
    AND NOW() >= COALESCE(w.opens, '-infinity'::TIMESTAMPTZ) AND NOW() < COALESCE(w.closes, 'infinity'::TIMESTAMPTZ)
    AND NOT EXISTS (SELECT 1 FROM "SurveyNotified" n WHERE n."surveyId" = s.id AND n."cohortKey" = c.id::TEXT);
END;
$$;

CREATE OR REPLACE FUNCTION public.survey_mark_notified(p_survey UUID, p_cohort UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  INSERT INTO "SurveyNotified" ("surveyId", "cohortKey") VALUES (p_survey, COALESCE(p_cohort::TEXT, 'ALL')) ON CONFLICT DO NOTHING;
$$;

REVOKE ALL ON FUNCTION public.survey_window(public."Survey", DATE, BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.survey_open_for_participant(public."Survey", public."Participant", public."Cohort") FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.survey_open_for_staff(public."Survey", UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.survey_people(public."Survey", UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.survey_questions_json(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.survey_notifications_due() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.survey_mark_notified(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.survey_pending(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.survey_get(TEXT, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.survey_submit(TEXT, UUID, JSONB) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.survey_admin_list(TEXT, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.survey_admin_get(TEXT, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.survey_admin_save(TEXT, JSONB, JSONB) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.survey_admin_delete(TEXT, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.survey_admin_results(TEXT, UUID, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.survey_admin_save_summary(TEXT, UUID, TEXT) TO anon, authenticated;

-- ── The built-in "Wrapping up" survey ────────────────────────────────────────
-- Same behaviour as the old hardcoded card: it appears in the last week and
-- stays after the cohort ends. Admins can now change all of it.
WITH s AS (
  INSERT INTO "Survey" (
    "builtinKey", title, audience, scope, anonymous, enabled, status, "timingMode",
    "weeksBeforeEnd", "closeDaysAfterEnd", "notifyOnOpen", "homeHeading", "homeLine", "homeButton"
  ) VALUES (
    'WRAPUP', 'Wrapping up', 'PARTICIPANTS', 'GENERAL', FALSE, TRUE, 'PUBLISHED', 'WEEKS_BEFORE_END',
    1, 365, FALSE, 'Your cohort is wrapping up', 'Tell us what comes next for you.', 'Continue'
  ) ON CONFLICT ("builtinKey") DO NOTHING
  RETURNING id
)
INSERT INTO "SurveyQuestion" ("surveyId", position, kind, prompt, required, config)
SELECT s.id, v.position, v.kind, v.prompt, v.required, v.config::JSONB FROM s,
(VALUES
  (1, 'DEPARTMENT', 'Which department are you interested in?', TRUE, '{"feeds":"department"}'),
  (2, 'YESNO', 'Would you like a referral to join that department?', TRUE, '{"feeds":"referral"}'),
  (3, 'TEXTAREA', 'Anything else you would like to tell us?', FALSE, '{"feeds":"note"}')
) AS v(position, kind, prompt, required, config);
