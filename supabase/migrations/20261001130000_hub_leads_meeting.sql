-- Hub Leads meeting, and admin-only meeting links and times.
--
-- 1. HubLeadsMeeting: one weekly meeting for all Hub Leads of a cohort. Locked
--    table (RLS on, no grants); read through get_hub_leads_meeting (the cohort's
--    Hub Leads and admins), written through set_hub_leads_meeting (admins only).
-- 2. update_hub_meeting (a hub's own weekly meeting) becomes admin-only. Before,
--    the hub lead, or an assistant with the MEETING switch, could change it. The
--    old 6-argument version is replaced by one with an optional "tell the hub"
--    flag. Existing meeting values are untouched.
-- Both setters can tell the people involved (in-app and push, through
-- invoke_hub_message_push) when something actually changed.
--
-- Rollback: DROP FUNCTION get_hub_leads_meeting, set_hub_leads_meeting;
-- DROP TABLE "HubLeadsMeeting"; restore update_hub_meeting from
-- 20260926120000_hub_roles.sql.

CREATE TABLE IF NOT EXISTS public."HubLeadsMeeting" (
  "cohortId" UUID PRIMARY KEY REFERENCES public."Cohort"(id) ON DELETE CASCADE,
  "meetingDay" TEXT,
  "meetingTime" TEXT,
  "meetingDurationMins" INTEGER,
  "callPlatform" TEXT CHECK ("callPlatform" IS NULL OR "callPlatform" IN ('WHATSAPP', 'GOOGLE_MEET')),
  "callLink" TEXT,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedById" UUID REFERENCES public."User"(id) ON DELETE SET NULL
);
ALTER TABLE public."HubLeadsMeeting" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."HubLeadsMeeting" FROM anon, authenticated;

-- Read ------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_hub_leads_meeting(p_cohort_id UUID)
 RETURNS JSONB
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT public.app_is_staff() THEN
    RAISE EXCEPTION 'You must be signed in as a support or admin';
  END IF;
  IF NOT public.app_is_admin() AND NOT EXISTS (
    SELECT 1 FROM public."SupportHub" h
    WHERE h."cohortId" = p_cohort_id AND h."leadUserId" = public.app_current_user_id()
  ) THEN
    RAISE EXCEPTION 'Only Hub Leads and admins can see the Hub Leads meeting';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_build_object(
      'cohortId', m."cohortId", 'meetingDay', m."meetingDay", 'meetingTime', m."meetingTime",
      'meetingDurationMins', m."meetingDurationMins", 'callPlatform', m."callPlatform", 'callLink', m."callLink")
    FROM public."HubLeadsMeeting" m WHERE m."cohortId" = p_cohort_id
  ), jsonb_build_object(
    'cohortId', p_cohort_id, 'meetingDay', NULL, 'meetingTime', NULL,
    'meetingDurationMins', NULL, 'callPlatform', NULL, 'callLink', NULL));
END;
$function$;

-- Write (admins only) -----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_hub_leads_meeting(
  p_cohort_id UUID,
  p_meeting_day TEXT,
  p_meeting_time TEXT,
  p_meeting_duration_mins INTEGER,
  p_call_platform TEXT,
  p_call_link TEXT,
  p_notify BOOLEAN DEFAULT FALSE
)
 RETURNS JSONB
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_old public."HubLeadsMeeting";
  v_new public."HubLeadsMeeting";
  v_leads UUID[];
BEGIN
  IF NOT public.app_is_admin() THEN
    RAISE EXCEPTION 'Only admins can set the Hub Leads meeting';
  END IF;
  IF p_call_platform IS NOT NULL AND p_call_platform NOT IN ('WHATSAPP', 'GOOGLE_MEET') THEN
    RAISE EXCEPTION 'Invalid call platform';
  END IF;

  SELECT * INTO v_old FROM public."HubLeadsMeeting" WHERE "cohortId" = p_cohort_id;

  INSERT INTO public."HubLeadsMeeting" AS m
    ("cohortId", "meetingDay", "meetingTime", "meetingDurationMins", "callPlatform", "callLink", "updatedAt", "updatedById")
  VALUES (p_cohort_id, p_meeting_day, p_meeting_time, p_meeting_duration_mins, p_call_platform, p_call_link, NOW(), public.app_current_user_id())
  ON CONFLICT ("cohortId") DO UPDATE
    SET "meetingDay" = EXCLUDED."meetingDay", "meetingTime" = EXCLUDED."meetingTime",
        "meetingDurationMins" = EXCLUDED."meetingDurationMins", "callPlatform" = EXCLUDED."callPlatform",
        "callLink" = EXCLUDED."callLink", "updatedAt" = NOW(), "updatedById" = EXCLUDED."updatedById"
  RETURNING * INTO v_new;

  IF p_notify AND (
    v_old."cohortId" IS NULL
    OR v_old."meetingDay" IS DISTINCT FROM v_new."meetingDay"
    OR v_old."meetingTime" IS DISTINCT FROM v_new."meetingTime"
    OR v_old."callLink" IS DISTINCT FROM v_new."callLink"
  ) AND v_new."meetingDay" IS NOT NULL AND v_new."meetingTime" IS NOT NULL THEN
    SELECT array_agg(DISTINCT h."leadUserId") INTO v_leads
    FROM public."SupportHub" h WHERE h."cohortId" = p_cohort_id AND h."leadUserId" IS NOT NULL;
    PERFORM public.invoke_hub_message_push(
      v_leads,
      'Hub Leads meeting',
      format('Now %s at %s. Open My Hub, then Leads.',
        initcap(lower(v_new."meetingDay")), to_char(v_new."meetingTime"::time, 'FMHH12:MI AM')));
  END IF;

  RETURN jsonb_build_object(
    'cohortId', v_new."cohortId", 'meetingDay', v_new."meetingDay", 'meetingTime', v_new."meetingTime",
    'meetingDurationMins', v_new."meetingDurationMins", 'callPlatform', v_new."callPlatform", 'callLink', v_new."callLink");
END;
$function$;

-- A hub's own weekly meeting: admins only now ------------------------------------
DROP FUNCTION IF EXISTS public.update_hub_meeting(UUID, TEXT, TEXT, INTEGER, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.update_hub_meeting(
  p_hub_id UUID,
  p_meeting_day TEXT,
  p_meeting_time TEXT,
  p_meeting_duration_mins INTEGER,
  p_call_platform TEXT,
  p_call_link TEXT,
  p_notify BOOLEAN DEFAULT FALSE
)
 RETURNS JSONB
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_old public."SupportHub";
  v_hub public."SupportHub";
  v_people UUID[];
BEGIN
  IF NOT public.app_is_admin() THEN
    RAISE EXCEPTION 'Only admins can set a hub''s meeting';
  END IF;
  IF p_call_platform IS NOT NULL AND p_call_platform NOT IN ('WHATSAPP', 'GOOGLE_MEET') THEN
    RAISE EXCEPTION 'Invalid call platform';
  END IF;

  SELECT * INTO v_old FROM public."SupportHub" WHERE id = p_hub_id;

  UPDATE public."SupportHub"
  SET "meetingDay" = p_meeting_day,
      "meetingTime" = p_meeting_time,
      "meetingDurationMins" = p_meeting_duration_mins,
      "callPlatform" = p_call_platform,
      "callLink" = p_call_link
  WHERE id = p_hub_id
  RETURNING * INTO v_hub;

  IF v_hub.id IS NULL THEN
    RAISE EXCEPTION 'Hub was not found';
  END IF;

  IF p_notify AND (
    v_old."meetingDay" IS DISTINCT FROM v_hub."meetingDay"
    OR v_old."meetingTime" IS DISTINCT FROM v_hub."meetingTime"
    OR v_old."callLink" IS DISTINCT FROM v_hub."callLink"
  ) AND v_hub."meetingDay" IS NOT NULL AND v_hub."meetingTime" IS NOT NULL THEN
    SELECT array_agg(DISTINCT u) INTO v_people FROM (
      SELECT m."userId" AS u FROM public."HubMembership" m WHERE m."hubId" = v_hub.id
      UNION SELECT v_hub."leadUserId" WHERE v_hub."leadUserId" IS NOT NULL
      UNION SELECT v_hub."assistantLeadUserId" WHERE v_hub."assistantLeadUserId" IS NOT NULL
    ) x;
    PERFORM public.invoke_hub_message_push(
      v_people,
      format('%s meeting', v_hub.name),
      format('Now %s at %s. Open My Hub to join.',
        initcap(lower(v_hub."meetingDay")), to_char(v_hub."meetingTime"::time, 'FMHH12:MI AM')));
  END IF;

  RETURN jsonb_build_object(
    'id', v_hub.id, 'name', v_hub.name, 'leadUserId', v_hub."leadUserId", 'cohortId', v_hub."cohortId",
    'meetingDay', v_hub."meetingDay", 'meetingTime', v_hub."meetingTime",
    'meetingDurationMins', v_hub."meetingDurationMins",
    'callPlatform', v_hub."callPlatform", 'callLink', v_hub."callLink"
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_hub_leads_meeting(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_hub_leads_meeting(UUID, TEXT, TEXT, INTEGER, TEXT, TEXT, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_hub_meeting(UUID, TEXT, TEXT, INTEGER, TEXT, TEXT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_hub_leads_meeting(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_hub_leads_meeting(UUID, TEXT, TEXT, INTEGER, TEXT, TEXT, BOOLEAN) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_hub_meeting(UUID, TEXT, TEXT, INTEGER, TEXT, TEXT, BOOLEAN) TO anon, authenticated;

-- The Notifications page names reminders by kind; give the new one a label.
CREATE OR REPLACE FUNCTION public.push_kind_label(p_kind TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_kind = 'OPEN_CONTACTS_8AM' THEN 'Follow-ups need attention (8am push)'
    WHEN p_kind LIKE 'NO_ACTIVITY_%' THEN 'No activity on your follow-ups'
    WHEN p_kind = 'GROUP_MEETING' THEN 'Group meeting reminder'
    WHEN p_kind = 'HUB_MEETING' THEN 'Hub meeting reminder'
    WHEN p_kind = 'HUB_LEADS_MEETING' THEN 'Hub Leads meeting reminder'
    WHEN p_kind = 'ACTIVITY' THEN 'Activity reminder'
    WHEN p_kind = 'RECAP_SUPPORT' THEN 'Class recap reminder'
    WHEN p_kind = 'MANUAL_SUPPORT' THEN 'Class manual reminder'
    ELSE p_kind
  END;
$$;
