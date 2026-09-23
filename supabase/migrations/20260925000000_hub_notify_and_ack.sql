-- Hub notifications + message acknowledgement, following the style of
-- 20260924000000_support_hubs.sql.
--
-- Gaps closed:
--   1. Being added to a hub now sends a push/bell notification.
--   2. Each lead message can be acknowledged by its members ("Got it"), and
--      the lead sees how many have acknowledged (and who hasn't).

-- 1. HubMessageAck — one row per member who tapped "Got it" on a message.
-- Writes only via acknowledge_hub_message (SECURITY DEFINER) below, same
-- lockdown as HubMessage itself.
CREATE TABLE IF NOT EXISTS public."HubMessageAck" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "messageId" UUID NOT NULL REFERENCES public."HubMessage"(id) ON DELETE CASCADE,
  "userId" UUID NOT NULL REFERENCES public."User"(id) ON DELETE CASCADE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("messageId", "userId")
);

CREATE INDEX IF NOT EXISTS idx_hubmessageack_message ON public."HubMessageAck"("messageId");
CREATE INDEX IF NOT EXISTS idx_hubmessageack_user ON public."HubMessageAck"("userId");

ALTER TABLE public."HubMessageAck" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Hub members and admin can read acks" ON public."HubMessageAck";
CREATE POLICY "Hub members and admin can read acks" ON public."HubMessageAck" FOR SELECT
  USING (
    public.app_is_admin()
    OR EXISTS (
      SELECT 1 FROM public."HubMessage" msg
      JOIN public."HubMembership" m ON m."hubId" = msg."hubId" AND m."userId" = public.app_current_user_id()
      WHERE msg.id = "HubMessageAck"."messageId"
    )
  );

GRANT SELECT ON public."HubMessageAck" TO anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public."HubMessageAck" FROM anon, authenticated;

-- 2. acknowledge_hub_message — the caller must be a member of the message's
-- hub. Acknowledging twice is a no-op (ON CONFLICT DO NOTHING).
CREATE OR REPLACE FUNCTION public.acknowledge_hub_message(p_message_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_id UUID;
  v_hub_id UUID;
BEGIN
  IF NOT public.app_is_staff() THEN
    RAISE EXCEPTION 'You must be signed in as a support or admin';
  END IF;
  v_actor_id := public.app_current_user_id();

  SELECT "hubId" INTO v_hub_id FROM public."HubMessage" WHERE id = p_message_id;
  IF v_hub_id IS NULL THEN
    RAISE EXCEPTION 'Message was not found';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public."HubMembership" WHERE "hubId" = v_hub_id AND "userId" = v_actor_id) THEN
    RAISE EXCEPTION 'You must be a member of this hub to acknowledge its messages';
  END IF;

  INSERT INTO public."HubMessageAck" ("messageId", "userId")
  VALUES (p_message_id, v_actor_id)
  ON CONFLICT ("messageId", "userId") DO NOTHING;
END;
$function$;

REVOKE ALL ON FUNCTION public.acknowledge_hub_message(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.acknowledge_hub_message(UUID) TO anon, authenticated;

-- 3. get_my_hub — same as 20260924000000, plus per-message ackedByMe,
-- ackCount, memberCount (other members only) and, for the lead or an admin
-- only, ackedUserIds.
CREATE OR REPLACE FUNCTION public.get_my_hub(p_cohort_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_id UUID;
  v_hub_id UUID;
  v_is_lead BOOLEAN;
  v_show_acks BOOLEAN;
  v_result JSON;
BEGIN
  IF NOT public.app_is_staff() THEN
    RAISE EXCEPTION 'You must be signed in as a support or admin';
  END IF;

  v_actor_id := public.app_current_user_id();

  SELECT "hubId" INTO v_hub_id
  FROM public."HubMembership"
  WHERE "userId" = v_actor_id AND "cohortId" = p_cohort_id;

  IF v_hub_id IS NULL THEN
    RETURN json_build_object('hub', NULL, 'isLead', FALSE, 'members', '[]'::json, 'messages', '[]'::json, 'myAttendance', '[]'::json);
  END IF;

  SELECT EXISTS (SELECT 1 FROM public."SupportHub" h WHERE h.id = v_hub_id AND h."leadUserId" = v_actor_id) INTO v_is_lead;
  v_show_acks := v_is_lead OR public.app_is_admin();

  SELECT json_build_object(
    'hub', (
      SELECT json_build_object('id', h.id, 'name', h.name, 'leadUserId', h."leadUserId", 'leadName', lead.name, 'cohortId', h."cohortId")
      FROM public."SupportHub" h
      LEFT JOIN public."User" lead ON lead.id = h."leadUserId"
      WHERE h.id = v_hub_id
    ),
    'isLead', v_is_lead,
    'members', COALESCE((
      SELECT json_agg(json_build_object(
        'userId', u.id,
        'name', u.name,
        'phone', u.phone,
        'isLead', (u.id = (SELECT "leadUserId" FROM public."SupportHub" WHERE id = v_hub_id)),
        'groupName', (SELECT g.name FROM public."Group" g WHERE g."supportId" = u.id AND g."cohortId" = p_cohort_id AND g."archivedAt" IS NULL ORDER BY g.name LIMIT 1)
      ) ORDER BY u.name)
      FROM public."HubMembership" m
      JOIN public."User" u ON u.id = m."userId"
      WHERE m."hubId" = v_hub_id
    ), '[]'::json),
    'messages', COALESCE((
      SELECT json_agg(json_build_object(
        'id', msg.id, 'subject', msg.subject, 'body', msg.body,
        'authorName', author.name, 'createdAt', msg."createdAt",
        'ackedByMe', EXISTS (SELECT 1 FROM public."HubMessageAck" a WHERE a."messageId" = msg.id AND a."userId" = v_actor_id),
        'ackCount', (SELECT COUNT(*) FROM public."HubMessageAck" a WHERE a."messageId" = msg.id),
        'memberCount', (SELECT COUNT(*) FROM public."HubMembership" m WHERE m."hubId" = v_hub_id AND m."userId" <> v_actor_id),
        'ackedUserIds', CASE WHEN v_show_acks THEN (
          SELECT COALESCE(json_agg(a."userId"), '[]'::json) FROM public."HubMessageAck" a WHERE a."messageId" = msg.id
        ) ELSE NULL END
      ) ORDER BY msg."createdAt" DESC)
      FROM public."HubMessage" msg
      LEFT JOIN public."User" author ON author.id = msg."authorId"
      WHERE msg."hubId" = v_hub_id
    ), '[]'::json),
    'myAttendance', COALESCE((
      SELECT json_agg(json_build_object(
        'sessionId', s.id, 'type', s.type, 'title', s.title, 'sessionDate', s."sessionDate",
        'weekId', s."weekId", 'status', a.status
      ) ORDER BY s."sessionDate" DESC)
      FROM public."SupportSessionAttendance" a
      JOIN public."SupportSession" s ON s.id = a."sessionId"
      WHERE a."userId" = v_actor_id AND s."cohortId" = p_cohort_id
    ), '[]'::json)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_my_hub(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_hub(UUID) TO anon, authenticated;

-- 4. Added to a hub → a push + bell notification. Fires only on INSERT, so
-- re-saving a hub's member list without changes never notifies anyone
-- (setMembers now only inserts genuinely new members).
CREATE OR REPLACE FUNCTION public.notify_hub_membership_added()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_hub_name TEXT;
BEGIN
  SELECT name INTO v_hub_name FROM public."SupportHub" WHERE id = NEW."hubId";
  PERFORM public.invoke_hub_message_push(
    ARRAY[NEW."userId"],
    format('You''ve been added to %s', COALESCE(v_hub_name, 'a hub')),
    'Tap to open My Hub'
  );
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_hub_membership_added ON public."HubMembership";
CREATE TRIGGER trg_hub_membership_added
  AFTER INSERT ON public."HubMembership"
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_hub_membership_added();
