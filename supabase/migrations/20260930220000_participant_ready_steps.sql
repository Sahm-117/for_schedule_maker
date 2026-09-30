-- Get ready steps, remembered on the server.
--
-- The pre-start "Get ready" list on Participant Home ticks "Prep for the Intro
-- Class" and "Meet your cohort" once opened. Until now that lived only on the
-- participant's phone, so the 7pm "Get ready" reminder could not know what was
-- already done. ParticipantReadyStep keeps one row per participant per step.
-- Participants reach it only through the two functions below.
--
-- Rollback: DROP FUNCTION participant_ready_steps, participant_mark_ready_step;
-- DROP TABLE "ParticipantReadyStep".

CREATE TABLE IF NOT EXISTS public."ParticipantReadyStep" (
  "participantId" UUID NOT NULL REFERENCES public."Participant"(id) ON DELETE CASCADE,
  step TEXT NOT NULL CHECK (step IN ('intro', 'people')),
  "doneAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("participantId", step)
);

ALTER TABLE public."ParticipantReadyStep" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."ParticipantReadyStep" FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.participant_mark_ready_step(p_token TEXT, p_step TEXT)
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
  IF p_step NOT IN ('intro', 'people') THEN
    RAISE EXCEPTION 'INVALID_STEP';
  END IF;

  INSERT INTO "ParticipantReadyStep" ("participantId", step)
  VALUES (person_id, p_step)
  ON CONFLICT DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.participant_ready_steps(p_token TEXT)
RETURNS JSON
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

  RETURN COALESCE((
    SELECT json_agg(s.step ORDER BY s.step)
    FROM "ParticipantReadyStep" s
    WHERE s."participantId" = person_id
  ), '[]'::json);
END;
$$;

REVOKE ALL ON FUNCTION public.participant_mark_ready_step(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.participant_mark_ready_step(TEXT, TEXT) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.participant_ready_steps(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.participant_ready_steps(TEXT) TO anon, authenticated;
