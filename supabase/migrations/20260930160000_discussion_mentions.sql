-- Group Discussion: @ tagging in posts and replies.
--
-- The app sends the people tagged in a post or reply as p_mentions, a JSON
-- list of {"kind": "SUPPORT" | "PARTICIPANT", "id": <uuid>}. The server keeps only
-- people in that group (the group's support and its active participants),
-- without duplicates, at most 20, and stores them in "mentions". Feeds return
-- each post's and reply's mentions with current names, plus the group's
-- "members" for the @ picker, and each author's id (so swiping a post or
-- reply can tag its author). Alerts to tagged people come with the
-- discussion alerts step.
--
-- The four post/reply functions gain a p_mentions parameter, so their old
-- signatures are dropped first (they were only used by unreleased screens).
--
-- Rollback: DROP the new signatures and recreate those from
-- 20260930120000_group_discussion.sql; DROP FUNCTION discussion_clean_mentions,
-- discussion_mentions_json; ALTER TABLE ... DROP COLUMN mentions.

ALTER TABLE public."GroupPost" ADD COLUMN IF NOT EXISTS mentions JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public."GroupPostReply" ADD COLUMN IF NOT EXISTS mentions JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Keep only valid, in-group people from the app's list.
CREATE OR REPLACE FUNCTION public.discussion_clean_mentions(p_group_id UUID, p_mentions JSONB)
 RETURNS JSONB
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('kind', kind, 'id', id)), '[]'::jsonb)
  FROM (
    SELECT DISTINCT m->>'kind' AS kind, (m->>'id')::uuid AS id
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_mentions) = 'array' THEN p_mentions ELSE '[]'::jsonb END) m
    WHERE m->>'id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND (
        (m->>'kind' = 'SUPPORT' AND EXISTS (
          SELECT 1 FROM public."Group" g WHERE g.id = p_group_id AND g."supportId" = (m->>'id')::uuid))
        OR (m->>'kind' = 'PARTICIPANT' AND EXISTS (
          SELECT 1 FROM public."GroupParticipant" gp JOIN public."Participant" p ON p.id = gp."participantId" AND p.status = 'ACTIVE'
          WHERE gp."groupId" = p_group_id AND gp."participantId" = (m->>'id')::uuid))
      )
    LIMIT 20
  ) v;
$function$;

-- Stored mentions with current names, for the feed.
CREATE OR REPLACE FUNCTION public.discussion_mentions_json(p_mentions JSONB)
 RETURNS JSON
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT COALESCE(json_agg(json_build_object('kind', m->>'kind', 'id', m->>'id', 'name', COALESCE(u.name, p."fullName"))), '[]'::json)
  FROM jsonb_array_elements(COALESCE(p_mentions, '[]'::jsonb)) m
  LEFT JOIN public."User" u ON m->>'kind' = 'SUPPORT' AND u.id = (m->>'id')::uuid
  LEFT JOIN public."Participant" p ON m->>'kind' = 'PARTICIPANT' AND p.id = (m->>'id')::uuid
  WHERE COALESCE(u.name, p."fullName") IS NOT NULL;
$function$;

REVOKE ALL ON FUNCTION public.discussion_clean_mentions(UUID, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.discussion_mentions_json(JSONB) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.discussion_post_json(
  p_post_id UUID, p_mod BOOLEAN, p_user_id UUID, p_participant_id UUID
)
 RETURNS JSON
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT json_build_object(
    'id', gp.id,
    'author', json_build_object(
      'kind', CASE WHEN gp."authorUserId" IS NOT NULL THEN 'SUPPORT' ELSE 'PARTICIPANT' END,
      'id', COALESCE(gp."authorUserId", gp."authorParticipantId"),
      'name', COALESCE(u.name, p."fullName"),
      'avatarUrl', COALESCE(u."avatarUrl", p."avatarUrl")
    ),
    'isMine', (gp."authorUserId" = p_user_id OR gp."authorParticipantId" = p_participant_id),
    'removed', gp."removedAt" IS NOT NULL,
    'body', CASE WHEN gp."removedAt" IS NULL OR p_mod THEN gp.body END,
    'pinned', gp."pinnedAt" IS NOT NULL AND gp."removedAt" IS NULL,
    'pinnedByName', (SELECT pu.name FROM public."User" pu WHERE pu.id = gp."pinnedById" AND gp."pinnedAt" IS NOT NULL),
    'createdAt', gp."createdAt",
    'mentions', public.discussion_mentions_json(gp.mentions),
    'likeCount', (SELECT count(*) FROM public."GroupPostLike" l WHERE l."postId" = gp.id),
    'likedByMe', EXISTS (
      SELECT 1 FROM public."GroupPostLike" l
      WHERE l."postId" = gp.id AND (l."userId" = p_user_id OR l."participantId" = p_participant_id)
    ),
    'reportCount', CASE WHEN p_mod THEN (
      SELECT count(*) FROM public."GroupPostReport" rp WHERE rp."postId" = gp.id AND rp."resolvedAt" IS NULL
    ) ELSE 0 END,
    'replies', COALESCE((
      SELECT json_agg(json_build_object(
        'id', r.id,
        'author', json_build_object(
          'kind', CASE WHEN r."authorUserId" IS NOT NULL THEN 'SUPPORT' ELSE 'PARTICIPANT' END,
          'id', COALESCE(r."authorUserId", r."authorParticipantId"),
          'name', COALESCE(ru.name, rpp."fullName"),
          'avatarUrl', COALESCE(ru."avatarUrl", rpp."avatarUrl")
        ),
        'isMine', (r."authorUserId" = p_user_id OR r."authorParticipantId" = p_participant_id),
        'removed', r."removedAt" IS NOT NULL,
        'body', CASE WHEN r."removedAt" IS NULL OR p_mod THEN r.body END,
        'createdAt', r."createdAt",
        'mentions', public.discussion_mentions_json(r.mentions)
      ) ORDER BY r."createdAt")
      FROM public."GroupPostReply" r
      LEFT JOIN public."User" ru ON ru.id = r."authorUserId"
      LEFT JOIN public."Participant" rpp ON rpp.id = r."authorParticipantId"
      WHERE r."postId" = gp.id AND r."deletedAt" IS NULL
        AND (gp."removedAt" IS NULL OR p_mod)
    ), '[]'::json)
  )
  FROM public."GroupPost" gp
  LEFT JOIN public."User" u ON u.id = gp."authorUserId"
  LEFT JOIN public."Participant" p ON p.id = gp."authorParticipantId"
  WHERE gp.id = p_post_id;
$function$;

CREATE OR REPLACE FUNCTION public.build_discussion_feed(
  p_group_id UUID, p_access TEXT, p_user_id UUID, p_participant_id UUID,
  p_before TIMESTAMPTZ, p_limit INTEGER
)
 RETURNS JSON
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_mod BOOLEAN := p_access IN ('SUPPORT', 'ADMIN');
  v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 30), 1), 100);
  v_group public."Group";
  v_support public."User";
  v_posts JSON;
  v_pinned JSON;
  v_more BOOLEAN;
BEGIN
  SELECT * INTO v_group FROM public."Group" WHERE id = p_group_id;
  SELECT * INTO v_support FROM public."User" WHERE id = v_group."supportId";

  WITH cand AS (
    SELECT gp.id
    FROM public."GroupPost" gp
    WHERE gp."groupId" = p_group_id
      AND gp."deletedAt" IS NULL
      AND (gp."pinnedAt" IS NULL OR gp."removedAt" IS NOT NULL)
      AND (p_before IS NULL OR gp."createdAt" < p_before)
    ORDER BY gp."createdAt" DESC
    LIMIT v_limit + 1
  )
  SELECT count(*) > v_limit INTO v_more FROM cand;

  WITH page AS (
    SELECT gp.id, gp."createdAt"
    FROM public."GroupPost" gp
    WHERE gp."groupId" = p_group_id
      AND gp."deletedAt" IS NULL
      AND (gp."pinnedAt" IS NULL OR gp."removedAt" IS NOT NULL)
      AND (p_before IS NULL OR gp."createdAt" < p_before)
    ORDER BY gp."createdAt" DESC
    LIMIT v_limit
  ), shaped AS (
    SELECT page."createdAt", public.discussion_post_json(page.id, v_mod, p_user_id, p_participant_id) AS j
    FROM page
  )
  SELECT COALESCE(json_agg(j ORDER BY "createdAt" DESC), '[]'::json) INTO v_posts FROM shaped;

  IF p_before IS NULL THEN
    SELECT public.discussion_post_json(gp.id, v_mod, p_user_id, p_participant_id) INTO v_pinned
    FROM public."GroupPost" gp
    WHERE gp."groupId" = p_group_id AND gp."pinnedAt" IS NOT NULL
      AND gp."removedAt" IS NULL AND gp."deletedAt" IS NULL
    ORDER BY gp."pinnedAt" DESC
    LIMIT 1;
  END IF;

  RETURN json_build_object(
    'groupId', v_group.id,
    'groupName', v_group.name,
    'supportId', v_support.id,
    'supportName', v_support.name,
    'supportAvatarUrl', v_support."avatarUrl",
    'access', p_access,
    'canPost', p_access IN ('PARTICIPANT', 'SUPPORT'),
    'canModerate', v_mod,
    'members', COALESCE((
      SELECT json_agg(m ORDER BY m->>'kind' DESC, m->>'name') FROM (
        SELECT json_build_object('kind', 'SUPPORT', 'id', v_support.id, 'name', v_support.name, 'avatarUrl', v_support."avatarUrl") AS m
        WHERE v_support.id IS NOT NULL
        UNION ALL
        SELECT json_build_object('kind', 'PARTICIPANT', 'id', p.id, 'name', p."fullName", 'avatarUrl', p."avatarUrl")
        FROM public."GroupParticipant" gp JOIN public."Participant" p ON p.id = gp."participantId" AND p.status = 'ACTIVE'
        WHERE gp."groupId" = p_group_id
      ) x
    ), '[]'::json),
    'pinned', v_pinned,
    'posts', v_posts,
    'hasMore', v_more,
    'openReports', CASE WHEN v_mod THEN COALESCE((
      SELECT json_agg(json_build_object('postId', r."postId", 'count', r.n, 'reasons', r.reasons) ORDER BY r.latest DESC)
      FROM (
        SELECT rp."postId", count(*) AS n, array_agg(DISTINCT rp.reason) AS reasons, max(rp."createdAt") AS latest
        FROM public."GroupPostReport" rp
        JOIN public."GroupPost" gp ON gp.id = rp."postId"
        WHERE gp."groupId" = p_group_id AND rp."resolvedAt" IS NULL
          AND gp."removedAt" IS NULL AND gp."deletedAt" IS NULL
        GROUP BY rp."postId"
      ) r
    ), '[]'::json) ELSE '[]'::json END
  );
END;
$function$;

DROP FUNCTION IF EXISTS public.participant_discussion_post(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.participant_discussion_reply(TEXT, UUID, TEXT);
DROP FUNCTION IF EXISTS public.group_discussion_post(UUID, TEXT);
DROP FUNCTION IF EXISTS public.group_discussion_reply(UUID, TEXT);

CREATE OR REPLACE FUNCTION public.participant_discussion_post(p_token TEXT, p_body TEXT, p_mentions JSONB DEFAULT '[]'::jsonb)
 RETURNS UUID
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_me UUID := public.app_participant_id(p_token);
  v_group UUID;
  v_id UUID;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  v_group := public.discussion_participant_group(v_me);
  IF v_group IS NULL THEN RAISE EXCEPTION 'You are not in a group yet'; END IF;
  INSERT INTO public."GroupPost" ("groupId", "authorParticipantId", body, mentions)
  VALUES (v_group, v_me, public.discussion_clean_body(p_body), public.discussion_clean_mentions(v_group, p_mentions))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.participant_discussion_reply(p_token TEXT, p_post_id UUID, p_body TEXT, p_mentions JSONB DEFAULT '[]'::jsonb)
 RETURNS UUID
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_me UUID := public.app_participant_id(p_token);
  v_id UUID;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  IF NOT public.discussion_live_post(p_post_id, public.discussion_participant_group(v_me)) THEN
    RAISE EXCEPTION 'This post is no longer available';
  END IF;
  INSERT INTO public."GroupPostReply" ("postId", "authorParticipantId", body, mentions)
  VALUES (p_post_id, v_me, public.discussion_clean_body(p_body), public.discussion_clean_mentions(public.discussion_participant_group(v_me), p_mentions))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.group_discussion_post(p_group_id UUID, p_body TEXT, p_mentions JSONB DEFAULT '[]'::jsonb)
 RETURNS UUID
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_id UUID;
BEGIN
  IF public.discussion_staff_access(p_group_id) IS DISTINCT FROM 'SUPPORT' THEN
    RAISE EXCEPTION 'Only this group''s support can post here';
  END IF;
  INSERT INTO public."GroupPost" ("groupId", "authorUserId", body, mentions)
  VALUES (p_group_id, public.app_current_user_id(), public.discussion_clean_body(p_body), public.discussion_clean_mentions(p_group_id, p_mentions))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.group_discussion_reply(p_post_id UUID, p_body TEXT, p_mentions JSONB DEFAULT '[]'::jsonb)
 RETURNS UUID
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_group UUID := (SELECT "groupId" FROM public."GroupPost" WHERE id = p_post_id);
  v_id UUID;
BEGIN
  IF public.discussion_staff_access(v_group) IS DISTINCT FROM 'SUPPORT' THEN
    RAISE EXCEPTION 'Only this group''s support can reply here';
  END IF;
  IF NOT public.discussion_live_post(p_post_id, v_group) THEN RAISE EXCEPTION 'This post is no longer available'; END IF;
  INSERT INTO public."GroupPostReply" ("postId", "authorUserId", body, mentions)
  VALUES (p_post_id, public.app_current_user_id(), public.discussion_clean_body(p_body), public.discussion_clean_mentions(v_group, p_mentions))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.discussion_post_json(UUID, BOOLEAN, UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.build_discussion_feed(UUID, TEXT, UUID, UUID, TIMESTAMPTZ, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.participant_discussion_post(TEXT, TEXT, JSONB) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.participant_discussion_reply(TEXT, UUID, TEXT, JSONB) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.group_discussion_post(UUID, TEXT, JSONB) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.group_discussion_reply(UUID, TEXT, JSONB) TO anon, authenticated;
