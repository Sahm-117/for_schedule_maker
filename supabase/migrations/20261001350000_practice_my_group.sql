-- The Practice pop-up tells a person which group and hub they are in, and who the practice
-- participants in it are, so they know what their actions are seen by.
-- Rollback: restore practice_my_progress from 20261001170000_practice_mode.sql.
CREATE OR REPLACE FUNCTION public.practice_my_progress()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_me UUID := public.app_current_user_id();
  v_role TEXT;
  v_c UUID;
  v_group UUID;
  v_group_name TEXT;
  v_hub_name TEXT;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('role', NULL, 'items', '[]'::jsonb);
  END IF;
  SELECT role INTO v_role FROM public."PracticeMember" WHERE "userId" = v_me;
  SELECT id INTO v_c FROM public."Cohort" WHERE "isPractice" LIMIT 1;
  SELECT g.id, g.name INTO v_group, v_group_name
    FROM public."Group" g WHERE g."cohortId" = v_c AND g."supportId" = v_me AND g."archivedAt" IS NULL
    ORDER BY g.name LIMIT 1;
  SELECT h.name INTO v_hub_name
    FROM public."HubMembership" hm JOIN public."SupportHub" h ON h.id = hm."hubId"
   WHERE hm."userId" = v_me AND hm."cohortId" = v_c LIMIT 1;
  RETURN jsonb_build_object(
    'role', v_role,
    'groupName', v_group_name,
    'hubName', v_hub_name,
    'groupParticipants', COALESCE((
      SELECT jsonb_agg(p."fullName" ORDER BY p."fullName")
      FROM public."GroupParticipant" gp JOIN public."Participant" p ON p.id = gp."participantId"
      WHERE gp."groupId" = v_group), '[]'::jsonb),
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('key', pp."scenarioKey", 'doneAt', pp."doneAt", 'stuckAt', pp."stuckAt"))
      FROM public."PracticeProgress" pp WHERE pp."userId" = v_me), '[]'::jsonb));
END;
$function$;
