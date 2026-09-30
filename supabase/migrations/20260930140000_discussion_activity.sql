-- Group Discussion: "Discussion this week" report for the group view (hub
-- leads with "See groups", admins, and the group's own support).
--
-- This week = since Monday 00:00 Lagos time. Active = posted, replied or liked
-- this week. Quiet = no post, reply or like in the last 14 days (active
-- participants in the group only). Removed and deleted posts don't count.
-- Read-only; uses discussion_staff_access from 20260930120000.
--
-- Rollback: DROP FUNCTION public.group_discussion_activity(UUID).

CREATE OR REPLACE FUNCTION public.group_discussion_activity(p_group_id UUID)
 RETURNS JSON
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_week_start TIMESTAMPTZ := date_trunc('week', NOW() AT TIME ZONE 'Africa/Lagos') AT TIME ZONE 'Africa/Lagos';
  v_quiet_since TIMESTAMPTZ := NOW() - INTERVAL '14 days';
BEGIN
  IF public.discussion_staff_access(p_group_id) IS NULL THEN
    RAISE EXCEPTION 'You can''t see this group''s discussion';
  END IF;

  RETURN (
    WITH members AS (
      SELECT p.id, p."fullName"
      FROM public."GroupParticipant" gp
      JOIN public."Participant" p ON p.id = gp."participantId" AND p.status = 'ACTIVE'
      WHERE gp."groupId" = p_group_id
    ), acts AS (
      -- Every post, reply and like by a participant in this group, with its time.
      SELECT gp."authorParticipantId" AS pid, gp."createdAt" AS at, TRUE AS wrote
      FROM public."GroupPost" gp
      WHERE gp."groupId" = p_group_id AND gp."authorParticipantId" IS NOT NULL
        AND gp."removedAt" IS NULL AND gp."deletedAt" IS NULL
      UNION ALL
      SELECT r."authorParticipantId", r."createdAt", TRUE
      FROM public."GroupPostReply" r JOIN public."GroupPost" gp ON gp.id = r."postId"
      WHERE gp."groupId" = p_group_id AND r."authorParticipantId" IS NOT NULL
        AND r."removedAt" IS NULL AND r."deletedAt" IS NULL
      UNION ALL
      SELECT l."participantId", l."createdAt", FALSE
      FROM public."GroupPostLike" l JOIN public."GroupPost" gp ON gp.id = l."postId"
      WHERE gp."groupId" = p_group_id AND l."participantId" IS NOT NULL
    ), per AS (
      SELECT m.id, m."fullName",
        count(*) FILTER (WHERE a.wrote AND a.at >= v_week_start) AS wrote_week,
        count(*) FILTER (WHERE a.at >= v_week_start) AS any_week,
        count(*) FILTER (WHERE a.at >= v_quiet_since) AS any_recent
      FROM members m LEFT JOIN acts a ON a.pid = m.id
      GROUP BY m.id, m."fullName"
    ), latest AS (
      SELECT gp.body, gp."createdAt"
      FROM public."GroupPost" gp
      WHERE gp."groupId" = p_group_id AND gp."removedAt" IS NULL AND gp."deletedAt" IS NULL
      ORDER BY gp."createdAt" DESC
      LIMIT 1
    )
    SELECT json_build_object(
      'weekStart', v_week_start,
      'postsAndReplies', (
        (SELECT count(*) FROM public."GroupPost" gp
          WHERE gp."groupId" = p_group_id AND gp."removedAt" IS NULL AND gp."deletedAt" IS NULL AND gp."createdAt" >= v_week_start)
        + (SELECT count(*) FROM public."GroupPostReply" r JOIN public."GroupPost" gp ON gp.id = r."postId"
          WHERE gp."groupId" = p_group_id AND r."removedAt" IS NULL AND r."deletedAt" IS NULL AND r."createdAt" >= v_week_start)
      ),
      'members', (SELECT count(*) FROM per),
      'active', (SELECT count(*) FROM per WHERE any_week > 0),
      'quiet', (SELECT count(*) FROM per WHERE any_recent = 0),
      'mostActive', COALESCE((
        SELECT json_agg(x."fullName" ORDER BY x.wrote_week DESC, x."fullName")
        FROM (SELECT "fullName", wrote_week FROM per WHERE wrote_week > 0 ORDER BY wrote_week DESC, "fullName" LIMIT 3) x
      ), '[]'::json),
      'goneQuiet', COALESCE((
        SELECT json_agg(x."fullName" ORDER BY x."fullName")
        FROM (SELECT "fullName" FROM per WHERE any_recent = 0 ORDER BY "fullName" LIMIT 8) x
      ), '[]'::json),
      'latest', (SELECT json_build_object('body', left(body, 80), 'createdAt', "createdAt") FROM latest)
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.group_discussion_activity(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.group_discussion_activity(UUID) TO anon, authenticated;
