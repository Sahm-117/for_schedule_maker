-- Venue map: a fifth Get ready step. The participant opens the FOF venue map
-- (church entrance to the New VIP Lounge after first service) and ticks that
-- they understand it. "Ready" now needs it. Once their first attendance is
-- marked (present, late or left early) the Get ready list goes away; absent
-- people keep it. State gains venueMapAcknowledged and hasAttended.
-- Anyone already ready/completed keeps that (completedAt and readyConfirmedAt stay set).
-- Idempotent.

ALTER TABLE public."ParticipantOnboarding" ADD COLUMN IF NOT EXISTS "venueMapAckAt" TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.participant_onboarding_state(p_participant_id UUID)
 RETURNS JSONB
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_group UUID := public.discussion_participant_group(p_participant_id);
  v_ob public."ParticipantOnboarding";
  v_profile JSON := public.profile_completion_for(p_participant_id);
  v_intro BOOLEAN;
  v_support_intro BOOLEAN;
  v_guide BOOLEAN;
  v_profile_ok BOOLEAN := COALESCE((v_profile->>'percent')::int, 0) >= 100;
  v_ready BOOLEAN;
  v_first DATE;
  v_map BOOLEAN;
  v_attended BOOLEAN;
BEGIN
  SELECT * INTO v_ob FROM public."ParticipantOnboarding" WHERE "participantId" = p_participant_id;
  v_guide := v_ob."introGuideReadAt" IS NOT NULL;
  v_ready := v_ob."readyConfirmedAt" IS NOT NULL;
  v_map := v_ob."venueMapAckAt" IS NOT NULL;
  -- Seen in class at least once (present, late or left early): the Get ready list retires.
  v_attended := EXISTS (SELECT 1 FROM public."AttendanceRecord" ar
    WHERE ar."participantId" = p_participant_id AND ar.status IN ('PRESENT','LATE','LEFT_EARLY'));

  v_intro := v_group IS NOT NULL AND EXISTS (
    SELECT 1 FROM public."GroupPost" gp
    WHERE gp."groupId" = v_group AND gp.kind = 'INTRO' AND gp."authorParticipantId" = p_participant_id
      AND gp."deletedAt" IS NULL AND gp."removedAt" IS NULL);
  v_support_intro := v_group IS NOT NULL AND EXISTS (
    SELECT 1 FROM public."GroupPost" gp
    JOIN public."Group" g ON g.id = gp."groupId"
    WHERE gp."groupId" = v_group AND gp.kind = 'INTRO' AND gp."authorUserId" = g."supportId"
      AND gp."deletedAt" IS NULL AND gp."removedAt" IS NULL);

  SELECT public.week_class_date(c."startDate", 1, w."classDate") INTO v_first
  FROM public."Participant" p
  JOIN public."Cohort" c ON c.id = p."cohortId"
  LEFT JOIN public."Week" w ON w."cohortId" = c.id AND w."weekNumber" = 1
  WHERE p.id = p_participant_id;

  RETURN jsonb_build_object(
    'introPosted', v_intro,
    'supportIntroPosted', v_support_intro,
    'introGuideRead', v_guide,
    'profileComplete', v_profile_ok,
    'profileMissing', COALESCE((v_profile->>'missing')::int, 0),
    'venueMapAcknowledged', v_map,
    'hasAttended', v_attended,
    'readyConfirmed', v_ready,
    'completed', v_ob."completedAt" IS NOT NULL OR (v_intro AND v_guide AND v_profile_ok AND v_ready),
    'firstClassDate', v_first
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.participant_confirm_ready(p_token TEXT)
 RETURNS JSONB
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_me UUID := public.app_participant_id(p_token);
  v_state JSONB;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  v_state := public.participant_onboarding_state(v_me);
  IF NOT (v_state->>'introPosted')::boolean THEN RAISE EXCEPTION 'Post your introduction first'; END IF;
  IF NOT (v_state->>'introGuideRead')::boolean THEN RAISE EXCEPTION 'Read the Intro Class guide first'; END IF;
  IF NOT (v_state->>'profileComplete')::boolean THEN RAISE EXCEPTION 'Finish your profile first'; END IF;

  IF NOT (v_state->>'venueMapAcknowledged')::boolean THEN RAISE EXCEPTION 'Check the venue map first'; END IF;

  INSERT INTO public."ParticipantOnboarding" ("participantId", "readyConfirmedAt")
  VALUES (v_me, NOW())
  ON CONFLICT ("participantId") DO UPDATE
    SET "readyConfirmedAt" = COALESCE(public."ParticipantOnboarding"."readyConfirmedAt", NOW());

  PERFORM public.onboarding_try_complete(v_me);
  RETURN public.participant_onboarding_state(v_me);
END;
$function$;

CREATE OR REPLACE FUNCTION public.participant_ack_venue_map(p_token TEXT)
 RETURNS VOID
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_me UUID := public.app_participant_id(p_token);
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  INSERT INTO public."ParticipantOnboarding" ("participantId", "venueMapAckAt")
  VALUES (v_me, NOW())
  ON CONFLICT ("participantId") DO UPDATE
    SET "venueMapAckAt" = COALESCE(public."ParticipantOnboarding"."venueMapAckAt", NOW());
END;
$function$;

REVOKE ALL ON FUNCTION public.participant_ack_venue_map(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.participant_ack_venue_map(TEXT) TO anon, authenticated;
