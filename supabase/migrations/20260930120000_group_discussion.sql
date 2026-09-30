-- Group Discussion, step 2: tables and access.
--
-- A private discussion per group: the group's support and that group's
-- participants only. Posts (text only), replies, likes, a pinned post, and a
-- subtle "Report post" for participants. The group's support and admins pin,
-- keep or remove. Removed posts show everyone else a neutral placeholder and
-- never say who removed them. Hub leads (and assistants with "See groups")
-- read the discussion of groups in their hub, read-only. Admins see all.
--
-- Nothing is read from these tables directly: RLS is on with no policies and
-- every grant revoked, so all access goes through the SECURITY DEFINER
-- functions below (participants with p_token like participant_home; staff with
-- the session header like get_support_group_view). That is what keeps removed
-- text and reporters hidden.
--
--   participant_discussion_feed / _post / _reply / _like / _delete / _report
--   group_discussion_feed / _post / _reply / _like / _delete / _pin / _moderate
--
-- Private helpers (no grants): discussion_participant_group, discussion_staff_access,
-- build_discussion_feed.
--
-- Rollback: DROP the functions above, then DROP TABLE "GroupPostReport",
-- "GroupPostLike", "GroupPostReply", "GroupPost".

-- 1. Tables -------------------------------------------------------------------
-- Posts and replies default "createdAt" to clock_timestamp() (not NOW()) so
-- rows written in one transaction still get distinct times for paging.

CREATE TABLE IF NOT EXISTS public."GroupPost" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "groupId" UUID NOT NULL REFERENCES public."Group"(id) ON DELETE CASCADE,
  "authorUserId" UUID REFERENCES public."User"(id) ON DELETE CASCADE,
  "authorParticipantId" UUID REFERENCES public."Participant"(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  "pinnedAt" TIMESTAMPTZ,
  "pinnedById" UUID REFERENCES public."User"(id) ON DELETE SET NULL,
  "removedAt" TIMESTAMPTZ,
  "removedById" UUID REFERENCES public."User"(id) ON DELETE SET NULL,
  "deletedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CHECK (num_nonnulls("authorUserId", "authorParticipantId") = 1)
);
CREATE INDEX IF NOT EXISTS "GroupPost_group_created_idx" ON public."GroupPost" ("groupId", "createdAt" DESC);

CREATE TABLE IF NOT EXISTS public."GroupPostReply" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "postId" UUID NOT NULL REFERENCES public."GroupPost"(id) ON DELETE CASCADE,
  "authorUserId" UUID REFERENCES public."User"(id) ON DELETE CASCADE,
  "authorParticipantId" UUID REFERENCES public."Participant"(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  "removedAt" TIMESTAMPTZ,
  "removedById" UUID REFERENCES public."User"(id) ON DELETE SET NULL,
  "deletedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CHECK (num_nonnulls("authorUserId", "authorParticipantId") = 1)
);
CREATE INDEX IF NOT EXISTS "GroupPostReply_post_idx" ON public."GroupPostReply" ("postId", "createdAt");

CREATE TABLE IF NOT EXISTS public."GroupPostLike" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "postId" UUID NOT NULL REFERENCES public."GroupPost"(id) ON DELETE CASCADE,
  "userId" UUID REFERENCES public."User"(id) ON DELETE CASCADE,
  "participantId" UUID REFERENCES public."Participant"(id) ON DELETE CASCADE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (num_nonnulls("userId", "participantId") = 1)
);
CREATE UNIQUE INDEX IF NOT EXISTS "GroupPostLike_user_uq" ON public."GroupPostLike" ("postId", "userId") WHERE "userId" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "GroupPostLike_participant_uq" ON public."GroupPostLike" ("postId", "participantId") WHERE "participantId" IS NOT NULL;

CREATE TABLE IF NOT EXISTS public."GroupPostReport" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "postId" UUID NOT NULL REFERENCES public."GroupPost"(id) ON DELETE CASCADE,
  "reporterParticipantId" UUID NOT NULL REFERENCES public."Participant"(id) ON DELETE CASCADE,
  reason TEXT NOT NULL CHECK (reason IN ('SPAM', 'UNKIND', 'OFF_TOPIC', 'OTHER')),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "resolvedAt" TIMESTAMPTZ,
  "resolvedById" UUID REFERENCES public."User"(id) ON DELETE SET NULL,
  resolution TEXT CHECK (resolution IN ('KEPT', 'REMOVED')),
  UNIQUE ("postId", "reporterParticipantId")
);

ALTER TABLE public."GroupPost" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."GroupPostReply" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."GroupPostLike" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."GroupPostReport" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."GroupPost", public."GroupPostReply", public."GroupPostLike", public."GroupPostReport" FROM anon, authenticated;

-- 2. Private helpers -----------------------------------------------------------

-- The participant's group in their own cohort (not archived), or NULL.
CREATE OR REPLACE FUNCTION public.discussion_participant_group(p_participant_id UUID)
 RETURNS UUID
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT g.id
  FROM public."GroupParticipant" gp
  JOIN public."Participant" p ON p.id = gp."participantId"
  JOIN public."Group" g ON g.id = gp."groupId" AND g."cohortId" = p."cohortId" AND g."archivedAt" IS NULL
  WHERE gp."participantId" = p_participant_id
  ORDER BY g.name
  LIMIT 1;
$function$;

-- How the signed-in staff member may see a group's discussion:
-- 'SUPPORT' (the group's own support), 'ADMIN', 'HUB' (read-only), or NULL.
CREATE OR REPLACE FUNCTION public.discussion_staff_access(p_group_id UUID)
 RETURNS TEXT
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_group public."Group";
BEGIN
  IF NOT public.app_is_staff() THEN
    RETURN NULL;
  END IF;
  SELECT * INTO v_group FROM public."Group" WHERE id = p_group_id;
  IF v_group.id IS NULL THEN
    RETURN NULL;
  END IF;
  IF v_group."supportId" = public.app_current_user_id() AND v_group."archivedAt" IS NULL THEN
    RETURN 'SUPPORT';
  END IF;
  IF public.app_is_admin() THEN
    RETURN 'ADMIN';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public."HubMembership" m
    WHERE m."userId" = v_group."supportId"
      AND m."cohortId" = v_group."cohortId"
      AND public.app_hub_can(m."hubId", 'GROUPS')
  ) THEN
    RETURN 'HUB';
  END IF;
  RETURN NULL;
END;
$function$;

-- One page of a group's discussion for a viewer. p_access is 'PARTICIPANT',
-- 'SUPPORT', 'ADMIN' or 'HUB'; the viewer is p_user_id or p_participant_id.
-- Moderators (SUPPORT, ADMIN) also get removed text and open reports.
-- The pinned post comes back on its own (first page only); `posts` is the rest,
-- newest first, older pages via p_before.
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

-- One post (with its replies) as a viewer sees it.
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
      'name', COALESCE(u.name, p."fullName"),
      'avatarUrl', COALESCE(u."avatarUrl", p."avatarUrl")
    ),
    'isMine', (gp."authorUserId" = p_user_id OR gp."authorParticipantId" = p_participant_id),
    'removed', gp."removedAt" IS NOT NULL,
    'body', CASE WHEN gp."removedAt" IS NULL OR p_mod THEN gp.body END,
    'pinned', gp."pinnedAt" IS NOT NULL AND gp."removedAt" IS NULL,
    'pinnedByName', (SELECT pu.name FROM public."User" pu WHERE pu.id = gp."pinnedById" AND gp."pinnedAt" IS NOT NULL),
    'createdAt', gp."createdAt",
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
          'name', COALESCE(ru.name, rpp."fullName"),
          'avatarUrl', COALESCE(ru."avatarUrl", rpp."avatarUrl")
        ),
        'isMine', (r."authorUserId" = p_user_id OR r."authorParticipantId" = p_participant_id),
        'removed', r."removedAt" IS NOT NULL,
        'body', CASE WHEN r."removedAt" IS NULL OR p_mod THEN r.body END,
        'createdAt', r."createdAt"
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

-- A post in this group that can still take replies, likes or reports.
CREATE OR REPLACE FUNCTION public.discussion_live_post(p_post_id UUID, p_group_id UUID)
 RETURNS BOOLEAN
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public."GroupPost"
    WHERE id = p_post_id AND "groupId" = p_group_id AND "removedAt" IS NULL AND "deletedAt" IS NULL
  );
$function$;

CREATE OR REPLACE FUNCTION public.discussion_clean_body(p_body TEXT)
 RETURNS TEXT
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
DECLARE
  v TEXT := btrim(COALESCE(p_body, ''));
BEGIN
  IF v = '' THEN
    RAISE EXCEPTION 'Write something first';
  END IF;
  IF char_length(v) > 2000 THEN
    RAISE EXCEPTION 'Keep it under 2000 characters';
  END IF;
  RETURN v;
END;
$function$;

REVOKE ALL ON FUNCTION public.discussion_participant_group(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.discussion_staff_access(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.build_discussion_feed(UUID, TEXT, UUID, UUID, TIMESTAMPTZ, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.discussion_post_json(UUID, BOOLEAN, UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.discussion_live_post(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.discussion_clean_body(TEXT) FROM PUBLIC, anon, authenticated;

-- 3. Participant functions (p_token) -------------------------------------------

CREATE OR REPLACE FUNCTION public.participant_discussion_feed(p_token TEXT, p_before TIMESTAMPTZ DEFAULT NULL, p_limit INTEGER DEFAULT 30)
 RETURNS JSON
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_me UUID := public.app_participant_id(p_token);
  v_group UUID;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  v_group := public.discussion_participant_group(v_me);
  IF v_group IS NULL THEN RETURN NULL; END IF;
  RETURN public.build_discussion_feed(v_group, 'PARTICIPANT', NULL, v_me, p_before, p_limit);
END;
$function$;

CREATE OR REPLACE FUNCTION public.participant_discussion_post(p_token TEXT, p_body TEXT)
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
  INSERT INTO public."GroupPost" ("groupId", "authorParticipantId", body)
  VALUES (v_group, v_me, public.discussion_clean_body(p_body))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.participant_discussion_reply(p_token TEXT, p_post_id UUID, p_body TEXT)
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
  INSERT INTO public."GroupPostReply" ("postId", "authorParticipantId", body)
  VALUES (p_post_id, v_me, public.discussion_clean_body(p_body))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.participant_discussion_like(p_token TEXT, p_post_id UUID, p_like BOOLEAN)
 RETURNS VOID
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_me UUID := public.app_participant_id(p_token);
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  IF NOT public.discussion_live_post(p_post_id, public.discussion_participant_group(v_me)) THEN
    RAISE EXCEPTION 'This post is no longer available';
  END IF;
  IF p_like THEN
    INSERT INTO public."GroupPostLike" ("postId", "participantId")
    SELECT p_post_id, v_me
    WHERE NOT EXISTS (SELECT 1 FROM public."GroupPostLike" WHERE "postId" = p_post_id AND "participantId" = v_me);
  ELSE
    DELETE FROM public."GroupPostLike" WHERE "postId" = p_post_id AND "participantId" = v_me;
  END IF;
END;
$function$;

-- Delete your own post or reply (p_kind 'POST' or 'REPLY').
CREATE OR REPLACE FUNCTION public.participant_discussion_delete(p_token TEXT, p_kind TEXT, p_id UUID)
 RETURNS VOID
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_me UUID := public.app_participant_id(p_token);
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  IF p_kind = 'POST' THEN
    UPDATE public."GroupPost" SET "deletedAt" = NOW(), "pinnedAt" = NULL
    WHERE id = p_id AND "authorParticipantId" = v_me AND "deletedAt" IS NULL;
  ELSIF p_kind = 'REPLY' THEN
    UPDATE public."GroupPostReply" SET "deletedAt" = NOW()
    WHERE id = p_id AND "authorParticipantId" = v_me AND "deletedAt" IS NULL;
  ELSE
    RAISE EXCEPTION 'Unknown kind';
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'You can only delete your own posts'; END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.participant_discussion_report(p_token TEXT, p_post_id UUID, p_reason TEXT)
 RETURNS VOID
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_me UUID := public.app_participant_id(p_token);
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  IF p_reason NOT IN ('SPAM', 'UNKIND', 'OFF_TOPIC', 'OTHER') THEN RAISE EXCEPTION 'Pick a reason'; END IF;
  IF NOT public.discussion_live_post(p_post_id, public.discussion_participant_group(v_me)) THEN
    RAISE EXCEPTION 'This post is no longer available';
  END IF;
  IF EXISTS (SELECT 1 FROM public."GroupPost" WHERE id = p_post_id AND "authorParticipantId" = v_me) THEN
    RAISE EXCEPTION 'You can''t report your own post';
  END IF;
  INSERT INTO public."GroupPostReport" ("postId", "reporterParticipantId", reason)
  SELECT p_post_id, v_me, p_reason
  WHERE NOT EXISTS (
    SELECT 1 FROM public."GroupPostReport" WHERE "postId" = p_post_id AND "reporterParticipantId" = v_me
  );
END;
$function$;

-- 4. Staff functions (session header) ------------------------------------------

CREATE OR REPLACE FUNCTION public.group_discussion_feed(p_group_id UUID, p_before TIMESTAMPTZ DEFAULT NULL, p_limit INTEGER DEFAULT 30)
 RETURNS JSON
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_access TEXT := public.discussion_staff_access(p_group_id);
BEGIN
  IF v_access IS NULL THEN RAISE EXCEPTION 'You can''t see this group''s discussion'; END IF;
  RETURN public.build_discussion_feed(p_group_id, v_access, public.app_current_user_id(), NULL, p_before, p_limit);
END;
$function$;

CREATE OR REPLACE FUNCTION public.group_discussion_post(p_group_id UUID, p_body TEXT)
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
  INSERT INTO public."GroupPost" ("groupId", "authorUserId", body)
  VALUES (p_group_id, public.app_current_user_id(), public.discussion_clean_body(p_body))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.group_discussion_reply(p_post_id UUID, p_body TEXT)
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
  INSERT INTO public."GroupPostReply" ("postId", "authorUserId", body)
  VALUES (p_post_id, public.app_current_user_id(), public.discussion_clean_body(p_body))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.group_discussion_like(p_post_id UUID, p_like BOOLEAN)
 RETURNS VOID
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_group UUID := (SELECT "groupId" FROM public."GroupPost" WHERE id = p_post_id);
  v_me UUID := public.app_current_user_id();
BEGIN
  IF public.discussion_staff_access(v_group) IS DISTINCT FROM 'SUPPORT' THEN
    RAISE EXCEPTION 'Only this group''s support can like posts here';
  END IF;
  IF NOT public.discussion_live_post(p_post_id, v_group) THEN RAISE EXCEPTION 'This post is no longer available'; END IF;
  IF p_like THEN
    INSERT INTO public."GroupPostLike" ("postId", "userId")
    SELECT p_post_id, v_me
    WHERE NOT EXISTS (SELECT 1 FROM public."GroupPostLike" WHERE "postId" = p_post_id AND "userId" = v_me);
  ELSE
    DELETE FROM public."GroupPostLike" WHERE "postId" = p_post_id AND "userId" = v_me;
  END IF;
END;
$function$;

-- The support deletes their own post or reply.
CREATE OR REPLACE FUNCTION public.group_discussion_delete(p_kind TEXT, p_id UUID)
 RETURNS VOID
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_me UUID := public.app_current_user_id();
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'You must be signed in as a support or admin'; END IF;
  IF p_kind = 'POST' THEN
    UPDATE public."GroupPost" SET "deletedAt" = NOW(), "pinnedAt" = NULL
    WHERE id = p_id AND "authorUserId" = v_me AND "deletedAt" IS NULL;
  ELSIF p_kind = 'REPLY' THEN
    UPDATE public."GroupPostReply" SET "deletedAt" = NOW()
    WHERE id = p_id AND "authorUserId" = v_me AND "deletedAt" IS NULL;
  ELSE
    RAISE EXCEPTION 'Unknown kind';
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'You can only delete your own posts'; END IF;
END;
$function$;

-- Pin (one at a time per group) or unpin. Group's support or an admin.
CREATE OR REPLACE FUNCTION public.group_discussion_pin(p_post_id UUID, p_pin BOOLEAN)
 RETURNS VOID
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_group UUID := (SELECT "groupId" FROM public."GroupPost" WHERE id = p_post_id);
  v_access TEXT := public.discussion_staff_access(v_group);
BEGIN
  IF v_access IS NULL OR v_access NOT IN ('SUPPORT', 'ADMIN') THEN
    RAISE EXCEPTION 'Only this group''s support or an admin can pin posts';
  END IF;
  IF p_pin THEN
    IF NOT public.discussion_live_post(p_post_id, v_group) THEN RAISE EXCEPTION 'This post is no longer available'; END IF;
    UPDATE public."GroupPost" SET "pinnedAt" = NULL, "pinnedById" = NULL
    WHERE "groupId" = v_group AND "pinnedAt" IS NOT NULL AND id <> p_post_id;
    UPDATE public."GroupPost" SET "pinnedAt" = NOW(), "pinnedById" = public.app_current_user_id() WHERE id = p_post_id;
  ELSE
    UPDATE public."GroupPost" SET "pinnedAt" = NULL, "pinnedById" = NULL WHERE id = p_post_id;
  END IF;
END;
$function$;

-- Keep or remove a post (p_kind 'POST') or remove a reply ('REPLY').
-- Group's support or an admin. Removing a post also unpins it; both actions
-- close the post's open reports.
CREATE OR REPLACE FUNCTION public.group_discussion_moderate(p_kind TEXT, p_id UUID, p_action TEXT)
 RETURNS VOID
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_me UUID := public.app_current_user_id();
  v_group UUID;
  v_access TEXT;
BEGIN
  IF p_kind = 'POST' THEN
    v_group := (SELECT "groupId" FROM public."GroupPost" WHERE id = p_id);
  ELSIF p_kind = 'REPLY' THEN
    v_group := (SELECT gp."groupId" FROM public."GroupPostReply" r JOIN public."GroupPost" gp ON gp.id = r."postId" WHERE r.id = p_id);
  ELSE
    RAISE EXCEPTION 'Unknown kind';
  END IF;
  v_access := public.discussion_staff_access(v_group);
  IF v_access IS NULL OR v_access NOT IN ('SUPPORT', 'ADMIN') THEN
    RAISE EXCEPTION 'Only this group''s support or an admin can do this';
  END IF;

  IF p_kind = 'POST' AND p_action = 'KEEP' THEN
    UPDATE public."GroupPostReport" SET "resolvedAt" = NOW(), "resolvedById" = v_me, resolution = 'KEPT'
    WHERE "postId" = p_id AND "resolvedAt" IS NULL;
  ELSIF p_kind = 'POST' AND p_action = 'REMOVE' THEN
    UPDATE public."GroupPost" SET "removedAt" = NOW(), "removedById" = v_me, "pinnedAt" = NULL, "pinnedById" = NULL
    WHERE id = p_id AND "removedAt" IS NULL;
    UPDATE public."GroupPostReport" SET "resolvedAt" = NOW(), "resolvedById" = v_me, resolution = 'REMOVED'
    WHERE "postId" = p_id AND "resolvedAt" IS NULL;
  ELSIF p_kind = 'REPLY' AND p_action = 'REMOVE' THEN
    UPDATE public."GroupPostReply" SET "removedAt" = NOW(), "removedById" = v_me
    WHERE id = p_id AND "removedAt" IS NULL;
  ELSE
    RAISE EXCEPTION 'Unknown action';
  END IF;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.participant_discussion_feed(TEXT, TIMESTAMPTZ, INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.participant_discussion_post(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.participant_discussion_reply(TEXT, UUID, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.participant_discussion_like(TEXT, UUID, BOOLEAN) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.participant_discussion_delete(TEXT, TEXT, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.participant_discussion_report(TEXT, UUID, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.group_discussion_feed(UUID, TIMESTAMPTZ, INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.group_discussion_post(UUID, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.group_discussion_reply(UUID, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.group_discussion_like(UUID, BOOLEAN) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.group_discussion_delete(TEXT, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.group_discussion_pin(UUID, BOOLEAN) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.group_discussion_moderate(TEXT, UUID, TEXT) TO anon, authenticated;
