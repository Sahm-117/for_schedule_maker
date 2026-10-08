-- What the app knows about each participant's phone, so a support or admin can see the type of phone
-- and when the app was last opened, instead of only a "Not installed" tag.
--   device               ios | ios-inapp | android | desktop (as last reported by the signed-in app)
--   installedAt          the first time they opened the app from their Home Screen (null: never)
--   lastOpenedInstalledAt  the last time they opened it from the Home Screen
--   lastSeenAt           the last time the signed-in app ran anywhere, browser or Home Screen
-- Staff only, like participants_without_app(); the app signs in as anon with a session token.
CREATE OR REPLACE FUNCTION public.participants_app_details()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NOT public.app_is_staff() THEN
    RAISE EXCEPTION 'You must be signed in as a support or admin';
  END IF;

  RETURN COALESCE((
    SELECT json_agg(json_build_object(
      'participantId', s."participantId",
      'device', s.device,
      'installedAt', s."installedAt",
      'lastOpenedInstalledAt', s."lastOpenedInstalledAt",
      'lastSeenAt', s."updatedAt"
    ))
    FROM "ParticipantAppState" s
  ), '[]'::json);
END;
$function$;

REVOKE ALL ON FUNCTION public.participants_app_details() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.participants_app_details() TO anon, authenticated;
