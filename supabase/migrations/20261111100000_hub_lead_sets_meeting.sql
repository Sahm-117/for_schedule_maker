-- A hub's lead can set its weekly meeting (day, time, call link), and so can its assistant lead when the lead
-- has given them the "Set the meeting time" permission ('MEETING' in "assistantPermissions"). Admins still can.
-- Only the permission check changes; the body is otherwise the one from 20261019100000_drop_meeting_duration.sql.
-- app_hub_can(hub, 'MEETING') is TRUE for the lead and for an assistant lead holding 'MEETING'.

CREATE OR REPLACE FUNCTION public.update_hub_meeting(p_hub_id uuid, p_meeting_day text, p_meeting_time text, p_meeting_duration_mins integer, p_call_platform text, p_call_link text, p_notify boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_old public."SupportHub";
  v_hub public."SupportHub";
  v_people UUID[];
BEGIN
  IF NOT (public.app_is_admin() OR public.app_hub_can(p_hub_id, 'MEETING')) THEN
    RAISE EXCEPTION 'Only this hub''s lead, an assistant lead they allow, or an admin can set its meeting';
  END IF;
  IF p_call_platform IS NOT NULL AND p_call_platform NOT IN ('WHATSAPP', 'GOOGLE_MEET') THEN
    RAISE EXCEPTION 'Invalid call platform';
  END IF;

  SELECT * INTO v_old FROM public."SupportHub" WHERE id = p_hub_id;

  UPDATE public."SupportHub"
  SET "meetingDay" = p_meeting_day,
      "meetingTime" = p_meeting_time,
      "callPlatform" = p_call_platform,
      "callLink" = p_call_link
  WHERE id = p_hub_id
  RETURNING * INTO v_hub;

  IF v_hub.id IS NULL THEN
    RAISE EXCEPTION 'Hub was not found';
  END IF;

  IF p_notify AND (
    v_old."meetingDay" IS DISTINCT FROM v_hub."meetingDay"
    OR v_old."meetingTime" IS DISTINCT FROM v_hub."meetingTime"
    OR v_old."callLink" IS DISTINCT FROM v_hub."callLink"
  ) AND v_hub."meetingDay" IS NOT NULL AND v_hub."meetingTime" IS NOT NULL THEN
    SELECT array_agg(DISTINCT u) INTO v_people FROM (
      SELECT m."userId" AS u FROM public."HubMembership" m WHERE m."hubId" = v_hub.id
      UNION SELECT v_hub."leadUserId" WHERE v_hub."leadUserId" IS NOT NULL
      UNION SELECT v_hub."assistantLeadUserId" WHERE v_hub."assistantLeadUserId" IS NOT NULL
    ) x;
    PERFORM public.invoke_hub_message_push(
      v_people,
      format('%s meeting', v_hub.name),
      format('Now %s at %s. Open My Hub to join.',
        initcap(lower(v_hub."meetingDay")), to_char(v_hub."meetingTime"::time, 'FMHH12:MI AM')));
  END IF;

  RETURN jsonb_build_object(
    'id', v_hub.id, 'name', v_hub.name, 'leadUserId', v_hub."leadUserId", 'cohortId', v_hub."cohortId",
    'meetingDay', v_hub."meetingDay", 'meetingTime', v_hub."meetingTime",
    'callPlatform', v_hub."callPlatform", 'callLink', v_hub."callLink"
  );
END;
$function$;
