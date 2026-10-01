-- Admin "Reset first-time experience": makes the next sign-in feel brand new.
-- Clears the seen-tours list (Welcome + page tours), the Hub Lead / Recap / etc.
-- role introductions and the Get the app prompt counters. Optionally makes the
-- person choose a new password. Touches nothing else.
--
-- Rollback: DROP FUNCTION public.admin_reset_first_time(UUID, BOOLEAN),
--           public.admin_reset_participant_first_time(UUID);

CREATE OR REPLACE FUNCTION public.admin_reset_first_time(p_user_id UUID, p_force_password BOOLEAN DEFAULT FALSE)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NOT public.app_is_admin() THEN
    RAISE EXCEPTION 'Only admins can reset the first-time experience';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public."User" WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'User not found';
  END IF;
  DELETE FROM public."TourProgress" WHERE "userId" = p_user_id;
  DELETE FROM public."HubRoleIntroSeen" WHERE "userId" = p_user_id;
  UPDATE public."UserAppState"
     SET "sheetShown" = 0, "sheetDismissed" = 0, "lastSheetAt" = NULL, "updatedAt" = NOW()
   WHERE "userId" = p_user_id;
  IF COALESCE(p_force_password, FALSE) THEN
    UPDATE public."User" SET "mustChangePassword" = TRUE WHERE id = p_user_id;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_reset_participant_first_time(p_participant_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NOT public.app_is_admin() THEN
    RAISE EXCEPTION 'Only admins can reset the first-time experience';
  END IF;
  DELETE FROM public."TourProgress" WHERE "participantId" = p_participant_id;
  UPDATE public."ParticipantAppState"
     SET "sheetShown" = 0, "sheetDismissed" = 0, "lastSheetAt" = NULL, "updatedAt" = NOW()
   WHERE "participantId" = p_participant_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_reset_first_time(UUID, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_reset_participant_first_time(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_reset_first_time(UUID, BOOLEAN) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reset_participant_first_time(UUID) TO anon, authenticated;
