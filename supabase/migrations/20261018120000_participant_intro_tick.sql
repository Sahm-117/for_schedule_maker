-- "Introduce yourself" stays for a participant who has been to class but has not posted their intro.
-- They can tick it themselves (for example, they introduced themselves on the call), but only once
-- their support has introduced themselves, as for posting an intro.
--
-- 1. ParticipantOnboarding gains introTickedAt.
-- 2. participant_tick_intro(token): the signed-in participant ticks their own intro; refused with
--    SUPPORT_NOT_INTRODUCED until their group's support has posted an intro.
-- 3. participant_onboarding_state: introPosted is true when they posted an intro OR ticked it, and it
--    returns introTicked. The rest is the live definition, unchanged.

ALTER TABLE public."ParticipantOnboarding"
  ADD COLUMN IF NOT EXISTS "introTickedAt" TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.participant_tick_intro(p_token TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_me UUID := public.app_participant_id(p_token);
  v_group UUID;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  v_group := public.discussion_participant_group(v_me);
  IF v_group IS NULL OR NOT EXISTS (
    SELECT 1 FROM public."GroupPost" gp
    JOIN public."Group" g ON g.id = gp."groupId"
    WHERE gp."groupId" = v_group AND gp.kind = 'INTRO' AND gp."authorUserId" = g."supportId"
      AND gp."deletedAt" IS NULL AND gp."removedAt" IS NULL) THEN
    RAISE EXCEPTION 'SUPPORT_NOT_INTRODUCED';
  END IF;
  INSERT INTO public."ParticipantOnboarding" ("participantId", "introTickedAt")
  VALUES (v_me, now())
  ON CONFLICT ("participantId") DO UPDATE
    SET "introTickedAt" = COALESCE(public."ParticipantOnboarding"."introTickedAt", now());
END;
$$;

REVOKE ALL ON FUNCTION public.participant_tick_intro(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.participant_tick_intro(TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.participant_onboarding_state(p_participant_id uuid)
 RETURNS jsonb
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
  v_intro_ticked BOOLEAN;
BEGIN
  SELECT * INTO v_ob FROM public."ParticipantOnboarding" WHERE "participantId" = p_participant_id;
  v_guide := v_ob."introGuideReadAt" IS NOT NULL;
  v_ready := v_ob."readyConfirmedAt" IS NOT NULL;
  v_map := v_ob."venueMapAckAt" IS NOT NULL OR v_ob."readyConfirmedAt" IS NOT NULL OR v_ob."completedAt" IS NOT NULL;
  v_intro_ticked := v_ob."introTickedAt" IS NOT NULL;
  -- Seen in class at least once (present, late or left early): the Get ready list retires.
  v_attended := EXISTS (SELECT 1 FROM public."AttendanceRecord" ar
    WHERE ar."participantId" = p_participant_id AND ar.status IN ('PRESENT','LATE','LEFT_EARLY'));

  -- Posted their intro in the group, or ticked it themselves.
  v_intro := v_intro_ticked OR (v_group IS NOT NULL AND EXISTS (
    SELECT 1 FROM public."GroupPost" gp
    WHERE gp."groupId" = v_group AND gp.kind = 'INTRO' AND gp."authorParticipantId" = p_participant_id
      AND gp."deletedAt" IS NULL AND gp."removedAt" IS NULL));
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
    'introTicked', v_intro_ticked,
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
