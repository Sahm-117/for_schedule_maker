-- Discussions this week (admin Dashboard line): leave Teen Support groups out. Teen groups have no
-- in-app discussion (they talk on WhatsApp), so counting them made "in 0 of N groups" read too low.
-- Only the group filter changes; body taken from the live definition.
-- Rollback: re-run 20260930200000_discussion_dashboard.sql.

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
      SELECT id FROM public."Group" WHERE "cohortId" = p_cohort_id AND "archivedAt" IS NULL AND "isTeenGroup" IS NOT TRUE
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
