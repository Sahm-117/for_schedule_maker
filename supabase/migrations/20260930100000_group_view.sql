-- Group view for hub leads and admins (Group Discussion, step 1).
--
-- A hub lead taps a support in their hub and sees that support's group:
-- meeting day, time, platform and a Join call link. Admins see every group.
-- Later steps add the discussion activity report and "Read the discussion"
-- to the same view.
--
-- 1. New assistant permission GROUPS ("See groups"): an assistant hub lead
--    sees the group view only when the hub lead grants it. The CHECK
--    constraint and set_assistant_permissions both learn the new value.
-- 2. get_support_group_view(p_support_id, p_cohort_id): read-only, SECURITY
--    DEFINER. Allowed for admins, or for anyone app_hub_can(hub, 'GROUPS')
--    on a hub that the support belongs to in that cohort (the lead always
--    passes app_hub_can). Returns NULL when the support has no group.

-- 1. GROUPS permission ------------------------------------------------------

ALTER TABLE public."SupportHub" DROP CONSTRAINT IF EXISTS "SupportHub_assistantPermissions_check";
ALTER TABLE public."SupportHub" ADD CONSTRAINT "SupportHub_assistantPermissions_check"
  CHECK ("assistantPermissions" <@ ARRAY['MEETING'::text, 'ATTENDANCE'::text, 'MESSAGE'::text, 'GROUPS'::text]);

CREATE OR REPLACE FUNCTION public.set_assistant_permissions(p_hub_id uuid, p_perms text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor_id UUID;
  v_perms TEXT[];
  v_perm TEXT;
  v_hub public."SupportHub";
BEGIN
  IF NOT public.app_is_staff() THEN
    RAISE EXCEPTION 'You must be signed in as a support or admin';
  END IF;
  v_actor_id := public.app_current_user_id();

  IF NOT public.app_is_admin() THEN
    IF NOT EXISTS (SELECT 1 FROM public."SupportHub" h WHERE h.id = p_hub_id AND h."leadUserId" = v_actor_id) THEN
      RAISE EXCEPTION 'Only this hub''s lead or an admin can set its assistant''s permissions';
    END IF;
  END IF;

  v_perms := COALESCE(p_perms, ARRAY[]::TEXT[]);
  FOREACH v_perm IN ARRAY v_perms LOOP
    IF v_perm NOT IN ('MEETING', 'ATTENDANCE', 'MESSAGE', 'GROUPS') THEN
      RAISE EXCEPTION 'Invalid permission: %', v_perm;
    END IF;
  END LOOP;

  UPDATE public."SupportHub"
  SET "assistantPermissions" = v_perms
  WHERE id = p_hub_id
  RETURNING * INTO v_hub;

  IF v_hub.id IS NULL THEN
    RAISE EXCEPTION 'Hub was not found';
  END IF;

  RETURN jsonb_build_object('id', v_hub.id, 'assistantPermissions', v_hub."assistantPermissions");
END;
$function$;

-- 2. get_support_group_view --------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_support_group_view(p_support_id uuid, p_cohort_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_hub_name TEXT;
  v_result JSON;
BEGIN
  IF NOT public.app_is_staff() THEN
    RAISE EXCEPTION 'You must be signed in as a support or admin';
  END IF;

  -- The support's hub this cohort (one hub per support per cohort).
  SELECT h.name INTO v_hub_name
  FROM public."HubMembership" m
  JOIN public."SupportHub" h ON h.id = m."hubId"
  WHERE m."userId" = p_support_id AND m."cohortId" = p_cohort_id
  ORDER BY h.name
  LIMIT 1;

  IF NOT public.app_is_admin() AND NOT EXISTS (
    SELECT 1
    FROM public."HubMembership" m
    WHERE m."userId" = p_support_id
      AND m."cohortId" = p_cohort_id
      AND public.app_hub_can(m."hubId", 'GROUPS')
  ) THEN
    RAISE EXCEPTION 'You can only see the groups of supports in a hub you lead';
  END IF;

  SELECT json_build_object(
    'groupId', g.id,
    'groupName', g.name,
    'supportId', u.id,
    'supportName', u.name,
    'supportAvatarUrl', u."avatarUrl",
    'hubName', v_hub_name,
    'meetingDay', g."meetingDay",
    'meetingTime', g."meetingTime",
    'meetingDurationMins', g."meetingDurationMins",
    'callPlatform', g."callPlatform",
    'callLink', g."callLink",
    'participantCount', (
      SELECT count(*)
      FROM public."GroupParticipant" gp
      JOIN public."Participant" p ON p.id = gp."participantId"
      WHERE gp."groupId" = g.id AND p.status = 'ACTIVE'
    )
  )
  INTO v_result
  FROM public."Group" g
  JOIN public."User" u ON u.id = g."supportId"
  WHERE g."supportId" = p_support_id
    AND g."cohortId" = p_cohort_id
    AND g."archivedAt" IS NULL
  ORDER BY g.name
  LIMIT 1;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_support_group_view(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_support_group_view(UUID, UUID) TO anon, authenticated;
