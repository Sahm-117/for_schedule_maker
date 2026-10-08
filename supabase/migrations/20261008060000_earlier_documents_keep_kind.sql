-- The same file can be a teen recap in one week and an adult recap or manual in another.
-- De-duplicate per kind so each use keeps its own label in "Choose earlier file", instead
-- of one kind winning at random. Live definition with only the two DISTINCT/ORDER lines changed.
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
      SELECT DISTINCT ON (docs.url, docs.name, docs.kind)
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
      ORDER BY docs.url, docs.name, docs.kind, docs."sortDate" DESC
    ) d
  ), '[]'::json);
END;
$function$;
