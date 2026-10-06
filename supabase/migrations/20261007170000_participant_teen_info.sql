-- A teen with an app login sees a page explaining that their Teen Support looks after them on
-- WhatsApp (frontend: TeenWelcomePage). This tells the app whether to show it, and who the Teen
-- Support is. A teen is a participant whose follow-up contact is TEENAGER / TEEN_ONBOARDED, and only
-- while teen handling is switched on, so admin "not a teen" lets them back into the full app.
--
-- Rollback: DROP FUNCTION public.participant_teen_info(text);

CREATE OR REPLACE FUNCTION public.participant_teen_info(p_token text)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_id UUID := public.app_participant_id(p_token);
  v_status TEXT;
  v_owner UUID;
  v_name TEXT;
  v_phone TEXT;
BEGIN
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'SESSION_EXPIRED';
  END IF;
  IF COALESCE((SELECT value = to_jsonb(true) FROM "AppSetting" WHERE "settingKey" = 'teen_flow_enabled'), false) IS NOT TRUE THEN
    RETURN json_build_object('isTeen', false);
  END IF;

  SELECT c."registrationStatus"::text, c."ownerId" INTO v_status, v_owner
  FROM "Participant" p
  JOIN "FollowUpContact" c ON c.id = p."followUpContactId"
  WHERE p.id = v_id;
  IF v_status IS NULL OR v_status NOT IN ('TEENAGER', 'TEEN_ONBOARDED') THEN
    RETURN json_build_object('isTeen', false);
  END IF;

  IF v_owner IS NOT NULL THEN
    SELECT u.name, CASE WHEN public.followup_phone_is_valid(u.phone) THEN u.phone END INTO v_name, v_phone
    FROM "User" u WHERE u.id = v_owner;
  END IF;

  RETURN json_build_object('isTeen', true, 'supportName', v_name, 'supportPhone', v_phone);
END;
$function$;
REVOKE ALL ON FUNCTION public.participant_teen_info(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.participant_teen_info(text) TO anon, authenticated;
