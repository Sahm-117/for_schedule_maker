-- Teen recap goes only to Teen Supports (and admins, who write it): support_recaps hides
-- the Teen keys, and weeks that only have Teen content, from every other support.
-- Live definition with the teen keys gated by v_teen_ok.
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
  v_teen_ok BOOLEAN;
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
  -- The Teen recap is for Teen Supports (and admins who write it) only.
  v_teen_ok := v_is_admin OR EXISTS (
    SELECT 1 FROM "SupportTagMember" m JOIN "SupportTag" t ON t.id = m."tagId"
    WHERE t."systemKey" = 'TEEN_SUPPORT' AND m."userId" = v_actor_id
  );

  RETURN COALESCE((
    SELECT json_agg(json_build_object(
      'weekId', w.id,
      'weekNumber', w."weekNumber",
      'classDate', public.week_class_date(cohort."startDate", w."weekNumber", w."classDate"),
      'title', w.title,
      'released', (rel.released OR cohort."isPractice"),
      'releasedAt', rel."releasedAt",
      'recapSummary', CASE WHEN rel.released OR v_is_admin OR cohort."isPractice" THEN w."recapSummary" END,
      'discussionPrompt', CASE WHEN rel.released OR v_is_admin OR cohort."isPractice" THEN w."discussionPrompt" END,
      'recapDocumentUrl', CASE WHEN rel.released OR v_is_admin OR cohort."isPractice" THEN w."recapDocumentUrl" END,
      'recapDocumentName', CASE WHEN rel.released OR v_is_admin OR cohort."isPractice" THEN w."recapDocumentName" END,
      'manual', CASE WHEN (manual_rel.released OR cohort."isPractice") AND w."manualDocumentUrl" IS NOT NULL THEN json_build_object(
        'documentUrl', w."manualDocumentUrl", 'documentName', w."manualDocumentName",
        'summary', w."manualSummary", 'discussionPrompt', w."manualDiscussionPrompt"
      ) END,
      'hasTeenRecap', (v_teen_ok AND (w."teenRecapDocumentUrl" IS NOT NULL OR btrim(COALESCE(w."teenRecapSummary", '')) <> '' OR btrim(COALESCE(w."teenDiscussionPrompt", '')) <> '')),
      'teenRecapReleased', (v_teen_ok AND teen_rel.released),
      'teenRecapReleaseAt', CASE WHEN v_teen_ok THEN w."teenRecapReleaseAt" END,
      'teenRecap', CASE WHEN v_teen_ok AND (teen_rel.released OR v_is_admin) AND (w."teenRecapDocumentUrl" IS NOT NULL OR btrim(COALESCE(w."teenRecapSummary", '')) <> '' OR btrim(COALESCE(w."teenDiscussionPrompt", '')) <> '') THEN json_build_object(
        'documentUrl', w."teenRecapDocumentUrl", 'documentName', w."teenRecapDocumentName",
        'summary', w."teenRecapSummary", 'discussionPrompt', w."teenDiscussionPrompt"
      ) END,
      'manualReleased', (manual_rel.released OR cohort."isPractice"),
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
      SELECT (w."teenRecapReleaseAt" IS NULL OR NOW() >= w."teenRecapReleaseAt" OR cohort."isPractice") AS released
    ) teen_rel
    CROSS JOIN LATERAL (
      SELECT
        COALESCE(w."manualReleasedEarlyAt" IS NOT NULL OR NOW() >= public.recap_release_at(public.week_class_date(cohort."startDate", w."weekNumber", w."classDate"), 'manual'), FALSE) AS released,
        COALESCE(w."manualReleasedEarlyAt", public.recap_release_at(public.week_class_date(cohort."startDate", w."weekNumber", w."classDate"), 'manual')) AS "releasedAt"
    ) manual_rel
    WHERE w."cohortId" = p_cohort_id
      AND (
        btrim(COALESCE(w."recapSummary", '')) <> '' OR w."recapDocumentUrl" IS NOT NULL
        OR w."manualDocumentUrl" IS NOT NULL
        OR (v_teen_ok AND (w."teenRecapDocumentUrl" IS NOT NULL
          OR btrim(COALESCE(w."teenRecapSummary", '')) <> '' OR btrim(COALESCE(w."teenDiscussionPrompt", '')) <> ''))
      )
  ), '[]'::json);
END;
$function$;
