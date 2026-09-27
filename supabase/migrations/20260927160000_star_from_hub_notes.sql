-- The ★ on a hub member now means "there's a note about them in this hub",
-- instead of a separate admin-set tag. Admins and that hub's Hub Lead see it
-- (the same people who can read the notes); a lead never sees it on themselves.
--
-- 1. build_hub_view: rebuilt from the LIVE definition; only isPersonOfInterest changes.
-- 2. The 11 people tagged from the FOF HUBS list get a note so their ★ stays.
--    HubPersonOfInterest is left in place (unused from now on) — nothing is dropped.

-- ── 1. build_hub_view ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.build_hub_view(p_hub_id uuid, p_cohort_id uuid, p_actor_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_hub public."SupportHub";
  v_is_lead BOOLEAN;
  v_is_assistant BOOLEAN;
  v_is_it_support BOOLEAN;
  v_can_meeting BOOLEAN;
  v_can_attendance BOOLEAN;
  v_can_message BOOLEAN;
  v_show_acks BOOLEAN;
  v_show_poi BOOLEAN;
  v_my_jobs TEXT[];
  v_result JSON;
BEGIN
  SELECT * INTO v_hub FROM public."SupportHub" WHERE id = p_hub_id;
  IF v_hub.id IS NULL THEN
    RETURN NULL;
  END IF;

  v_is_lead := (v_hub."leadUserId" = p_actor_id);
  v_is_assistant := (v_hub."assistantLeadUserId" = p_actor_id);
  v_is_it_support := EXISTS (SELECT 1 FROM public."HubItSupport" WHERE "hubId" = p_hub_id AND "userId" = p_actor_id);

  v_can_meeting := v_is_lead OR (v_is_assistant AND 'MEETING' = ANY(COALESCE(v_hub."assistantPermissions", ARRAY[]::TEXT[])));
  v_can_attendance := v_is_lead OR (v_is_assistant AND 'ATTENDANCE' = ANY(COALESCE(v_hub."assistantPermissions", ARRAY[]::TEXT[])));
  v_can_message := v_is_lead OR (v_is_assistant AND 'MESSAGE' = ANY(COALESCE(v_hub."assistantPermissions", ARRAY[]::TEXT[])));
  v_show_acks := v_is_lead OR v_is_assistant OR public.app_is_admin();
  -- ★ on a member = there's a note about them in this hub. Admins and this hub's lead only (not assistant).
  v_show_poi := v_is_lead OR public.app_is_admin();

  v_my_jobs := array_remove(ARRAY[
    CASE WHEN v_is_lead THEN 'HUB_LEAD' END,
    CASE WHEN v_is_assistant THEN 'ASSISTANT_HUB_LEAD' END,
    CASE WHEN p_actor_id = ANY(v_hub."recapLeadUserIds") THEN 'RECAP_LEAD' END,
    CASE WHEN p_actor_id = ANY(v_hub."prayerLeadUserIds") THEN 'PRAYER_LEAD' END,
    CASE WHEN v_is_it_support THEN 'IT_SUPPORT' END
  ], NULL);

  SELECT json_build_object(
    'hub', json_build_object(
      'id', v_hub.id, 'name', v_hub.name, 'cohortId', v_hub."cohortId",
      'leadUserId', v_hub."leadUserId", 'leadName', (SELECT name FROM public."User" WHERE id = v_hub."leadUserId"),
      'assistantLeadUserId', v_hub."assistantLeadUserId", 'assistantLeadName', (SELECT name FROM public."User" WHERE id = v_hub."assistantLeadUserId"),
      'assistantPermissions', to_json(v_hub."assistantPermissions"),
      'recapLeadUserIds', to_json(v_hub."recapLeadUserIds"),
      'recapLeadNames', COALESCE((SELECT json_agg(u.name ORDER BY u.name) FROM public."User" u WHERE u.id = ANY(v_hub."recapLeadUserIds")), '[]'::json),
      'prayerLeadUserIds', to_json(v_hub."prayerLeadUserIds"),
      'prayerLeadNames', COALESCE((SELECT json_agg(u.name ORDER BY u.name) FROM public."User" u WHERE u.id = ANY(v_hub."prayerLeadUserIds")), '[]'::json),
      -- Joined names kept under the old keys so an older cached app build still
      -- shows who leads each part.
      'recapLeadName', (SELECT string_agg(u.name, ' & ' ORDER BY u.name) FROM public."User" u WHERE u.id = ANY(v_hub."recapLeadUserIds")),
      'prayerLeadName', (SELECT string_agg(u.name, ' & ' ORDER BY u.name) FROM public."User" u WHERE u.id = ANY(v_hub."prayerLeadUserIds")),
      'meetingDay', v_hub."meetingDay", 'meetingTime', v_hub."meetingTime", 'meetingDurationMins', v_hub."meetingDurationMins",
      'callPlatform', v_hub."callPlatform", 'callLink', v_hub."callLink",
      'itSupports', COALESCE((
        SELECT json_agg(json_build_object('userId', u.id, 'name', u.name) ORDER BY u.name)
        FROM public."HubItSupport" hi JOIN public."User" u ON u.id = hi."userId"
        WHERE hi."hubId" = v_hub.id
      ), '[]'::json)
    ),
    'isLead', v_is_lead,
    'isAssistant', v_is_assistant,
    'isItSupport', v_is_it_support,
    'canMeeting', v_can_meeting,
    'canAttendance', v_can_attendance,
    'canMessage', v_can_message,
    'myJobs', to_json(v_my_jobs),
    'unseenIntroJobs', to_json(COALESCE((
      SELECT array_agg(j) FROM unnest(v_my_jobs) j
      WHERE j NOT IN (SELECT job FROM public."HubRoleIntroSeen" WHERE "userId" = p_actor_id AND "hubId" = v_hub.id)
    ), ARRAY[]::TEXT[])),
    'members', COALESCE((
      SELECT json_agg(json_build_object(
        'userId', u.id,
        'name', u.name,
        'phone', u.phone,
        'isLead', (u.id = v_hub."leadUserId"),
        'groupName', (SELECT g.name FROM public."Group" g WHERE g."supportId" = u.id AND g."cohortId" = p_cohort_id AND g."archivedAt" IS NULL ORDER BY g.name LIMIT 1),
        'jobs', to_json(array_remove(ARRAY[
          CASE WHEN u.id = v_hub."leadUserId" THEN 'HUB_LEAD' END,
          CASE WHEN u.id = v_hub."assistantLeadUserId" THEN 'ASSISTANT_HUB_LEAD' END,
          CASE WHEN u.id = ANY(v_hub."recapLeadUserIds") THEN 'RECAP_LEAD' END,
          CASE WHEN u.id = ANY(v_hub."prayerLeadUserIds") THEN 'PRAYER_LEAD' END
        ], NULL)),
        'isPersonOfInterest', CASE WHEN v_show_poi AND u.id <> p_actor_id THEN EXISTS (
          SELECT 1 FROM public."SupportNote" sn
          WHERE sn."hubId" = v_hub.id AND sn."supportId" = u.id AND sn."noteType" = 'NOTE'
        ) WHEN v_show_poi THEN FALSE ELSE NULL END
      ) ORDER BY u.name)
      FROM public."HubMembership" m
      JOIN public."User" u ON u.id = m."userId"
      WHERE m."hubId" = v_hub.id
    ), '[]'::json),
    'messages', COALESCE((
      SELECT json_agg(json_build_object(
        'id', msg.id, 'subject', msg.subject, 'body', msg.body,
        'authorId', msg."authorId", 'authorName', author.name,
        'createdAt', msg."createdAt", 'editedAt', msg."editedAt",
        'ackedByMe', EXISTS (SELECT 1 FROM public."HubMessageAck" a WHERE a."messageId" = msg.id AND a."userId" = p_actor_id),
        'ackCount', (SELECT COUNT(*) FROM public."HubMessageAck" a WHERE a."messageId" = msg.id),
        'memberCount', (SELECT COUNT(*) FROM public."HubMembership" m WHERE m."hubId" = v_hub.id AND m."userId" <> p_actor_id),
        'ackedUserIds', CASE WHEN v_show_acks THEN (
          SELECT COALESCE(json_agg(a."userId"), '[]'::json) FROM public."HubMessageAck" a WHERE a."messageId" = msg.id
        ) ELSE NULL END
      ) ORDER BY msg."createdAt" DESC)
      FROM public."HubMessage" msg
      LEFT JOIN public."User" author ON author.id = msg."authorId"
      WHERE msg."hubId" = v_hub.id
    ), '[]'::json),
    'myAttendance', COALESCE((
      SELECT json_agg(json_build_object(
        'sessionId', s.id, 'type', s.type, 'title', s.title, 'sessionDate', s."sessionDate",
        'weekId', s."weekId", 'status', a.status, 'notes', s.notes, 'submittedAt', s."submittedAt"
      ) ORDER BY s."sessionDate" DESC)
      FROM public."SupportSessionAttendance" a
      JOIN public."SupportSession" s ON s.id = a."sessionId"
      WHERE a."userId" = p_actor_id AND s."cohortId" = p_cohort_id
    ), '[]'::json),
    'meetingLive', (
      SELECT CASE
        WHEN s."startedAt" IS NOT NULL AND s."submittedAt" IS NULL AND s."startedAt" > NOW() - INTERVAL '3 hours'
          THEN json_build_object('weekId', s."weekId", 'startedAt', s."startedAt")
        ELSE NULL
      END
      FROM public."SupportSession" s
      WHERE s."hubId" = v_hub.id AND s.type = 'SUNDAY_RECAP' AND s."startedAt" IS NOT NULL
      ORDER BY s."startedAt" DESC
      LIMIT 1
    )
  ) INTO v_result;

  RETURN v_result;
END;
$function$;


-- ── 2. Notes for the people tagged before this change ──────────────────────
INSERT INTO public."SupportNote" ("supportId", "authorId", "hubId", "noteType", body)
SELECT poi."userId", '34393d4f-7a6c-4e65-8f25-12ddae64862b'::uuid, poi."hubId", 'NOTE',
       'Flagged, might not be consistent with meetings'
FROM public."HubPersonOfInterest" poi
WHERE NOT EXISTS (
  SELECT 1 FROM public."SupportNote" sn
  WHERE sn."supportId" = poi."userId" AND sn."hubId" = poi."hubId" AND sn."noteType" = 'NOTE'
);
