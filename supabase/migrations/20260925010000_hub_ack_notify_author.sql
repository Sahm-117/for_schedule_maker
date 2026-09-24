-- Tell the message's author (normally the hub lead) when a member taps
-- "Got it". Same as 20260925000000's acknowledge_hub_message, plus a push +
-- in-app notification via invoke_hub_message_push — sent only on the first
-- acknowledgement, never for repeat taps, and never to yourself.
CREATE OR REPLACE FUNCTION public.acknowledge_hub_message(p_message_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_id UUID;
  v_hub_id UUID;
  v_author_id UUID;
  v_subject TEXT;
  v_actor_name TEXT;
  v_inserted INTEGER;
BEGIN
  IF NOT public.app_is_staff() THEN
    RAISE EXCEPTION 'You must be signed in as a support or admin';
  END IF;
  v_actor_id := public.app_current_user_id();

  SELECT "hubId", "authorId", subject INTO v_hub_id, v_author_id, v_subject
  FROM public."HubMessage" WHERE id = p_message_id;
  IF v_hub_id IS NULL THEN
    RAISE EXCEPTION 'Message was not found';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public."HubMembership" WHERE "hubId" = v_hub_id AND "userId" = v_actor_id) THEN
    RAISE EXCEPTION 'You must be a member of this hub to acknowledge its messages';
  END IF;

  INSERT INTO public."HubMessageAck" ("messageId", "userId")
  VALUES (p_message_id, v_actor_id)
  ON CONFLICT ("messageId", "userId") DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_inserted > 0 AND v_author_id IS NOT NULL AND v_author_id <> v_actor_id THEN
    SELECT name INTO v_actor_name FROM public."User" WHERE id = v_actor_id;
    PERFORM public.invoke_hub_message_push(
      ARRAY[v_author_id],
      COALESCE(v_actor_name, 'A member') || ' got your message',
      v_subject
    );
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.acknowledge_hub_message(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.acknowledge_hub_message(UUID) TO anon, authenticated;
