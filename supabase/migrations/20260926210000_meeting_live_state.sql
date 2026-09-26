-- Meeting live state: persisted "Pray for your hub" done + "Finish prayer",
-- and a "meeting is on now" signal for the hub meeting and the group meeting,
-- surfaced to supports and participants.
--
-- Design notes, read before touching anything below:
--
-- 1. set_hub_prayer_state(p_hub_id, p_week_id, p_hub_prayer_done, p_prayer_finished)
--    is new, alongside the existing set_hub_prayer_focus. Both nullable
--    booleans default NULL and only change what's passed (so the frontend
--    can call it for just one of the two without disturbing the other).
--    Same permission rule as set_hub_prayer_focus (this hub's lead, assistant
--    lead, prayer lead, or an admin), same find-or-create of the week's
--    SUNDAY_RECAP session. Passing p_prayer_finished = TRUE also clears the
--    live prayer focus (prayerFocusFaithProjectId/prayerFocusSetAt), so
--    "Finish prayer" both marks it done and takes the focus off everyone's
--    screen. The frontend broadcasts on hub-meeting:<hubId>:<weekId> after
--    calling this, same as set_hub_prayer_focus, so every open tab refetches.
--
-- 2. get_hub_prayer_focus (latest: 20260926190000_hub_meeting_live.sql) is
--    CREATE OR REPLACE'd verbatim, adding two read-only booleans —
--    hubPrayerDone and prayerFinished — to both the empty-session branch and
--    the normal one. Same signature, no grant change needed.
--
-- 3. "Meeting is on" for a hub: SupportSession.startedAt is set once, the
--    first time an attendance mark is saved for that hub's week (inside
--    mark_support_attendance, CREATE OR REPLACE'd verbatim from
--    20260926120000_hub_roles.sql with just that one addition) — that's the
--    walk-through's own clear start moment, so no separate "start" action is
--    needed. build_hub_view (same migration, also CREATE OR REPLACE'd
--    verbatim + one field) exposes the hub's current live window as
--    meetingLive: { weekId, startedAt } | null, live meaning startedAt is
--    set, submittedAt isn't, and it started within the last 3 hours.
--
-- 4. "Meeting is on" for a group meeting has no SupportSession-style row to
--    add a column to — MeetingAttendance is one row per participant per week
--    (20260915000000_support_v2_tables.sql), not one row per meeting. Its
--    existing "markedAt" (set on every mark, insert or update) already is a
--    reliable first-mark signal: the earliest markedAt for a (groupId,
--    weekId) is when that week's meeting started. So no new column here —
--    participant_home (latest: 20260925120000_photos_people_directory.sql,
--    CREATE OR REPLACE'd verbatim + one field) computes groupMeetingLive the
--    same way: earliest MeetingAttendance.markedAt for the participant's
--    group + week, live meaning that's within the last 3 hours and
--    GroupPrayerStatus.done isn't true for that week (GroupPrayerStatus is
--    the group meeting's "submitted" record, set by handleMeetingSubmit).
--    MeetingAttendance/GroupPrayerStatus are staff-only tables
--    (20260918040000_staff_only_meetings_attendance.sql), so the support side
--    computes the equivalent client-side by querying them directly (it's
--    already staff and already queries both) — no RPC needed there, only
--    participant_home needs a DB-side change since a participant token can't
--    read those tables directly.
--
--    NOTE for the main chat: participant_home is on the "test before
--    applying" list (fof-test-participant-home-after-db-change memory rule)
--    — this migration's participant_home change is additive-only (one new
--    field, nothing else touched) but still needs that regression run.
--
-- 5. Olamide's follow-up on "Finish prayer" (praying for everyone isn't
--    realistic): set_hub_prayer_state's p_prayer_finished is available at
--    any time, not gated on every project being prayed for — that gate lives
--    only in the frontend's earlier "All prayed for" idea, which is dropped.
--    Nothing in this migration enforces it either way (it never did).
--    Instead, hub_prayer_list (latest: 20260926190000_hub_meeting_live.sql
--    #1) is CREATE OR REPLACE'd verbatim, adding two read-only fields per
--    item — timesPrayedFor and lastPrayedWeek — a tally across every one of
--    this hub's SUNDAY_RECAP sessions' prayedForFaithProjectIds (already
--    written by set_hub_prayer_focus/set_hub_prayer_state each time a focus
--    is set), so the prayer list can show "Prayed for 2× · last Week 9" and
--    let the frontend sort least/longest-ago-prayed first. "Prayed for this
--    week" (to sink to the bottom) is already known client-side from
--    get_hub_prayer_focus's prayedForIds for the current week, so that part
--    of the sort needs no new field here.
--
-- Additive and idempotent. Not yet applied to the live database.

-- ── 1. SupportSession: hubPrayerDoneAt, prayerFinishedAt, startedAt ─────────

ALTER TABLE public."SupportSession"
  ADD COLUMN IF NOT EXISTS "hubPrayerDoneAt" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "prayerFinishedAt" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "startedAt" TIMESTAMPTZ;

-- ── 2. set_hub_prayer_state — new. Nullable args, only changes what's ──────
-- passed. Same access rule as set_hub_prayer_focus.
CREATE OR REPLACE FUNCTION public.set_hub_prayer_state(
  p_hub_id UUID,
  p_week_id INTEGER,
  p_hub_prayer_done BOOLEAN DEFAULT NULL,
  p_prayer_finished BOOLEAN DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_id UUID;
  v_hub public."SupportHub";
  v_week public."Week";
  v_session public."SupportSession";
BEGIN
  IF NOT public.app_is_staff() THEN
    RAISE EXCEPTION 'You must be signed in as a support or admin';
  END IF;
  v_actor_id := public.app_current_user_id();

  SELECT * INTO v_hub FROM public."SupportHub" WHERE id = p_hub_id;
  IF v_hub.id IS NULL THEN
    RAISE EXCEPTION 'Hub was not found';
  END IF;

  IF NOT public.app_is_admin() THEN
    IF v_hub."leadUserId" IS DISTINCT FROM v_actor_id
      AND v_hub."assistantLeadUserId" IS DISTINCT FROM v_actor_id
      AND v_hub."prayerLeadUserId" IS DISTINCT FROM v_actor_id
    THEN
      RAISE EXCEPTION 'Only this hub''s lead, assistant lead, prayer lead, or an admin can set its prayer state';
    END IF;
  END IF;

  SELECT * INTO v_week FROM public."Week" WHERE id = p_week_id;
  IF v_week.id IS NULL THEN RAISE EXCEPTION 'Week was not found'; END IF;
  IF v_hub."cohortId" IS DISTINCT FROM v_week."cohortId" THEN
    RAISE EXCEPTION 'This hub and week are not in the same cohort';
  END IF;

  -- Find-or-create the week's SUNDAY_RECAP session, same as
  -- set_hub_prayer_focus / mark_support_attendance / submit_hub_meeting.
  INSERT INTO public."SupportSession" ("cohortId", type, title, "sessionDate", "weekId", "hubId", "createdById")
  VALUES (v_week."cohortId", 'SUNDAY_RECAP', format('Sunday recap · Week %s', v_week."weekNumber"), CURRENT_DATE, p_week_id, p_hub_id, v_actor_id)
  ON CONFLICT ("hubId", "weekId") DO NOTHING;

  UPDATE public."SupportSession"
  SET "hubPrayerDoneAt" = CASE
        WHEN p_hub_prayer_done IS NULL THEN "hubPrayerDoneAt"
        WHEN p_hub_prayer_done THEN NOW()
        ELSE NULL
      END,
      "prayerFinishedAt" = CASE
        WHEN p_prayer_finished IS NULL THEN "prayerFinishedAt"
        WHEN p_prayer_finished THEN NOW()
        ELSE NULL
      END,
      -- Finishing prayer takes the live focus off everyone's screen too.
      "prayerFocusFaithProjectId" = CASE WHEN p_prayer_finished IS TRUE THEN NULL ELSE "prayerFocusFaithProjectId" END,
      "prayerFocusSetAt" = CASE WHEN p_prayer_finished IS TRUE THEN NULL ELSE "prayerFocusSetAt" END
  WHERE "hubId" = p_hub_id AND "weekId" = p_week_id AND type = 'SUNDAY_RECAP'
  RETURNING * INTO v_session;

  RETURN jsonb_build_object(
    'sessionId', v_session.id,
    'hubId', v_session."hubId",
    'weekId', v_session."weekId",
    'hubPrayerDone', v_session."hubPrayerDoneAt" IS NOT NULL,
    'prayerFinished', v_session."prayerFinishedAt" IS NOT NULL,
    'faithProjectId', v_session."prayerFocusFaithProjectId",
    'setAt', v_session."prayerFocusSetAt",
    'prayedForIds', to_jsonb(COALESCE(v_session."prayedForFaithProjectIds", ARRAY[]::UUID[]))
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.set_hub_prayer_state(UUID, INTEGER, BOOLEAN, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_hub_prayer_state(UUID, INTEGER, BOOLEAN, BOOLEAN) TO anon, authenticated;

-- ── 2b. hub_prayer_list — verbatim from 20260926190000_hub_meeting_live.sql ─
-- #1, adding timesPrayedFor/lastPrayedWeek per item (see design note #5).
-- Same signature, no grant change needed.
CREATE OR REPLACE FUNCTION public.hub_prayer_list(p_hub_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_id UUID;
  v_result JSON;
BEGIN
  IF NOT public.app_is_staff() THEN
    RAISE EXCEPTION 'You must be signed in as a support or admin';
  END IF;
  v_actor_id := public.app_current_user_id();

  IF NOT public.app_is_admin() THEN
    IF NOT EXISTS (SELECT 1 FROM public."HubMembership" m WHERE m."hubId" = p_hub_id AND m."userId" = v_actor_id)
      AND NOT EXISTS (SELECT 1 FROM public."HubItSupport" hi WHERE hi."hubId" = p_hub_id AND hi."userId" = v_actor_id)
    THEN
      RAISE EXCEPTION 'You must be a member, IT support, or admin of this hub to see its prayer list';
    END IF;
  END IF;

  SELECT COALESCE(json_agg(json_build_object(
    'faithProjectId', f.id,
    'participantId', p.id,
    'fullName', p."fullName",
    'groupName', g.name,
    'supportName', support.name,
    'body', f.body,
    'categoryName', cat.name,
    'timesPrayedFor', (
      SELECT COUNT(*) FROM public."SupportSession" s2
      WHERE s2."hubId" = p_hub_id AND s2.type = 'SUNDAY_RECAP'
        AND f.id = ANY(COALESCE(s2."prayedForFaithProjectIds", ARRAY[]::UUID[]))
    ),
    'lastPrayedWeek', (
      SELECT w2."weekNumber" FROM public."SupportSession" s2
      JOIN public."Week" w2 ON w2.id = s2."weekId"
      WHERE s2."hubId" = p_hub_id AND s2.type = 'SUNDAY_RECAP'
        AND f.id = ANY(COALESCE(s2."prayedForFaithProjectIds", ARRAY[]::UUID[]))
      ORDER BY w2."weekNumber" DESC LIMIT 1
    )
  ) ORDER BY p."fullName"), '[]'::json)
  INTO v_result
  FROM public."FaithProject" f
  JOIN public."Participant" p ON p.id = f."participantId"
  JOIN public."GroupParticipant" gp ON gp."participantId" = p.id
  JOIN public."Group" g ON g.id = gp."groupId" AND g."archivedAt" IS NULL
  JOIN public."HubMembership" hm ON hm."userId" = g."supportId" AND hm."hubId" = p_hub_id
  LEFT JOIN public."User" support ON support.id = g."supportId"
  LEFT JOIN public."FaithProjectCategory" cat ON cat.id = f."categoryId"
  WHERE f.status = 'APPROVED' AND f."sharedForPrayer" IS TRUE;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.hub_prayer_list(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hub_prayer_list(UUID) TO anon, authenticated;

-- ── 3. get_hub_prayer_focus — verbatim from 20260926190000_hub_meeting_live ──
-- .sql, adding hubPrayerDone/prayerFinished to both branches. Same signature.
CREATE OR REPLACE FUNCTION public.get_hub_prayer_focus(p_hub_id UUID, p_week_id INTEGER)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_id UUID;
  v_session public."SupportSession";
  v_result JSON;
BEGIN
  IF NOT public.app_is_staff() THEN
    RAISE EXCEPTION 'You must be signed in as a support or admin';
  END IF;
  v_actor_id := public.app_current_user_id();

  IF NOT public.app_is_admin() THEN
    IF NOT EXISTS (SELECT 1 FROM public."HubMembership" m WHERE m."hubId" = p_hub_id AND m."userId" = v_actor_id)
      AND NOT EXISTS (SELECT 1 FROM public."HubItSupport" hi WHERE hi."hubId" = p_hub_id AND hi."userId" = v_actor_id)
    THEN
      RAISE EXCEPTION 'You must be a member, IT support, or admin of this hub to see its prayer focus';
    END IF;
  END IF;

  SELECT * INTO v_session
  FROM public."SupportSession"
  WHERE "hubId" = p_hub_id AND "weekId" = p_week_id AND type = 'SUNDAY_RECAP';

  IF v_session.id IS NULL OR v_session."prayerFocusFaithProjectId" IS NULL THEN
    RETURN json_build_object(
      'faithProjectId', NULL, 'participantName', NULL, 'groupName', NULL, 'projectText', NULL,
      'setAt', NULL,
      'prayedForIds', to_json(COALESCE(v_session."prayedForFaithProjectIds", ARRAY[]::UUID[])),
      'hubPrayerDone', v_session."hubPrayerDoneAt" IS NOT NULL,
      'prayerFinished', v_session."prayerFinishedAt" IS NOT NULL
    );
  END IF;

  SELECT json_build_object(
    'faithProjectId', f.id,
    'participantName', p."fullName",
    'groupName', g.name,
    'projectText', f.body,
    'setAt', v_session."prayerFocusSetAt",
    'prayedForIds', to_json(COALESCE(v_session."prayedForFaithProjectIds", ARRAY[]::UUID[])),
    'hubPrayerDone', v_session."hubPrayerDoneAt" IS NOT NULL,
    'prayerFinished', v_session."prayerFinishedAt" IS NOT NULL
  ) INTO v_result
  FROM public."FaithProject" f
  JOIN public."Participant" p ON p.id = f."participantId"
  LEFT JOIN public."GroupParticipant" gp ON gp."participantId" = p.id
  LEFT JOIN public."Group" g ON g.id = gp."groupId" AND g."archivedAt" IS NULL
  WHERE f.id = v_session."prayerFocusFaithProjectId"
  ORDER BY g.name
  LIMIT 1;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_hub_prayer_focus(UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_hub_prayer_focus(UUID, INTEGER) TO anon, authenticated;

-- ── 4. mark_support_attendance — verbatim from 20260926120000_hub_roles.sql, ─
-- adding: the first attendance mark for a hub's SUNDAY_RECAP session starts
-- its live window (startedAt), set once and never reset here.
CREATE OR REPLACE FUNCTION public.mark_support_attendance(
  p_status TEXT,
  p_user_id UUID,
  p_hub_id UUID DEFAULT NULL,
  p_week_id INTEGER DEFAULT NULL,
  p_session_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_id UUID;
  v_session public."SupportSession";
  v_week public."Week";
  v_hub public."SupportHub";
  v_is_lead_of_any BOOLEAN;
  v_result public."SupportSessionAttendance";
BEGIN
  IF NOT public.app_is_staff() THEN
    RAISE EXCEPTION 'You must be signed in as a support or admin to mark attendance';
  END IF;
  IF p_status NOT IN ('PRESENT', 'LATE', 'ABSENT', 'EXCUSED') THEN
    RAISE EXCEPTION 'Invalid attendance status';
  END IF;
  v_actor_id := public.app_current_user_id();

  IF p_session_id IS NOT NULL THEN
    SELECT * INTO v_session FROM public."SupportSession" WHERE id = p_session_id;
    IF v_session.id IS NULL THEN RAISE EXCEPTION 'Session was not found'; END IF;
  ELSE
    IF p_hub_id IS NULL OR p_week_id IS NULL THEN
      RAISE EXCEPTION 'Provide either a session, or a hub and week';
    END IF;

    SELECT * INTO v_week FROM public."Week" WHERE id = p_week_id;
    IF v_week.id IS NULL THEN RAISE EXCEPTION 'Week was not found'; END IF;

    SELECT * INTO v_hub FROM public."SupportHub" WHERE id = p_hub_id;
    IF v_hub.id IS NULL THEN RAISE EXCEPTION 'Hub was not found'; END IF;
    IF v_hub."cohortId" IS DISTINCT FROM v_week."cohortId" THEN
      RAISE EXCEPTION 'This hub and week are not in the same cohort';
    END IF;

    INSERT INTO public."SupportSession" ("cohortId", type, title, "sessionDate", "weekId", "hubId", "createdById")
    VALUES (v_week."cohortId", 'SUNDAY_RECAP', format('Sunday recap · Week %s', v_week."weekNumber"), CURRENT_DATE, p_week_id, p_hub_id, v_actor_id)
    ON CONFLICT ("hubId", "weekId") DO NOTHING;

    SELECT * INTO v_session FROM public."SupportSession" WHERE "hubId" = p_hub_id AND "weekId" = p_week_id;
  END IF;

  -- First attendance mark for this hub week starts the "meeting is on" live
  -- window (build_hub_view's meetingLive reads this); never reset here —
  -- reopen_hub_meeting/submit_hub_meeting only ever touch submittedAt.
  IF v_session.type = 'SUNDAY_RECAP' AND v_session."hubId" IS NOT NULL THEN
    UPDATE public."SupportSession" SET "startedAt" = COALESCE("startedAt", NOW()) WHERE id = v_session.id;
  END IF;

  -- Permission: recap is the session's own hub's lead or (with ATTENDANCE
  -- permission) its assistant lead; trainings/get-togethers (no fixed hub)
  -- stay lead-only, any hub. Admin can always mark.
  IF NOT public.app_is_admin() THEN
    IF v_session."hubId" IS NOT NULL THEN
      IF NOT public.app_hub_can(v_session."hubId", 'ATTENDANCE') THEN
        RAISE EXCEPTION 'Only this hub''s lead, its assistant lead, or an admin can mark this attendance';
      END IF;
    ELSE
      SELECT EXISTS (SELECT 1 FROM public."SupportHub" h WHERE h."cohortId" = v_session."cohortId" AND h."leadUserId" = v_actor_id) INTO v_is_lead_of_any;
      IF NOT COALESCE(v_is_lead_of_any, FALSE) THEN
        RAISE EXCEPTION 'Only a hub lead or an admin can mark this attendance';
      END IF;
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public."User" u WHERE u.id = p_user_id AND u."isActive" IS NOT FALSE
  ) THEN
    RAISE EXCEPTION 'That support was not found';
  END IF;

  INSERT INTO public."SupportSessionAttendance" ("sessionId", "userId", status, "markedById", "markedAt")
  VALUES (v_session.id, p_user_id, p_status, v_actor_id, NOW())
  ON CONFLICT ("sessionId", "userId") DO UPDATE
    SET status = EXCLUDED.status, "markedById" = EXCLUDED."markedById", "markedAt" = EXCLUDED."markedAt"
  RETURNING * INTO v_result;

  RETURN jsonb_build_object(
    'id', v_result.id,
    'sessionId', v_result."sessionId",
    'userId', v_result."userId",
    'status', v_result.status,
    'markedById', v_result."markedById",
    'markedAt', v_result."markedAt"
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.mark_support_attendance(TEXT, UUID, UUID, INTEGER, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_support_attendance(TEXT, UUID, UUID, INTEGER, UUID) TO anon, authenticated;

-- ── 5. build_hub_view — verbatim from 20260926120000_hub_roles.sql, adding ──
-- meetingLive: { weekId, startedAt } | null — the hub's most recently started
-- SUNDAY_RECAP session, only if it's still "on" (started, not submitted,
-- within the last 3 hours).
CREATE OR REPLACE FUNCTION public.build_hub_view(p_hub_id UUID, p_cohort_id UUID, p_actor_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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

  v_my_jobs := array_remove(ARRAY[
    CASE WHEN v_is_lead THEN 'HUB_LEAD' END,
    CASE WHEN v_is_assistant THEN 'ASSISTANT_HUB_LEAD' END,
    CASE WHEN v_hub."recapLeadUserId" = p_actor_id THEN 'RECAP_LEAD' END,
    CASE WHEN v_hub."prayerLeadUserId" = p_actor_id THEN 'PRAYER_LEAD' END,
    CASE WHEN v_is_it_support THEN 'IT_SUPPORT' END
  ], NULL);

  SELECT json_build_object(
    'hub', json_build_object(
      'id', v_hub.id, 'name', v_hub.name, 'cohortId', v_hub."cohortId",
      'leadUserId', v_hub."leadUserId", 'leadName', (SELECT name FROM public."User" WHERE id = v_hub."leadUserId"),
      'assistantLeadUserId', v_hub."assistantLeadUserId", 'assistantLeadName', (SELECT name FROM public."User" WHERE id = v_hub."assistantLeadUserId"),
      'assistantPermissions', to_json(v_hub."assistantPermissions"),
      'recapLeadUserId', v_hub."recapLeadUserId", 'recapLeadName', (SELECT name FROM public."User" WHERE id = v_hub."recapLeadUserId"),
      'prayerLeadUserId', v_hub."prayerLeadUserId", 'prayerLeadName', (SELECT name FROM public."User" WHERE id = v_hub."prayerLeadUserId"),
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
          CASE WHEN u.id = v_hub."recapLeadUserId" THEN 'RECAP_LEAD' END,
          CASE WHEN u.id = v_hub."prayerLeadUserId" THEN 'PRAYER_LEAD' END
        ], NULL))
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

REVOKE ALL ON FUNCTION public.build_hub_view(UUID, UUID, UUID) FROM PUBLIC;

-- ── 6. participant_home — verbatim from 20260925120000_photos_people_ ───────
-- directory.sql, adding groupMeetingLive: { weekId, startedAt } | null. See
-- design note #4 above. Same signature, no grant change needed. FLAGGED for
-- the main chat's participant_home regression run before this is applied.
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
      'meetingDurationMins', grp."meetingDurationMins", 'callPlatform', grp."callPlatform", 'callLink', grp."callLink",
      'supportName', support.name, 'supportPhone', support.phone, 'supportAvatarUrl', support."avatarUrl"
    ) END,
    'groupMeetingLive', (
      SELECT json_build_object('weekId', gm."weekId", 'startedAt', gm.started)
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
    ),
    'weeks', COALESCE((
      SELECT json_agg(json_build_object(
        'id', w.id,
        'weekNumber', w."weekNumber",
        'title', w.title,
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
        'recapDocumentName', CASE WHEN rel.released THEN w."recapDocumentName" END
      ) ORDER BY w."weekNumber")
      FROM "Week" w
      CROSS JOIN LATERAL (
        SELECT
          COALESCE(w."shareWithParticipants" AND (
            btrim(COALESCE(w."recapSummary", '')) <> ''
            OR w."recapDocumentUrl" IS NOT NULL
          ) AND (
            w."participantReleasedEarlyAt" IS NOT NULL
            OR NOW() >= public.recap_release_at(cohort."startDate", w."weekNumber", 'participant')
          ), FALSE) AS released,
          COALESCE(w."participantReleasedEarlyAt", public.recap_release_at(cohort."startDate", w."weekNumber", 'participant')) AS "releasedAt"
        FROM (SELECT 1) one
      ) rel
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
    'rules', (SELECT value FROM "AppSetting" WHERE "settingKey" = 'programme_rules'),
    -- Empty when an admin has switched Scriptures off (AppSetting
    -- scriptures_enabled = false); a missing row means on.
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
      FROM "Resource" r WHERE r."visibleToParticipants"
    ), '[]'::json),
    'announcement', (
      SELECT json_build_object('id', a.id, 'subject', a.subject, 'body', a.body, 'linkUrl', a."linkUrl", 'linkLabel', a."linkLabel")
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
    -- The latest week whose class Sunday has arrived, unless already answered
    -- (older unanswered weeks are never re-asked); 'open' is whether its
    -- participant feedback time has passed.
    'classFeedbackDue', (
      SELECT json_build_object(
        'weekId', w3.id,
        'weekNumber', w3."weekNumber",
        'open', NOW() >= public.class_feedback_release_at(cohort."startDate", w3."weekNumber", 'participant')
      )
      FROM (
        SELECT wk.* FROM "Week" wk
        WHERE wk."cohortId" = person."cohortId"
          AND cohort."startDate" IS NOT NULL
          AND ((cohort."startDate" + (wk."weekNumber" - 1) * 7)::TIMESTAMP AT TIME ZONE 'Africa/Lagos') <= NOW()
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
            AND NOW() >= ((cohort."startDate" + (dwk."weekNumber" - 1) * 7)::TIMESTAMP AT TIME ZONE 'Africa/Lagos')
        )
    ), FALSE)
  );
END;
$function$
;
