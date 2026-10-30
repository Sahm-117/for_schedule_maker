-- Discussions this week, per group (FLOW_MAP rule 120).
--
-- admin_discussion_summary also returns byGroup: { groupId: posts and replies since Monday (Lagos) }. The dashboard's
-- "Discussions this week" line links to Groups filtered to the groups that posted, and each group card shows its
-- count. Same week, same counting and same admin check as before; the existing fields are unchanged.
--
-- Rollback: re-apply admin_discussion_summary without the byGroup line.

CREATE OR REPLACE FUNCTION public.admin_discussion_summary(p_cohort_id uuid)
 RETURNS json
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
      -- Posts and replies this week per group, so the Groups page can say which groups are talking.
      'byGroup', COALESCE((SELECT json_object_agg("groupId", n) FROM (SELECT "groupId", count(*) AS n FROM msgs WHERE "createdAt" >= v_week_start GROUP BY "groupId") t), '{}'::json),
      'openReports', (
        SELECT count(DISTINCT rp."postId")
        FROM public."GroupPostReport" rp JOIN public."GroupPost" gp ON gp.id = rp."postId" JOIN grp ON grp.id = gp."groupId"
        WHERE rp."resolvedAt" IS NULL AND gp."removedAt" IS NULL AND gp."deletedAt" IS NULL
      )
    )
  );
END;
$function$;
