-- Teen recap: Teens get their own recap (written and/or an uploaded document),
-- separate from the adult one. Admin writes or uploads it per week; an optional
-- release time holds it back (empty = visible as soon as it exists). Hidden from
-- non-admins until released, same as the adult recap. Teen documents also show in
-- the "choose an earlier file" picker. support_recaps is the LIVE definition plus
-- the teen keys only.
ALTER TABLE public."Week"
  ADD COLUMN IF NOT EXISTS "teenRecapSummary" text,
  ADD COLUMN IF NOT EXISTS "teenDiscussionPrompt" text,
  ADD COLUMN IF NOT EXISTS "teenRecapDocumentUrl" text,
  ADD COLUMN IF NOT EXISTS "teenRecapDocumentName" text,
  ADD COLUMN IF NOT EXISTS "teenRecapReleaseAt" timestamptz;

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
      'hasTeenRecap', (w."teenRecapDocumentUrl" IS NOT NULL OR btrim(COALESCE(w."teenRecapSummary", '')) <> '' OR btrim(COALESCE(w."teenDiscussionPrompt", '')) <> ''),
      'teenRecapReleased', teen_rel.released,
      'teenRecapReleaseAt', w."teenRecapReleaseAt",
      'teenRecap', CASE WHEN (teen_rel.released OR v_is_admin) AND (w."teenRecapDocumentUrl" IS NOT NULL OR btrim(COALESCE(w."teenRecapSummary", '')) <> '' OR btrim(COALESCE(w."teenDiscussionPrompt", '')) <> '') THEN json_build_object(
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
        OR w."teenRecapDocumentUrl" IS NOT NULL
        OR btrim(COALESCE(w."teenRecapSummary", '')) <> '' OR btrim(COALESCE(w."teenDiscussionPrompt", '')) <> ''
      )
  ), '[]'::json);
END;
$function$;
CREATE OR REPLACE FUNCTION public.list_earlier_class_documents(p_exclude_cohort_id uuid DEFAULT NULL::uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
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
        SELECT w."teenRecapDocumentUrl", w."teenRecapDocumentName", 'TEEN_RECAP',
          c.name, w."weekNumber", c."startDate", c.id
        FROM public."Week" w JOIN public."Cohort" c ON c.id = w."cohortId"
        WHERE w."teenRecapDocumentUrl" IS NOT NULL
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