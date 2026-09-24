-- Hub lead: edit/delete their own hub messages, and set a recurring hub
-- meeting (day/time/length/link) the same way a group's call is set up.
-- Additive and idempotent, following 20260924000000_support_hubs.sql and
-- 20260925000000_hub_notify_and_ack.sql.

-- 1. SupportHub gets the same meeting-slot + call columns as "Group"
-- (20260622170000_group_meeting_slot.sql, 20260915000000_support_v2_tables.sql).
ALTER TABLE public."SupportHub"
  ADD COLUMN IF NOT EXISTS "meetingDay" TEXT,             -- 'WEDNESDAY' | 'FRIDAY' | 'SATURDAY'
  ADD COLUMN IF NOT EXISTS "meetingTime" TEXT,             -- 'HH:MM' 24h e.g. '17:30'
  ADD COLUMN IF NOT EXISTS "meetingDurationMins" INTEGER,  -- 45 or 60
  ADD COLUMN IF NOT EXISTS "callPlatform" TEXT,
  ADD COLUMN IF NOT EXISTS "callLink" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SupportHub_callPlatform_check') THEN
    ALTER TABLE public."SupportHub" ADD CONSTRAINT "SupportHub_callPlatform_check"
      CHECK ("callPlatform" IS NULL OR "callPlatform" IN ('WHATSAPP', 'GOOGLE_MEET'));
  END IF;
END $$;

-- 2. HubMessage gets an editedAt, set only when update_hub_message actually
-- changes a message's text.
ALTER TABLE public."HubMessage" ADD COLUMN IF NOT EXISTS "editedAt" TIMESTAMPTZ;

-- 3. update_hub_message — the author, this hub's lead, or an admin.
CREATE OR REPLACE FUNCTION public.update_hub_message(p_message_id UUID, p_subject TEXT, p_body TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_id UUID;
  v_subject TEXT;
  v_body TEXT;
  v_message public."HubMessage";
BEGIN
  IF NOT public.app_is_staff() THEN
    RAISE EXCEPTION 'You must be signed in as a support or admin';
  END IF;
  v_actor_id := public.app_current_user_id();

  SELECT * INTO v_message FROM public."HubMessage" WHERE id = p_message_id;
  IF v_message.id IS NULL THEN
    RAISE EXCEPTION 'Message was not found';
  END IF;

  IF NOT public.app_is_admin() THEN
    IF v_message."authorId" IS DISTINCT FROM v_actor_id
      AND NOT EXISTS (SELECT 1 FROM public."SupportHub" h WHERE h.id = v_message."hubId" AND h."leadUserId" = v_actor_id)
    THEN
      RAISE EXCEPTION 'Only the author, this hub''s lead or an admin can edit this message';
    END IF;
  END IF;

  v_subject := NULLIF(BTRIM(COALESCE(p_subject, '')), '');
  v_body := NULLIF(BTRIM(COALESCE(p_body, '')), '');
  IF v_subject IS NULL OR v_body IS NULL THEN
    RAISE EXCEPTION 'Subject and message are required';
  END IF;

  UPDATE public."HubMessage"
  SET subject = v_subject, body = v_body, "editedAt" = NOW()
  WHERE id = p_message_id
  RETURNING * INTO v_message;

  RETURN jsonb_build_object(
    'id', v_message.id, 'hubId', v_message."hubId", 'authorId', v_message."authorId",
    'subject', v_message.subject, 'body', v_message.body,
    'createdAt', v_message."createdAt", 'editedAt', v_message."editedAt"
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.update_hub_message(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_hub_message(UUID, TEXT, TEXT) TO anon, authenticated;

-- 4. delete_hub_message — the author, this hub's lead, or an admin. Acks go
-- with it via HubMessageAck's ON DELETE CASCADE.
CREATE OR REPLACE FUNCTION public.delete_hub_message(p_message_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_id UUID;
  v_hub_id UUID;
  v_author_id UUID;
BEGIN
  IF NOT public.app_is_staff() THEN
    RAISE EXCEPTION 'You must be signed in as a support or admin';
  END IF;
  v_actor_id := public.app_current_user_id();

  SELECT "hubId", "authorId" INTO v_hub_id, v_author_id FROM public."HubMessage" WHERE id = p_message_id;
  IF v_hub_id IS NULL THEN
    RAISE EXCEPTION 'Message was not found';
  END IF;

  IF NOT public.app_is_admin() THEN
    IF v_author_id IS DISTINCT FROM v_actor_id
      AND NOT EXISTS (SELECT 1 FROM public."SupportHub" h WHERE h.id = v_hub_id AND h."leadUserId" = v_actor_id)
    THEN
      RAISE EXCEPTION 'Only the author, this hub''s lead or an admin can delete this message';
    END IF;
  END IF;

  DELETE FROM public."HubMessage" WHERE id = p_message_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.delete_hub_message(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_hub_message(UUID) TO anon, authenticated;

-- 5. update_hub_meeting — the hub's lead, or an admin.
CREATE OR REPLACE FUNCTION public.update_hub_meeting(
  p_hub_id UUID,
  p_meeting_day TEXT,
  p_meeting_time TEXT,
  p_meeting_duration_mins INTEGER,
  p_call_platform TEXT,
  p_call_link TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_id UUID;
  v_hub public."SupportHub";
BEGIN
  IF NOT public.app_is_staff() THEN
    RAISE EXCEPTION 'You must be signed in as a support or admin';
  END IF;
  v_actor_id := public.app_current_user_id();

  IF NOT public.app_is_admin() THEN
    IF NOT EXISTS (SELECT 1 FROM public."SupportHub" h WHERE h.id = p_hub_id AND h."leadUserId" = v_actor_id) THEN
      RAISE EXCEPTION 'Only this hub''s lead or an admin can set its meeting';
    END IF;
  END IF;

  IF p_call_platform IS NOT NULL AND p_call_platform NOT IN ('WHATSAPP', 'GOOGLE_MEET') THEN
    RAISE EXCEPTION 'Invalid call platform';
  END IF;

  UPDATE public."SupportHub"
  SET "meetingDay" = p_meeting_day,
      "meetingTime" = p_meeting_time,
      "meetingDurationMins" = p_meeting_duration_mins,
      "callPlatform" = p_call_platform,
      "callLink" = p_call_link
  WHERE id = p_hub_id
  RETURNING * INTO v_hub;

  IF v_hub.id IS NULL THEN
    RAISE EXCEPTION 'Hub was not found';
  END IF;

  RETURN jsonb_build_object(
    'id', v_hub.id, 'name', v_hub.name, 'leadUserId', v_hub."leadUserId", 'cohortId', v_hub."cohortId",
    'meetingDay', v_hub."meetingDay", 'meetingTime', v_hub."meetingTime",
    'meetingDurationMins', v_hub."meetingDurationMins",
    'callPlatform', v_hub."callPlatform", 'callLink', v_hub."callLink"
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.update_hub_meeting(UUID, TEXT, TEXT, INTEGER, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_hub_meeting(UUID, TEXT, TEXT, INTEGER, TEXT, TEXT) TO anon, authenticated;

-- 6. get_my_hub — same as 20260925000000, plus the hub's meeting fields and
-- each message's editedAt.
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
      SELECT json_build_object(
        'id', h.id, 'name', h.name, 'leadUserId', h."leadUserId", 'leadName', lead.name, 'cohortId', h."cohortId",
        'meetingDay', h."meetingDay", 'meetingTime', h."meetingTime", 'meetingDurationMins', h."meetingDurationMins",
        'callPlatform', h."callPlatform", 'callLink', h."callLink"
      )
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
        'authorId', msg."authorId", 'authorName', author.name,
        'createdAt', msg."createdAt", 'editedAt', msg."editedAt",
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
