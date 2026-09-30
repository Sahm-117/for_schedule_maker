-- Onboarding, participant-led: group introductions + four steps the participant does.
--
-- The four steps: (1) post an introduction in the group Discussion, (2) read the
-- Intro Class guide, (3) finish the profile, (4) confirm "I have all I need to be
-- ready for class". Supports only watch; the old support-ticked steps
-- (ParticipantOnboardingStatus, GroupOnboardingStatus) stay in place, unused.
--
-- 1. GroupPost.kind ('POST' | 'INTRO'). One live intro per author per group; a
--    second one updates the first. Feeds return each post's kind, plus the
--    author's gender and an isSupport flag (photo, name and gender are read live
--    from the profile when shown, never stored in the post).
--    group_discussion_intro (support) / participant_discussion_intro (participant).
--    A participant can't post their intro until the group's support has.
-- 2. ParticipantOnboarding (introGuideReadAt, readyConfirmedAt, completedAt),
--    reached only through: participant_mark_intro_guide_read,
--    participant_confirm_ready, participant_onboarding_state_self.
--    participant_home is NOT changed.
-- 3. Staff progress: group_onboarding_progress (the group's support, admins, hub),
--    cohort_onboarding_progress (admins).
-- 4. Alerts (same notify path as the discussion alerts): support intro → the
--    group's participants; participant intro → the support; participant fully
--    onboarded → the support. Intro posts skip the normal "posted in your group
--    discussion" alert.
--
-- Rollback: DROP FUNCTION group_discussion_intro, participant_discussion_intro,
-- participant_mark_intro_guide_read, participant_confirm_ready,
-- participant_onboarding_state_self, participant_onboarding_state,
-- onboarding_try_complete, onboarding_progress_json, group_onboarding_progress,
-- cohort_onboarding_progress, discussion_upsert_intro; DROP TABLE
-- "ParticipantOnboarding"; DROP INDEX "GroupPost_live_intro_uq"; ALTER TABLE
-- "GroupPost" DROP COLUMN kind; recreate discussion_post_json from
-- 20260930160000_discussion_mentions.sql and discussion_post_alerts from
-- 20260930210000_discussion_support_post_alerts.sql.

-- 1. Intro posts -------------------------------------------------------------------

ALTER TABLE public."GroupPost"
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'POST' CHECK (kind IN ('POST', 'INTRO'));

CREATE UNIQUE INDEX IF NOT EXISTS "GroupPost_live_intro_uq"
  ON public."GroupPost" ("groupId", COALESCE("authorUserId", "authorParticipantId"))
  WHERE kind = 'INTRO' AND "deletedAt" IS NULL AND "removedAt" IS NULL;

-- Intros don't fire the normal post alert (they have their own, below).
CREATE OR REPLACE FUNCTION public.discussion_post_alerts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NEW.kind = 'INTRO' THEN
    RETURN NEW;
  END IF;
  IF NEW."authorParticipantId" IS NOT NULL THEN
    PERFORM public.discussion_send_alerts(
      NEW."groupId", NEW."authorUserId", NEW."authorParticipantId", NEW.mentions, NEW.body,
      ARRAY(SELECT "supportId" FROM public."Group" WHERE id = NEW."groupId"), '{}',
      '{name} posted in your group discussion');
  ELSE
    PERFORM public.discussion_send_alerts(
      NEW."groupId", NEW."authorUserId", NEW."authorParticipantId", NEW.mentions, NEW.body,
      '{}',
      ARRAY(
        SELECT gp."participantId"
        FROM public."GroupParticipant" gp
        JOIN public."Participant" p ON p.id = gp."participantId" AND p.status = 'ACTIVE'
        WHERE gp."groupId" = NEW."groupId"
      ),
      '{name} posted in your group discussion');
  END IF;
  RETURN NEW;
END;
$function$;

-- Feed post shape: as before, plus kind and the author's gender / isSupport.
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
    'kind', gp.kind,
    'author', json_build_object(
      'kind', CASE WHEN gp."authorUserId" IS NOT NULL THEN 'SUPPORT' ELSE 'PARTICIPANT' END,
      'id', COALESCE(gp."authorUserId", gp."authorParticipantId"),
      'name', COALESCE(u.name, p."fullName"),
      'avatarUrl', COALESCE(u."avatarUrl", p."avatarUrl"),
      'gender', p.gender,
      'isSupport', gp."authorUserId" IS NOT NULL
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

-- Write or update an author's live intro in a group. Returns the post id and
-- sends the alert only when the intro is new (an edit stays quiet).
CREATE OR REPLACE FUNCTION public.discussion_upsert_intro(
  p_group_id UUID, p_user_id UUID, p_participant_id UUID, p_body TEXT
)
 RETURNS UUID
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_body TEXT := public.discussion_clean_body(p_body);
  v_id UUID;
  v_name TEXT := public.discussion_alert_name(p_user_id, p_participant_id);
  v_snippet TEXT := left(regexp_replace(v_body, '\s+', ' ', 'g'), 120);
BEGIN
  SELECT id INTO v_id
  FROM public."GroupPost"
  WHERE "groupId" = p_group_id AND kind = 'INTRO'
    AND "authorUserId" IS NOT DISTINCT FROM p_user_id
    AND "authorParticipantId" IS NOT DISTINCT FROM p_participant_id
    AND "deletedAt" IS NULL AND "removedAt" IS NULL;

  IF v_id IS NOT NULL THEN
    UPDATE public."GroupPost" SET body = v_body WHERE id = v_id;
    RETURN v_id;
  END IF;

  INSERT INTO public."GroupPost" ("groupId", "authorUserId", "authorParticipantId", body, kind)
  VALUES (p_group_id, p_user_id, p_participant_id, v_body, 'INTRO')
  RETURNING id INTO v_id;

  IF p_user_id IS NOT NULL THEN
    PERFORM public.invoke_discussion_notify(
      '{}',
      ARRAY(
        SELECT gp."participantId"
        FROM public."GroupParticipant" gp
        JOIN public."Participant" p ON p.id = gp."participantId" AND p.status = 'ACTIVE'
        WHERE gp."groupId" = p_group_id
      ),
      'Your support has started introductions. Say hello!', v_snippet,
      '/support/participants?tab=discussion', '/me/group?tab=discussion');
  ELSE
    PERFORM public.invoke_discussion_notify(
      ARRAY(SELECT "supportId" FROM public."Group" WHERE id = p_group_id AND "supportId" IS NOT NULL),
      '{}',
      v_name || ' introduced themselves.', v_snippet,
      '/support/participants?tab=discussion', '/me/group?tab=discussion');
  END IF;
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.group_discussion_intro(p_group_id UUID, p_body TEXT)
 RETURNS UUID
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF public.discussion_staff_access(p_group_id) IS DISTINCT FROM 'SUPPORT' THEN
    RAISE EXCEPTION 'Only this group''s support can post here';
  END IF;
  RETURN public.discussion_upsert_intro(p_group_id, public.app_current_user_id(), NULL, p_body);
END;
$function$;

CREATE OR REPLACE FUNCTION public.participant_discussion_intro(p_token TEXT, p_body TEXT)
 RETURNS UUID
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
  IF v_group IS NULL THEN RAISE EXCEPTION 'You are not in a group yet'; END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public."GroupPost" gp
    JOIN public."Group" g ON g.id = gp."groupId"
    WHERE gp."groupId" = v_group AND gp.kind = 'INTRO'
      AND gp."authorUserId" = g."supportId"
      AND gp."deletedAt" IS NULL AND gp."removedAt" IS NULL
  ) THEN
    RAISE EXCEPTION 'Your support hasn''t started introductions yet';
  END IF;
  RETURN public.discussion_upsert_intro(v_group, NULL, v_me, p_body);
END;
$function$;

-- 2. The other steps -----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public."ParticipantOnboarding" (
  "participantId" UUID PRIMARY KEY REFERENCES public."Participant"(id) ON DELETE CASCADE,
  "introGuideReadAt" TIMESTAMPTZ,
  "readyConfirmedAt" TIMESTAMPTZ,
  "completedAt" TIMESTAMPTZ
);

ALTER TABLE public."ParticipantOnboarding" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."ParticipantOnboarding" FROM anon, authenticated;

-- Anyone who already opened the Intro Class guide keeps that step.
INSERT INTO public."ParticipantOnboarding" ("participantId", "introGuideReadAt")
SELECT s."participantId", s."doneAt" FROM public."ParticipantReadyStep" s WHERE s.step = 'intro'
ON CONFLICT ("participantId") DO NOTHING;

-- Where one participant stands. "completed" stays true once set, even if the
-- profile later slips below 100%.
CREATE OR REPLACE FUNCTION public.participant_onboarding_state(p_participant_id UUID)
 RETURNS JSONB
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_group UUID := public.discussion_participant_group(p_participant_id);
  v_ob public."ParticipantOnboarding";
  v_profile JSON := public.profile_completion_for(p_participant_id);
  v_intro BOOLEAN;
  v_support_intro BOOLEAN;
  v_guide BOOLEAN;
  v_profile_ok BOOLEAN := COALESCE((v_profile->>'percent')::int, 0) >= 100;
  v_ready BOOLEAN;
  v_first DATE;
BEGIN
  SELECT * INTO v_ob FROM public."ParticipantOnboarding" WHERE "participantId" = p_participant_id;
  v_guide := v_ob."introGuideReadAt" IS NOT NULL;
  v_ready := v_ob."readyConfirmedAt" IS NOT NULL;

  v_intro := v_group IS NOT NULL AND EXISTS (
    SELECT 1 FROM public."GroupPost" gp
    WHERE gp."groupId" = v_group AND gp.kind = 'INTRO' AND gp."authorParticipantId" = p_participant_id
      AND gp."deletedAt" IS NULL AND gp."removedAt" IS NULL);
  v_support_intro := v_group IS NOT NULL AND EXISTS (
    SELECT 1 FROM public."GroupPost" gp
    JOIN public."Group" g ON g.id = gp."groupId"
    WHERE gp."groupId" = v_group AND gp.kind = 'INTRO' AND gp."authorUserId" = g."supportId"
      AND gp."deletedAt" IS NULL AND gp."removedAt" IS NULL);

  SELECT public.week_class_date(c."startDate", 1, w."classDate") INTO v_first
  FROM public."Participant" p
  JOIN public."Cohort" c ON c.id = p."cohortId"
  LEFT JOIN public."Week" w ON w."cohortId" = c.id AND w."weekNumber" = 1
  WHERE p.id = p_participant_id;

  RETURN jsonb_build_object(
    'introPosted', v_intro,
    'supportIntroPosted', v_support_intro,
    'introGuideRead', v_guide,
    'profileComplete', v_profile_ok,
    'profileMissing', COALESCE((v_profile->>'missing')::int, 0),
    'readyConfirmed', v_ready,
    'completed', v_ob."completedAt" IS NOT NULL OR (v_intro AND v_guide AND v_profile_ok AND v_ready),
    'firstClassDate', v_first
  );
END;
$function$;

-- Set completedAt once when all four are true, and tell the support.
CREATE OR REPLACE FUNCTION public.onboarding_try_complete(p_participant_id UUID)
 RETURNS VOID
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_state JSONB := public.participant_onboarding_state(p_participant_id);
  v_group UUID;
BEGIN
  IF (v_state->>'introPosted')::boolean AND (v_state->>'introGuideRead')::boolean
     AND (v_state->>'profileComplete')::boolean AND (v_state->>'readyConfirmed')::boolean THEN
    UPDATE public."ParticipantOnboarding" SET "completedAt" = NOW()
    WHERE "participantId" = p_participant_id AND "completedAt" IS NULL;
    IF FOUND THEN
      v_group := public.discussion_participant_group(p_participant_id);
      PERFORM public.invoke_discussion_notify(
        ARRAY(SELECT "supportId" FROM public."Group" WHERE id = v_group AND "supportId" IS NOT NULL),
        '{}',
        public.discussion_alert_name(NULL, p_participant_id) || ' is ready for class.',
        'They have finished all their onboarding steps.',
        '/support/onboarding', NULL);
    END IF;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.participant_mark_intro_guide_read(p_token TEXT)
 RETURNS VOID
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_me UUID := public.app_participant_id(p_token);
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  INSERT INTO public."ParticipantOnboarding" ("participantId", "introGuideReadAt")
  VALUES (v_me, NOW())
  ON CONFLICT ("participantId") DO UPDATE
    SET "introGuideReadAt" = COALESCE(public."ParticipantOnboarding"."introGuideReadAt", NOW());
  -- Keep the older Get ready tick in step.
  INSERT INTO public."ParticipantReadyStep" ("participantId", step)
  VALUES (v_me, 'intro')
  ON CONFLICT DO NOTHING;
END;
$function$;

CREATE OR REPLACE FUNCTION public.participant_confirm_ready(p_token TEXT)
 RETURNS JSONB
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_me UUID := public.app_participant_id(p_token);
  v_state JSONB;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  v_state := public.participant_onboarding_state(v_me);
  IF NOT (v_state->>'introPosted')::boolean THEN RAISE EXCEPTION 'Post your introduction first'; END IF;
  IF NOT (v_state->>'introGuideRead')::boolean THEN RAISE EXCEPTION 'Read the Intro Class guide first'; END IF;
  IF NOT (v_state->>'profileComplete')::boolean THEN RAISE EXCEPTION 'Finish your profile first'; END IF;

  INSERT INTO public."ParticipantOnboarding" ("participantId", "readyConfirmedAt")
  VALUES (v_me, NOW())
  ON CONFLICT ("participantId") DO UPDATE
    SET "readyConfirmedAt" = COALESCE(public."ParticipantOnboarding"."readyConfirmedAt", NOW());

  PERFORM public.onboarding_try_complete(v_me);
  RETURN public.participant_onboarding_state(v_me);
END;
$function$;

-- The participant app's own view of their steps (participant_home is untouched).
CREATE OR REPLACE FUNCTION public.participant_onboarding_state_self(p_token TEXT)
 RETURNS JSONB
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_me UUID := public.app_participant_id(p_token);
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  PERFORM public.onboarding_try_complete(v_me);
  RETURN public.participant_onboarding_state(v_me);
END;
$function$;

-- 3. Staff progress ------------------------------------------------------------------

-- p_group_id NULL = every active participant in the cohort (with or without a group).
CREATE OR REPLACE FUNCTION public.onboarding_progress_json(p_cohort_id UUID, p_group_id UUID)
 RETURNS JSON
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT json_build_object(
    'groups', COALESCE((
      SELECT json_agg(json_build_object(
        'groupId', g.id, 'groupName', g.name, 'supportId', g."supportId", 'supportName', u.name,
        'supportIntroPosted', EXISTS (
          SELECT 1 FROM public."GroupPost" gp
          WHERE gp."groupId" = g.id AND gp.kind = 'INTRO' AND gp."authorUserId" = g."supportId"
            AND gp."deletedAt" IS NULL AND gp."removedAt" IS NULL)
      ) ORDER BY g.name)
      FROM public."Group" g
      LEFT JOIN public."User" u ON u.id = g."supportId"
      WHERE g."cohortId" = p_cohort_id AND g."archivedAt" IS NULL
        AND (p_group_id IS NULL OR g.id = p_group_id)
    ), '[]'::json),
    'participants', COALESCE((
      SELECT json_agg((
        jsonb_build_object(
          'participantId', x.id, 'name', x."fullName", 'avatarUrl', x."avatarUrl",
          'groupId', x."groupId", 'groupName', x."groupName")
        || public.participant_onboarding_state(x.id)
      ) ORDER BY x."groupName" NULLS LAST, x."fullName")
      FROM (
        SELECT p.id, p."fullName", p."avatarUrl", g.id AS "groupId", g.name AS "groupName"
        FROM public."Participant" p
        LEFT JOIN public."Group" g ON g.id = public.discussion_participant_group(p.id)
        WHERE p."cohortId" = p_cohort_id AND p.status = 'ACTIVE'
          AND (p_group_id IS NULL OR g.id = p_group_id)
      ) x
    ), '[]'::json)
  );
$function$;

CREATE OR REPLACE FUNCTION public.group_onboarding_progress(p_group_id UUID)
 RETURNS JSON
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_cohort UUID;
BEGIN
  IF public.discussion_staff_access(p_group_id) IS NULL THEN
    RAISE EXCEPTION 'You can''t see this group''s onboarding';
  END IF;
  SELECT "cohortId" INTO v_cohort FROM public."Group" WHERE id = p_group_id;
  RETURN public.onboarding_progress_json(v_cohort, p_group_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.cohort_onboarding_progress(p_cohort_id UUID)
 RETURNS JSON
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT public.app_is_admin() THEN
    RAISE EXCEPTION 'Only admins can see the whole cohort''s onboarding';
  END IF;
  RETURN public.onboarding_progress_json(p_cohort_id, NULL);
END;
$function$;

-- 4. Grants ----------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.discussion_upsert_intro(UUID, UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.participant_onboarding_state(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.onboarding_try_complete(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.onboarding_progress_json(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.discussion_post_json(UUID, BOOLEAN, UUID, UUID) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.group_discussion_intro(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.participant_discussion_intro(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.participant_mark_intro_guide_read(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.participant_confirm_ready(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.participant_onboarding_state_self(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.group_onboarding_progress(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cohort_onboarding_progress(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.group_discussion_intro(UUID, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.participant_discussion_intro(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.participant_mark_intro_guide_read(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.participant_confirm_ready(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.participant_onboarding_state_self(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.group_onboarding_progress(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cohort_onboarding_progress(UUID) TO anon, authenticated;
