-- Participant app, step 4: AI help through OpenRouter (the ai-assist edge function).
--   - End-of-FOF personal summary, only for participants who opt in.
--   - Feedback themes for admins (from anonymous answers).
-- Results are saved so each costs one AI request. Additive and idempotent.

-- When the participant agreed to have their reflections summarised by an outside
-- AI service. NULL = not opted in.
ALTER TABLE "ParticipantAccount" ADD COLUMN IF NOT EXISTS "aiOptInAt" TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS "ReflectionSummary" (
  "participantId" UUID NOT NULL REFERENCES "Participant"(id) ON DELETE CASCADE,
  "cohortId" UUID NOT NULL REFERENCES "Cohort"(id) ON DELETE CASCADE,
  summary TEXT NOT NULL,
  model TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("participantId", "cohortId")
);

CREATE TABLE IF NOT EXISTS "FeedbackThemes" (
  "cohortId" UUID NOT NULL REFERENCES "Cohort"(id) ON DELETE CASCADE,
  round TEXT NOT NULL CHECK (round IN ('MID', 'END')),
  themes TEXT NOT NULL,
  model TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("cohortId", round)
);

ALTER TABLE "ReflectionSummary" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FeedbackThemes" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "ReflectionSummary", "FeedbackThemes" FROM anon, authenticated;

-- The participant's opt-in, their saved summary, and whether it has unlocked
-- (from the start of their cohort's last week, Lagos time).
CREATE OR REPLACE FUNCTION public.participant_summary(p_token TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
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
      SELECT NOW() >= ((c."startDate" + (max(w."weekNumber") - 1) * 7)::TIMESTAMP AT TIME ZONE 'Africa/Lagos')
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
$$;

CREATE OR REPLACE FUNCTION public.set_ai_opt_in(p_token TEXT, p_opt_in BOOLEAN)
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
  UPDATE "ParticipantAccount"
  SET "aiOptInAt" = CASE WHEN p_opt_in THEN COALESCE("aiOptInAt", NOW()) END, "updatedAt" = NOW()
  WHERE "participantId" = person_id;
  -- Opting out also removes the summary that was written from their entries.
  IF NOT p_opt_in THEN
    DELETE FROM "ReflectionSummary" WHERE "participantId" = person_id;
  END IF;
END;
$$;

-- Saved AI themes for a cohort's feedback rounds (admins).
CREATE OR REPLACE FUNCTION public.feedback_themes(p_token TEXT, p_cohort_id UUID)
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
  RETURN COALESCE((
    SELECT json_agg(json_build_object('round', t.round, 'themes', t.themes, 'createdAt', t."createdAt"))
    FROM "FeedbackThemes" t WHERE t."cohortId" = p_cohort_id
  ), '[]'::json);
END;
$$;

GRANT EXECUTE ON FUNCTION public.participant_summary(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_ai_opt_in(TEXT, BOOLEAN) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.feedback_themes(TEXT, UUID) TO anon, authenticated;
