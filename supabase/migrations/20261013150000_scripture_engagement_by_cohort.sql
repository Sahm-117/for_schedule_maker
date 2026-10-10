-- The admin totals for the Scripture posts can be narrowed to one cohort.
-- A participant counts for the cohort they are in; a support counts for each cohort they are attached to.
-- This replaces the one-argument function from 20261013140000 (a second version beside it would make the call ambiguous).
DROP FUNCTION IF EXISTS public.scripture_engagement_summary(TEXT);

CREATE OR REPLACE FUNCTION public.scripture_engagement_summary(p_token TEXT, p_cohort_id UUID DEFAULT NULL)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  staff "User" := public.app_staff(p_token);
BEGIN
  IF staff.id IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  IF staff.role <> 'ADMIN' THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  RETURN COALESCE((
    SELECT json_agg(json_build_object(
      'dayNumber', s."dayNumber",
      'likes', COALESCE(c.likes, 0), 'downloads', COALESCE(c.downloads, 0), 'shares', COALESCE(c.shares, 0)
    ) ORDER BY s."dayNumber")
    FROM "Scripture" s
    LEFT JOIN (
      SELECT e."scriptureId",
             COUNT(*) FILTER (WHERE e.action = 'LIKE') AS likes,
             COUNT(*) FILTER (WHERE e.action = 'DOWNLOAD') AS downloads,
             COUNT(*) FILTER (WHERE e.action = 'SHARE') AS shares
      FROM "ScriptureEngagement" e
      LEFT JOIN "Participant" p ON e."actorKind" = 'PARTICIPANT' AND p.id = e."actorId"
      LEFT JOIN "Cohort" pc ON pc.id = p."cohortId"
      LEFT JOIN "User" u ON e."actorKind" = 'USER' AND u.id = e."actorId"
      WHERE (
              (e."actorKind" = 'PARTICIPANT' AND COALESCE(p."isTest", FALSE) = FALSE AND COALESCE(pc."isPractice", FALSE) = FALSE
                AND (p_cohort_id IS NULL OR p."cohortId" = p_cohort_id))
           OR (e."actorKind" = 'USER' AND COALESCE(u."isTest", FALSE) = FALSE
                AND (p_cohort_id IS NULL OR EXISTS (SELECT 1 FROM "UserCohort" uc WHERE uc."userId" = u.id AND uc."cohortId" = p_cohort_id)))
            )
      GROUP BY e."scriptureId"
    ) c ON c."scriptureId" = s.id
  ), '[]'::JSON);
END;
$$;

GRANT EXECUTE ON FUNCTION public.scripture_engagement_summary(TEXT, UUID) TO anon, authenticated;
