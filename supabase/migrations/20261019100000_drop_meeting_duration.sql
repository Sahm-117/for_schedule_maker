-- Meeting lengths are gone from the app (migrations 20261018*, FLOW_MAP rule 78): meetings have a day and a time only.
-- This removes the now-unused columns and every function reference to them.
--
-- Group, SupportHub and HubLeadsMeeting lose "meetingDurationMins". The two RPCs that hubs use to save their meeting
-- (update_hub_meeting, set_hub_leads_meeting) keep their p_meeting_duration_mins argument in the signature and ignore it,
-- so an app tab that is still open from before this change keeps working; it can be removed in a later clean-up.
--
-- Apply AFTER the app version that no longer writes the column is live (an older app writes meetingDurationMins: null).

-- build_hub_view
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
      'meetingDay', v_hub."meetingDay", 'meetingTime', v_hub."meetingTime", 
      'callPlatform', v_hub."callPlatform", 'callLink', v_hub."callLink",
      'itSupports', COALESCE((
        SELECT json_agg(json_build_object('userId', u.id, 'name', u.name, 'avatarUrl', u."avatarUrl") ORDER BY u.name)
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
        'avatarUrl', u."avatarUrl",
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

-- get_hub_leads_meeting
CREATE OR REPLACE FUNCTION public.get_hub_leads_meeting(p_cohort_id uuid)
 RETURNS jsonb
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
      'callPlatform', m."callPlatform", 'callLink', m."callLink")
    FROM public."HubLeadsMeeting" m WHERE m."cohortId" = p_cohort_id
  ), jsonb_build_object(
    'cohortId', p_cohort_id, 'meetingDay', NULL, 'meetingTime', NULL,
    'callPlatform', NULL, 'callLink', NULL));
END;
$function$;

-- get_support_group_view
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

-- participant_home
CREATE OR REPLACE FUNCTION public.participant_home(p_token text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  person_id UUID := public.app_participant_id(p_token);
  person "Participant";
  cohort "Cohort";
  grp "Group";
  support "User";
BEGIN
  IF person_id IS NULL THEN
    RAISE EXCEPTION 'SESSION_EXPIRED';
  END IF;

  SELECT * INTO person FROM "Participant" WHERE id = person_id;
  SELECT * INTO cohort FROM "Cohort" WHERE id = person."cohortId";
  SELECT g.* INTO grp
  FROM "GroupParticipant" gp
  JOIN "Group" g ON g.id = gp."groupId" AND g."cohortId" = person."cohortId"
  WHERE gp."participantId" = person_id
  LIMIT 1;
  SELECT * INTO support FROM "User" WHERE id = grp."supportId";

  RETURN json_build_object(
    'now', NOW(),
    'participant', json_build_object('id', person.id, 'name', person."fullName", 'phone', person.phone),
    'cohort', CASE WHEN cohort.id IS NULL THEN NULL ELSE json_build_object(
      'id', cohort.id, 'name', cohort.name, 'startDate', cohort."startDate", 'endDate', cohort."endDate",
      'status', cohort.status, 'venue', cohort.venue
    ) END,
    'group', CASE WHEN grp.id IS NULL THEN NULL ELSE json_build_object(
      'id', grp.id, 'name', grp.name, 'meetingDay', grp."meetingDay", 'meetingTime', grp."meetingTime",
      'callPlatform', grp."callPlatform", 'callLink', grp."callLink",
      'supportName', support.name, 'supportPhone', support.phone, 'supportAvatarUrl', support."avatarUrl"
    ) END,
    'groupMeetingLive', (
      SELECT json_build_object('weekId', gm."weekId", 'startedAt', gm.started, 'prayerFinished', gps."prayerFinishedAt" IS NOT NULL, 'recapFinished', gps."recapFinishedAt" IS NOT NULL,
        'recap', CASE WHEN gps."prayerFinishedAt" IS NOT NULL
          AND COALESCE(lw."shareWithParticipants", FALSE)
          AND (btrim(COALESCE(lw."recapSummary", '')) <> '' OR lw."recapDocumentUrl" IS NOT NULL)
          THEN json_build_object(
            'recapSummary', lw."recapSummary", 'discussionPrompt', lw."discussionPrompt",
            'recapDocumentUrl', lw."recapDocumentUrl", 'recapDocumentName', lw."recapDocumentName"
          ) END)
      FROM (
        SELECT m."weekId" AS "weekId", MIN(m."markedAt") AS started
        FROM "MeetingAttendance" m
        WHERE m."groupId" = grp.id
        GROUP BY m."weekId"
      ) gm
      LEFT JOIN "GroupPrayerStatus" gps ON gps."groupId" = grp.id AND gps."weekId" = gm."weekId"
      LEFT JOIN "Week" lw ON lw.id = gm."weekId"
      WHERE gm.started > NOW() - INTERVAL '3 hours'
        AND COALESCE(gps.done, FALSE) = FALSE
      ORDER BY gm.started DESC
      LIMIT 1
    ),
    'groupPrayerFocus', (
      SELECT json_build_object(
        'weekId', f."weekId",
        'participantName', fp_person."fullName",
        'projectText', (
          SELECT fp.body FROM "FaithProject" fp
          WHERE fp."participantId" = fp_person.id AND public.faith_project_prayable(fp)
          ORDER BY fp."updatedAt" DESC LIMIT 1
        )
      )
      FROM "GroupPrayerFocus" f
      JOIN "Participant" fp_person ON fp_person.id = f."participantId"
      WHERE f."groupId" = grp.id
        AND f."weekId" = (
          SELECT gm."weekId"
          FROM (
            SELECT m."weekId" AS "weekId", MIN(m."markedAt") AS started
            FROM "MeetingAttendance" m
            WHERE m."groupId" = grp.id
            GROUP BY m."weekId"
          ) gm
          LEFT JOIN "GroupPrayerStatus" gps ON gps."groupId" = grp.id AND gps."weekId" = gm."weekId"
          WHERE gm.started > NOW() - INTERVAL '3 hours'
            AND COALESCE(gps.done, FALSE) = FALSE
          ORDER BY gm.started DESC
          LIMIT 1
        )
    ),
    'weeks', COALESCE((
      SELECT json_agg(json_build_object(
        'id', w.id,
        'weekNumber', w."weekNumber",
        'classDate', public.week_class_date(cohort."startDate", w."weekNumber", w."classDate"),
        'title', w.title,
        'teacher', CASE
          WHEN public.fof_is_teen_age(person."ageRange") AND btrim(COALESCE(w."teenTeacherName", '')) <> '' THEN json_build_object(
            'name', btrim(w."teenTeacherName"), 'role', NULLIF(btrim(COALESCE(w."teenTeacherRole", '')), ''),
            'bio', NULLIF(btrim(COALESCE(w."teenTeacherBio", '')), ''), 'photoUrl', w."teenTeacherPhotoUrl"
          )
          WHEN btrim(COALESCE(w."teacherName", '')) <> '' THEN json_build_object(
            'name', btrim(w."teacherName"), 'role', NULLIF(btrim(COALESCE(w."teacherRole", '')), ''),
            'bio', NULLIF(btrim(COALESCE(w."teacherBio", '')), ''), 'photoUrl', w."teacherPhotoUrl"
          ) END,
        'classGraphicUrl', w."classGraphicUrl",
        'manualReleasesAt', CASE WHEN NOT manual_rel.released AND w."manualDocumentUrl" IS NOT NULL
          THEN public.recap_release_at(public.week_class_date(cohort."startDate", w."weekNumber", w."classDate"), 'manual') END,
        'classTime', (
          SELECT a.time FROM "Day" d JOIN "Activity" a ON a."dayId" = d.id
          WHERE d."weekId" = w.id AND d."dayName" = 'Sunday' AND a.description ~* '^\s*class\s*[0-9]|introductory class'
          ORDER BY a.time LIMIT 1
        ),
        'expectations', w.expectations,
        'shared', w."shareWithParticipants",
        'released', rel.released,
        'releasedAt', rel."releasedAt",
        'recapSummary', CASE WHEN rel.released THEN w."recapSummary" END,
        'discussionPrompt', CASE WHEN rel.released THEN w."discussionPrompt" END,
        'recapDocumentUrl', CASE WHEN rel.released THEN w."recapDocumentUrl" END,
        'recapDocumentName', CASE WHEN rel.released THEN w."recapDocumentName" END,
        'manual', CASE WHEN manual_rel.released AND w."manualDocumentUrl" IS NOT NULL THEN json_build_object(
          'documentUrl', w."manualDocumentUrl", 'documentName', w."manualDocumentName",
          'summary', w."manualSummary", 'discussionPrompt', w."manualDiscussionPrompt"
        ) END,
        'manualQuestions', COALESCE((
          SELECT json_agg(json_build_object(
            'id', mq.id, 'body', mq.body, 'status', mq.status, 'reply', mq.reply, 'createdAt', mq."createdAt"
          ) ORDER BY mq."createdAt")
          FROM "ManualQuestion" mq WHERE mq."weekId" = w.id AND mq."participantId" = person_id
        ), '[]'::json),
        'manualNote', (SELECT n.body FROM "ManualNote" n WHERE n."weekId" = w.id AND n."participantId" = person_id)
      ) ORDER BY w."weekNumber")
      FROM "Week" w
      CROSS JOIN LATERAL (
        SELECT
          COALESCE(w."shareWithParticipants" AND (
            btrim(COALESCE(w."recapSummary", '')) <> ''
            OR w."recapDocumentUrl" IS NOT NULL
          ) AND (
            w."participantReleasedEarlyAt" IS NOT NULL
            OR COALESCE(cohort."isPractice", FALSE)
            OR NOW() >= public.recap_release_at(public.week_class_date(cohort."startDate", w."weekNumber", w."classDate"), 'participant')
          ), FALSE) AS released,
          COALESCE(w."participantReleasedEarlyAt", public.recap_release_at(public.week_class_date(cohort."startDate", w."weekNumber", w."classDate"), 'participant')) AS "releasedAt"
        FROM (SELECT 1) one
      ) rel
      CROSS JOIN LATERAL (
        SELECT COALESCE(
          w."manualReleasedEarlyAt" IS NOT NULL
          OR NOW() >= public.recap_release_at(public.week_class_date(cohort."startDate", w."weekNumber", w."classDate"), 'manual'),
          FALSE
        ) AS released
      ) manual_rel
      WHERE w."cohortId" = person."cohortId"
    ), '[]'::json),
    'reflections', COALESCE((
      SELECT json_agg(json_build_object(
        'weekId', r."weekId", 'stoodOut', r."stoodOut", 'goal', r.goal, 'goalCheck', r."goalCheck",
        'goalDoneAt', r."goalDoneAt", 'createdAt', r."createdAt", 'updatedAt', r."updatedAt"
      ))
      FROM "Reflection" r WHERE r."participantId" = person_id
    ), '[]'::json),
    'sunday', COALESCE((
      SELECT json_agg(json_build_object('weekId', a."weekId", 'status', a.status, 'lateExcused', a."lateExcused"))
      FROM "AttendanceRecord" a JOIN "Week" w ON w.id = a."weekId" AND w."cohortId" = person."cohortId"
      WHERE a."participantId" = person_id
    ), '[]'::json),
    'meeting', COALESCE((
      SELECT json_agg(json_build_object('weekId', m."weekId", 'status', m.status))
      FROM "MeetingAttendance" m JOIN "Week" w ON w.id = m."weekId" AND w."cohortId" = person."cohortId"
      WHERE m."participantId" = person_id
    ), '[]'::json),
    'openWindow', (
      SELECT jsonb_build_object(
        'weekId', s."weekId",
        'closesAt', s."closesAt",
        'myStatus', (SELECT a.status FROM "AttendanceRecord" a WHERE a."weekId" = s."weekId" AND a."participantId" = person_id)
      )
      FROM "AttendanceSession" s
      JOIN "Week" w2 ON w2.id = s."weekId" AND w2."cohortId" = person."cohortId"
      WHERE s."startedAt" IS NOT NULL AND s."closesAt" > NOW() AND s."finalizedAt" IS NULL
      ORDER BY s."startedAt" DESC LIMIT 1
    ),
    'faithProjectStatus', (SELECT f.status FROM "FaithProject" f WHERE f."participantId" = person_id ORDER BY f."updatedAt" DESC LIMIT 1),
    'prayerConsent', person."prayerConsent",
    'prayerPrompt', CASE WHEN person."prayerConsent" IS NULL AND public.faith_prayers_prompt_due(person."cohortId")
      THEN json_build_object('startsOn', public.faith_prayers_start_date(person."cohortId")) ELSE NULL END,
    'rules', (SELECT value FROM "AppSetting" WHERE "settingKey" = 'programme_rules'),
    'scriptures', CASE WHEN COALESCE((SELECT (value #>> '{}')::boolean FROM "AppSetting" WHERE "settingKey" = 'scriptures_enabled'), TRUE)
      THEN COALESCE((
        SELECT json_agg(json_build_object('dayNumber', sc."dayNumber", 'imageUrl', sc."imageUrl") ORDER BY sc."dayNumber")
        FROM "Scripture" sc
      ), '[]'::json)
      ELSE '[]'::json
    END,
    'scriptureStartDay', COALESCE((SELECT (value #>> '{}')::int FROM "AppSetting" WHERE "settingKey" = 'scripture_start_day'), 1),
    'members', COALESCE((
      SELECT json_agg(json_build_object('name', m."fullName", 'avatarUrl', m."avatarUrl") ORDER BY m."fullName")
      FROM "GroupParticipant" gp JOIN "Participant" m ON m.id = gp."participantId"
      WHERE gp."groupId" = grp.id AND m.id <> person_id AND m.status = 'ACTIVE'
    ), '[]'::json),
    'profile', json_build_object(
      'email', person.email,
      'avatarUrl', person."avatarUrl",
      'gender', person.gender,
      'ageRange', person."ageRange",
      'dateOfBirth', person."dateOfBirth",
      'occupation', COALESCE(person.occupation, (SELECT f.occupation FROM "FollowUpContact" f WHERE f.id = person."followUpContactId"))
    ),
    'faithUnread', EXISTS (
      SELECT 1 FROM "ParticipantNote" n
      WHERE n."participantId" = person_id AND n."noteType" = 'FAITH_COACH' AND NOT n."byParticipant"
        AND n."createdAt" > GREATEST(
          COALESCE((SELECT t."coachLastReadAt" FROM "ParticipantThreadRead" t WHERE t."participantId" = person_id), '-infinity'::timestamptz),
          '2026-09-17T02:00:00Z'::timestamptz)
    ),
    'reminders', (
      SELECT json_build_object(
        'meetingRemindMinutes', COALESCE(rs."meetingRemindMinutes", '[60]'::jsonb),
        'recapReleased', COALESCE(rs."recapReleased", TRUE)
      )
      FROM (SELECT 1) one LEFT JOIN "ParticipantReminderSetting" rs ON rs."participantId" = person_id
    ),
    'resources', COALESCE((
      SELECT json_agg(json_build_object('id', r.id, 'title', r.title, 'description', r.description, 'type', r.type, 'url', r.url, 'fileName', r."fileName") ORDER BY r.title)
      FROM "Resource" r WHERE r."visibleToParticipants" AND (r."cohortId" IS NULL OR r."cohortId" = person."cohortId")
    ), '[]'::json),
    'announcement', (
      SELECT json_build_object('id', a.id, 'subject', a.subject, 'body', a.body, 'linkUrl', a."linkUrl", 'linkLabel', a."linkLabel", 'homeLabel', a."homeLabel")
      FROM "Announcement" a
      WHERE a."showOnHome" AND a."homeUntil" > NOW() AND a.audience IN ('PARTICIPANTS', 'EVERYONE')
        AND (a.scope = 'ALL_USERS' OR a."cohortId" IS NULL OR a."cohortId" = person."cohortId")
        AND a."targetUserId" IS NULL
        AND (a."targetParticipantId" IS NULL OR a."targetParticipantId" = person_id)
      ORDER BY a."sentAt" DESC LIMIT 1
    ),
    'wrapUp', (
      SELECT json_build_object('submitted', w."participantId" IS NOT NULL, 'department', w.department)
      FROM (SELECT 1) one
      LEFT JOIN "ParticipantWrapUp" w ON w."participantId" = person_id AND w."cohortId" = person."cohortId"
    ),
    'profileFields', public.participant_profile_fields(person_id),
    'profileCompletion', public.profile_completion_for(person_id),
    'lastCheckIn', (
      SELECT json_build_object('response', c.response, 'sundayMisses', c."sundayMisses", 'meetingMisses', c."meetingMisses", 'createdAt', c."createdAt")
      FROM "ParticipantCheckIn" c WHERE c."participantId" = person_id
      ORDER BY c."createdAt" DESC LIMIT 1
    ),
    'classFeedbackDue', (
      SELECT json_build_object(
        'weekId', w3.id,
        'weekNumber', w3."weekNumber",
        'open', NOW() >= public.class_feedback_release_at(public.week_class_date(cohort."startDate", w3."weekNumber", w3."classDate"), 'participant')
      )
      FROM (
        SELECT wk.* FROM "Week" wk
        WHERE wk."cohortId" = person."cohortId"
          AND cohort."startDate" IS NOT NULL
          AND (public.week_class_date(cohort."startDate", wk."weekNumber", wk."classDate")::TIMESTAMP AT TIME ZONE 'Africa/Lagos') <= NOW()
        ORDER BY wk."weekNumber" DESC
        LIMIT 1
      ) w3
      WHERE NOT EXISTS (SELECT 1 FROM "ParticipantClassFeedbackDone" d WHERE d."participantId" = person_id AND d."weekId" = w3.id)
    ),
    'departmentPromptDue', COALESCE((
      SELECT TRUE
      FROM "AppSetting" cft
      WHERE cft."settingKey" = 'class_feedback_times'
        AND (cft.value->>'departmentWeek') IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM "ParticipantWrapUp" ww WHERE ww."participantId" = person_id AND ww."cohortId" = person."cohortId")
        AND EXISTS (
          SELECT 1 FROM "Week" dwk
          WHERE dwk."cohortId" = person."cohortId"
            AND dwk."weekNumber" >= (cft.value->>'departmentWeek')::int
            AND NOW() >= (public.week_class_date(cohort."startDate", dwk."weekNumber", dwk."classDate")::TIMESTAMP AT TIME ZONE 'Africa/Lagos')
        )
    ), FALSE)
  );
END;
$function$;

-- group_meeting_limits_guard
CREATE OR REPLACE FUNCTION public.group_meeting_limits_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  lim JSONB := public.group_meeting_limits();
  win JSONB;
  start_min INT;
  earliest TEXT;
  latest TEXT;
  earliest_min INT;
  latest_min INT;
  allowed_days TEXT[];
BEGIN
  -- Only when the slot is being set or changed, and only for people who are held to the limits.
  IF TG_OP = 'UPDATE'
     AND NEW."meetingDay" IS NOT DISTINCT FROM OLD."meetingDay"
     AND NEW."meetingTime" IS NOT DISTINCT FROM OLD."meetingTime" THEN
    RETURN NEW;
  END IF;
  IF public.app_current_token() IS NULL OR public.app_current_token() = '' OR public.app_is_admin() THEN RETURN NEW; END IF;
  -- Clearing a field is always fine; the limits judge a full slot.
  IF NEW."meetingDay" IS NULL AND NEW."meetingTime" IS NULL THEN RETURN NEW; END IF;

  SELECT array_agg(d) INTO allowed_days FROM jsonb_array_elements_text(lim -> 'days') d;

  IF NEW."meetingDay" IS NOT NULL AND NOT (NEW."meetingDay" = ANY (allowed_days)) THEN
    RAISE EXCEPTION 'MEETING_OUTSIDE_LIMITS: group calls can only be on %', array_to_string(ARRAY(SELECT initcap(lower(d)) FROM unnest(allowed_days) d), ', ');
  END IF;
  IF NEW."meetingTime" IS NOT NULL THEN
    IF NEW."meetingTime" !~ '^[0-2][0-9]:[0-5][0-9]$' THEN RAISE EXCEPTION 'MEETING_OUTSIDE_LIMITS: that start time is not valid'; END IF;
    start_min := split_part(NEW."meetingTime", ':', 1)::INT * 60 + split_part(NEW."meetingTime", ':', 2)::INT;
    win := CASE WHEN NEW."meetingDay" IS NOT NULL THEN lim -> 'dayTimes' -> NEW."meetingDay" END;
    earliest := COALESCE(win ->> 'earliestStart', lim ->> 'earliestStart');
    latest := COALESCE(win ->> 'latestStart', lim ->> 'latestStart', lim ->> 'latestEnd');
    earliest_min := split_part(earliest, ':', 1)::INT * 60 + split_part(earliest, ':', 2)::INT;
    latest_min := split_part(latest, ':', 1)::INT * 60 + split_part(latest, ':', 2)::INT;
    IF start_min < earliest_min OR start_min > latest_min THEN
      RAISE EXCEPTION 'MEETING_OUTSIDE_LIMITS: group calls must start between % and %', earliest, latest;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- practice_build
CREATE OR REPLACE FUNCTION public.practice_build(p_calendar text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_c UUID;
  v_cal TEXT;
  v_today DATE := (timezone('Africa/Lagos', NOW()))::date;
  v_day TEXT;
  v_hubs INTEGER;
  v_i INTEGER;
  v_n INTEGER := 0;
  v_hub UUID;
  r RECORD;
BEGIN
  IF NOT public.app_is_admin() THEN
    RAISE EXCEPTION 'Only admins can set up Practice';
  END IF;
  v_c := public.practice_ensure_cohort();
  SELECT COALESCE(NULLIF(p_calendar, ''), "practiceCalendar", 'CLASS_DAY') INTO v_cal FROM public."Cohort" WHERE id = v_c;
  v_day := upper(trim(to_char(v_today, 'Day')));

  -- Wipe (children go with their parents).
  DELETE FROM public."PracticeProgress" WHERE TRUE;
  DELETE FROM public."PracticePeer" WHERE TRUE;
  UPDATE public."PracticeMember" SET "inParticipantView" = FALSE WHERE TRUE;
  DELETE FROM public."UserCohort" WHERE "cohortId" = v_c;
  DELETE FROM public."HubLeadsMeeting" WHERE "cohortId" = v_c;
  DELETE FROM public."SupportHub" WHERE "cohortId" = v_c;
  -- People leave their groups first so the handover log runs while both still exist.
  DELETE FROM public."GroupParticipant" WHERE "groupId" IN (SELECT id FROM public."Group" WHERE "cohortId" = v_c);
  DELETE FROM public."Participant" WHERE "cohortId" = v_c;
  DELETE FROM public."Group" WHERE "cohortId" = v_c;
  DELETE FROM public."Week" WHERE "cohortId" = v_c;

  -- Four practice weeks.
  INSERT INTO public."Week" ("weekNumber", "cohortId", title, "recapSummary", "discussionPrompt", "shareWithParticipants")
  SELECT n, v_c, format('Practice week %s', n),
         format('This is the practice recap for week %s: the main point of the class in a few clear lines.', n),
         'How would you put this into practice this week?', TRUE
  FROM generate_series(1, 4) AS n;
  PERFORM public.practice_apply_calendar(v_c, v_cal);
  PERFORM public.practice_load_manuals(v_c);

  -- Hubs: one per practice Hub Lead (at least one).
  SELECT GREATEST(1, count(*)) INTO v_hubs FROM public."PracticeMember" WHERE role = 'HUB_LEAD';
  DROP TABLE IF EXISTS _pm;
  DROP TABLE IF EXISTS _ph;
  CREATE TEMP TABLE _pm ON COMMIT DROP AS
    SELECT m."userId", m.role, u.name, (row_number() OVER (ORDER BY u.name))::int AS rn,
           (row_number() OVER (PARTITION BY m.role ORDER BY u.name))::int AS role_rn
    FROM public."PracticeMember" m JOIN public."User" u ON u.id = m."userId";
  CREATE TEMP TABLE _ph (idx INT, hub UUID) ON COMMIT DROP;

  FOR v_i IN 1..v_hubs LOOP
    INSERT INTO public."SupportHub" ("cohortId", name, "leadUserId", "meetingDay", "meetingTime", "callPlatform", "callLink", "assistantPermissions")
    VALUES (
      v_c, format('Practice Hub %s', v_i),
      (SELECT "userId" FROM _pm WHERE role = 'HUB_LEAD' AND role_rn = v_i),
      v_day, '19:00', 'GOOGLE_MEET', 'https://meet.google.com/practice-hub',
      ARRAY['ATTENDANCE', 'MESSAGE', 'GROUPS'])
    RETURNING id INTO v_hub;
    INSERT INTO _ph VALUES (v_i, v_hub);
  END LOOP;

  -- Everyone who is not a Hub Lead is dealt across the hubs in name order; the
  -- Hub Leads belong to their own hub.
  FOR r IN SELECT * FROM _pm WHERE role <> 'HUB_LEAD' ORDER BY name LOOP
    v_n := v_n + 1;
    SELECT hub INTO v_hub FROM _ph WHERE idx = ((v_n - 1) % v_hubs) + 1;
    INSERT INTO public."HubMembership" ("hubId", "userId", "cohortId") VALUES (v_hub, r."userId", v_c);
    IF r.role = 'ASSISTANT' THEN
      UPDATE public."SupportHub" SET "assistantLeadUserId" = r."userId" WHERE id = v_hub AND "assistantLeadUserId" IS NULL;
    ELSIF r.role = 'RECAP_LEAD' THEN
      UPDATE public."SupportHub" SET "recapLeadUserIds" = array_append("recapLeadUserIds", r."userId") WHERE id = v_hub;
    ELSIF r.role = 'PRAYER_LEAD' THEN
      UPDATE public."SupportHub" SET "prayerLeadUserIds" = array_append("prayerLeadUserIds", r."userId") WHERE id = v_hub;
    END IF;
    PERFORM public.practice_make_group(v_c, r."userId", r.rn);
  END LOOP;
  FOR r IN SELECT * FROM _pm WHERE role = 'HUB_LEAD' ORDER BY name LOOP
    SELECT hub INTO v_hub FROM _ph WHERE idx = r.role_rn;
    INSERT INTO public."HubMembership" ("hubId", "userId", "cohortId") VALUES (v_hub, r."userId", v_c);
  END LOOP;

  INSERT INTO public."HubLeadsMeeting" ("cohortId", "meetingDay", "meetingTime", "callPlatform", "callLink")
  VALUES (v_c, v_day, '20:00', 'GOOGLE_MEET', 'https://meet.google.com/practice-leads');

  PERFORM public.practice_sync_members(v_c);
  RETURN jsonb_build_object('cohortId', v_c, 'hubs', v_hubs, 'people', (SELECT count(*) FROM _pm), 'calendar', v_cal);
END;
$function$;

-- practice_place
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
    INSERT INTO public."SupportHub" ("cohortId", name, "meetingDay", "meetingTime", "callPlatform", "callLink", "assistantPermissions")
    VALUES (v_c, format('Practice Hub %s', v_n), upper(trim(to_char(timezone('Africa/Lagos', NOW()), 'Day'))), '19:00', 'GOOGLE_MEET',
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

-- practice_prepare
CREATE OR REPLACE FUNCTION public.practice_prepare()
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_c UUID := public.practice_ensure_cohort();
  v_day TEXT := upper(trim(to_char(timezone('Africa/Lagos', NOW()), 'Day')));
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public."Week" WHERE "cohortId" = v_c) THEN
    INSERT INTO public."Week" ("weekNumber", "cohortId", title, "recapSummary", "discussionPrompt", "shareWithParticipants")
    SELECT n, v_c, format('Practice week %s', n),
           format('This is the practice recap for week %s: the main point of the class in a few clear lines.', n),
           'How would you put this into practice this week?', TRUE
    FROM generate_series(1, 4) AS n;
  END IF;
  PERFORM public.practice_apply_calendar(v_c, 'CLASS_DAY');
  PERFORM public.practice_load_manuals(v_c);
  IF NOT EXISTS (SELECT 1 FROM public."HubLeadsMeeting" WHERE "cohortId" = v_c) THEN
    INSERT INTO public."HubLeadsMeeting" ("cohortId", "meetingDay", "meetingTime", "callPlatform", "callLink")
    VALUES (v_c, v_day, '20:00', 'GOOGLE_MEET', 'https://meet.google.com/practice-leads');
  END IF;
  RETURN v_c;
END;
$function$;

-- set_hub_leads_meeting
CREATE OR REPLACE FUNCTION public.set_hub_leads_meeting(p_cohort_id uuid, p_meeting_day text, p_meeting_time text, p_meeting_duration_mins integer, p_call_platform text, p_call_link text, p_notify boolean DEFAULT false)
 RETURNS jsonb
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
    ("cohortId", "meetingDay", "meetingTime", "callPlatform", "callLink", "updatedAt", "updatedById")
  VALUES (p_cohort_id, p_meeting_day, p_meeting_time, p_call_platform, p_call_link, NOW(), public.app_current_user_id())
  ON CONFLICT ("cohortId") DO UPDATE
    SET "meetingDay" = EXCLUDED."meetingDay", "meetingTime" = EXCLUDED."meetingTime",
        "callPlatform" = EXCLUDED."callPlatform",
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
    'callPlatform', v_new."callPlatform", 'callLink', v_new."callLink");
END;
$function$;

-- update_hub_meeting
CREATE OR REPLACE FUNCTION public.update_hub_meeting(p_hub_id uuid, p_meeting_day text, p_meeting_time text, p_meeting_duration_mins integer, p_call_platform text, p_call_link text, p_notify boolean DEFAULT false)
 RETURNS jsonb
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
    'callPlatform', v_hub."callPlatform", 'callLink', v_hub."callLink"
  );
END;
$function$;

ALTER TABLE public."Group" DROP COLUMN IF EXISTS "meetingDurationMins";
ALTER TABLE public."SupportHub" DROP COLUMN IF EXISTS "meetingDurationMins";
ALTER TABLE public."HubLeadsMeeting" DROP COLUMN IF EXISTS "meetingDurationMins";
