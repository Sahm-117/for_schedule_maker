-- Venue map follow-up: anyone already ready (or completed) counts as having done the
-- map step, so they are never asked again and a retry of participant_confirm_ready
-- from them cannot be refused. Replaces the whole state function (same body as
-- 20261008130000, which now carries this too), so order and re-runs are safe.
-- Idempotent.

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
  v_map := v_ob."venueMapAckAt" IS NOT NULL OR v_ob."readyConfirmedAt" IS NOT NULL OR v_ob."completedAt" IS NOT NULL;
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
