-- Any move to a different Practice seat clears that seat's steps, not only the "Play as" buttons:
-- a walkthrough that puts someone in a seat did the same stale-ticks thing. The check lives in
-- practice_place, which all of them go through. Rollback: restore practice_place from 20261001190000.
CREATE OR REPLACE FUNCTION public.practice_place(p_user uuid, p_role text, p_hub uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_c UUID := public.practice_ensure_cohort();
  v_old UUID;
  v_hub UUID;
  v_no INTEGER;
  v_n INTEGER;
BEGIN
  IF p_role NOT IN ('SUPPORT', 'HUB_LEAD', 'ASSISTANT', 'RECAP_LEAD', 'PRAYER_LEAD') THEN
    RAISE EXCEPTION 'Unknown seat';
  END IF;
  -- Many supports can be placed in the same moment: take turns.
  PERFORM pg_advisory_xact_lock(hashtext('practice_place'));
  SELECT "hubId" INTO v_old FROM public."HubMembership" WHERE "userId" = p_user AND "cohortId" = v_c LIMIT 1;

  UPDATE public."SupportHub" SET "leadUserId" = NULL WHERE "cohortId" = v_c AND "leadUserId" = p_user;
  UPDATE public."SupportHub" SET "assistantLeadUserId" = NULL WHERE "cohortId" = v_c AND "assistantLeadUserId" = p_user;
  UPDATE public."SupportHub"
     SET "recapLeadUserIds" = array_remove("recapLeadUserIds", p_user),
         "prayerLeadUserIds" = array_remove("prayerLeadUserIds", p_user)
   WHERE "cohortId" = v_c AND (p_user = ANY("recapLeadUserIds") OR p_user = ANY("prayerLeadUserIds"));
  DELETE FROM public."HubMembership" WHERE "userId" = p_user AND "cohortId" = v_c;

  v_hub := COALESCE(p_hub, v_old);
  IF v_hub IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public."SupportHub" WHERE id = v_hub AND "cohortId" = v_c) THEN
    v_hub := NULL;
  END IF;
  IF p_role = 'HUB_LEAD' AND v_hub IS NOT NULL
     AND (SELECT "leadUserId" FROM public."SupportHub" WHERE id = v_hub) IS NOT NULL THEN
    v_hub := NULL;
  END IF;
  IF v_hub IS NULL AND p_role = 'HUB_LEAD' THEN
    SELECT id INTO v_hub FROM public."SupportHub" WHERE "cohortId" = v_c AND "leadUserId" IS NULL ORDER BY name LIMIT 1;
  ELSIF v_hub IS NULL THEN
    -- The smallest hub with room (six people), otherwise a new one.
    SELECT h.id INTO v_hub
      FROM public."SupportHub" h
     WHERE h."cohortId" = v_c
       AND (SELECT count(*) FROM public."HubMembership" hm WHERE hm."hubId" = h.id) < 6
     ORDER BY (SELECT count(*) FROM public."HubMembership" hm WHERE hm."hubId" = h.id), h.name
     LIMIT 1;
  END IF;
  IF v_hub IS NULL THEN
    SELECT count(*) + 1 INTO v_n FROM public."SupportHub" WHERE "cohortId" = v_c;
    INSERT INTO public."SupportHub" ("cohortId", name, "meetingDay", "meetingTime", "meetingDurationMins", "callPlatform", "callLink", "assistantPermissions")
    VALUES (v_c, format('Practice Hub %s', v_n), upper(trim(to_char(timezone('Africa/Lagos', NOW()), 'Day'))), '19:00', 60, 'GOOGLE_MEET',
            'https://meet.google.com/practice-hub', ARRAY['ATTENDANCE', 'MESSAGE', 'GROUPS'])
    RETURNING id INTO v_hub;
  END IF;

  INSERT INTO public."HubMembership" ("hubId", "userId", "cohortId") VALUES (v_hub, p_user, v_c);
  IF p_role = 'HUB_LEAD' THEN
    UPDATE public."SupportHub" SET "leadUserId" = p_user WHERE id = v_hub;
  ELSIF p_role = 'ASSISTANT' THEN
    UPDATE public."SupportHub" SET "assistantLeadUserId" = p_user WHERE id = v_hub;
  ELSIF p_role = 'RECAP_LEAD' THEN
    UPDATE public."SupportHub" SET "recapLeadUserIds" = array_append("recapLeadUserIds", p_user) WHERE id = v_hub;
  ELSIF p_role = 'PRAYER_LEAD' THEN
    UPDATE public."SupportHub" SET "prayerLeadUserIds" = array_append("prayerLeadUserIds", p_user) WHERE id = v_hub;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public."Group" WHERE "supportId" = p_user AND "cohortId" = v_c) THEN
    SELECT COALESCE(max(substring(name FROM '[0-9]+$')::int), 0) + 1 INTO v_no FROM public."Group" WHERE "cohortId" = v_c;
    PERFORM public.practice_make_group(v_c, p_user, v_no);
  END IF;

  -- Moving to a different seat (by choice, or because a walkthrough needs it) starts that seat's
  -- steps fresh; the shared support steps stay.
  IF EXISTS (SELECT 1 FROM public."PracticeMember" WHERE "userId" = p_user AND role IS DISTINCT FROM p_role) THEN
    DELETE FROM public."PracticeProgress" WHERE "userId" = p_user AND "scenarioKey" NOT LIKE 'sup-%';
    UPDATE public."PracticeMember" SET "resetAt" = NOW() WHERE "userId" = p_user;
  END IF;
  UPDATE public."PracticeMember" SET role = p_role WHERE "userId" = p_user;
  UPDATE public."UserCohort"
     SET "supportKind" = CASE WHEN p_role = 'HUB_LEAD' THEN 'HUB_LEAD' ELSE 'PARTICIPANT_SUPPORT' END
   WHERE "userId" = p_user AND "cohortId" = v_c;
  RETURN v_hub;
END;
$function$;
