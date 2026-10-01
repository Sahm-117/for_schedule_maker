-- Practice always has today as class day. The calendar stayed wherever it was last set (it was
-- left on "4 October"), so attendance showed "starts on Sunday 4 October" and could not be started.
-- The first beat each day now moves the practice weeks so week 1's class day is today.
-- Rollback: restore practice_pulse(boolean) from 20261001300000.
CREATE OR REPLACE FUNCTION public.practice_pulse(p_active boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_me UUID := public.app_current_user_id();
  v_member public."PracticeMember";
  v_on BOOLEAN;
  v_key TEXT;
  v_active JSONB;
  r public."PracticePeer";
  v_partner UUID;
  v_iam_pt BOOLEAN;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('member', FALSE, 'cohortKey', '');
  END IF;
  SELECT string_agg("cohortId"::text, ',' ORDER BY "cohortId"::text) INTO v_key FROM public."UserCohort" WHERE "userId" = v_me;
  SELECT * INTO v_member FROM public."PracticeMember" WHERE "userId" = v_me;
  SELECT COALESCE("practiceOn", FALSE) INTO v_on FROM public."Cohort" WHERE "isPractice" LIMIT 1;
  -- Practice is open to every support: while it is on, the first beat enrols them.
  IF v_member."userId" IS NULL AND COALESCE(v_on, FALSE)
     AND EXISTS (SELECT 1 FROM public."User" WHERE id = v_me AND role = 'SUPPORT' AND "isActive") THEN
    INSERT INTO public."PracticeMember" ("userId", role) VALUES (v_me, 'SUPPORT') ON CONFLICT ("userId") DO NOTHING;
    SELECT * INTO v_member FROM public."PracticeMember" WHERE "userId" = v_me;
  END IF;
  IF v_member."userId" IS NULL THEN
    RETURN jsonb_build_object('member', FALSE, 'on', COALESCE(v_on, FALSE), 'cohortKey', COALESCE(v_key, ''));
  END IF;
  IF COALESCE(v_on, FALSE) THEN
    -- Practice's calendar always has today as class day, so attendance can be started any day
    -- (it used to stay on the day it was last set, e.g. "opens Sunday 4 October").
    IF EXISTS (SELECT 1 FROM public."Cohort" WHERE "isPractice" AND "startDate" IS DISTINCT FROM (timezone('Africa/Lagos', NOW()))::date) THEN
      PERFORM public.practice_apply_calendar((SELECT id FROM public."Cohort" WHERE "isPractice" LIMIT 1), 'CLASS_DAY');
    END IF;
    -- Placed in Practice (group, hub, cohort menu) the first time, and kept there.
    IF NOT EXISTS (SELECT 1 FROM public."HubMembership" hm JOIN public."Cohort" c ON c.id = hm."cohortId" WHERE hm."userId" = v_me AND c."isPractice") THEN
      PERFORM public.practice_place(v_me, v_member.role, NULL);
    END IF;
    INSERT INTO public."UserCohort" ("userId", "cohortId", "supportKind")
    SELECT v_me, c.id, CASE WHEN v_member.role = 'HUB_LEAD' THEN 'HUB_LEAD' ELSE 'PARTICIPANT_SUPPORT' END
      FROM public."Cohort" c
     WHERE c."isPractice"
       AND NOT EXISTS (SELECT 1 FROM public."UserCohort" uc WHERE uc."userId" = v_me AND uc."cohortId" = c.id);
    SELECT string_agg("cohortId"::text, ',' ORDER BY "cohortId"::text) INTO v_key FROM public."UserCohort" WHERE "userId" = v_me;
  END IF;
  IF p_active AND NOT v_member."inParticipantView" THEN
    UPDATE public."PracticeMember" SET "lastSeenAt" = NOW() WHERE "userId" = v_me;
  END IF;
  IF p_active AND COALESCE(v_on, FALSE) THEN
    PERFORM public.practice_autotick_staff(v_me);
    PERFORM public.practice_autotick_participant(pp."participantId") FROM public."PracticePeer" pp
      WHERE pp.status = 'ACTIVE' AND pp."participantId" IS NOT NULL AND v_me IN (pp."fromUserId", pp."toUserId");
  END IF;

  SELECT * INTO r FROM public."PracticePeer"
   WHERE status = 'ACTIVE' AND v_me IN ("fromUserId", "toUserId") ORDER BY "respondedAt" DESC LIMIT 1;
  IF r.id IS NOT NULL THEN
    v_partner := CASE WHEN r."fromUserId" = v_me THEN r."toUserId" ELSE r."fromUserId" END;
    v_iam_pt := (CASE WHEN r."fromUserId" = v_me THEN r."fromRole" ELSE r."toRole" END) = 'PARTICIPANT';
    v_active := jsonb_build_object(
      'id', r.id,
      'partnerUserId', v_partner,
      'partnerName', (SELECT name FROM public."User" WHERE id = v_partner),
      'myRole', CASE WHEN r."fromUserId" = v_me THEN r."fromRole" ELSE r."toRole" END,
      'partnerRole', CASE WHEN r."fromUserId" = v_me THEN r."toRole" ELSE r."fromRole" END,
      'iAmParticipant', v_iam_pt,
      'partnerPresent', COALESCE((SELECT "lastSeenAt" > NOW() - INTERVAL '30 seconds' FROM public."PracticeMember" WHERE "userId" = v_partner), FALSE),
      'partnerInParticipantView', COALESCE((SELECT "inParticipantView" FROM public."PracticeMember" WHERE "userId" = v_partner), FALSE),
      'myProgress', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('key', pp."scenarioKey", 'doneAt', pp."doneAt", 'stuckAt', pp."stuckAt"))
        FROM public."PracticeProgress" pp
        WHERE pp."scenarioKey" LIKE 'peer-%' AND (pp."userId" = v_me OR (v_iam_pt AND pp."participantId" = r."participantId"))), '[]'::jsonb),
      'partnerProgress', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('key', pp."scenarioKey", 'doneAt', pp."doneAt", 'stuckAt', pp."stuckAt"))
        FROM public."PracticeProgress" pp
        WHERE pp."scenarioKey" LIKE 'peer-%' AND (pp."userId" = v_partner OR (NOT v_iam_pt AND (CASE WHEN r."fromUserId" = v_me THEN r."toRole" ELSE r."fromRole" END) = 'PARTICIPANT' AND pp."participantId" = r."participantId"))), '[]'::jsonb)
    );
  END IF;

  RETURN jsonb_build_object(
    'member', TRUE,
    'on', COALESCE(v_on, FALSE),
    'role', v_member.role,
    'inParticipantView', v_member."inParticipantView",
    'cohortKey', COALESCE(v_key, ''),
    'incoming', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', pp.id, 'fromName', u.name, 'fromRole', pp."fromRole", 'toRole', pp."toRole") ORDER BY pp."createdAt")
      FROM public."PracticePeer" pp JOIN public."User" u ON u.id = pp."fromUserId"
      WHERE pp."toUserId" = v_me AND pp.status = 'PENDING' AND pp."createdAt" > NOW() - INTERVAL '1 hour'), '[]'::jsonb),
    'outgoing', (
      SELECT jsonb_build_object('id', pp.id, 'toName', u.name, 'myRole', pp."fromRole", 'theirRole', pp."toRole")
      FROM public."PracticePeer" pp JOIN public."User" u ON u.id = pp."toUserId"
      WHERE pp."fromUserId" = v_me AND pp.status = 'PENDING' AND pp."createdAt" > NOW() - INTERVAL '1 hour'
      ORDER BY pp."createdAt" DESC LIMIT 1),
    'active', v_active
  );
END;
$function$;

SELECT public.practice_apply_calendar((SELECT id FROM public."Cohort" WHERE "isPractice" LIMIT 1), 'CLASS_DAY') WHERE EXISTS (SELECT 1 FROM public."Cohort" WHERE "isPractice");
