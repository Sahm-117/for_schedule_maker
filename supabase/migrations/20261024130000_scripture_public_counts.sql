-- All-time Like, Download and Share totals per Inspirational Scripture post, for participants and supports.
-- Shown as social proof next to the three icons. Counts only: no names, no cohort split.
-- Same rules as the admin totals (FLOW_MAP rule 58): likes count people, downloads and shares count every time,
-- and practice cohorts and test accounts are left out. Only posts with at least one count are returned.
-- Any valid participant or staff session may read it.
--
-- Rollback: DROP FUNCTION public.scripture_public_counts(TEXT);

CREATE OR REPLACE FUNCTION public.scripture_public_counts(p_token TEXT)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  pid UUID := public.app_participant_id(p_token);
  staff "User" := public.app_staff(p_token);
BEGIN
  IF pid IS NULL AND staff.id IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  RETURN COALESCE((
    SELECT json_agg(json_build_object(
      'dayNumber', s."dayNumber", 'likes', c.likes, 'downloads', c.downloads, 'shares', c.shares
    ) ORDER BY s."dayNumber")
    FROM (
      SELECT e."scriptureId",
             COUNT(*) FILTER (WHERE e.action = 'LIKE') AS likes,
             COUNT(*) FILTER (WHERE e.action = 'DOWNLOAD') AS downloads,
             COUNT(*) FILTER (WHERE e.action = 'SHARE') AS shares
      FROM "ScriptureEngagement" e
      LEFT JOIN "Participant" p ON e."actorKind" = 'PARTICIPANT' AND p.id = e."actorId"
      LEFT JOIN "Cohort" pc ON pc.id = p."cohortId"
      LEFT JOIN "User" u ON e."actorKind" = 'USER' AND u.id = e."actorId"
      WHERE (e."actorKind" = 'PARTICIPANT' AND COALESCE(p."isTest", FALSE) = FALSE AND COALESCE(pc."isPractice", FALSE) = FALSE)
         OR (e."actorKind" = 'USER' AND COALESCE(u."isTest", FALSE) = FALSE)
      GROUP BY e."scriptureId"
    ) c
    JOIN "Scripture" s ON s.id = c."scriptureId"
  ), '[]'::JSON);
END;
$$;

GRANT EXECUTE ON FUNCTION public.scripture_public_counts(TEXT) TO anon, authenticated;
