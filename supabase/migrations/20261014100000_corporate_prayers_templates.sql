-- Corporate prayers, round two: a slot is a template (stacked verses plus an optional faith project), it goes to chosen hubs,
-- a Live slot carries its own Telegram link, and an admin can fire a test prayer in the Practice cohort.
--
--   * A slot keeps `blocks`: an ordered list of {type:'VERSE', verseId} and {type:'FAITH_PROJECT'}. The verse is fixed; only the
--     person changes (rotation and cycle record are unchanged: prayer_pick). The day's session copies the template and the audience,
--     so editing a slot never rewrites a day that already ran.
--   * Audience: everyone, or chosen hubs (that hub's supports and the participants of those supports). In "different person per hub"
--     mode each chosen hub gets its own person; in "same person" mode they all get one. Two slots may share a time when their
--     audiences do not overlap (checked on save).
--   * Live slots: link, wait before "Prayed" unlocks and the line shown above the link now live on the slot (the per-cohort row is unused).
--   * Practice cohort: test participants are allowed there only, and `practice_send_test_prayer` makes a short-lived session for them.
--   * Old test data removed here (approved by Olamide, 14 Oct 2026): the one 3:13 pm test slot in the Practice cohort and its one test day.
-- Rollback: restore the functions from 20261011100000_corporate_prayers.sql; the added columns are harmless to leave.

-- ---------------------------------------------------------------------------------------------------------------------------
-- 0. Clear the old test slot (and its session, targets and check-ins by cascade). Refuses if anyone has checked in.
-- ---------------------------------------------------------------------------------------------------------------------------
DELETE FROM public."CorporatePrayerSlot" sl
WHERE sl.id = '4f741c18-b25e-49e5-bc01-93bb3f9c162e'
  AND NOT EXISTS (SELECT 1 FROM public."CorporatePrayerSession" s JOIN public."CorporatePrayerCheckin" k ON k."sessionId" = s.id WHERE s."slotId" = sl.id);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public."CorporatePrayerSlot" WHERE "slotType" <> 'LIVE') THEN
    RAISE EXCEPTION 'Old-style slots still exist; clear them before applying this migration.';
  END IF;
END $$;

-- ---------------------------------------------------------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------------------------------------------------------
ALTER TABLE public."CorporatePrayerVerse" ADD COLUMN IF NOT EXISTS title text;
UPDATE public."CorporatePrayerVerse" SET title = reference WHERE title IS NULL;
ALTER TABLE public."CorporatePrayerVerse" ALTER COLUMN title SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_prayer_verse_title ON public."CorporatePrayerVerse" (lower(btrim(title)));

DROP INDEX IF EXISTS public.uniq_prayer_slot_time;
DO $$
DECLARE c record;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint
           WHERE conrelid = 'public."CorporatePrayerSlot"'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%slotType%' LOOP
    EXECUTE format('ALTER TABLE public."CorporatePrayerSlot" DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;
ALTER TABLE public."CorporatePrayerSlot"
  ADD CONSTRAINT "CorporatePrayerSlot_slotType_check" CHECK ("slotType" IN ('PRAYER', 'LIVE')),
  ADD COLUMN IF NOT EXISTS blocks jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "audienceAll" boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "hubIds" uuid[] NOT NULL DEFAULT '{}'::uuid[],
  ADD COLUMN IF NOT EXISTS "telegramLink" text,
  ADD COLUMN IF NOT EXISTS "liveWaitMinutes" integer NOT NULL DEFAULT 5 CHECK ("liveWaitMinutes" BETWEEN 0 AND 60),
  ADD COLUMN IF NOT EXISTS "liveMessage" text,
  ADD COLUMN IF NOT EXISTS "isTest" boolean NOT NULL DEFAULT false;

ALTER TABLE public."CorporatePrayerSession"
  ADD COLUMN IF NOT EXISTS blocks jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "audienceAll" boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "hubIds" uuid[] NOT NULL DEFAULT '{}'::uuid[];

-- ---------------------------------------------------------------------------------------------------------------------------
-- 2. Helpers (internal)
-- ---------------------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prayer_is_practice(p_cohort uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $$ SELECT COALESCE((SELECT c."isPractice" FROM public."Cohort" c WHERE c.id = p_cohort), FALSE) $$;

-- Is a person in this hub (or, for "everyone", anyone) inside an audience? NO_HUB people only get "everyone".
CREATE OR REPLACE FUNCTION public.prayer_in_audience(p_all boolean, p_hubs uuid[], p_hub_key text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $$ SELECT COALESCE(p_all, FALSE) OR (p_hub_key IS NOT NULL AND p_hub_key <> 'NO_HUB' AND p_hub_key = ANY (COALESCE(p_hubs, '{}'::uuid[])::text[])) $$;

CREATE OR REPLACE FUNCTION public.prayer_session_cohort(p_session uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $$ SELECT s."cohortId" FROM public."CorporatePrayerSession" s WHERE s.id = p_session $$;

-- FAITH when the template shows a faith project, else NAME.
CREATE OR REPLACE FUNCTION public.prayer_blocks_pool(p_blocks jsonb)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $$ SELECT CASE WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(p_blocks, '[]'::jsonb)) b WHERE b->>'type' = 'FAITH_PROJECT') THEN 'FAITH' ELSE 'NAME' END $$;

-- The template filled in for display: verses with their text, the project with the person's words.
CREATE OR REPLACE FUNCTION public.prayer_resolve_blocks(p_blocks jsonb, p_project text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $$
  SELECT COALESCE(jsonb_agg(r.j ORDER BY r.ord), '[]'::jsonb) FROM (
    SELECT b.ord,
           CASE WHEN b.elem->>'type' = 'VERSE' THEN
                  (SELECT jsonb_build_object('type', 'VERSE', 'title', v.title, 'prayer', v.prayer, 'reference', v.reference)
                   FROM public."CorporatePrayerVerse" v WHERE v.id = (b.elem->>'verseId')::uuid)
                WHEN b.elem->>'type' = 'FAITH_PROJECT' THEN jsonb_build_object('type', 'FAITH_PROJECT', 'text', p_project)
           END AS j
    FROM jsonb_array_elements(COALESCE(p_blocks, '[]'::jsonb)) WITH ORDINALITY AS b(elem, ord)) r
  WHERE r.j IS NOT NULL
$$;

-- Test accounts count only inside the Practice cohort.
CREATE OR REPLACE FUNCTION public.prayer_pool_members(p_cohort uuid, p_pool text)
RETURNS TABLE (participant_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $$
  SELECT p.id
  FROM public."Participant" p
  WHERE p."cohortId" = p_cohort
    AND p.status = 'ACTIVE'
    AND (p."isTest" IS NOT TRUE OR public.prayer_is_practice(p_cohort))
    AND NOT public.prayer_is_teen(p)
    AND p."prayerConsent" IS DISTINCT FROM 'OUT'
    AND (p_pool = 'NAME' OR EXISTS (
      SELECT 1 FROM public."FaithProject" f
      WHERE f."participantId" = p.id AND f.status = 'SAVED' AND NULLIF(btrim(COALESCE(f.body, '')), '') IS NOT NULL))
$$;

CREATE OR REPLACE FUNCTION public.prayer_counted_participants(p_cohort uuid)
RETURNS TABLE (participant_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $$
  SELECT p.id
  FROM public."Participant" p
  JOIN public."ParticipantAccount" a ON a."participantId" = p.id AND a."isActive"
  WHERE p."cohortId" = p_cohort AND p.status = 'ACTIVE' AND (p."isTest" IS NOT TRUE OR public.prayer_is_practice(p_cohort)) AND NOT public.prayer_is_teen(p)
$$;

-- The caller for the prayer screens. A support working in Practice passes the Practice cohort (p_cohort) and, if they belong to it,
-- is placed there; otherwise staff pray in the current programme cohort.
DROP FUNCTION IF EXISTS public.prayer_caller(text);
CREATE OR REPLACE FUNCTION public.prayer_caller(p_token text, p_cohort uuid DEFAULT NULL)
RETURNS TABLE (kind text, person_id uuid, cohort_id uuid, hub_key text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_pid uuid := public.app_participant_id(p_token);
  v_user "User";
  v_cohort uuid;
BEGIN
  IF v_pid IS NOT NULL THEN
    SELECT p."cohortId" INTO v_cohort FROM public."Participant" p
    WHERE p.id = v_pid AND NOT public.prayer_is_teen(p) AND (p."isTest" IS NOT TRUE OR public.prayer_is_practice(p."cohortId"));
    IF v_cohort IS NULL THEN RETURN; END IF;
    RETURN QUERY SELECT 'PARTICIPANT'::text, v_pid, v_cohort, public.prayer_participant_hub(v_cohort, v_pid);
    RETURN;
  END IF;
  v_user := public.app_staff(p_token);
  IF v_user.id IS NULL THEN RETURN; END IF;
  IF NOT ('SUPPORT'::"Role" = ANY (public.app_user_roles(v_user))) OR v_user."isTest" IS TRUE THEN RETURN; END IF;
  IF p_cohort IS NOT NULL AND public.prayer_is_practice(p_cohort)
     AND EXISTS (SELECT 1 FROM public."UserCohort" uc WHERE uc."userId" = v_user.id AND uc."cohortId" = p_cohort) THEN
    v_cohort := p_cohort;
  ELSE
    v_cohort := public.prayer_user_cohort(v_user.id);
  END IF;
  IF v_cohort IS NULL THEN RETURN; END IF;
  RETURN QUERY SELECT 'SUPPORT'::text, v_user.id, v_cohort, public.prayer_user_hub(v_cohort, v_user.id);
END;
$$;

-- ---------------------------------------------------------------------------------------------------------------------------
-- 3. Making a day's session
-- ---------------------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ensure_prayer_session(p_slot uuid, p_date date)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  s public."CorporatePrayerSlot";
  v_session uuid;
  v_opens timestamptz;
  v_pool text;
  v_key text;
  v_pick record;
  v_chosen uuid[] := '{}'::uuid[];
BEGIN
  SELECT * INTO s FROM public."CorporatePrayerSlot" WHERE id = p_slot AND active;
  IF NOT FOUND THEN RETURN NULL; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_slot::text || p_date::text, 0));
  SELECT id INTO v_session FROM public."CorporatePrayerSession" WHERE "slotId" = p_slot AND "prayerDate" = p_date;
  IF FOUND THEN RETURN v_session; END IF;

  v_opens := (p_date + s."timeOfDay") AT TIME ZONE 'Africa/Lagos';
  INSERT INTO public."CorporatePrayerSession" ("slotId", "cohortId", "prayerDate", "slotType", "opensAt", "closesAt", "timerMinutes", blocks, "audienceAll", "hubIds")
  VALUES (p_slot, s."cohortId", p_date, s."slotType", v_opens, v_opens + make_interval(mins => s."joinWindowMinutes"), s."timerMinutes", s.blocks, s."audienceAll", s."hubIds")
  RETURNING id INTO v_session;

  IF s."slotType" = 'LIVE' THEN RETURN v_session; END IF;

  v_pool := public.prayer_blocks_pool(s.blocks);
  IF COALESCE(s."targetMode", 'HUB') = 'COHORT' THEN
    -- One person for every chosen hub.
    SELECT * INTO v_pick FROM public.prayer_pick(s."cohortId", v_pool, v_chosen, p_date, TRUE);
    IF v_pick.participant_id IS NOT NULL THEN
      INSERT INTO public."CorporatePrayerTarget" ("sessionId", "hubKey", "cohortId", pool, "prayerDate", "participantId", "cycleNo")
      VALUES (v_session, 'COHORT', s."cohortId", v_pool, p_date, v_pick.participant_id, v_pick.cycle_no);
    END IF;
  ELSE
    -- One person per chosen hub that has anyone in it, hubs in a fixed order, so every hub prays for someone different.
    FOR v_key IN
      SELECT k.key FROM (
        SELECT public.prayer_participant_hub(s."cohortId", cp.participant_id) AS key FROM public.prayer_counted_participants(s."cohortId") cp
        UNION
        SELECT public.prayer_user_hub(s."cohortId", cs.user_id) FROM public.prayer_counted_supports(s."cohortId") cs
      ) k
      WHERE public.prayer_in_audience(s."audienceAll", s."hubIds", k.key)
      ORDER BY (SELECT h.name FROM public."SupportHub" h WHERE h.id::text = k.key) NULLS LAST, k.key
    LOOP
      SELECT * INTO v_pick FROM public.prayer_pick(s."cohortId", v_pool, v_chosen, p_date, TRUE);
      EXIT WHEN v_pick.participant_id IS NULL;
      INSERT INTO public."CorporatePrayerTarget" ("sessionId", "hubKey", "cohortId", pool, "prayerDate", "participantId", "cycleNo")
      VALUES (v_session, v_key, s."cohortId", v_pool, p_date, v_pick.participant_id, v_pick.cycle_no);
      v_chosen := v_chosen || v_pick.participant_id;
    END LOOP;
  END IF;
  RETURN v_session;
END;
$$;

-- The session open right now for a person in this hub (making today's if a slot has just opened). The most recently opened wins.
DROP FUNCTION IF EXISTS public.prayer_open_session(uuid);
CREATE OR REPLACE FUNCTION public.prayer_open_session(p_cohort uuid, p_hub text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_today date := public.prayer_lagos_today();
  s record;
  v_opens timestamptz;
  v_day date;
  v_running boolean := public.prayer_running(p_cohort);
BEGIN
  IF v_running THEN
    -- Yesterday too: a slot late in the evening can stay joinable past midnight. Sessions are made for every open slot, whoever asks.
    FOR v_day IN SELECT d::date FROM generate_series(v_today - 1, v_today, interval '1 day') d LOOP
      FOR s IN SELECT sl.id, sl."timeOfDay", sl."joinWindowMinutes" FROM public."CorporatePrayerSlot" sl
               WHERE sl."cohortId" = p_cohort AND sl.active AND NOT sl."isTest" LOOP
        v_opens := (v_day + s."timeOfDay") AT TIME ZONE 'Africa/Lagos';
        IF now() >= v_opens AND now() < v_opens + make_interval(mins => s."joinWindowMinutes") THEN
          PERFORM public.ensure_prayer_session(s.id, v_day);
        END IF;
      END LOOP;
    END LOOP;
  END IF;
  -- A test prayer (Practice) shows whether or not prayers have "started" there.
  RETURN (SELECT x.id FROM public."CorporatePrayerSession" x
          JOIN public."CorporatePrayerSlot" sl ON sl.id = x."slotId" AND sl.active
          WHERE x."cohortId" = p_cohort AND x."prayerDate" >= v_today - 1 AND now() >= x."opensAt" AND now() < x."closesAt"
            AND public.prayer_in_audience(x."audienceAll", x."hubIds", p_hub)
            AND (v_running OR sl."isTest")
          ORDER BY x."opensAt" DESC LIMIT 1);
END;
$$;

-- The next slot to open today or tomorrow for a person in this hub (or null). Used for the "next prayer" line.
DROP FUNCTION IF EXISTS public.prayer_next_opening(uuid);
CREATE OR REPLACE FUNCTION public.prayer_next_opening(p_cohort uuid, p_hub text)
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $$
  SELECT row_to_json(n) FROM (
    SELECT sl.id AS "slotId", sl.name, sl."slotType",
           ((public.prayer_lagos_today() + d.off + sl."timeOfDay") AT TIME ZONE 'Africa/Lagos') AS "opensAt"
    FROM public."CorporatePrayerSlot" sl
    CROSS JOIN (VALUES (0), (1)) AS d(off)
    WHERE sl."cohortId" = p_cohort AND sl.active AND NOT sl."isTest" AND public.prayer_running(p_cohort)
      AND public.prayer_in_audience(sl."audienceAll", sl."hubIds", p_hub)
      AND ((public.prayer_lagos_today() + d.off + sl."timeOfDay") AT TIME ZONE 'Africa/Lagos') > now()
    ORDER BY ((public.prayer_lagos_today() + d.off + sl."timeOfDay") AT TIME ZONE 'Africa/Lagos') LIMIT 1
  ) n
$$;

REVOKE ALL ON FUNCTION public.prayer_is_practice(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prayer_in_audience(boolean, uuid[], text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prayer_session_cohort(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prayer_blocks_pool(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prayer_resolve_blocks(jsonb, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prayer_caller(text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prayer_open_session(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prayer_next_opening(uuid, text) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------
-- 4. Admin functions
-- ---------------------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.corporate_prayer_overview(p_token text, p_cohort_id uuid)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_today date := public.prayer_lagos_today();
  v_start date := public.faith_prayers_start_date(p_cohort_id);
BEGIN
  PERFORM public.prayer_require_admin(p_token);
  RETURN json_build_object(
    'startWeekNumber', (SELECT s."prayersStartWeekNumber" FROM public."FaithProjectSetting" s WHERE s."cohortId" = p_cohort_id),
    'popupDaysBefore', COALESCE((SELECT s."prayerPopupDaysBefore" FROM public."FaithProjectSetting" s WHERE s."cohortId" = p_cohort_id), 3),
    'startDate', v_start,
    'endDate', (SELECT c."endDate" FROM public."Cohort" c WHERE c.id = p_cohort_id),
    'today', v_today,
    'running', public.prayer_running(p_cohort_id),
    'isPractice', public.prayer_is_practice(p_cohort_id),
    'hubs', COALESCE((SELECT json_agg(json_build_object('id', h.id, 'name', h.name) ORDER BY h.name) FROM public."SupportHub" h WHERE h."cohortId" = p_cohort_id), '[]'::json),
    'slots', COALESCE((SELECT json_agg(json_build_object(
        'id', sl.id, 'name', sl.name, 'time', to_char(sl."timeOfDay", 'HH24:MI'), 'slotType', sl."slotType",
        'timerMinutes', sl."timerMinutes", 'joinWindowMinutes', sl."joinWindowMinutes", 'targetMode', sl."targetMode",
        'notify', sl.notify, 'active', sl.active, 'blocks', sl.blocks, 'audienceAll', sl."audienceAll", 'hubIds', sl."hubIds",
        'telegramLink', sl."telegramLink", 'liveWaitMinutes', sl."liveWaitMinutes", 'liveMessage', sl."liveMessage",
        'hasHistory', EXISTS (SELECT 1 FROM public."CorporatePrayerSession" h WHERE h."slotId" = sl.id),
        'today', (SELECT json_build_object('sessionId', se.id, 'opensAt', se."opensAt", 'closesAt', se."closesAt", 'counts', public.prayer_counts_json(se.id))
                  FROM public."CorporatePrayerSession" se WHERE se."slotId" = sl.id AND se."prayerDate" = v_today)
      ) ORDER BY sl."timeOfDay", sl."createdAt") FROM public."CorporatePrayerSlot" sl WHERE sl."cohortId" = p_cohort_id AND NOT sl."isTest"), '[]'::json),
    'verses', json_build_object(
      'total', (SELECT count(*) FROM public."CorporatePrayerVerse"),
      'active', (SELECT count(*) FROM public."CorporatePrayerVerse" WHERE active)),
    'pools', json_build_object(
      'FAITH', (SELECT count(*) FROM public.prayer_pool_members(p_cohort_id, 'FAITH')),
      'NAME', (SELECT count(*) FROM public.prayer_pool_members(p_cohort_id, 'NAME'))),
    'counted', json_build_object(
      'participants', (SELECT count(*) FROM public.prayer_counted_participants(p_cohort_id)),
      'supports', (SELECT count(*) FROM public.prayer_counted_supports(p_cohort_id)))
  );
END;
$$;

DROP FUNCTION IF EXISTS public.upsert_prayer_slot(text, uuid, uuid, text, text, text, integer, integer, text, boolean, boolean);
CREATE OR REPLACE FUNCTION public.upsert_prayer_slot(
  p_token text, p_cohort_id uuid, p_id uuid, p_name text, p_time text, p_type text,
  p_timer integer, p_window integer, p_target_mode text, p_notify boolean, p_active boolean,
  p_blocks jsonb, p_audience_all boolean, p_hub_ids uuid[], p_telegram text, p_wait integer, p_message text)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_time time;
  v_row public."CorporatePrayerSlot";
  v_name text := NULLIF(btrim(COALESCE(p_name, '')), '');
  v_all boolean := COALESCE(p_audience_all, TRUE);
  v_hubs uuid[] := CASE WHEN COALESCE(p_audience_all, TRUE) THEN '{}'::uuid[] ELSE COALESCE(p_hub_ids, '{}'::uuid[]) END;
  v_blocks jsonb := '[]'::jsonb;
  v_link text := NULLIF(btrim(COALESCE(p_telegram, '')), '');
  v_msg text := NULLIF(btrim(COALESCE(p_message, '')), '');
  v_mode text := CASE WHEN p_type = 'PRAYER' THEN COALESCE(p_target_mode, 'HUB') ELSE NULL END;
  b jsonb;
  v_n integer := 0;
  v_projects integer := 0;
  x record;
  v_clash uuid[];
BEGIN
  PERFORM public.prayer_require_admin(p_token);
  IF p_type NOT IN ('PRAYER', 'LIVE') THEN RAISE EXCEPTION 'INVALID_TYPE'; END IF;
  BEGIN v_time := p_time::time; EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'INVALID_TIME'; END;
  IF COALESCE(p_timer, 15) NOT BETWEEN 1 AND 120 THEN RAISE EXCEPTION 'INVALID_TIMER'; END IF;
  IF COALESCE(p_window, 15) NOT BETWEEN 1 AND 240 THEN RAISE EXCEPTION 'INVALID_WINDOW'; END IF;
  IF v_name IS NOT NULL AND length(v_name) > 40 THEN RAISE EXCEPTION 'NAME_TOO_LONG'; END IF;
  IF v_mode IS NOT NULL AND v_mode NOT IN ('COHORT', 'HUB') THEN RAISE EXCEPTION 'INVALID_MODE'; END IF;

  -- Audience: everyone, or at least one hub of this cohort.
  IF NOT v_all AND COALESCE(array_length(v_hubs, 1), 0) = 0 THEN RAISE EXCEPTION 'AUDIENCE_REQUIRED'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_hubs) h WHERE NOT EXISTS (SELECT 1 FROM public."SupportHub" sh WHERE sh.id = h AND sh."cohortId" = p_cohort_id)) THEN
    RAISE EXCEPTION 'INVALID_HUB';
  END IF;

  IF p_type = 'PRAYER' THEN
    IF p_blocks IS NULL OR jsonb_typeof(p_blocks) <> 'array' OR jsonb_array_length(p_blocks) = 0 THEN RAISE EXCEPTION 'BLOCKS_REQUIRED'; END IF;
    IF jsonb_array_length(p_blocks) > 8 THEN RAISE EXCEPTION 'TOO_MANY_BLOCKS'; END IF;
    FOR b IN SELECT * FROM jsonb_array_elements(p_blocks) LOOP
      v_n := v_n + 1;
      IF b->>'type' = 'VERSE' THEN
        IF NOT EXISTS (SELECT 1 FROM public."CorporatePrayerVerse" v WHERE v.id::text = b->>'verseId') THEN RAISE EXCEPTION 'VERSE_NOT_FOUND'; END IF;
        v_blocks := v_blocks || jsonb_build_array(jsonb_build_object('type', 'VERSE', 'verseId', b->>'verseId'));
      ELSIF b->>'type' = 'FAITH_PROJECT' THEN
        v_projects := v_projects + 1;
        IF v_projects > 1 THEN RAISE EXCEPTION 'ONE_PROJECT_ONLY'; END IF;
        v_blocks := v_blocks || jsonb_build_array(jsonb_build_object('type', 'FAITH_PROJECT'));
      ELSE
        RAISE EXCEPTION 'INVALID_BLOCK';
      END IF;
    END LOOP;
  ELSE
    IF v_link IS NULL THEN RAISE EXCEPTION 'LINK_REQUIRED'; END IF;
    IF v_link !~* '^https://' THEN RAISE EXCEPTION 'LINK_MUST_BE_HTTPS'; END IF;
    IF COALESCE(p_wait, 5) NOT BETWEEN 0 AND 60 THEN RAISE EXCEPTION 'INVALID_WAIT'; END IF;
    IF v_msg IS NOT NULL AND length(v_msg) > 120 THEN RAISE EXCEPTION 'MESSAGE_TOO_LONG'; END IF;
  END IF;

  -- No hub may be in two active slots at the same time.
  IF COALESCE(p_active, TRUE) THEN
    FOR x IN SELECT o.id, o."audienceAll", o."hubIds" FROM public."CorporatePrayerSlot" o
             WHERE o."cohortId" = p_cohort_id AND o.active AND NOT o."isTest" AND o."timeOfDay" = v_time AND o.id IS DISTINCT FROM p_id LOOP
      v_clash := CASE
        WHEN v_all AND x."audienceAll" THEN NULL
        WHEN v_all THEN x."hubIds"
        WHEN x."audienceAll" THEN v_hubs
        ELSE ARRAY(SELECT unnest(v_hubs) INTERSECT SELECT unnest(x."hubIds"))
      END;
      IF (v_all AND x."audienceAll") OR COALESCE(array_length(v_clash, 1), 0) > 0 THEN
        RAISE EXCEPTION 'HUB_CLASH:%', COALESCE((SELECT string_agg(h.name, ', ' ORDER BY h.name) FROM public."SupportHub" h WHERE h.id = ANY (v_clash)), 'everyone');
      END IF;
    END LOOP;
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public."CorporatePrayerSlot" ("cohortId", name, "timeOfDay", "slotType", "timerMinutes", "joinWindowMinutes", "targetMode", notify, active,
                                              blocks, "audienceAll", "hubIds", "telegramLink", "liveWaitMinutes", "liveMessage")
    VALUES (p_cohort_id, v_name, v_time, p_type, CASE WHEN p_type = 'LIVE' THEN 15 ELSE COALESCE(p_timer, 15) END, COALESCE(p_window, 15), v_mode,
            COALESCE(p_notify, TRUE), COALESCE(p_active, TRUE),
            v_blocks, v_all, v_hubs,
            CASE WHEN p_type = 'LIVE' THEN v_link END, CASE WHEN p_type = 'LIVE' THEN COALESCE(p_wait, 5) ELSE 5 END, CASE WHEN p_type = 'LIVE' THEN v_msg END)
    RETURNING * INTO v_row;
  ELSE
    UPDATE public."CorporatePrayerSlot" SET
      name = v_name, "timeOfDay" = v_time, "slotType" = p_type,
      "timerMinutes" = CASE WHEN p_type = 'LIVE' THEN 15 ELSE COALESCE(p_timer, 15) END, "joinWindowMinutes" = COALESCE(p_window, 15),
      "targetMode" = v_mode, notify = COALESCE(p_notify, TRUE), active = COALESCE(p_active, TRUE),
      blocks = v_blocks, "audienceAll" = v_all, "hubIds" = v_hubs,
      "telegramLink" = CASE WHEN p_type = 'LIVE' THEN v_link END, "liveWaitMinutes" = CASE WHEN p_type = 'LIVE' THEN COALESCE(p_wait, 5) ELSE 5 END,
      "liveMessage" = CASE WHEN p_type = 'LIVE' THEN v_msg END, "updatedAt" = now()
    WHERE id = p_id AND "cohortId" = p_cohort_id AND NOT "isTest"
    RETURNING * INTO v_row;
    IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
    -- Today's and later days' sessions that nobody has joined are dropped, so the change takes effect (they are made again when next
    -- needed). A session someone joined is history and stays. Switching the slot off ends one that is open right now.
    DELETE FROM public."CorporatePrayerSession" se
    WHERE se."slotId" = v_row.id AND se."prayerDate" >= public.prayer_lagos_today()
      AND NOT EXISTS (SELECT 1 FROM public."CorporatePrayerCheckin" k WHERE k."sessionId" = se.id);
    IF NOT v_row.active THEN
      UPDATE public."CorporatePrayerSession" SET "closesAt" = LEAST("closesAt", now())
      WHERE "slotId" = v_row.id AND "prayerDate" >= public.prayer_lagos_today() - 1 AND "closesAt" > now();
    END IF;
  END IF;
  RETURN row_to_json(v_row);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_prayer_verses(p_token text)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  PERFORM public.prayer_require_admin(p_token);
  RETURN COALESCE((SELECT json_agg(json_build_object(
      'id', v.id, 'title', v.title, 'prayer', v.prayer, 'reference', v.reference, 'sortOrder', v."sortOrder", 'active', v.active,
      'used', (SELECT count(*) FROM public."CorporatePrayerSession" s WHERE s.blocks @> jsonb_build_array(jsonb_build_object('type', 'VERSE', 'verseId', v.id))),
      'inSlots', (SELECT count(*) FROM public."CorporatePrayerSlot" sl WHERE NOT sl."isTest" AND sl.blocks @> jsonb_build_array(jsonb_build_object('type', 'VERSE', 'verseId', v.id))))
    ORDER BY v."sortOrder", v."createdAt", v.id) FROM public."CorporatePrayerVerse" v), '[]'::json);
END;
$$;

DROP FUNCTION IF EXISTS public.upsert_prayer_verse(text, uuid, text, text, boolean);
CREATE OR REPLACE FUNCTION public.upsert_prayer_verse(p_token text, p_id uuid, p_title text, p_prayer text, p_reference text, p_active boolean)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_row public."CorporatePrayerVerse";
  v_title text := NULLIF(btrim(COALESCE(p_title, '')), '');
  v_prayer text := NULLIF(btrim(COALESCE(p_prayer, '')), '');
  v_ref text := NULLIF(btrim(COALESCE(p_reference, '')), '');
BEGIN
  PERFORM public.prayer_require_admin(p_token);
  IF v_title IS NULL THEN RAISE EXCEPTION 'TITLE_REQUIRED'; END IF;
  IF length(v_title) > 60 THEN RAISE EXCEPTION 'TITLE_TOO_LONG'; END IF;
  IF v_prayer IS NULL THEN RAISE EXCEPTION 'PRAYER_REQUIRED'; END IF;
  IF v_ref IS NULL THEN RAISE EXCEPTION 'REFERENCE_REQUIRED'; END IF;
  IF length(v_prayer) > 1500 THEN RAISE EXCEPTION 'PRAYER_TOO_LONG'; END IF;
  IF EXISTS (SELECT 1 FROM public."CorporatePrayerVerse" x WHERE lower(btrim(x.title)) = lower(v_title) AND x.id IS DISTINCT FROM p_id) THEN
    RAISE EXCEPTION 'TITLE_TAKEN';
  END IF;
  IF p_id IS NULL THEN
    INSERT INTO public."CorporatePrayerVerse" (title, prayer, reference, "sortOrder", active)
    VALUES (v_title, v_prayer, v_ref, COALESCE((SELECT max("sortOrder") + 1 FROM public."CorporatePrayerVerse"), 0), COALESCE(p_active, TRUE))
    RETURNING * INTO v_row;
  ELSE
    UPDATE public."CorporatePrayerVerse" SET title = v_title, prayer = v_prayer, reference = v_ref, active = COALESCE(p_active, TRUE), "updatedAt" = now()
    WHERE id = p_id RETURNING * INTO v_row;
    IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  END IF;
  RETURN row_to_json(v_row);
END;
$$;

-- Several verses at once: p_items is [{title, prayer, reference}, ...], added at the end in that order. A missing title uses the reference.
CREATE OR REPLACE FUNCTION public.add_prayer_verses(p_token text, p_items jsonb)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  item jsonb;
  v_next integer;
  v_count integer := 0;
  v_title text;
BEGIN
  PERFORM public.prayer_require_admin(p_token);
  IF jsonb_typeof(p_items) <> 'array' THEN RAISE EXCEPTION 'INVALID_ITEMS'; END IF;
  SELECT COALESCE(max("sortOrder") + 1, 0) INTO v_next FROM public."CorporatePrayerVerse";
  FOR item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    IF NULLIF(btrim(COALESCE(item->>'prayer', '')), '') IS NULL OR NULLIF(btrim(COALESCE(item->>'reference', '')), '') IS NULL THEN
      RAISE EXCEPTION 'PRAYER_AND_REFERENCE_REQUIRED';
    END IF;
    v_title := COALESCE(NULLIF(btrim(COALESCE(item->>'title', '')), ''), btrim(item->>'reference'));
    IF EXISTS (SELECT 1 FROM public."CorporatePrayerVerse" x WHERE lower(btrim(x.title)) = lower(v_title)) THEN RAISE EXCEPTION 'TITLE_TAKEN'; END IF;
    INSERT INTO public."CorporatePrayerVerse" (title, prayer, reference, "sortOrder") VALUES (v_title, btrim(item->>'prayer'), btrim(item->>'reference'), v_next);
    v_next := v_next + 1;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_prayer_verse(p_token text, p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_ref jsonb := jsonb_build_array(jsonb_build_object('type', 'VERSE', 'verseId', p_id));
BEGIN
  PERFORM public.prayer_require_admin(p_token);
  IF EXISTS (SELECT 1 FROM public."CorporatePrayerSession" WHERE "verseId" = p_id OR blocks @> v_ref)
     OR EXISTS (SELECT 1 FROM public."CorporatePrayerSlot" WHERE blocks @> v_ref) THEN
    RAISE EXCEPTION 'VERSE_IN_USE';
  END IF;
  DELETE FROM public."CorporatePrayerVerse" WHERE id = p_id;
END;
$$;

-- What a slot looks like for a chosen person (or whoever is next), without making a session or touching the rotation.
CREATE OR REPLACE FUNCTION public.prayer_preview(p_token text, p_slot_id uuid, p_participant_id uuid)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  s public."CorporatePrayerSlot";
  v_person uuid := p_participant_id;
  v_project text;
BEGIN
  PERFORM public.prayer_require_admin(p_token);
  SELECT * INTO s FROM public."CorporatePrayerSlot" WHERE id = p_slot_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF s."slotType" <> 'LIVE' AND v_person IS NULL THEN
    SELECT participant_id INTO v_person FROM public.prayer_pick(s."cohortId", public.prayer_blocks_pool(s.blocks), '{}'::uuid[], public.prayer_lagos_today(), FALSE);
  END IF;
  IF s."slotType" <> 'LIVE' AND public.prayer_blocks_pool(s.blocks) = 'FAITH' THEN
    SELECT f.body INTO v_project FROM public."FaithProject" f WHERE f."participantId" = v_person AND f.status = 'SAVED' LIMIT 1;
  END IF;
  RETURN json_build_object(
    'slot', json_build_object('id', s.id, 'name', s.name, 'time', to_char(s."timeOfDay", 'HH24:MI'), 'slotType', s."slotType", 'timerMinutes', s."timerMinutes"),
    'person', (SELECT json_build_object('id', p.id, 'fullName', p."fullName", 'firstName', split_part(btrim(p."fullName"), ' ', 1), 'avatarUrl', p."avatarUrl")
               FROM public."Participant" p WHERE p.id = v_person),
    'blocks', CASE WHEN s."slotType" = 'LIVE' THEN '[]'::jsonb ELSE public.prayer_resolve_blocks(s.blocks, v_project) END,
    'live', CASE WHEN s."slotType" = 'LIVE' THEN json_build_object('telegramLink', s."telegramLink", 'waitMinutes', s."liveWaitMinutes", 'message', s."liveMessage") END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.corporate_prayer_overview(text, uuid) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.upsert_prayer_slot(text, uuid, uuid, text, text, text, integer, integer, text, boolean, boolean, jsonb, boolean, uuid[], text, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_prayer_slot(text, uuid, uuid, text, text, text, integer, integer, text, boolean, boolean, jsonb, boolean, uuid[], text, integer, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_prayer_verses(text) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.upsert_prayer_verse(text, uuid, text, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_prayer_verse(text, uuid, text, text, text, boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_prayer_verses(text, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_prayer_verse(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prayer_preview(text, uuid, uuid) TO anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------
-- 5. Prayer functions (a signed-in participant or support)
-- ---------------------------------------------------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.corporate_prayer_signal(text);
CREATE OR REPLACE FUNCTION public.corporate_prayer_signal(p_token text, p_cohort uuid DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  c record;
  v_session uuid;
  se public."CorporatePrayerSession";
  ci public."CorporatePrayerCheckin";
BEGIN
  SELECT * INTO c FROM public.prayer_caller(p_token, p_cohort);
  IF c.person_id IS NULL THEN RETURN json_build_object('open', NULL); END IF;
  v_session := public.prayer_open_session(c.cohort_id, c.hub_key);
  -- A live prayer someone joined but has not answered stays on screen after the window closes (up to an hour).
  IF v_session IS NULL THEN
    SELECT s.* INTO se FROM public."CorporatePrayerSession" s
    JOIN public."CorporatePrayerCheckin" k ON k."sessionId" = s.id AND k."personKind" = c.kind AND k."personId" = c.person_id AND k."amenAt" IS NULL
    WHERE s."cohortId" = c.cohort_id AND s."slotType" = 'LIVE' AND s."closesAt" > now() - interval '1 hour' AND s."closesAt" <= now()
    ORDER BY s."closesAt" DESC LIMIT 1;
    v_session := se.id;
  END IF;
  IF v_session IS NULL THEN
    RETURN json_build_object('open', NULL, 'next', public.prayer_next_opening(c.cohort_id, c.hub_key));
  END IF;
  SELECT * INTO se FROM public."CorporatePrayerSession" WHERE id = v_session;
  SELECT * INTO ci FROM public."CorporatePrayerCheckin" WHERE "sessionId" = v_session AND "personKind" = c.kind AND "personId" = c.person_id;
  RETURN json_build_object(
    'open', json_build_object('sessionId', se.id, 'slotType', se."slotType", 'opensAt', se."opensAt", 'closesAt', se."closesAt",
                              'checkedIn', ci."sessionId" IS NOT NULL, 'amen', ci."amenAt" IS NOT NULL, 'serverNow', now()),
    'next', public.prayer_next_opening(c.cohort_id, c.hub_key));
END;
$$;

CREATE OR REPLACE FUNCTION public.corporate_prayer_now(p_token text, p_session uuid)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  c record;
  se public."CorporatePrayerSession";
  slot public."CorporatePrayerSlot";
  ci public."CorporatePrayerCheckin";
  v_key text;
  v_target uuid;
  v_pool text;
  v_pick record;
  v_project text;
  v_blocks jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO c FROM public.prayer_caller(p_token, public.prayer_session_cohort(p_session));
  IF c.person_id IS NULL THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  SELECT * INTO se FROM public."CorporatePrayerSession"
  WHERE id = COALESCE(p_session, public.prayer_open_session(c.cohort_id, c.hub_key)) AND "cohortId" = c.cohort_id;
  IF se.id IS NULL THEN
    RETURN json_build_object('state', 'none', 'serverNow', now(), 'next', public.prayer_next_opening(c.cohort_id, c.hub_key));
  END IF;
  SELECT * INTO slot FROM public."CorporatePrayerSlot" WHERE id = se."slotId";
  SELECT * INTO ci FROM public."CorporatePrayerCheckin" WHERE "sessionId" = se.id AND "personKind" = c.kind AND "personId" = c.person_id;
  -- A prayer for other hubs is no prayer for this person (unless they already joined it).
  IF ci."sessionId" IS NULL AND NOT public.prayer_in_audience(se."audienceAll", se."hubIds", c.hub_key) THEN
    RETURN json_build_object('state', 'none', 'serverNow', now(), 'next', public.prayer_next_opening(c.cohort_id, c.hub_key));
  END IF;

  -- Who is being prayed for is not shown before the slot opens.
  IF se."slotType" <> 'LIVE' AND now() >= se."opensAt" THEN
    v_pool := public.prayer_blocks_pool(se.blocks);
    v_key := 'COHORT';
    SELECT t."participantId" INTO v_target FROM public."CorporatePrayerTarget" t WHERE t."sessionId" = se.id AND t."hubKey" = v_key;
    IF v_target IS NULL THEN
      v_key := c.hub_key;
      SELECT t."participantId" INTO v_target FROM public."CorporatePrayerTarget" t WHERE t."sessionId" = se.id AND t."hubKey" = v_key;
    END IF;
    IF v_target IS NULL THEN
      SELECT t."participantId", t."hubKey" INTO v_target, v_key FROM public."CorporatePrayerTarget" t WHERE t."sessionId" = se.id
      ORDER BY (t."hubKey" = 'NO_HUB') DESC, t."hubKey" LIMIT 1;
    END IF;
    -- A person who opted out (or whose project is gone) since the session was made is replaced, never shown.
    -- Only while the slot is open, and under the same lock the rotation uses, so ten phones do not each pick a different replacement.
    IF v_target IS NOT NULL AND now() < se."closesAt" AND NOT EXISTS (SELECT 1 FROM public.prayer_pool_members(c.cohort_id, v_pool) m WHERE m.participant_id = v_target) THEN
      PERFORM pg_advisory_xact_lock(hashtextextended('prayer-pick:' || c.cohort_id::text || ':' || v_pool, 0));
      SELECT t."participantId" INTO v_target FROM public."CorporatePrayerTarget" t WHERE t."sessionId" = se.id AND t."hubKey" = v_key;
      IF v_target IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.prayer_pool_members(c.cohort_id, v_pool) m WHERE m.participant_id = v_target) THEN
        SELECT * INTO v_pick FROM public.prayer_pick(
          c.cohort_id, v_pool,
          COALESCE((SELECT array_agg(t."participantId") FROM public."CorporatePrayerTarget" t WHERE t."sessionId" = se.id AND t."hubKey" <> v_key), '{}'::uuid[]),
          se."prayerDate", TRUE);
        v_target := v_pick.participant_id;
        IF v_target IS NOT NULL THEN
          UPDATE public."CorporatePrayerTarget" SET "participantId" = v_target, "cycleNo" = v_pick.cycle_no WHERE "sessionId" = se.id AND "hubKey" = v_key;
        ELSE
          DELETE FROM public."CorporatePrayerTarget" WHERE "sessionId" = se.id AND "hubKey" = v_key;
        END IF;
      END IF;
    END IF;
    IF v_pool = 'FAITH' THEN
      SELECT f.body INTO v_project FROM public."FaithProject" f WHERE f."participantId" = v_target AND f.status = 'SAVED' LIMIT 1;
    END IF;
    v_blocks := public.prayer_resolve_blocks(se.blocks, v_project);
  END IF;

  RETURN json_build_object(
    'role', c.kind,
    'serverNow', now(),
    'state', CASE WHEN now() < se."opensAt" THEN 'upcoming' WHEN now() < se."closesAt" THEN 'open' ELSE 'closed' END,
    'session', json_build_object('id', se.id, 'name', slot.name, 'slotType', se."slotType", 'timerMinutes', se."timerMinutes", 'opensAt', se."opensAt", 'closesAt', se."closesAt"),
    'person', (SELECT json_build_object('id', p.id, 'fullName', p."fullName", 'firstName', split_part(btrim(p."fullName"), ' ', 1), 'avatarUrl', p."avatarUrl")
               FROM public."Participant" p WHERE p.id = v_target),
    'blocks', v_blocks,
    'me', CASE WHEN ci."sessionId" IS NOT NULL THEN json_build_object('checkedInAt', ci."checkedInAt", 'amenAt', ci."amenAt", 'linkTappedAt', ci."linkTappedAt") END,
    'counts', public.prayer_counts_json(se.id),
    'live', CASE WHEN se."slotType" = 'LIVE' THEN json_build_object('telegramLink', slot."telegramLink", 'waitMinutes', slot."liveWaitMinutes", 'message', slot."liveMessage") END,
    'next', public.prayer_next_opening(c.cohort_id, c.hub_key));
END;
$$;

-- Opening the screen checks you in. Safe to call again.
CREATE OR REPLACE FUNCTION public.corporate_prayer_join(p_token text, p_session uuid)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  c record;
  se public."CorporatePrayerSession";
BEGIN
  SELECT * INTO c FROM public.prayer_caller(p_token, public.prayer_session_cohort(p_session));
  IF c.person_id IS NULL THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  SELECT * INTO se FROM public."CorporatePrayerSession" WHERE id = p_session AND "cohortId" = c.cohort_id;
  IF se.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF now() < se."opensAt" THEN RAISE EXCEPTION 'NOT_OPEN_YET'; END IF;
  -- Someone who already checked in may come back after the window; a new person may not.
  IF now() >= se."closesAt" AND NOT EXISTS (
       SELECT 1 FROM public."CorporatePrayerCheckin" k WHERE k."sessionId" = se.id AND k."personKind" = c.kind AND k."personId" = c.person_id) THEN
    RAISE EXCEPTION 'ENDED';
  END IF;
  IF NOT public.prayer_in_audience(se."audienceAll", se."hubIds", c.hub_key) AND NOT EXISTS (
       SELECT 1 FROM public."CorporatePrayerCheckin" k WHERE k."sessionId" = se.id AND k."personKind" = c.kind AND k."personId" = c.person_id) THEN
    RAISE EXCEPTION 'NOT_ALLOWED';
  END IF;
  INSERT INTO public."CorporatePrayerCheckin" ("sessionId", "personKind", "personId")
  VALUES (se.id, c.kind, c.person_id) ON CONFLICT DO NOTHING;
  RETURN json_build_object('counts', public.prayer_counts_json(se.id), 'serverNow', now());
END;
$$;

-- Amen / Prayed. For the live prayer, "Prayed" waits for the slot's minutes after the link tap; if the link could not be
-- opened, p_without_link lets someone finish after ten minutes.
CREATE OR REPLACE FUNCTION public.corporate_prayer_amen(p_token text, p_session uuid, p_without_link boolean DEFAULT FALSE)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  c record;
  se public."CorporatePrayerSession";
  ci public."CorporatePrayerCheckin";
  v_wait integer;
BEGIN
  SELECT * INTO c FROM public.prayer_caller(p_token, public.prayer_session_cohort(p_session));
  IF c.person_id IS NULL THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  SELECT * INTO se FROM public."CorporatePrayerSession" WHERE id = p_session AND "cohortId" = c.cohort_id;
  IF se.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  SELECT * INTO ci FROM public."CorporatePrayerCheckin" WHERE "sessionId" = se.id AND "personKind" = c.kind AND "personId" = c.person_id;
  IF ci."sessionId" IS NULL THEN RAISE EXCEPTION 'NOT_CHECKED_IN'; END IF;
  IF se."slotType" = 'LIVE' AND ci."amenAt" IS NULL THEN
    SELECT COALESCE((SELECT x."liveWaitMinutes" FROM public."CorporatePrayerSlot" x WHERE x.id = se."slotId"), 5) INTO v_wait;
    IF ci."linkTappedAt" IS NOT NULL THEN
      IF now() < ci."linkTappedAt" + make_interval(mins => v_wait) THEN RAISE EXCEPTION 'TOO_EARLY'; END IF;
    ELSIF COALESCE(p_without_link, FALSE) THEN
      IF now() < ci."checkedInAt" + interval '10 minutes' THEN RAISE EXCEPTION 'TOO_EARLY'; END IF;
    ELSE
      RAISE EXCEPTION 'OPEN_THE_LINK_FIRST';
    END IF;
  END IF;
  UPDATE public."CorporatePrayerCheckin" SET "amenAt" = COALESCE("amenAt", now()), "withoutLink" = ("linkTappedAt" IS NULL)
  WHERE "sessionId" = se.id AND "personKind" = c.kind AND "personId" = c.person_id;
  RETURN json_build_object('counts', public.prayer_counts_json(se.id), 'serverNow', now());
END;
$$;

CREATE OR REPLACE FUNCTION public.corporate_prayer_counts(p_token text, p_session uuid)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  c record;
  se public."CorporatePrayerSession";
BEGIN
  SELECT * INTO c FROM public.prayer_caller(p_token, public.prayer_session_cohort(p_session));
  IF c.person_id IS NULL THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  SELECT * INTO se FROM public."CorporatePrayerSession" WHERE id = p_session AND "cohortId" = c.cohort_id;
  IF se.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  RETURN json_build_object('counts', public.prayer_counts_json(se.id), 'serverNow', now(),
                           'state', CASE WHEN now() < se."opensAt" THEN 'upcoming' WHEN now() < se."closesAt" THEN 'open' ELSE 'closed' END);
END;
$$;

REVOKE ALL ON FUNCTION public.corporate_prayer_signal(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.corporate_prayer_signal(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.corporate_prayer_now(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.corporate_prayer_join(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.corporate_prayer_amen(text, uuid, boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.corporate_prayer_counts(text, uuid) TO anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------
-- 6. Slot-time notifications: only people in the slot's audience, and never for a test slot.
-- ---------------------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_prayer_slots()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_today date := public.prayer_lagos_today();
  s record;
  v_opens timestamptz;
  v_session uuid;
  v_claimed uuid;
  v_participants uuid[];
  v_users uuid[];
  v_sent integer := 0;
  v_body text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public."CorporatePrayerSlot" WHERE active AND notify AND NOT "isTest") THEN RETURN 0; END IF;
  -- Without the secrets nothing can be sent, so leave every slot unclaimed and try again next minute.
  IF NOT public.prayer_notify_ready() THEN RETURN 0; END IF;
  FOR s IN SELECT sl.* FROM public."CorporatePrayerSlot" sl WHERE sl.active AND sl.notify AND NOT sl."isTest" LOOP
    v_opens := (v_today + s."timeOfDay") AT TIME ZONE 'Africa/Lagos';
    CONTINUE WHEN NOT (v_opens <= now() + interval '60 seconds' AND v_opens > now() - interval '2 minutes');
    -- A slot made or changed after it opened is not announced late.
    CONTINUE WHEN s."updatedAt" > v_opens;
    CONTINUE WHEN NOT public.prayer_running(s."cohortId");
    v_session := public.ensure_prayer_session(s.id, v_today);
    CONTINUE WHEN v_session IS NULL;
    -- Nothing to announce for a window that has already closed.
    CONTINUE WHEN (SELECT x."closesAt" FROM public."CorporatePrayerSession" x WHERE x.id = v_session) <= now();
    UPDATE public."CorporatePrayerSession" SET "notifiedAt" = now() WHERE id = v_session AND "notifiedAt" IS NULL RETURNING id INTO v_claimed;
    CONTINUE WHEN v_claimed IS NULL;
    SELECT array_agg(cp.participant_id) INTO v_participants FROM public.prayer_counted_participants(s."cohortId") cp
    WHERE public.prayer_in_audience(s."audienceAll", s."hubIds", public.prayer_participant_hub(s."cohortId", cp.participant_id));
    SELECT array_agg(cs.user_id) INTO v_users FROM public.prayer_counted_supports(s."cohortId") cs
    WHERE public.prayer_in_audience(s."audienceAll", s."hubIds", public.prayer_user_hub(s."cohortId", cs.user_id));
    v_body := CASE WHEN s."slotType" = 'LIVE' THEN 'The live prayer is on. Tap to join.'
                   ELSE format('%s prayer is open. Join for %s minutes.', COALESCE(s.name, to_char(s."timeOfDay", 'HH24:MI')), s."timerMinutes") END;
    PERFORM public.invoke_prayer_notify(v_participants, v_users, 'Time to pray', v_body);
    v_sent := v_sent + 1;
  END LOOP;
  RETURN v_sent;
END;
$$;

-- ---------------------------------------------------------------------------------------------------------------------------
-- 7. Practice: a short-lived test prayer. Admin only. It uses a hidden test slot (never listed, never run by the clock), makes a
--    30-minute session for everyone in the Practice cohort, and notifies the admin's own practice participants and the admin.
-- ---------------------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.practice_send_test_prayer(p_token text, p_kind text, p_link text DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  u "User" := public.prayer_require_admin(p_token);
  v_c uuid;
  v_blocks jsonb := '[]'::jsonb;
  v_link text := COALESCE(NULLIF(btrim(COALESCE(p_link, '')), ''), 'https://telegram.org/');
  v_slot uuid;
  v_session uuid;
  v_pool text;
  v_pick record;
  v_participants uuid[];
  v_body text;
  v_pushed boolean;
BEGIN
  IF p_kind NOT IN ('PRAYER', 'LIVE') THEN RAISE EXCEPTION 'INVALID_TYPE'; END IF;
  IF v_link !~* '^https://' THEN RAISE EXCEPTION 'LINK_MUST_BE_HTTPS'; END IF;
  SELECT c.id INTO v_c FROM public."Cohort" c WHERE c."isPractice";
  IF v_c IS NULL THEN RAISE EXCEPTION 'NO_PRACTICE_COHORT'; END IF;

  IF p_kind = 'PRAYER' THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object('type', 'VERSE', 'verseId', q.id) ORDER BY q.ord), '[]'::jsonb) INTO v_blocks
    FROM (SELECT v.id, row_number() OVER (ORDER BY v."sortOrder", v."createdAt", v.id) AS ord FROM public."CorporatePrayerVerse" v WHERE v.active ORDER BY v."sortOrder", v."createdAt", v.id LIMIT 2) q;
    IF jsonb_array_length(v_blocks) = 0 THEN RAISE EXCEPTION 'ADD_A_VERSE_FIRST'; END IF;
    v_blocks := v_blocks || jsonb_build_array(jsonb_build_object('type', 'FAITH_PROJECT'));
  END IF;

  SELECT id INTO v_slot FROM public."CorporatePrayerSlot" WHERE "cohortId" = v_c AND "isTest" AND "slotType" = p_kind;
  IF v_slot IS NULL THEN
    INSERT INTO public."CorporatePrayerSlot" ("cohortId", name, "timeOfDay", "slotType", "timerMinutes", "joinWindowMinutes", "targetMode", notify, active,
                                              blocks, "audienceAll", "hubIds", "telegramLink", "liveWaitMinutes", "liveMessage", "isTest")
    VALUES (v_c, 'Test prayer', (now() AT TIME ZONE 'Africa/Lagos')::time(0), p_kind, 5, 30, CASE WHEN p_kind = 'PRAYER' THEN 'COHORT' END, FALSE, TRUE,
            v_blocks, TRUE, '{}'::uuid[], CASE WHEN p_kind = 'LIVE' THEN v_link END, 1, CASE WHEN p_kind = 'LIVE' THEN 'Test: join the live prayer on Telegram' END, TRUE)
    RETURNING id INTO v_slot;
  ELSE
    UPDATE public."CorporatePrayerSlot" SET blocks = v_blocks, "telegramLink" = CASE WHEN p_kind = 'LIVE' THEN v_link END, "updatedAt" = now() WHERE id = v_slot;
  END IF;

  -- Replace the previous test (its check-ins go with it) and open a fresh 30-minute one.
  DELETE FROM public."CorporatePrayerSession" WHERE "slotId" = v_slot;
  INSERT INTO public."CorporatePrayerSession" ("slotId", "cohortId", "prayerDate", "slotType", "opensAt", "closesAt", "timerMinutes", blocks, "audienceAll", "hubIds")
  VALUES (v_slot, v_c, public.prayer_lagos_today(), p_kind, now(), now() + interval '30 minutes', 5, v_blocks, TRUE, '{}'::uuid[])
  RETURNING id INTO v_session;

  IF p_kind = 'PRAYER' THEN
    v_pool := public.prayer_blocks_pool(v_blocks);
    SELECT * INTO v_pick FROM public.prayer_pick(v_c, v_pool, '{}'::uuid[], public.prayer_lagos_today(), TRUE);
    IF v_pick.participant_id IS NOT NULL THEN
      INSERT INTO public."CorporatePrayerTarget" ("sessionId", "hubKey", "cohortId", pool, "prayerDate", "participantId", "cycleNo")
      VALUES (v_session, 'COHORT', v_c, v_pool, public.prayer_lagos_today(), v_pick.participant_id, v_pick.cycle_no);
    END IF;
  END IF;

  -- The admin's own practice participants (the ones they can step into) and the admin as the practice support.
  SELECT array_agg(gp."participantId") INTO v_participants
  FROM public."Group" g JOIN public."GroupParticipant" gp ON gp."groupId" = g.id WHERE g."supportId" = u.id AND g."cohortId" = v_c;
  v_body := CASE WHEN p_kind = 'LIVE' THEN 'Test: the live prayer is on. Tap to join.' ELSE 'Test: a prayer is open. Join for 5 minutes.' END;
  v_pushed := public.prayer_notify_ready();
  IF v_pushed THEN
    PERFORM public.invoke_prayer_notify(v_participants, ARRAY[u.id], 'Time to pray (test)', v_body);
  END IF;
  RETURN json_build_object('sessionId', v_session, 'kind', p_kind, 'participants', COALESCE(array_length(v_participants, 1), 0), 'pushed', v_pushed);
END;
$$;

REVOKE ALL ON FUNCTION public.practice_send_test_prayer(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.practice_send_test_prayer(text, text, text) TO anon, authenticated;
