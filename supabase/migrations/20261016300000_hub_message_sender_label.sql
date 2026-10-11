-- Hub message alerts say who they are from. The push + bell title is now
-- "Hub Lead · <subject>" (or "Assistant Hub Lead · " / "Admin · " when the sender is
-- the hub's assistant lead or an admin who is not the lead). Only the alert is
-- labelled: the stored HubMessage subject is unchanged, so the hub's message
-- list and the sender's own copy read exactly as written. Alerts already sent
-- are not touched.
CREATE OR REPLACE FUNCTION public.post_hub_message(p_hub_id UUID, p_subject TEXT, p_body TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_id UUID;
  v_subject TEXT;
  v_body TEXT;
  v_label TEXT;
  v_message public."HubMessage";
  v_member_ids UUID[];
BEGIN
  IF NOT public.app_is_staff() THEN
    RAISE EXCEPTION 'You must be signed in as a support or admin to message a hub';
  END IF;
  v_actor_id := public.app_current_user_id();

  IF NOT public.app_is_admin() THEN
    IF NOT public.app_hub_can(p_hub_id, 'MESSAGE') THEN
      RAISE EXCEPTION 'Only this hub''s lead, its assistant lead, or an admin can message it';
    END IF;
  END IF;

  v_subject := NULLIF(BTRIM(COALESCE(p_subject, '')), '');
  v_body := NULLIF(BTRIM(COALESCE(p_body, '')), '');
  IF v_subject IS NULL OR v_body IS NULL THEN
    RAISE EXCEPTION 'Subject and message are required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public."SupportHub" WHERE id = p_hub_id) THEN
    RAISE EXCEPTION 'Hub was not found';
  END IF;

  INSERT INTO public."HubMessage" ("hubId", "authorId", subject, body)
  VALUES (p_hub_id, v_actor_id, v_subject, v_body)
  RETURNING * INTO v_message;

  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM public."SupportHub" WHERE id = p_hub_id AND "leadUserId" = v_actor_id) THEN 'Hub Lead'
    WHEN EXISTS (SELECT 1 FROM public."SupportHub" WHERE id = p_hub_id AND "assistantLeadUserId" = v_actor_id) THEN 'Assistant Hub Lead'
    ELSE 'Admin'
  END INTO v_label;

  SELECT array_agg("userId") INTO v_member_ids
  FROM public."HubMembership"
  WHERE "hubId" = p_hub_id AND "userId" <> v_actor_id;

  IF v_member_ids IS NOT NULL AND array_length(v_member_ids, 1) > 0 THEN
    PERFORM public.invoke_hub_message_push(v_member_ids, v_label || ' · ' || v_subject, v_body);
  END IF;

  RETURN jsonb_build_object(
    'id', v_message.id, 'hubId', v_message."hubId", 'authorId', v_message."authorId",
    'subject', v_message.subject, 'body', v_message.body, 'createdAt', v_message."createdAt"
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.post_hub_message(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.post_hub_message(UUID, TEXT, TEXT) TO anon, authenticated;
