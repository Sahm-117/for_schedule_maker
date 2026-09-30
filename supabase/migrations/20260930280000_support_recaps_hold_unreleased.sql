-- support_recaps used to send every week's recap (summary, prompt, document link)
-- to any signed-in support, with only the screen hiding it until release time.
-- Now the database holds it back too, as it already does for the class manual.
-- Admins still see everything (they preview and send recaps). Based on the live
-- body; only the four recap fields below changed.
CREATE OR REPLACE FUNCTION public.support_recaps(p_cohort_id uuid)
 RETURNS json
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
      'classDate', public.week_class_date(cohort."startDate", w."weekNumber", w."classDate"),
      'title', w.title,
      'released', rel.released,
      'releasedAt', rel."releasedAt",
      'recapSummary', CASE WHEN rel.released OR v_is_admin THEN w."recapSummary" END,
      'discussionPrompt', CASE WHEN rel.released OR v_is_admin THEN w."discussionPrompt" END,
      'recapDocumentUrl', CASE WHEN rel.released OR v_is_admin THEN w."recapDocumentUrl" END,
      'recapDocumentName', CASE WHEN rel.released OR v_is_admin THEN w."recapDocumentName" END,
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
        NOW() >= public.recap_release_at(public.week_class_date(cohort."startDate", w."weekNumber", w."classDate"), 'support') AS released,
        public.recap_release_at(public.week_class_date(cohort."startDate", w."weekNumber", w."classDate"), 'support') AS "releasedAt"
    ) rel
    CROSS JOIN LATERAL (
      SELECT
        COALESCE(w."manualReleasedEarlyAt" IS NOT NULL OR NOW() >= public.recap_release_at(public.week_class_date(cohort."startDate", w."weekNumber", w."classDate"), 'manual'), FALSE) AS released,
        COALESCE(w."manualReleasedEarlyAt", public.recap_release_at(public.week_class_date(cohort."startDate", w."weekNumber", w."classDate"), 'manual')) AS "releasedAt"
    ) manual_rel
    WHERE w."cohortId" = p_cohort_id
      AND (
        btrim(COALESCE(w."recapSummary", '')) <> '' OR w."recapDocumentUrl" IS NOT NULL
        OR w."manualDocumentUrl" IS NOT NULL
      )
  ), '[]'::json);
END;
$function$;
