-- Practice: a safe place to try the app together, inside the same database.
--
-- A permanent cohort named "Practice" (isPractice, status COMPLETED, so every
-- job that works on the running cohort leaves it alone). An admin picks a
-- roster of people and a practice role for each; "Set up" builds a practice
-- hub (or hubs) with those roles, a practice group of 3 made-up participants
-- for each support, four practice weeks and a Hub Leads meeting. "Test mode"
-- on puts the roster into the cohort (so the cohort chip shows Practice);
-- off removes them again. Resets rebuild the data; nothing real is touched.
--
--   Cohort.isPractice / practiceOn / practiceCalendar
--   PracticeMember   (roster: user + practice role)
--   PracticeProgress (scenario ticks and "stuck" flags, staff or participant)
--   Admin:  practice_state, practice_set_roster, practice_build,
--           practice_set_on, practice_set_calendar, practice_reset_person,
--           practice_reset_participant
--   Staff:  practice_my_progress, practice_set_progress
--   Participant: practice_participant_progress, practice_participant_set_progress
--
-- Practice participants sign in with their phone number and the setup code
-- FOF-PRACTICE (so a reset gives a true first sign-in). The hub-added and
-- role-assigned pushes skip practice hubs.
--
-- Rollback: DROP the functions above and public.practice_*; DROP TABLE
-- "PracticeProgress", "PracticeMember"; delete the Practice cohort; drop the
-- three Cohort columns; restore notify_hub_membership_added /
-- notify_hub_role_assigned from their earlier migrations.

ALTER TABLE public."Cohort"
  ADD COLUMN IF NOT EXISTS "isPractice" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "practiceOn" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "practiceCalendar" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS cohort_only_one_practice ON public."Cohort" ((TRUE)) WHERE "isPractice";

CREATE TABLE IF NOT EXISTS public."PracticeMember" (
  "userId" UUID PRIMARY KEY REFERENCES public."User"(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('SUPPORT', 'HUB_LEAD', 'ASSISTANT', 'RECAP_LEAD', 'PRAYER_LEAD')),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public."PracticeMember" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."PracticeMember" FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public."PracticeProgress" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" UUID REFERENCES public."User"(id) ON DELETE CASCADE,
  "participantId" UUID REFERENCES public."Participant"(id) ON DELETE CASCADE,
  "scenarioKey" TEXT NOT NULL CHECK (char_length("scenarioKey") BETWEEN 1 AND 60),
  "doneAt" TIMESTAMPTZ,
  "stuckAt" TIMESTAMPTZ,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (num_nonnulls("userId", "participantId") = 1)
);
CREATE UNIQUE INDEX IF NOT EXISTS practice_progress_user_key ON public."PracticeProgress" ("userId", "scenarioKey") WHERE "userId" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS practice_progress_participant_key ON public."PracticeProgress" ("participantId", "scenarioKey") WHERE "participantId" IS NOT NULL;
ALTER TABLE public."PracticeProgress" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."PracticeProgress" FROM anon, authenticated;

-- The practice cohort, created on first use (never ACTIVE).
CREATE OR REPLACE FUNCTION public.practice_ensure_cohort()
 RETURNS UUID
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_id UUID;
  v_today DATE := (timezone('Africa/Lagos', NOW()))::date;
BEGIN
  SELECT id INTO v_id FROM public."Cohort" WHERE "isPractice";
  IF v_id IS NULL THEN
    INSERT INTO public."Cohort" (name, description, "startDate", "endDate", status, "schedulePublished", "isPractice")
    VALUES ('Practice', 'A safe place to try the app. Nothing here is real.', v_today, v_today + 28, 'COMPLETED', TRUE, TRUE)
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END;
$function$;

-- Move the four practice weeks so "today" sits where the admin wants it.
CREATE OR REPLACE FUNCTION public.practice_apply_calendar(p_cohort UUID, p_mode TEXT)
 RETURNS VOID
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_today DATE := (timezone('Africa/Lagos', NOW()))::date;
  v_first DATE;
  v_mode TEXT := COALESCE(NULLIF(p_mode, ''), 'CLASS_DAY');
BEGIN
  IF v_mode NOT IN ('BEFORE', 'CLASS_DAY', 'MID_WEEK', 'WEEK_2') THEN
    RAISE EXCEPTION 'Unknown calendar choice';
  END IF;
  v_first := CASE v_mode
    WHEN 'BEFORE' THEN v_today + 3
    WHEN 'CLASS_DAY' THEN v_today
    WHEN 'MID_WEEK' THEN v_today - 3
    ELSE v_today - 7
  END;
  UPDATE public."Cohort" SET "startDate" = v_first, "endDate" = v_first + 28, "practiceCalendar" = v_mode, "updatedAt" = NOW() WHERE id = p_cohort;
  UPDATE public."Week" SET "classDate" = v_first + ("weekNumber" - 1) * 7, "shareWithParticipants" = TRUE WHERE "cohortId" = p_cohort;
END;
$function$;

-- One practice group of three made-up participants for a support.
CREATE OR REPLACE FUNCTION public.practice_make_group(p_cohort UUID, p_user UUID, p_no INTEGER)
 RETURNS UUID
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_group UUID;
  v_pid UUID;
  k INTEGER;
  v_names TEXT[] := ARRAY['Ada', 'Bola', 'Chidi', 'Dayo', 'Efe', 'Femi', 'Gozie', 'Hauwa', 'Ifeanyi', 'Jide', 'Kemi', 'Lola'];
BEGIN
  INSERT INTO public."Group" ("cohortId", name, "supportId")
  VALUES (p_cohort, format('Practice Group %s', p_no), p_user)
  RETURNING id INTO v_group;

  FOR k IN 1..3 LOOP
    INSERT INTO public."Participant" ("fullName", phone, "cohortId", status, "isTest", gender)
    VALUES (
      format('%s Practice %s', v_names[((p_no - 1) * 3 + k - 1) % 12 + 1], p_no),
      '0800999' || lpad((p_no * 10 + k)::text, 4, '0'),
      p_cohort, 'ACTIVE', TRUE, CASE WHEN k % 2 = 0 THEN 'Male' ELSE 'Female' END)
    RETURNING id INTO v_pid;
    INSERT INTO public."GroupParticipant" ("groupId", "participantId") VALUES (v_group, v_pid);
    INSERT INTO public."ParticipantAccount" ("participantId", password_hash, "setupCode", "mustChangePassword", "isActive", "issuedAt")
    VALUES (v_pid, extensions.crypt('FOF-PRACTICE', extensions.gen_salt('bf', 10)), 'FOF-PRACTICE', TRUE, TRUE, NOW());
    IF k = 1 THEN
      INSERT INTO public."FaithProject" ("participantId", title, body, status, "sharedForPrayer")
      VALUES (v_pid, 'Practice faith project', 'A short practice faith project, here so there is something to pray for.', 'APPROVED', TRUE);
    END IF;
  END LOOP;
  RETURN v_group;
END;
$function$;

-- Roster people in or out of the practice cohort to match Test mode.
CREATE OR REPLACE FUNCTION public.practice_sync_members(p_cohort UUID)
 RETURNS VOID
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  DELETE FROM public."UserCohort" WHERE "cohortId" = p_cohort;
  IF (SELECT "practiceOn" FROM public."Cohort" WHERE id = p_cohort) THEN
    INSERT INTO public."UserCohort" ("userId", "cohortId", "supportKind")
    SELECT m."userId", p_cohort, CASE WHEN m.role = 'HUB_LEAD' THEN 'HUB_LEAD' ELSE 'PARTICIPANT_SUPPORT' END
    FROM public."PracticeMember" m;
  END IF;
END;
$function$;

-- Wipe and rebuild everything practice from the roster.
CREATE OR REPLACE FUNCTION public.practice_build(p_calendar TEXT DEFAULT NULL)
 RETURNS JSONB
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
    INSERT INTO public."SupportHub" ("cohortId", name, "leadUserId", "meetingDay", "meetingTime", "meetingDurationMins", "callPlatform", "callLink", "assistantPermissions")
    VALUES (
      v_c, format('Practice Hub %s', v_i),
      (SELECT "userId" FROM _pm WHERE role = 'HUB_LEAD' AND role_rn = v_i),
      v_day, '19:00', 60, 'GOOGLE_MEET', 'https://meet.google.com/practice-hub',
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

  INSERT INTO public."HubLeadsMeeting" ("cohortId", "meetingDay", "meetingTime", "meetingDurationMins", "callPlatform", "callLink")
  VALUES (v_c, v_day, '20:00', 45, 'GOOGLE_MEET', 'https://meet.google.com/practice-leads');

  PERFORM public.practice_sync_members(v_c);
  RETURN jsonb_build_object('cohortId', v_c, 'hubs', v_hubs, 'people', (SELECT count(*) FROM _pm), 'calendar', v_cal);
END;
$function$;

CREATE OR REPLACE FUNCTION public.practice_set_roster(p_members JSONB)
 RETURNS VOID
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_c UUID;
BEGIN
  IF NOT public.app_is_admin() THEN
    RAISE EXCEPTION 'Only admins can change the Practice roster';
  END IF;
  v_c := public.practice_ensure_cohort();
  DELETE FROM public."PracticeMember" WHERE TRUE;
  INSERT INTO public."PracticeMember" ("userId", role)
  SELECT (x->>'userId')::uuid, x->>'role'
  FROM jsonb_array_elements(COALESCE(p_members, '[]'::jsonb)) x
  JOIN public."User" u ON u.id = (x->>'userId')::uuid AND u.role = 'SUPPORT'
  ON CONFLICT ("userId") DO UPDATE SET role = EXCLUDED.role;
  PERFORM public.practice_sync_members(v_c);
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
    RAISE EXCEPTION 'Only admins can switch Test mode';
  END IF;
  v_c := public.practice_ensure_cohort();
  UPDATE public."Cohort" SET "practiceOn" = COALESCE(p_on, FALSE), "updatedAt" = NOW() WHERE id = v_c;
  PERFORM public.practice_sync_members(v_c);
END;
$function$;

CREATE OR REPLACE FUNCTION public.practice_set_calendar(p_mode TEXT)
 RETURNS VOID
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT public.app_is_admin() THEN
    RAISE EXCEPTION 'Only admins can change the Practice calendar';
  END IF;
  PERFORM public.practice_apply_calendar(public.practice_ensure_cohort(), p_mode);
END;
$function$;

-- Reset one support: a brand-new practice group (fresh participants), tick-offs cleared.
CREATE OR REPLACE FUNCTION public.practice_reset_person(p_user_id UUID)
 RETURNS VOID
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_c UUID;
  v_group public."Group";
  v_no INTEGER;
BEGIN
  IF NOT public.app_is_admin() THEN
    RAISE EXCEPTION 'Only admins can reset Practice';
  END IF;
  v_c := public.practice_ensure_cohort();
  DELETE FROM public."PracticeProgress" WHERE "userId" = p_user_id
    OR "participantId" IN (SELECT gp."participantId" FROM public."GroupParticipant" gp JOIN public."Group" g ON g.id = gp."groupId" WHERE g."supportId" = p_user_id AND g."cohortId" = v_c);
  SELECT * INTO v_group FROM public."Group" WHERE "supportId" = p_user_id AND "cohortId" = v_c LIMIT 1;
  IF v_group.id IS NOT NULL THEN
    v_no := COALESCE(NULLIF(regexp_replace(v_group.name, '\D', '', 'g'), '')::int, 1);
    -- Take people out of the group first so the handover log runs while they still exist.
    CREATE TEMP TABLE _gone ON COMMIT DROP AS SELECT "participantId" AS id FROM public."GroupParticipant" WHERE "groupId" = v_group.id;
    DELETE FROM public."GroupParticipant" WHERE "groupId" = v_group.id;
    DELETE FROM public."Participant" WHERE id IN (SELECT id FROM _gone);
    DROP TABLE _gone;
    DELETE FROM public."Group" WHERE id = v_group.id;
    PERFORM public.practice_make_group(v_c, p_user_id, v_no);
  END IF;
END;
$function$;

-- Reset one practice participant: same name and phone, new first-time experience.
CREATE OR REPLACE FUNCTION public.practice_reset_participant(p_participant_id UUID)
 RETURNS VOID
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_c UUID;
  v_p public."Participant";
  v_group UUID;
  v_new UUID;
  v_first BOOLEAN;
BEGIN
  IF NOT public.app_is_admin() THEN
    RAISE EXCEPTION 'Only admins can reset Practice';
  END IF;
  v_c := public.practice_ensure_cohort();
  SELECT * INTO v_p FROM public."Participant" WHERE id = p_participant_id AND "cohortId" = v_c;
  IF v_p.id IS NULL THEN
    RAISE EXCEPTION 'That is not a practice participant';
  END IF;
  SELECT "groupId" INTO v_group FROM public."GroupParticipant" WHERE "participantId" = v_p.id LIMIT 1;
  v_first := EXISTS (SELECT 1 FROM public."FaithProject" WHERE "participantId" = v_p.id);
  DELETE FROM public."GroupParticipant" WHERE "participantId" = v_p.id;
  DELETE FROM public."Participant" WHERE id = v_p.id;
  INSERT INTO public."Participant" ("fullName", phone, "cohortId", status, "isTest", gender)
  VALUES (v_p."fullName", v_p.phone, v_c, 'ACTIVE', TRUE, v_p.gender) RETURNING id INTO v_new;
  IF v_group IS NOT NULL THEN
    INSERT INTO public."GroupParticipant" ("groupId", "participantId") VALUES (v_group, v_new);
  END IF;
  INSERT INTO public."ParticipantAccount" ("participantId", password_hash, "setupCode", "mustChangePassword", "isActive", "issuedAt")
  VALUES (v_new, extensions.crypt('FOF-PRACTICE', extensions.gen_salt('bf', 10)), 'FOF-PRACTICE', TRUE, TRUE, NOW());
  IF v_first THEN
    INSERT INTO public."FaithProject" ("participantId", title, body, status, "sharedForPrayer")
    VALUES (v_new, 'Practice faith project', 'A short practice faith project, here so there is something to pray for.', 'APPROVED', TRUE);
  END IF;
END;
$function$;

-- Everything the admin board shows.
CREATE OR REPLACE FUNCTION public.practice_state()
 RETURNS JSONB
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_c public."Cohort";
BEGIN
  IF NOT public.app_is_admin() THEN
    RAISE EXCEPTION 'Only admins can see Practice';
  END IF;
  SELECT * INTO v_c FROM public."Cohort" WHERE "isPractice";
  IF v_c.id IS NULL THEN
    RETURN jsonb_build_object('cohortId', NULL, 'on', FALSE, 'built', FALSE, 'calendar', NULL,
      'members', COALESCE((SELECT jsonb_agg(jsonb_build_object('userId', m."userId", 'name', u.name, 'role', m.role, 'progress', '[]'::jsonb, 'group', NULL) ORDER BY u.name)
                           FROM public."PracticeMember" m JOIN public."User" u ON u.id = m."userId"), '[]'::jsonb));
  END IF;
  RETURN jsonb_build_object(
    'cohortId', v_c.id,
    'on', v_c."practiceOn",
    'calendar', v_c."practiceCalendar",
    'built', EXISTS (SELECT 1 FROM public."Week" WHERE "cohortId" = v_c.id),
    'members', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'userId', m."userId", 'name', u.name, 'role', m.role, 'avatarUrl', u."avatarUrl",
        'progress', COALESCE((SELECT jsonb_agg(jsonb_build_object('key', pp."scenarioKey", 'doneAt', pp."doneAt", 'stuckAt', pp."stuckAt")) FROM public."PracticeProgress" pp WHERE pp."userId" = m."userId"), '[]'::jsonb),
        'group', (
          SELECT jsonb_build_object('id', g.id, 'name', g.name, 'participants', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'id', p.id, 'name', p."fullName", 'phone', p.phone,
              'code', CASE WHEN a."mustChangePassword" THEN a."setupCode" END,
              'signedIn', COALESCE(NOT a."mustChangePassword", FALSE),
              'progress', COALESCE((SELECT jsonb_agg(jsonb_build_object('key', pp."scenarioKey", 'doneAt', pp."doneAt", 'stuckAt', pp."stuckAt")) FROM public."PracticeProgress" pp WHERE pp."participantId" = p.id), '[]'::jsonb)
            ) ORDER BY p."fullName")
            FROM public."GroupParticipant" gp JOIN public."Participant" p ON p.id = gp."participantId"
            LEFT JOIN public."ParticipantAccount" a ON a."participantId" = p.id
            WHERE gp."groupId" = g.id), '[]'::jsonb))
          FROM public."Group" g WHERE g."supportId" = m."userId" AND g."cohortId" = v_c.id AND g."archivedAt" IS NULL LIMIT 1)
      ) ORDER BY u.name)
      FROM public."PracticeMember" m JOIN public."User" u ON u.id = m."userId"), '[]'::jsonb),
    'hubs', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', h.id, 'name', h.name, 'leadName', (SELECT name FROM public."User" WHERE id = h."leadUserId"))) FROM public."SupportHub" h WHERE h."cohortId" = v_c.id), '[]'::jsonb)
  );
END;
$function$;

-- Staff: my practice role and ticks.
CREATE OR REPLACE FUNCTION public.practice_my_progress()
 RETURNS JSONB
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_me UUID := public.app_current_user_id();
  v_role TEXT;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('role', NULL, 'items', '[]'::jsonb);
  END IF;
  SELECT role INTO v_role FROM public."PracticeMember" WHERE "userId" = v_me;
  RETURN jsonb_build_object('role', v_role, 'items', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('key', pp."scenarioKey", 'doneAt', pp."doneAt", 'stuckAt', pp."stuckAt"))
    FROM public."PracticeProgress" pp WHERE pp."userId" = v_me), '[]'::jsonb));
END;
$function$;

CREATE OR REPLACE FUNCTION public.practice_set_progress(p_key TEXT, p_done BOOLEAN, p_stuck BOOLEAN)
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
  INSERT INTO public."PracticeProgress" ("userId", "scenarioKey", "doneAt", "stuckAt")
  VALUES (v_me, p_key, CASE WHEN p_done THEN NOW() END, CASE WHEN p_stuck THEN NOW() END)
  ON CONFLICT ("userId", "scenarioKey") WHERE "userId" IS NOT NULL DO UPDATE
    SET "doneAt" = EXCLUDED."doneAt", "stuckAt" = EXCLUDED."stuckAt", "updatedAt" = NOW();
END;
$function$;

-- Practice participants: their ticks, through their own token.
CREATE OR REPLACE FUNCTION public.practice_participant_progress(p_token TEXT)
 RETURNS JSONB
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_pid UUID := public.app_participant_id(p_token);
  v_practice BOOLEAN;
BEGIN
  IF v_pid IS NULL THEN
    RAISE EXCEPTION 'SESSION_EXPIRED';
  END IF;
  SELECT COALESCE(c."isPractice", FALSE) INTO v_practice
  FROM "Participant" p LEFT JOIN "Cohort" c ON c.id = p."cohortId" WHERE p.id = v_pid;
  IF NOT COALESCE(v_practice, FALSE) THEN
    RETURN jsonb_build_object('practice', FALSE, 'items', '[]'::jsonb);
  END IF;
  RETURN jsonb_build_object('practice', TRUE, 'items', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('key', pp."scenarioKey", 'doneAt', pp."doneAt", 'stuckAt', pp."stuckAt"))
    FROM "PracticeProgress" pp WHERE pp."participantId" = v_pid), '[]'::jsonb));
END;
$function$;

CREATE OR REPLACE FUNCTION public.practice_participant_set_progress(p_token TEXT, p_key TEXT, p_done BOOLEAN, p_stuck BOOLEAN)
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
  INSERT INTO "PracticeProgress" ("participantId", "scenarioKey", "doneAt", "stuckAt")
  VALUES (v_pid, p_key, CASE WHEN p_done THEN NOW() END, CASE WHEN p_stuck THEN NOW() END)
  ON CONFLICT ("participantId", "scenarioKey") WHERE "participantId" IS NOT NULL DO UPDATE
    SET "doneAt" = EXCLUDED."doneAt", "stuckAt" = EXCLUDED."stuckAt", "updatedAt" = NOW();
END;
$function$;

-- Practice hubs never send the "added to a hub" or "you are now the ..." pushes.
CREATE OR REPLACE FUNCTION public.notify_hub_membership_added()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_hub_name TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM public."Cohort" WHERE id = NEW."cohortId" AND "isPractice") THEN
    RETURN NEW;
  END IF;
  SELECT name INTO v_hub_name FROM public."SupportHub" WHERE id = NEW."hubId";
  PERFORM public.invoke_hub_message_push(
    ARRAY[NEW."userId"],
    format('You''ve been added to %s', COALESCE(v_hub_name, 'a hub')),
    'Tap to open My Hub'
  );
  RETURN NEW;
END;
$function$;

DO $patch$
DECLARE
  v_def TEXT;
  v_new TEXT;
BEGIN
  SELECT pg_get_functiondef('public.notify_hub_role_assigned()'::regprocedure) INTO v_def;
  IF position('"isPractice"' IN v_def) > 0 THEN
    RETURN;
  END IF;
  v_new := regexp_replace(v_def, E'\\mBEGIN\\M', E'BEGIN\n  IF EXISTS (SELECT 1 FROM public."Cohort" WHERE id = NEW."cohortId" AND "isPractice") THEN RETURN NEW; END IF;', '');
  IF v_new = v_def THEN
    RAISE EXCEPTION 'notify_hub_role_assigned: BEGIN not found';
  END IF;
  EXECUTE v_new;
END
$patch$;

-- Grants: admin and staff functions are callable; each checks who is asking.
REVOKE ALL ON FUNCTION public.practice_ensure_cohort() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.practice_apply_calendar(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.practice_make_group(UUID, UUID, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.practice_sync_members(UUID) FROM PUBLIC, anon, authenticated;
DO $g$
DECLARE
  f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'practice_build(text)', 'practice_set_roster(jsonb)', 'practice_set_on(boolean)', 'practice_set_calendar(text)',
    'practice_reset_person(uuid)', 'practice_reset_participant(uuid)', 'practice_state()', 'practice_my_progress()',
    'practice_set_progress(text,boolean,boolean)', 'practice_participant_progress(text)', 'practice_participant_set_progress(text,text,boolean,boolean)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO anon, authenticated', f);
  END LOOP;
END
$g$;
