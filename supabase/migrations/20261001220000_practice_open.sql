-- Practice, open to everyone.
--
-- No roster and no admin control room. An admin only switches Practice on or
-- off (Settings). While it is on, every support is enrolled by their own app
-- (the pulse), placed in a practice hub and group, and may play any seat, run
-- peer walkthroughs and reset their own practice and first-time experience.
--
--   practice_place            smarter hub choice (small hubs, no pile-up), serialised
--   practice_prepare          the cohort, four weeks, real manuals, Hub Leads meeting (idempotent)
--   practice_set_on           admin: on = prepare + show; off = hide + end walkthroughs
--   practice_status           admin: on?, how many are in, who is in a walkthrough
--   practice_pulse            enrols a support when Practice is on; placed + in the cohort menu
--   practice_team             online people first
--   practice_reset_me / practice_reset_my_first_time / practice_participant_reset_me
--
-- The older admin-only functions (practice_build, practice_state, ...) are left
-- in place, unused.
--
-- Rollback: restore practice_place, practice_set_on, practice_pulse and
-- practice_team from the earlier migrations; DROP the new functions.

CREATE OR REPLACE FUNCTION public.practice_place(p_user UUID, p_role TEXT, p_hub UUID DEFAULT NULL)
 RETURNS UUID
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

  UPDATE public."PracticeMember" SET role = p_role WHERE "userId" = p_user;
  UPDATE public."UserCohort"
     SET "supportKind" = CASE WHEN p_role = 'HUB_LEAD' THEN 'HUB_LEAD' ELSE 'PARTICIPANT_SUPPORT' END
   WHERE "userId" = p_user AND "cohortId" = v_c;
  RETURN v_hub;
END;
$function$;

-- Everything Practice needs before anyone walks in. Safe to run again.
CREATE OR REPLACE FUNCTION public.practice_prepare()
 RETURNS UUID
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
    INSERT INTO public."HubLeadsMeeting" ("cohortId", "meetingDay", "meetingTime", "meetingDurationMins", "callPlatform", "callLink")
    VALUES (v_c, v_day, '20:00', 45, 'GOOGLE_MEET', 'https://meet.google.com/practice-leads');
  END IF;
  RETURN v_c;
END;
$function$;

CREATE OR REPLACE FUNCTION public.practice_set_on(p_on BOOLEAN)
 RETURNS VOID
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_c UUID;
BEGIN
  IF NOT public.app_is_admin() THEN
    RAISE EXCEPTION 'Only admins can switch Practice';
  END IF;
  v_c := public.practice_prepare();
  UPDATE public."Cohort" SET "practiceOn" = COALESCE(p_on, FALSE), "updatedAt" = NOW() WHERE id = v_c;
  IF NOT COALESCE(p_on, FALSE) THEN
    UPDATE public."PracticePeer"
       SET status = CASE WHEN status = 'PENDING' THEN 'CANCELLED' ELSE 'ENDED' END, "endedAt" = NOW(), "respondedAt" = COALESCE("respondedAt", NOW())
     WHERE status IN ('ACTIVE', 'PENDING');
    UPDATE public."PracticeMember" SET "inParticipantView" = FALSE;
  END IF;
  PERFORM public.practice_sync_members(v_c);
END;
$function$;

CREATE OR REPLACE FUNCTION public.practice_status()
 RETURNS JSONB
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT public.app_is_admin() THEN
    RAISE EXCEPTION 'Only admins can see this';
  END IF;
  RETURN jsonb_build_object(
    'on', COALESCE((SELECT "practiceOn" FROM public."Cohort" WHERE "isPractice" LIMIT 1), FALSE),
    'people', (SELECT count(*) FROM public."PracticeMember"),
    'online', (SELECT count(*) FROM public."PracticeMember" WHERE "lastSeenAt" > NOW() - INTERVAL '30 seconds'),
    'walkthroughs', (SELECT count(*) FROM public."PracticePeer" WHERE status = 'ACTIVE')
  );
END;
$function$;

-- The pulse also enrols and places a support when Practice is on.
CREATE OR REPLACE FUNCTION public.practice_pulse()
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
  IF NOT v_member."inParticipantView" THEN
    UPDATE public."PracticeMember" SET "lastSeenAt" = NOW() WHERE "userId" = v_me;
  END IF;
  IF COALESCE(v_on, FALSE) THEN
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

-- The picker lists people who are online first.
CREATE OR REPLACE FUNCTION public.practice_team()
 RETURNS JSONB
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_me UUID := public.app_current_user_id();
BEGIN
  IF v_me IS NULL OR NOT EXISTS (SELECT 1 FROM public."PracticeMember" WHERE "userId" = v_me) THEN
    RETURN '[]'::jsonb;
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(x.j ORDER BY x.online DESC, x.name)
    FROM (
      SELECT u.name,
             COALESCE(m."lastSeenAt" > NOW() - INTERVAL '30 seconds', FALSE) AS online,
             jsonb_build_object(
               'userId', u.id, 'name', u.name, 'avatarUrl', u."avatarUrl", 'role', m.role,
               'online', COALESCE(m."lastSeenAt" > NOW() - INTERVAL '30 seconds', FALSE),
               'busy', EXISTS (SELECT 1 FROM public."PracticePeer" pp
                               WHERE pp.status = 'ACTIVE' AND (pp."fromUserId" = u.id OR pp."toUserId" = u.id))) AS j
        FROM public."PracticeMember" m JOIN public."User" u ON u.id = m."userId"
       WHERE m."userId" <> v_me AND u."isActive"
    ) x), '[]'::jsonb);
END;
$function$;

-- Start my own practice over: a fresh group of made-up participants, a clean checklist.
CREATE OR REPLACE FUNCTION public.practice_reset_me()
 RETURNS VOID
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_me UUID := public.app_current_user_id();
  v_c UUID;
  v_group public."Group";
  v_no INTEGER;
BEGIN
  IF v_me IS NULL OR NOT EXISTS (SELECT 1 FROM public."PracticeMember" WHERE "userId" = v_me) THEN
    RAISE EXCEPTION 'You are not in Practice';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('practice_place'));
  v_c := public.practice_ensure_cohort();
  DELETE FROM public."PracticeProgress" WHERE "userId" = v_me
    OR "participantId" IN (SELECT gp."participantId" FROM public."GroupParticipant" gp JOIN public."Group" g ON g.id = gp."groupId" WHERE g."supportId" = v_me AND g."cohortId" = v_c);
  SELECT * INTO v_group FROM public."Group" WHERE "supportId" = v_me AND "cohortId" = v_c LIMIT 1;
  IF v_group.id IS NOT NULL THEN
    v_no := COALESCE(NULLIF(regexp_replace(v_group.name, '\D', '', 'g'), '')::int, 1);
    CREATE TEMP TABLE _gone ON COMMIT DROP AS SELECT "participantId" AS id FROM public."GroupParticipant" WHERE "groupId" = v_group.id;
    DELETE FROM public."GroupParticipant" WHERE "groupId" = v_group.id;
    DELETE FROM public."Participant" WHERE id IN (SELECT id FROM _gone);
    DROP TABLE _gone;
    DELETE FROM public."Group" WHERE id = v_group.id;
    PERFORM public.practice_make_group(v_c, v_me, v_no);
  END IF;
END;
$function$;

-- Bring my own welcome, tours, role introductions and Get the app prompt back.
CREATE OR REPLACE FUNCTION public.practice_reset_my_first_time()
 RETURNS VOID
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_me UUID := public.app_current_user_id();
BEGIN
  IF v_me IS NULL OR NOT EXISTS (SELECT 1 FROM public."PracticeMember" WHERE "userId" = v_me) THEN
    RAISE EXCEPTION 'You are not in Practice';
  END IF;
  DELETE FROM public."TourProgress" WHERE "userId" = v_me;
  DELETE FROM public."HubRoleIntroSeen" WHERE "userId" = v_me;
  UPDATE public."UserAppState" SET "sheetShown" = 0, "sheetDismissed" = 0, "lastSheetAt" = NULL, "updatedAt" = NOW() WHERE "userId" = v_me;
END;
$function$;

-- The same, from inside a practice participant's own session: a true first sign-in again.
CREATE OR REPLACE FUNCTION public.practice_participant_reset_me(p_token TEXT)
 RETURNS VOID
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_pid UUID := public.app_participant_id(p_token);
BEGIN
  IF v_pid IS NULL THEN
    RAISE EXCEPTION 'SESSION_EXPIRED';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "Participant" p JOIN "Cohort" c ON c.id = p."cohortId" WHERE p.id = v_pid AND c."isPractice") THEN
    RAISE EXCEPTION 'This is only for Practice';
  END IF;
  DELETE FROM "TourProgress" WHERE "participantId" = v_pid;
  DELETE FROM "PracticeProgress" WHERE "participantId" = v_pid;
  UPDATE "ParticipantAppState" SET "sheetShown" = 0, "sheetDismissed" = 0, "lastSheetAt" = NULL, "updatedAt" = NOW() WHERE "participantId" = v_pid;
  UPDATE "ParticipantAccount"
     SET password_hash = extensions.crypt('FOF-PRACTICE', extensions.gen_salt('bf', 10)),
         "setupCode" = 'FOF-PRACTICE', "mustChangePassword" = TRUE, "passwordSetAt" = NULL, "updatedAt" = NOW()
   WHERE "participantId" = v_pid;
END;
$function$;

REVOKE ALL ON FUNCTION public.practice_place(UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.practice_prepare() FROM PUBLIC, anon, authenticated;
DO $g$
DECLARE
  f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'practice_set_on(boolean)', 'practice_status()', 'practice_pulse()', 'practice_team()',
    'practice_reset_me()', 'practice_reset_my_first_time()', 'practice_participant_reset_me(text)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO anon, authenticated', f);
  END LOOP;
END
$g$;
