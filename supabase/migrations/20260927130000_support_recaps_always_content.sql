-- Hub meetings: supports always see each week's recap content (summary,
-- discussion prompt, document) in the hub meeting's Review & Recap step,
-- whether or not the support release time has passed.
--
-- support_recaps (latest: 20260925060000_recap_release_times.sql)
-- CREATE OR REPLACE'd verbatim, except the recap fields are no longer
-- nulled out before release. 'released' / 'releasedAt' are unchanged, so the
-- support Recaps page still shows its "Not out yet / Arrives ..." timing.
-- Participant release times are untouched.
CREATE OR REPLACE FUNCTION public.support_recaps(p_cohort_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  cohort "Cohort";
BEGIN
  IF NOT public.app_is_staff() THEN
    RAISE EXCEPTION 'You must be signed in as a support or admin';
  END IF;

  SELECT * INTO cohort FROM "Cohort" WHERE id = p_cohort_id;
  IF cohort.id IS NULL THEN
    RAISE EXCEPTION 'Cohort was not found';
  END IF;

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
      'recapDocumentName', w."recapDocumentName"
    ) ORDER BY w."weekNumber" DESC)
    FROM "Week" w
    CROSS JOIN LATERAL (
      SELECT
        NOW() >= public.recap_release_at(cohort."startDate", w."weekNumber", 'support') AS released,
        public.recap_release_at(cohort."startDate", w."weekNumber", 'support') AS "releasedAt"
    ) rel
    WHERE w."cohortId" = p_cohort_id
      AND (btrim(COALESCE(w."recapSummary", '')) <> '' OR w."recapDocumentUrl" IS NOT NULL)
  ), '[]'::json);
END;
$function$;

