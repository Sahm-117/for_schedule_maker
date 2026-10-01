-- Practice, part 2: play any seat, peer walkthroughs, step into a practice
-- participant, and a tiny "pulse" the app checks every few seconds.
--
--   practice_pulse()              one small answer: my cohort list key, my seat,
--                                 requests to me / from me, my active walkthrough
--   practice_team()               the other people on the Practice team
--   practice_set_my_role(role)    play any staff seat (moves me into a hub with it)
--   practice_peer_request / respond / end
--   practice_enter_participant()  a session for one of my practice participants
--   practice_leave_participant()  back to my own account (flag only)
--   practice_participant_peer(token)  a participant session's view of its walkthrough
--
-- Everything is limited to the Practice cohort and to people on the Practice
-- team. Practice pushes stay off, except peer requests (that is their point).
--
-- Rollback: DROP the functions above, DROP TABLE "PracticePeer", drop the two
-- PracticeMember columns, and restore practice_build from 20261001170000.

ALTER TABLE public."PracticeMember"
  ADD COLUMN IF NOT EXISTS "lastSeenAt" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "inParticipantView" BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS public."PracticePeer" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "fromUserId" UUID NOT NULL REFERENCES public."User"(id) ON DELETE CASCADE,
  "toUserId" UUID NOT NULL REFERENCES public."User"(id) ON DELETE CASCADE,
  "fromRole" TEXT NOT NULL CHECK ("fromRole" IN ('SUPPORT', 'HUB_LEAD', 'ASSISTANT', 'RECAP_LEAD', 'PRAYER_LEAD', 'PARTICIPANT')),
  "toRole" TEXT NOT NULL CHECK ("toRole" IN ('SUPPORT', 'HUB_LEAD', 'ASSISTANT', 'RECAP_LEAD', 'PRAYER_LEAD', 'PARTICIPANT')),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACTIVE', 'ENDED', 'DECLINED', 'CANCELLED')),
  "hubId" UUID,
  "participantId" UUID,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "respondedAt" TIMESTAMPTZ,
  "endedAt" TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS practicepeer_to ON public."PracticePeer"("toUserId", status);
CREATE INDEX IF NOT EXISTS practicepeer_from ON public."PracticePeer"("fromUserId", status);
ALTER TABLE public."PracticePeer" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."PracticePeer" FROM anon, authenticated;

-- A real push for a peer request (the Practice-wide pushes stay off).
CREATE OR REPLACE FUNCTION public.practice_push(p_user UUID, p_title TEXT, p_body TEXT)
 RETURNS VOID
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_url TEXT;
  v_key TEXT;
BEGIN
  INSERT INTO public."Notification" ("userId", title, body, path, type)
  VALUES (p_user, p_title, p_body, '/support/my-schedule', 'HUB');
  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'project_url';
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'push_reminders_service_key';
  IF v_url IS NULL OR v_key IS NULL THEN
    RETURN;
  END IF;
  PERFORM net.http_post(
    url := v_url || '/functions/v1/notify-users',
    headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', v_key, 'Authorization', 'Bearer ' || v_key),
    body := jsonb_build_object('userIds', jsonb_build_array(p_user), 'title', p_title, 'body', p_body, 'path', '/support/my-schedule', 'type', 'HUB'),
    timeout_milliseconds := 25000
  );
END;
$function$;

-- Put a person into the practice hub with a seat (and give them a practice group).
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
    SELECT id INTO v_hub FROM public."SupportHub" WHERE "cohortId" = v_c ORDER BY name LIMIT 1;
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

-- Play any seat.
CREATE OR REPLACE FUNCTION public.practice_set_my_role(p_role TEXT)
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
  PERFORM public.practice_place(v_me, p_role, NULL);
END;
$function$;

-- Everyone else on the team, for the walkthrough picker.
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
    SELECT jsonb_agg(jsonb_build_object(
      'userId', u.id, 'name', u.name, 'avatarUrl', u."avatarUrl", 'role', m.role,
      'online', COALESCE(m."lastSeenAt" > NOW() - INTERVAL '30 seconds', FALSE),
      'busy', EXISTS (SELECT 1 FROM public."PracticePeer" pp
                      WHERE pp.status = 'ACTIVE' AND (pp."fromUserId" = u.id OR pp."toUserId" = u.id))
    ) ORDER BY u.name)
    FROM public."PracticeMember" m JOIN public."User" u ON u.id = m."userId"
    WHERE m."userId" <> v_me AND u."isActive"), '[]'::jsonb);
END;
$function$;

CREATE OR REPLACE FUNCTION public.practice_peer_request(p_to UUID, p_my_role TEXT, p_their_role TEXT)
 RETURNS UUID
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_me UUID := public.app_current_user_id();
  v_id UUID;
  v_name TEXT;
BEGIN
  IF v_me IS NULL OR NOT EXISTS (SELECT 1 FROM public."PracticeMember" WHERE "userId" = v_me) THEN
    RAISE EXCEPTION 'You are not in Practice';
  END IF;
  IF p_to IS NULL OR p_to = v_me OR NOT EXISTS (SELECT 1 FROM public."PracticeMember" WHERE "userId" = p_to) THEN
    RAISE EXCEPTION 'Pick someone from the Practice team';
  END IF;
  IF p_my_role NOT IN ('SUPPORT', 'HUB_LEAD', 'ASSISTANT', 'RECAP_LEAD', 'PRAYER_LEAD', 'PARTICIPANT')
     OR p_their_role NOT IN ('SUPPORT', 'HUB_LEAD', 'ASSISTANT', 'RECAP_LEAD', 'PRAYER_LEAD', 'PARTICIPANT')
     OR (p_my_role = 'PARTICIPANT' AND p_their_role = 'PARTICIPANT') THEN
    RAISE EXCEPTION 'Choose two seats, at most one of them a participant';
  END IF;
  UPDATE public."PracticePeer" SET status = 'CANCELLED', "respondedAt" = NOW() WHERE "fromUserId" = v_me AND status = 'PENDING';
  INSERT INTO public."PracticePeer" ("fromUserId", "toUserId", "fromRole", "toRole")
  VALUES (v_me, p_to, p_my_role, p_their_role) RETURNING id INTO v_id;
  SELECT name INTO v_name FROM public."User" WHERE id = v_me;
  PERFORM public.practice_push(p_to,
    format('%s wants to practise with you', split_part(v_name, ' ', 1)),
    format('%s will be the %s and you will be the %s. Takes about 10 minutes.',
           split_part(v_name, ' ', 1), replace(initcap(replace(lower(p_my_role), '_', ' ')), 'Hub Lead', 'Hub Lead'),
           replace(initcap(replace(lower(p_their_role), '_', ' ')), 'Hub Lead', 'Hub Lead')));
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.practice_peer_respond(p_id UUID, p_accept BOOLEAN)
 RETURNS VOID
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_me UUID := public.app_current_user_id();
  r public."PracticePeer";
  v_staff UUID;
  v_staff_role TEXT;
  v_hub UUID;
  v_pid UUID;
  v_name TEXT;
BEGIN
  SELECT * INTO r FROM public."PracticePeer"
   WHERE id = p_id AND "toUserId" = v_me AND status = 'PENDING' AND "createdAt" > NOW() - INTERVAL '1 hour';
  IF r.id IS NULL THEN
    RAISE EXCEPTION 'That request is no longer open';
  END IF;
  IF p_accept AND (
       NOT COALESCE((SELECT "practiceOn" FROM public."Cohort" WHERE "isPractice" LIMIT 1), FALSE)
       OR NOT EXISTS (SELECT 1 FROM public."PracticeMember" WHERE "userId" = r."fromUserId")
       OR NOT EXISTS (SELECT 1 FROM public."PracticeMember" WHERE "userId" = r."toUserId")) THEN
    UPDATE public."PracticePeer" SET status = 'CANCELLED', "respondedAt" = NOW() WHERE id = r.id;
    RAISE EXCEPTION 'Practice is off, or that person has left the team';
  END IF;
  SELECT name INTO v_name FROM public."User" WHERE id = v_me;
  IF NOT p_accept THEN
    UPDATE public."PracticePeer" SET status = 'DECLINED', "respondedAt" = NOW() WHERE id = r.id;
    INSERT INTO public."Notification" ("userId", title, body, path, type)
    VALUES (r."fromUserId", format('%s can''t practise right now', split_part(v_name, ' ', 1)), 'Try someone else, or ask again later.', '/support/my-schedule', 'HUB');
    RETURN;
  END IF;

  UPDATE public."PracticePeer" SET status = 'ENDED', "endedAt" = NOW()
   WHERE status = 'ACTIVE' AND ("fromUserId" IN (r."fromUserId", r."toUserId") OR "toUserId" IN (r."fromUserId", r."toUserId"));

  IF r."fromRole" = 'PARTICIPANT' OR r."toRole" = 'PARTICIPANT' THEN
    v_staff := CASE WHEN r."fromRole" = 'PARTICIPANT' THEN r."toUserId" ELSE r."fromUserId" END;
    v_staff_role := CASE WHEN r."fromRole" = 'PARTICIPANT' THEN r."toRole" ELSE r."fromRole" END;
    v_hub := public.practice_place(v_staff, v_staff_role, NULL);
    SELECT gp."participantId" INTO v_pid
      FROM public."Group" g
      JOIN public."GroupParticipant" gp ON gp."groupId" = g.id
      JOIN public."Participant" p ON p.id = gp."participantId"
     WHERE g."supportId" = v_staff AND g."cohortId" = public.practice_ensure_cohort()
     ORDER BY p."fullName" LIMIT 1;
  ELSIF r."fromRole" = 'HUB_LEAD' OR r."toRole" <> 'HUB_LEAD' THEN
    v_hub := public.practice_place(r."fromUserId", r."fromRole", NULL);
    PERFORM public.practice_place(r."toUserId", r."toRole", v_hub);
  ELSE
    v_hub := public.practice_place(r."toUserId", r."toRole", NULL);
    PERFORM public.practice_place(r."fromUserId", r."fromRole", v_hub);
  END IF;

  -- A fresh walkthrough starts with a clean shared checklist.
  DELETE FROM public."PracticeProgress"
   WHERE "scenarioKey" LIKE 'peer-%'
     AND ("userId" IN (r."fromUserId", r."toUserId") OR ("participantId" IS NOT NULL AND "participantId" = v_pid));
  UPDATE public."PracticePeer" SET status = 'ACTIVE', "respondedAt" = NOW(), "hubId" = v_hub, "participantId" = v_pid WHERE id = r.id;
  PERFORM public.practice_push(r."fromUserId", format('%s joined your walkthrough', split_part(v_name, ' ', 1)), 'Open Practice to start.');
END;
$function$;

CREATE OR REPLACE FUNCTION public.practice_peer_end(p_id UUID)
 RETURNS VOID
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_me UUID := public.app_current_user_id();
BEGIN
  UPDATE public."PracticePeer"
     SET status = CASE WHEN status = 'PENDING' THEN 'CANCELLED' ELSE 'ENDED' END, "endedAt" = NOW(), "respondedAt" = COALESCE("respondedAt", NOW())
   WHERE id = p_id AND status IN ('PENDING', 'ACTIVE') AND (v_me IN ("fromUserId", "toUserId"));
END;
$function$;

-- The small answer the app asks for every few seconds.
CREATE OR REPLACE FUNCTION public.practice_pulse()
 RETURNS JSONB
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
  IF v_member."userId" IS NULL THEN
    RETURN jsonb_build_object('member', FALSE, 'cohortKey', COALESCE(v_key, ''));
  END IF;
  IF NOT v_member."inParticipantView" THEN
    UPDATE public."PracticeMember" SET "lastSeenAt" = NOW() WHERE "userId" = v_me;
  END IF;
  SELECT COALESCE("practiceOn", FALSE) INTO v_on FROM public."Cohort" WHERE "isPractice" LIMIT 1;

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

-- Step into one of my practice participants. Returns a real participant
-- session (12 hours), so the participant app works exactly as it does for them.
CREATE OR REPLACE FUNCTION public.practice_enter_participant()
 RETURNS JSONB
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_me UUID := public.app_current_user_id();
  v_c UUID;
  v_pid UUID;
  v_token TEXT;
  v_role TEXT;
BEGIN
  IF v_me IS NULL OR NOT EXISTS (SELECT 1 FROM "PracticeMember" WHERE "userId" = v_me) THEN
    RAISE EXCEPTION 'You are not in Practice';
  END IF;
  v_c := public.practice_ensure_cohort();
  IF NOT (SELECT COALESCE("practiceOn", FALSE) FROM "Cohort" WHERE id = v_c) THEN
    RAISE EXCEPTION 'Practice is switched off';
  END IF;
  SELECT "participantId" INTO v_pid FROM "PracticePeer"
   WHERE status = 'ACTIVE' AND "participantId" IS NOT NULL
     AND ((("fromUserId" = v_me) AND "fromRole" = 'PARTICIPANT') OR (("toUserId" = v_me) AND "toRole" = 'PARTICIPANT'))
   ORDER BY "respondedAt" DESC LIMIT 1;
  IF v_pid IS NULL THEN
    SELECT role INTO v_role FROM "PracticeMember" WHERE "userId" = v_me;
    PERFORM public.practice_place(v_me, v_role, NULL);
    SELECT gp."participantId" INTO v_pid
      FROM "Group" g JOIN "GroupParticipant" gp ON gp."groupId" = g.id JOIN "Participant" p ON p.id = gp."participantId"
     WHERE g."supportId" = v_me AND g."cohortId" = v_c ORDER BY p."fullName" LIMIT 1;
  END IF;
  IF v_pid IS NULL OR NOT EXISTS (SELECT 1 FROM "Participant" WHERE id = v_pid AND "cohortId" = v_c) THEN
    RAISE EXCEPTION 'No practice participant to step into';
  END IF;
  v_token := public.start_app_session(NULL, v_pid);
  UPDATE "AppSession" SET "expiresAt" = NOW() + INTERVAL '12 hours'
   WHERE "tokenHash" = encode(digest(v_token, 'sha256'), 'hex');
  UPDATE "PracticeMember" SET "inParticipantView" = TRUE WHERE "userId" = v_me;
  RETURN jsonb_build_object('token', v_token, 'user', public.participant_user_json(v_pid));
END;
$function$;

CREATE OR REPLACE FUNCTION public.practice_leave_participant()
 RETURNS VOID
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  UPDATE public."PracticeMember" SET "inParticipantView" = FALSE WHERE "userId" = public.app_current_user_id();
END;
$function$;

-- A participant session's view of the walkthrough it belongs to.
CREATE OR REPLACE FUNCTION public.practice_participant_peer(p_token TEXT)
 RETURNS JSONB
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_pid UUID := public.app_participant_id(p_token);
  r "PracticePeer";
  v_partner UUID;
BEGIN
  IF v_pid IS NULL THEN
    RAISE EXCEPTION 'SESSION_EXPIRED';
  END IF;
  SELECT * INTO r FROM "PracticePeer" WHERE status = 'ACTIVE' AND "participantId" = v_pid ORDER BY "respondedAt" DESC LIMIT 1;
  IF r.id IS NULL THEN
    RETURN NULL;
  END IF;
  v_partner := CASE WHEN r."fromRole" = 'PARTICIPANT' THEN r."toUserId" ELSE r."fromUserId" END;
  RETURN jsonb_build_object(
    'id', r.id,
    'partnerUserId', v_partner,
    'partnerName', (SELECT name FROM "User" WHERE id = v_partner),
    'myRole', 'PARTICIPANT',
    'partnerRole', CASE WHEN r."fromRole" = 'PARTICIPANT' THEN r."toRole" ELSE r."fromRole" END,
    'iAmParticipant', TRUE,
    'partnerPresent', COALESCE((SELECT "lastSeenAt" > NOW() - INTERVAL '30 seconds' FROM "PracticeMember" WHERE "userId" = v_partner), FALSE),
    'partnerInParticipantView', FALSE,
    'myProgress', COALESCE((SELECT jsonb_agg(jsonb_build_object('key', "scenarioKey", 'doneAt', "doneAt", 'stuckAt', "stuckAt"))
        FROM "PracticeProgress" WHERE "scenarioKey" LIKE 'peer-%' AND "participantId" = v_pid), '[]'::jsonb),
    'partnerProgress', COALESCE((SELECT jsonb_agg(jsonb_build_object('key', "scenarioKey", 'doneAt', "doneAt", 'stuckAt', "stuckAt"))
        FROM "PracticeProgress" WHERE "scenarioKey" LIKE 'peer-%' AND "userId" = v_partner), '[]'::jsonb)
  );
END;
$function$;

-- Set-up clears walkthroughs along with everything else practice.
DO $patch$
DECLARE
  v_def TEXT;
  v_new TEXT;
BEGIN
  SELECT pg_get_functiondef('public.practice_build(text)'::regprocedure) INTO v_def;
  IF position('PracticePeer' IN v_def) > 0 THEN
    RETURN;
  END IF;
  v_new := replace(v_def, 'DELETE FROM public."PracticeProgress" WHERE TRUE;',
    E'DELETE FROM public."PracticeProgress" WHERE TRUE;\n  DELETE FROM public."PracticePeer" WHERE TRUE;\n  UPDATE public."PracticeMember" SET "inParticipantView" = FALSE;');
  IF v_new = v_def THEN
    RAISE EXCEPTION 'practice_build: wipe line not found';
  END IF;
  EXECUTE v_new;
END
$patch$;

REVOKE ALL ON FUNCTION public.practice_push(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.practice_place(UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;
DO $g$
DECLARE
  f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'practice_set_my_role(text)', 'practice_team()', 'practice_peer_request(uuid,text,text)', 'practice_peer_respond(uuid,boolean)',
    'practice_peer_end(uuid)', 'practice_pulse()', 'practice_enter_participant()', 'practice_leave_participant()', 'practice_participant_peer(text)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO anon, authenticated', f);
  END LOOP;
END
$g$;
