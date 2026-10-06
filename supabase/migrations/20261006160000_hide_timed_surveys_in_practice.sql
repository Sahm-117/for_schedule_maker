-- The practice cohort has no real dates, so a timed survey (wrap-up, mid, end) used to count as
-- "always open" there and showed up on a practice participant's Home. Timed surveys now stay
-- out of the practice cohort. Surveys with fixed open/close dates are unchanged.
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
  IF COALESCE(c."isPractice", FALSE) AND s."timingMode" IN ('WEEKS_BEFORE_END', 'WEEKS_AFTER_START') THEN RETURN FALSE; END IF;
  IF s.scope = 'COHORT' AND s."cohortId" IS DISTINCT FROM person."cohortId" THEN RETURN FALSE; END IF;
  IF s."targetGroupId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "GroupParticipant" gp WHERE gp."groupId" = s."targetGroupId" AND gp."participantId" = person.id
  ) THEN RETURN FALSE; END IF;
  SELECT * INTO w FROM public.survey_window(s, c."startDate", c."endDate", COALESCE(c."isPractice", FALSE));
  RETURN NOW() >= COALESCE(w.opens, '-infinity'::TIMESTAMPTZ) AND NOW() < COALESCE(w.closes, 'infinity'::TIMESTAMPTZ);
END;
$$;
