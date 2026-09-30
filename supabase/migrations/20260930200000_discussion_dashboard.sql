-- Admin Dashboard: one Group Discussion line for the active cohort.
--
-- "Discussions this week: N posts & replies · in X of Y groups · R reports waiting".
-- This week = since Monday 00:00 Lagos time (same as group_discussion_activity).
-- Removed and deleted posts don't count. Admins only; read-only.
--
-- Rollback: DROP FUNCTION public.admin_discussion_summary(UUID).

CREATE OR REPLACE FUNCTION public.admin_discussion_summary(p_cohort_id UUID)
 RETURNS JSON
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_week_start TIMESTAMPTZ := date_trunc('week', NOW() AT TIME ZONE 'Africa/Lagos') AT TIME ZONE 'Africa/Lagos';
BEGIN
  IF NOT public.app_is_admin() THEN
    RAISE EXCEPTION 'Only admins can see this';
  END IF;

  RETURN (
    WITH grp AS (
      SELECT id FROM public."Group" WHERE "cohortId" = p_cohort_id AND "archivedAt" IS NULL
    ), msgs AS (
      SELECT gp."groupId", gp."createdAt"
      FROM public."GroupPost" gp JOIN grp ON grp.id = gp."groupId"
      WHERE gp."removedAt" IS NULL AND gp."deletedAt" IS NULL
      UNION ALL
      SELECT gp."groupId", r."createdAt"
      FROM public."GroupPostReply" r JOIN public."GroupPost" gp ON gp.id = r."postId" JOIN grp ON grp.id = gp."groupId"
      WHERE r."removedAt" IS NULL AND r."deletedAt" IS NULL AND gp."removedAt" IS NULL AND gp."deletedAt" IS NULL
    )
    SELECT json_build_object(
      'groups', (SELECT count(*) FROM grp),
      'postsAndReplies', (SELECT count(*) FROM msgs WHERE "createdAt" >= v_week_start),
      'activeGroups', (SELECT count(DISTINCT "groupId") FROM msgs WHERE "createdAt" >= v_week_start),
      'openReports', (
        SELECT count(DISTINCT rp."postId")
        FROM public."GroupPostReport" rp JOIN public."GroupPost" gp ON gp.id = rp."postId" JOIN grp ON grp.id = gp."groupId"
        WHERE rp."resolvedAt" IS NULL AND gp."removedAt" IS NULL AND gp."deletedAt" IS NULL
      )
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_discussion_summary(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_discussion_summary(UUID) TO anon, authenticated;
