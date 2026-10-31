-- Who still owes an answer to an open survey, for the morning reminders (daily-checks, owner request 2026-10-31).
-- One row per survey and running cohort, from two days after the survey opened for that cohort until it closes:
-- the participants it is open for (survey_open_for_participant, the same rule as their Home card) and the supports
-- it is open for (survey_open_for_staff) who have not submitted. Test people, Practice and finished wrap-ups are left
-- out, as survey_pending does. Service role only.
-- Rollback: DROP FUNCTION public.survey_reminders_due();

CREATE OR REPLACE FUNCTION public.survey_reminders_due()
 RETURNS TABLE ("surveyId" UUID, "cohortId" UUID, title TEXT, "participantIds" UUID[], "userIds" UUID[])
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT s.id, c.id, COALESCE(s."homeHeading", s.title),
    ARRAY(
      SELECT p.id FROM "Participant" p
      WHERE p."cohortId" = c.id AND p.status = 'ACTIVE' AND p."isTest" IS NOT TRUE
        AND public.survey_open_for_participant(s, p, c)
        AND NOT EXISTS (SELECT 1 FROM "SurveySubmission" x WHERE x."surveyId" = s.id AND x."respondentKey" = 'p:' || p.id::TEXT)
        AND NOT (s."builtinKey" = 'WRAPUP' AND EXISTS (
          SELECT 1 FROM "ParticipantWrapUp" wu WHERE wu."participantId" = p.id AND wu."cohortId" = p."cohortId"))
    ),
    ARRAY(
      SELECT u.id FROM "User" u
      WHERE s.audience IN ('SUPPORTS', 'EVERYONE')
        AND u."isActive" IS NOT FALSE AND COALESCE(u."isTest", FALSE) = FALSE
        AND EXISTS (SELECT 1 FROM "UserCohort" uc WHERE uc."userId" = u.id AND uc."cohortId" = c.id)
        AND public.survey_open_for_staff(s, u.id)
        AND NOT EXISTS (SELECT 1 FROM "SurveySubmission" x WHERE x."surveyId" = s.id AND x."respondentKey" = 'u:' || u.id::TEXT)
    )
  FROM "Survey" s
  JOIN "Cohort" c ON c.status = 'ACTIVE' AND COALESCE(c."isPractice", FALSE) = FALSE
    AND (s.scope <> 'COHORT' OR s."cohortId" = c.id)
  CROSS JOIN LATERAL public.survey_window(s, c."startDate", c."endDate", FALSE) w
  WHERE s.enabled AND s.status = 'PUBLISHED'
    AND w.opens IS NOT NULL AND NOW() >= w.opens + INTERVAL '2 days'
    AND NOW() < COALESCE(w.closes, 'infinity'::TIMESTAMPTZ);
$function$;

REVOKE ALL ON FUNCTION public.survey_reminders_due() FROM PUBLIC, anon, authenticated;
