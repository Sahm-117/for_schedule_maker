-- Notification check, part 1: which active participant logins cannot receive
-- a push alert. "ParticipantAccount" and "ParticipantPushSubscription" are
-- both locked (REVOKE ALL FROM anon, authenticated -- see
-- 20260917110000_participant_accounts.sql and
-- 20260917130000_participant_app_group_faith_profile.sql), reachable only
-- through SECURITY DEFINER functions. Staff need to see, per participant,
-- "has an active login but no saved push subscription" for the support and
-- admin participant lists' "No alerts" tag/filter -- this is that function.
--
-- Same auth pattern as support_recaps/get_my_hub (20260924000000_support_hubs.sql,
-- 20260925060000_recap_release_times.sql): app_is_staff() reads the
-- x-session-token header directly, no token parameter needed.
--
-- Not applied. Frontend calls this via supabase.rpc('participants_without_push')
-- and treats a missing-function error the same as an empty result (no tag, no
-- console error) until this migration is run.

CREATE OR REPLACE FUNCTION public.participants_without_push()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NOT public.app_is_staff() THEN
    RAISE EXCEPTION 'You must be signed in as a support or admin';
  END IF;

  RETURN COALESCE((
    SELECT json_agg(a."participantId")
    FROM "ParticipantAccount" a
    WHERE a."isActive"
      AND NOT EXISTS (
        SELECT 1 FROM "ParticipantPushSubscription" s WHERE s."participantId" = a."participantId"
      )
  ), '[]'::json);
END;
$function$;

REVOKE ALL ON FUNCTION public.participants_without_push() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.participants_without_push() TO anon, authenticated;
