-- Group Discussion: alerts and the "something new" dot.
--
-- Alerts (bell + push) go through notify-users, same vault-secret +
-- net.http_post pattern as invoke_hub_message_push (20260924000000):
--   * someone is @tagged in a post or reply → that person
--     ("<Name> tagged you in the group discussion")
--   * a participant posts → the group's support
--   * someone replies to a post → the post's author
--   * a post is reported → the group's support and every admin
-- Nobody is alerted about their own post or reply, and a person who is tagged
-- only gets the tag alert (not a second "replied"/"posted" one).
--
-- The dot: GroupDiscussionSeen records when each person last opened their
-- group's Discussion tab. *_discussion_unseen counts posts and replies by
-- other people since then; *_discussion_mark_seen updates it.
--
-- Rollback: DROP TRIGGER discussion_post_alerts, discussion_reply_alerts,
-- discussion_report_alerts; DROP the functions below; DROP TABLE
-- "GroupDiscussionSeen".

-- 1. Sending ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.invoke_discussion_notify(
  p_user_ids UUID[], p_participant_ids UUID[], p_title TEXT, p_body TEXT, p_user_path TEXT, p_participant_path TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_url text;
  v_key text;
BEGIN
  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'project_url';
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'push_reminders_service_key';
  IF v_url IS NULL OR v_key IS NULL THEN
    RAISE NOTICE 'invoke_discussion_notify: vault secrets missing; skipping';
    RETURN;
  END IF;

  IF array_length(p_user_ids, 1) IS NOT NULL THEN
    PERFORM net.http_post(
      url := v_url || '/functions/v1/notify-users',
      headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', v_key, 'Authorization', 'Bearer ' || v_key),
      body := jsonb_build_object('userIds', to_jsonb(p_user_ids), 'title', p_title, 'body', p_body, 'path', p_user_path, 'type', 'DISCUSSION'),
      timeout_milliseconds := 25000
    );
  END IF;
  IF array_length(p_participant_ids, 1) IS NOT NULL THEN
    PERFORM net.http_post(
      url := v_url || '/functions/v1/notify-users',
      headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', v_key, 'Authorization', 'Bearer ' || v_key),
      body := jsonb_build_object('participantIds', to_jsonb(p_participant_ids), 'title', p_title, 'body', p_body, 'path', p_participant_path, 'type', 'DISCUSSION'),
      timeout_milliseconds := 25000
    );
  END IF;
END;
$function$;

-- Short name for alert titles: "Chioma Eze" → "Chioma E."; supports keep their name.
CREATE OR REPLACE FUNCTION public.discussion_alert_name(p_user_id UUID, p_participant_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT COALESCE(
    (SELECT name FROM public."User" WHERE id = p_user_id),
    (SELECT CASE WHEN array_length(parts, 1) > 1 THEN parts[1] || ' ' || left(parts[array_length(parts, 1)], 1) || '.' ELSE parts[1] END
     FROM (SELECT regexp_split_to_array(btrim("fullName"), '\s+') AS parts FROM public."Participant" WHERE id = p_participant_id) x),
    'Someone'
  );
$function$;

-- Send one event's alerts: tag alerts, then "other" alerts to anyone not tagged.
CREATE OR REPLACE FUNCTION public.discussion_send_alerts(
  p_group_id UUID, p_author_user UUID, p_author_participant UUID, p_mentions JSONB, p_body TEXT,
  p_other_users UUID[], p_other_participants UUID[], p_other_title TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_name TEXT := public.discussion_alert_name(p_author_user, p_author_participant);
  v_snippet TEXT := left(regexp_replace(p_body, '\s+', ' ', 'g'), 120);
  v_tag_users UUID[];
  v_tag_participants UUID[];
  v_staff_path TEXT := '/support/participants?tab=discussion';
  v_participant_path TEXT := '/me/group?tab=discussion';
BEGIN
  SELECT
    COALESCE(array_agg(DISTINCT (m->>'id')::uuid) FILTER (WHERE m->>'kind' = 'SUPPORT'), '{}'),
    COALESCE(array_agg(DISTINCT (m->>'id')::uuid) FILTER (WHERE m->>'kind' = 'PARTICIPANT'), '{}')
  INTO v_tag_users, v_tag_participants
  FROM jsonb_array_elements(COALESCE(p_mentions, '[]'::jsonb)) m;

  v_tag_users := array_remove(v_tag_users, p_author_user);
  v_tag_participants := array_remove(v_tag_participants, p_author_participant);

  PERFORM public.invoke_discussion_notify(
    v_tag_users, v_tag_participants,
    v_name || ' tagged you in the group discussion', v_snippet, v_staff_path, v_participant_path);

  PERFORM public.invoke_discussion_notify(
    ARRAY(SELECT u FROM unnest(COALESCE(p_other_users, '{}')) u
          WHERE u IS NOT NULL AND u IS DISTINCT FROM p_author_user AND NOT (u = ANY(v_tag_users))),
    ARRAY(SELECT p FROM unnest(COALESCE(p_other_participants, '{}')) p
          WHERE p IS NOT NULL AND p IS DISTINCT FROM p_author_participant AND NOT (p = ANY(v_tag_participants))),
    replace(p_other_title, '{name}', v_name), v_snippet, v_staff_path, v_participant_path);
END;
$function$;

-- 2. Triggers ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.discussion_post_alerts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  -- Participants' posts alert the group's support; supports' own posts only alert people they tag.
  PERFORM public.discussion_send_alerts(
    NEW."groupId", NEW."authorUserId", NEW."authorParticipantId", NEW.mentions, NEW.body,
    CASE WHEN NEW."authorParticipantId" IS NOT NULL
      THEN ARRAY(SELECT "supportId" FROM public."Group" WHERE id = NEW."groupId") ELSE '{}' END,
    '{}',
    '{name} posted in your group discussion');
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.discussion_reply_alerts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_post public."GroupPost";
BEGIN
  SELECT * INTO v_post FROM public."GroupPost" WHERE id = NEW."postId";
  PERFORM public.discussion_send_alerts(
    v_post."groupId", NEW."authorUserId", NEW."authorParticipantId", NEW.mentions, NEW.body,
    ARRAY[v_post."authorUserId"], ARRAY[v_post."authorParticipantId"],
    '{name} replied to your post');
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.discussion_report_alerts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_group public."Group";
  v_reason TEXT := CASE NEW.reason
    WHEN 'SPAM' THEN 'Spam or selling' WHEN 'UNKIND' THEN 'Unkind or offensive'
    WHEN 'OFF_TOPIC' THEN 'Not about FOF' ELSE 'Something else' END;
BEGIN
  SELECT g.* INTO v_group FROM public."Group" g JOIN public."GroupPost" gp ON gp."groupId" = g.id WHERE gp.id = NEW."postId";
  -- The group's support opens their Discussion tab; admins open the group page.
  PERFORM public.invoke_discussion_notify(
    ARRAY[v_group."supportId"], '{}',
    'A post was reported in ' || v_group.name, 'Reason: ' || v_reason || '. Tap to review.',
    '/support/participants?tab=discussion', NULL);
  PERFORM public.invoke_discussion_notify(
    ARRAY(SELECT id FROM public."User" WHERE role = 'ADMIN' AND "isActive" IS NOT FALSE AND id IS DISTINCT FROM v_group."supportId"), '{}',
    'A post was reported in ' || v_group.name, 'Reason: ' || v_reason || '. Tap to review.',
    '/group-view/' || v_group."supportId" || '?cohort=' || v_group."cohortId", NULL);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS discussion_post_alerts ON public."GroupPost";
CREATE TRIGGER discussion_post_alerts AFTER INSERT ON public."GroupPost"
  FOR EACH ROW EXECUTE FUNCTION public.discussion_post_alerts();
DROP TRIGGER IF EXISTS discussion_reply_alerts ON public."GroupPostReply";
CREATE TRIGGER discussion_reply_alerts AFTER INSERT ON public."GroupPostReply"
  FOR EACH ROW EXECUTE FUNCTION public.discussion_reply_alerts();
DROP TRIGGER IF EXISTS discussion_report_alerts ON public."GroupPostReport";
CREATE TRIGGER discussion_report_alerts AFTER INSERT ON public."GroupPostReport"
  FOR EACH ROW EXECUTE FUNCTION public.discussion_report_alerts();

REVOKE ALL ON FUNCTION public.invoke_discussion_notify(UUID[], UUID[], TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.discussion_alert_name(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.discussion_send_alerts(UUID, UUID, UUID, JSONB, TEXT, UUID[], UUID[], TEXT) FROM PUBLIC, anon, authenticated;

-- 3. "Something new" dot --------------------------------------------------------

CREATE TABLE IF NOT EXISTS public."GroupDiscussionSeen" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "groupId" UUID NOT NULL REFERENCES public."Group"(id) ON DELETE CASCADE,
  "userId" UUID REFERENCES public."User"(id) ON DELETE CASCADE,
  "participantId" UUID REFERENCES public."Participant"(id) ON DELETE CASCADE,
  "seenAt" TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CHECK (num_nonnulls("userId", "participantId") = 1)
);
CREATE UNIQUE INDEX IF NOT EXISTS "GroupDiscussionSeen_user_uq" ON public."GroupDiscussionSeen" ("groupId", "userId") WHERE "userId" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "GroupDiscussionSeen_participant_uq" ON public."GroupDiscussionSeen" ("groupId", "participantId") WHERE "participantId" IS NOT NULL;
ALTER TABLE public."GroupDiscussionSeen" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."GroupDiscussionSeen" FROM anon, authenticated;

-- Posts and replies by other people in the group since the viewer last looked.
CREATE OR REPLACE FUNCTION public.discussion_unseen_count(p_group_id UUID, p_user_id UUID, p_participant_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = ''
AS $function$
  WITH seen AS (
    SELECT COALESCE(max("seenAt"), '-infinity'::timestamptz) AS at
    FROM public."GroupDiscussionSeen"
    WHERE "groupId" = p_group_id AND ("userId" = p_user_id OR "participantId" = p_participant_id)
  )
  SELECT (
    (SELECT count(*) FROM public."GroupPost" gp, seen
      WHERE gp."groupId" = p_group_id AND gp."createdAt" > seen.at
        AND gp."removedAt" IS NULL AND gp."deletedAt" IS NULL
        AND NOT (COALESCE(gp."authorUserId" = p_user_id, FALSE) OR COALESCE(gp."authorParticipantId" = p_participant_id, FALSE)))
    + (SELECT count(*) FROM public."GroupPostReply" r JOIN public."GroupPost" gp ON gp.id = r."postId", seen
      WHERE gp."groupId" = p_group_id AND r."createdAt" > seen.at
        AND gp."removedAt" IS NULL AND gp."deletedAt" IS NULL AND r."removedAt" IS NULL AND r."deletedAt" IS NULL
        AND NOT (COALESCE(r."authorUserId" = p_user_id, FALSE) OR COALESCE(r."authorParticipantId" = p_participant_id, FALSE)))
  )::int;
$function$;

CREATE OR REPLACE FUNCTION public.discussion_mark_seen(p_group_id UUID, p_user_id UUID, p_participant_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  UPDATE public."GroupDiscussionSeen" SET "seenAt" = clock_timestamp()
  WHERE "groupId" = p_group_id AND ("userId" = p_user_id OR "participantId" = p_participant_id);
  IF NOT FOUND THEN
    INSERT INTO public."GroupDiscussionSeen" ("groupId", "userId", "participantId") VALUES (p_group_id, p_user_id, p_participant_id);
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.discussion_unseen_count(UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.discussion_mark_seen(UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.participant_discussion_unseen(p_token TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_me UUID := public.app_participant_id(p_token);
  v_group UUID;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  v_group := public.discussion_participant_group(v_me);
  IF v_group IS NULL THEN RETURN 0; END IF;
  RETURN public.discussion_unseen_count(v_group, NULL, v_me);
END;
$function$;

CREATE OR REPLACE FUNCTION public.participant_discussion_mark_seen(p_token TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_me UUID := public.app_participant_id(p_token);
  v_group UUID;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  v_group := public.discussion_participant_group(v_me);
  IF v_group IS NOT NULL THEN PERFORM public.discussion_mark_seen(v_group, NULL, v_me); END IF;
END;
$function$;

-- Supports: only for a group they support (other viewers get 0 / no-op).
CREATE OR REPLACE FUNCTION public.group_discussion_unseen(p_group_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF public.discussion_staff_access(p_group_id) IS DISTINCT FROM 'SUPPORT' THEN RETURN 0; END IF;
  RETURN public.discussion_unseen_count(p_group_id, public.app_current_user_id(), NULL);
END;
$function$;

CREATE OR REPLACE FUNCTION public.group_discussion_mark_seen(p_group_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF public.discussion_staff_access(p_group_id) IS DISTINCT FROM 'SUPPORT' THEN RETURN; END IF;
  PERFORM public.discussion_mark_seen(p_group_id, public.app_current_user_id(), NULL);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.participant_discussion_unseen(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.participant_discussion_mark_seen(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.group_discussion_unseen(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.group_discussion_mark_seen(UUID) TO anon, authenticated;
