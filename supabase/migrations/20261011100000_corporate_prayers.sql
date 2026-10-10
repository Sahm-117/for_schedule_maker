-- Corporate prayers: the admin module, the prayer slot screen and the live (Telegram) prayer.
-- See docs/specs/corporate-prayers-admin.md. Part 1 (opt-out, start week, pop-up) is already live (FLOW_MAP rules 49 and 50).
--
--   * Tables are born locked (RLS on, no policies): everything goes through SECURITY DEFINER functions that resolve the caller from p_token.
--   * Admin functions need an ADMIN session (NOT_ALLOWED otherwise). Prayer functions work for a signed-in participant or a support.
--   * "Who is prayed for" rotates: each pool (FAITH = people with a saved, non-opted-out faith project; NAME = every non-opted-out
--     participant) keeps a cycle number; a person is shown once per cycle, the person longest since last prayed for first, and the
--     cycle restarts when everyone has had a turn. In hub mode every hub gets a different person on the same day.
--   * A slot's session for a day is made once, on first need (or by the per-minute notifier a minute before it opens).
--   * The per-minute job notify_prayer_slots() does nothing unless a slot is about to open.
-- Rollback: DROP the functions and tables created here and unschedule corporate_prayer_slots_every_minute.

-- ---------------------------------------------------------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public."CorporatePrayerSlot" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "cohortId" uuid NOT NULL REFERENCES public."Cohort"(id) ON DELETE CASCADE,
  name text,
  "timeOfDay" time NOT NULL,
  "slotType" text NOT NULL CHECK ("slotType" IN ('VERSE', 'FAITH_PROJECT', 'LIVE')),
  "timerMinutes" integer NOT NULL DEFAULT 15 CHECK ("timerMinutes" BETWEEN 1 AND 120),
  "joinWindowMinutes" integer NOT NULL DEFAULT 15 CHECK ("joinWindowMinutes" BETWEEN 1 AND 240),
  "targetMode" text CHECK ("targetMode" IN ('COHORT', 'HUB')),
  notify boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_prayer_slot_time ON public."CorporatePrayerSlot" ("cohortId", "timeOfDay") WHERE active;

CREATE TABLE IF NOT EXISTS public."CorporatePrayerVerse" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prayer text NOT NULL,
  reference text NOT NULL,
  "sortOrder" integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public."CorporatePrayerSetting" (
  "cohortId" uuid PRIMARY KEY REFERENCES public."Cohort"(id) ON DELETE CASCADE,
  "telegramLink" text,
  "liveWaitMinutes" integer NOT NULL DEFAULT 5 CHECK ("liveWaitMinutes" BETWEEN 0 AND 60),
  "liveMessage" text,
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public."CorporatePrayerSession" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "slotId" uuid NOT NULL REFERENCES public."CorporatePrayerSlot"(id) ON DELETE CASCADE,
  "cohortId" uuid NOT NULL,
  "prayerDate" date NOT NULL,
  "slotType" text NOT NULL,
  "opensAt" timestamptz NOT NULL,
  "closesAt" timestamptz NOT NULL,
  "timerMinutes" integer NOT NULL,
  "verseId" uuid REFERENCES public."CorporatePrayerVerse"(id) ON DELETE SET NULL,
  "notifiedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("slotId", "prayerDate")
);
CREATE INDEX IF NOT EXISTS idx_prayer_session_cohort_date ON public."CorporatePrayerSession" ("cohortId", "prayerDate");

CREATE TABLE IF NOT EXISTS public."CorporatePrayerTarget" (
  "sessionId" uuid NOT NULL REFERENCES public."CorporatePrayerSession"(id) ON DELETE CASCADE,
  "hubKey" text NOT NULL,
  "cohortId" uuid NOT NULL,
  pool text NOT NULL CHECK (pool IN ('FAITH', 'NAME')),
  "prayerDate" date NOT NULL,
  "participantId" uuid NOT NULL REFERENCES public."Participant"(id) ON DELETE CASCADE,
  "cycleNo" integer NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("sessionId", "hubKey")
);
CREATE INDEX IF NOT EXISTS idx_prayer_target_cycle ON public."CorporatePrayerTarget" ("cohortId", pool, "cycleNo", "participantId");
CREATE INDEX IF NOT EXISTS idx_prayer_target_day ON public."CorporatePrayerTarget" ("cohortId", pool, "prayerDate");

CREATE TABLE IF NOT EXISTS public."CorporatePrayerCheckin" (
  "sessionId" uuid NOT NULL REFERENCES public."CorporatePrayerSession"(id) ON DELETE CASCADE,
  "personKind" text NOT NULL CHECK ("personKind" IN ('PARTICIPANT', 'SUPPORT')),
  "personId" uuid NOT NULL,
  "checkedInAt" timestamptz NOT NULL DEFAULT now(),
  "amenAt" timestamptz,
  "linkTappedAt" timestamptz,
  "withoutLink" boolean NOT NULL DEFAULT false,
  PRIMARY KEY ("sessionId", "personKind", "personId")
);

CREATE TABLE IF NOT EXISTS public."CorporatePrayerCycle" (
  "cohortId" uuid NOT NULL REFERENCES public."Cohort"(id) ON DELETE CASCADE,
  pool text NOT NULL CHECK (pool IN ('FAITH', 'NAME')),
  "cycleNo" integer NOT NULL DEFAULT 1,
  "startedAt" timestamptz NOT NULL DEFAULT now(),
  "restartedById" uuid,
  PRIMARY KEY ("cohortId", pool)
);

CREATE TABLE IF NOT EXISTS public."CorporatePrayerSkip" (
  "cohortId" uuid NOT NULL REFERENCES public."Cohort"(id) ON DELETE CASCADE,
  "participantId" uuid NOT NULL REFERENCES public."Participant"(id) ON DELETE CASCADE,
  "cycleNo" integer NOT NULL,
  PRIMARY KEY ("cohortId", "participantId", "cycleNo")
);

-- Closed outright, like Notification and AppSession: the public key cannot even read them, only the functions below can.
REVOKE ALL ON TABLE public."CorporatePrayerSlot", public."CorporatePrayerVerse", public."CorporatePrayerSetting", public."CorporatePrayerSession",
  public."CorporatePrayerTarget", public."CorporatePrayerCheckin", public."CorporatePrayerCycle", public."CorporatePrayerSkip" FROM anon, authenticated;

ALTER TABLE public."CorporatePrayerSlot" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."CorporatePrayerVerse" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."CorporatePrayerSetting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."CorporatePrayerSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."CorporatePrayerTarget" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."CorporatePrayerCheckin" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."CorporatePrayerCycle" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."CorporatePrayerSkip" ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------------------------------------------------------
-- Internal helpers (not callable from the app)
-- ---------------------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prayer_lagos_today()
RETURNS date LANGUAGE sql STABLE SET search_path TO 'public'
AS $$ SELECT (now() AT TIME ZONE 'Africa/Lagos')::date $$;

-- The teen test: a 10 - 17 age range (every older label the age-bracket trigger knows counts too), membership of a teen group,
-- or the teen path.
CREATE OR REPLACE FUNCTION public.prayer_is_teen(p public."Participant")
RETURNS boolean LANGUAGE sql STABLE SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    replace(lower(COALESCE(p."ageRange", '')), ' ', '') IN ('10-17', '18andbelow', 'below18', 'under18', 'below15', '15-17', '17andbelow')
    OR EXISTS (
      SELECT 1 FROM public."GroupParticipant" gp JOIN public."Group" g ON g.id = gp."groupId"
      WHERE gp."participantId" = p.id AND g."isTeenGroup" IS TRUE)
    OR EXISTS (
      SELECT 1 FROM public."FollowUpContact" fc
      WHERE fc.id = p."followUpContactId" AND fc."registrationStatus"::text IN ('TEENAGER', 'TEEN_ONBOARDED')),
    FALSE)
$$;

-- Prayers run from the start date (the class date of the chosen week) through the cohort's end date.
CREATE OR REPLACE FUNCTION public.prayer_running(p_cohort uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $$
  SELECT COALESCE(
    public.faith_prayers_start_date(p_cohort) IS NOT NULL
    AND public.prayer_lagos_today() >= public.faith_prayers_start_date(p_cohort)
    AND (SELECT c."endDate" IS NULL OR public.prayer_lagos_today() <= c."endDate"::date FROM public."Cohort" c WHERE c.id = p_cohort),
    FALSE)
$$;

-- Who can be prayed for. FAITH: a saved faith project with text. NAME: any participant. Both: active, not a test, not a teen,
-- and not opted out (the same conditions as faith_project_prayable; slots only run after the start date, when prayers have started).
CREATE OR REPLACE FUNCTION public.prayer_pool_members(p_cohort uuid, p_pool text)
RETURNS TABLE (participant_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $$
  SELECT p.id
  FROM public."Participant" p
  WHERE p."cohortId" = p_cohort
    AND p.status = 'ACTIVE'
    AND p."isTest" IS NOT TRUE
    AND NOT public.prayer_is_teen(p)
    AND p."prayerConsent" IS DISTINCT FROM 'OUT'
    AND (p_pool = 'NAME' OR EXISTS (
      SELECT 1 FROM public."FaithProject" f
      WHERE f."participantId" = p.id AND f.status = 'SAVED' AND NULLIF(btrim(COALESCE(f.body, '')), '') IS NOT NULL))
$$;

-- The hub a participant prays with: their group's support's hub in this cohort, else NO_HUB.
CREATE OR REPLACE FUNCTION public.prayer_participant_hub(p_cohort uuid, p_participant uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $$
  SELECT COALESCE((
    SELECT hm."hubId"::text
    FROM public."GroupParticipant" gp
    JOIN public."Group" g ON g.id = gp."groupId" AND g."archivedAt" IS NULL AND g."isTeenGroup" IS NOT TRUE
    JOIN public."HubMembership" hm ON hm."userId" = g."supportId" AND hm."cohortId" = p_cohort
    WHERE gp."participantId" = p_participant
    ORDER BY hm."createdAt"
    LIMIT 1), 'NO_HUB')
$$;

CREATE OR REPLACE FUNCTION public.prayer_user_hub(p_cohort uuid, p_user uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $$
  SELECT COALESCE((SELECT hm."hubId"::text FROM public."HubMembership" hm
                   WHERE hm."userId" = p_user AND hm."cohortId" = p_cohort ORDER BY hm."createdAt" LIMIT 1), 'NO_HUB')
$$;

-- People who are notified and counted: participants with a working login, and supports (anyone holding the Support role).
CREATE OR REPLACE FUNCTION public.prayer_counted_participants(p_cohort uuid)
RETURNS TABLE (participant_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $$
  SELECT p.id
  FROM public."Participant" p
  JOIN public."ParticipantAccount" a ON a."participantId" = p.id AND a."isActive"
  WHERE p."cohortId" = p_cohort AND p.status = 'ACTIVE' AND p."isTest" IS NOT TRUE AND NOT public.prayer_is_teen(p)
$$;

CREATE OR REPLACE FUNCTION public.prayer_counted_supports(p_cohort uuid)
RETURNS TABLE (user_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $$
  SELECT u.id
  FROM public."User" u
  JOIN public."UserCohort" uc ON uc."userId" = u.id AND uc."cohortId" = p_cohort
  WHERE u."isActive" IS NOT FALSE AND u."isTest" IS NOT TRUE
    AND 'SUPPORT'::"Role" = ANY (public.app_user_roles(u))
$$;

-- Which cohort a staff member prays in: the current programme cohort when they belong to it.
CREATE OR REPLACE FUNCTION public.prayer_user_cohort(p_user uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $$
  SELECT uc."cohortId" FROM public."UserCohort" uc
  WHERE uc."userId" = p_user AND uc."cohortId" = public.current_programme_cohort_id()
$$;

-- The caller for the prayer screens: a participant (not a teen) or a support. Nothing is returned for anyone else.
CREATE OR REPLACE FUNCTION public.prayer_caller(p_token text)
RETURNS TABLE (kind text, person_id uuid, cohort_id uuid, hub_key text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_pid uuid := public.app_participant_id(p_token);
  v_user "User";
  v_cohort uuid;
BEGIN
  IF v_pid IS NOT NULL THEN
    SELECT p."cohortId" INTO v_cohort FROM public."Participant" p WHERE p.id = v_pid AND NOT public.prayer_is_teen(p) AND p."isTest" IS NOT TRUE;
    IF v_cohort IS NULL THEN RETURN; END IF;
    RETURN QUERY SELECT 'PARTICIPANT'::text, v_pid, v_cohort, public.prayer_participant_hub(v_cohort, v_pid);
    RETURN;
  END IF;
  v_user := public.app_staff(p_token);
  IF v_user.id IS NULL THEN RETURN; END IF;
  IF NOT ('SUPPORT'::"Role" = ANY (public.app_user_roles(v_user))) OR v_user."isTest" IS TRUE THEN RETURN; END IF;
  v_cohort := public.prayer_user_cohort(v_user.id);
  IF v_cohort IS NULL THEN RETURN; END IF;
  RETURN QUERY SELECT 'SUPPORT'::text, v_user.id, v_cohort, public.prayer_user_hub(v_cohort, v_user.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.prayer_require_admin(p_token text)
RETURNS "User" LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $$
DECLARE u "User" := public.app_staff(p_token);
BEGIN
  IF u.id IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  IF u.role::text <> 'ADMIN' THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  RETURN u;
END;
$$;

-- Picks the next person to pray for in a pool. With p_apply = FALSE it only looks (no cycle change, nothing written).
--   1. Candidates: pool members, minus p_exclude, minus anyone already chosen today in this pool, minus anyone skipped this cycle.
--   2. Of those, anyone with no turn in the current cycle. If there is none, the next cycle begins (only when applying).
--   3. The person longest since last prayed for goes first (never prayed = first); a stable hash of person and date breaks ties.
--   4. If everyone is used up today, the day's rule is relaxed so a small pool is never left empty.
CREATE OR REPLACE FUNCTION public.prayer_pick(p_cohort uuid, p_pool text, p_exclude uuid[], p_date date, p_apply boolean)
RETURNS TABLE (participant_id uuid, cycle_no integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_cycle integer;
  v_pick uuid;
BEGIN
  IF p_apply THEN
    -- Everything a pick reads and writes (cycle number, today's targets) is per cohort and pool, so one lock covers all slots of a pool.
    PERFORM pg_advisory_xact_lock(hashtextextended('prayer-pick:' || p_cohort::text || ':' || p_pool, 0));
    INSERT INTO public."CorporatePrayerCycle" ("cohortId", pool) VALUES (p_cohort, p_pool) ON CONFLICT DO NOTHING;
  END IF;
  SELECT c."cycleNo" INTO v_cycle FROM public."CorporatePrayerCycle" c WHERE c."cohortId" = p_cohort AND c.pool = p_pool;
  v_cycle := COALESCE(v_cycle, 1);

  -- Step 2: someone with no turn in this cycle.
  SELECT m.participant_id INTO v_pick
  FROM public.prayer_pool_members(p_cohort, p_pool) m
  WHERE m.participant_id <> ALL (COALESCE(p_exclude, '{}'::uuid[]))
    AND NOT EXISTS (SELECT 1 FROM public."CorporatePrayerTarget" t WHERE t."cohortId" = p_cohort AND t.pool = p_pool AND t."prayerDate" = p_date AND t."participantId" = m.participant_id)
    AND NOT EXISTS (SELECT 1 FROM public."CorporatePrayerSkip" s WHERE s."cohortId" = p_cohort AND s."participantId" = m.participant_id AND s."cycleNo" = v_cycle)
    AND NOT EXISTS (SELECT 1 FROM public."CorporatePrayerTarget" t WHERE t."cohortId" = p_cohort AND t.pool = p_pool AND t."cycleNo" = v_cycle AND t."participantId" = m.participant_id)
  ORDER BY (SELECT max(t."prayerDate") FROM public."CorporatePrayerTarget" t WHERE t."cohortId" = p_cohort AND t.pool = p_pool AND t."participantId" = m.participant_id) NULLS FIRST,
           md5(m.participant_id::text || p_date::text)
  LIMIT 1;

  IF v_pick IS NULL THEN
    -- Everyone has had a turn this cycle: the next cycle begins, so anyone not chosen today is eligible again.
    SELECT m.participant_id INTO v_pick
    FROM public.prayer_pool_members(p_cohort, p_pool) m
    WHERE m.participant_id <> ALL (COALESCE(p_exclude, '{}'::uuid[]))
      AND NOT EXISTS (SELECT 1 FROM public."CorporatePrayerTarget" t WHERE t."cohortId" = p_cohort AND t.pool = p_pool AND t."prayerDate" = p_date AND t."participantId" = m.participant_id)
    ORDER BY (SELECT max(t."prayerDate") FROM public."CorporatePrayerTarget" t WHERE t."cohortId" = p_cohort AND t.pool = p_pool AND t."participantId" = m.participant_id) NULLS FIRST,
             md5(m.participant_id::text || p_date::text)
    LIMIT 1;
    IF v_pick IS NOT NULL AND p_apply THEN
      UPDATE public."CorporatePrayerCycle" SET "cycleNo" = "cycleNo" + 1, "startedAt" = now()
      WHERE "cohortId" = p_cohort AND pool = p_pool RETURNING "cycleNo" INTO v_cycle;
    END IF;
  END IF;

  IF v_pick IS NULL THEN
    -- Relax "not chosen today" so a very small pool still shows someone.
    SELECT m.participant_id INTO v_pick
    FROM public.prayer_pool_members(p_cohort, p_pool) m
    WHERE m.participant_id <> ALL (COALESCE(p_exclude, '{}'::uuid[]))
    ORDER BY (SELECT max(t."prayerDate") FROM public."CorporatePrayerTarget" t WHERE t."cohortId" = p_cohort AND t.pool = p_pool AND t."participantId" = m.participant_id) NULLS FIRST,
             md5(m.participant_id::text || p_date::text)
    LIMIT 1;
  END IF;

  IF v_pick IS NULL THEN RETURN; END IF;
  RETURN QUERY SELECT v_pick, v_cycle;
END;
$$;

-- Makes the day's session for a slot, once. Safe to call from many phones at the same second.
CREATE OR REPLACE FUNCTION public.ensure_prayer_session(p_slot uuid, p_date date)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  s public."CorporatePrayerSlot";
  v_session uuid;
  v_opens timestamptz;
  v_verse uuid;
  v_n integer;
  v_pool text;
  v_mode text;
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

  IF s."slotType" <> 'LIVE' THEN
    SELECT count(*) INTO v_n FROM public."CorporatePrayerVerse" WHERE active;
    IF v_n > 0 THEN
      SELECT v.id INTO v_verse
      FROM public."CorporatePrayerVerse" v WHERE v.active
      ORDER BY v."sortOrder", v."createdAt", v.id
      OFFSET ((SELECT count(*) FROM public."CorporatePrayerSession" x WHERE x."slotId" = p_slot AND x."prayerDate" < p_date) % v_n)
      LIMIT 1;
    END IF;
  END IF;

  INSERT INTO public."CorporatePrayerSession" ("slotId", "cohortId", "prayerDate", "slotType", "opensAt", "closesAt", "timerMinutes", "verseId")
  VALUES (p_slot, s."cohortId", p_date, s."slotType", v_opens, v_opens + make_interval(mins => s."joinWindowMinutes"), s."timerMinutes", v_verse)
  RETURNING id INTO v_session;

  IF s."slotType" = 'LIVE' THEN RETURN v_session; END IF;

  v_pool := CASE WHEN s."slotType" = 'FAITH_PROJECT' THEN 'FAITH' ELSE 'NAME' END;
  v_mode := CASE WHEN s."slotType" = 'FAITH_PROJECT' THEN COALESCE(s."targetMode", 'COHORT') ELSE 'COHORT' END;

  IF v_mode = 'COHORT' THEN
    SELECT * INTO v_pick FROM public.prayer_pick(s."cohortId", v_pool, v_chosen, p_date, TRUE);
    IF v_pick.participant_id IS NOT NULL THEN
      INSERT INTO public."CorporatePrayerTarget" ("sessionId", "hubKey", "cohortId", pool, "prayerDate", "participantId", "cycleNo")
      VALUES (v_session, 'COHORT', s."cohortId", v_pool, p_date, v_pick.participant_id, v_pick.cycle_no);
    END IF;
  ELSE
    -- One person per hub that has anyone in it, hubs in a fixed order, so every hub prays for someone different.
    FOR v_key IN
      SELECT k.key FROM (
        SELECT public.prayer_participant_hub(s."cohortId", cp.participant_id) AS key FROM public.prayer_counted_participants(s."cohortId") cp
        UNION
        SELECT public.prayer_user_hub(s."cohortId", cs.user_id) FROM public.prayer_counted_supports(s."cohortId") cs
      ) k
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

-- Counts for one session: joined, still praying (checked in, no Amen, inside the timer plus a short grace), said Amen.
CREATE OR REPLACE FUNCTION public.prayer_counts_json(p_session uuid)
RETURNS json LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $$
  SELECT json_build_object(
    'joined', count(c."sessionId"),
    'praying', count(c."sessionId") FILTER (WHERE c."amenAt" IS NULL AND c."checkedInAt" > now() - make_interval(mins => s."timerMinutes" + 2)),
    'amen', count(c."sessionId") FILTER (WHERE c."amenAt" IS NOT NULL))
  FROM public."CorporatePrayerSession" s
  LEFT JOIN public."CorporatePrayerCheckin" c ON c."sessionId" = s.id
  WHERE s.id = p_session
  GROUP BY s."timerMinutes"
$$;

-- The session open right now for a cohort (making today's if a slot has just opened). The most recently opened wins.
CREATE OR REPLACE FUNCTION public.prayer_open_session(p_cohort uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_today date := public.prayer_lagos_today();
  s record;
  v_opens timestamptz;
  v_day date;
BEGIN
  IF NOT public.prayer_running(p_cohort) THEN RETURN NULL; END IF;
  -- Yesterday too: a slot late in the evening can stay joinable past midnight.
  FOR v_day IN SELECT d::date FROM generate_series(v_today - 1, v_today, interval '1 day') d LOOP
    FOR s IN SELECT sl.id, sl."timeOfDay", sl."joinWindowMinutes" FROM public."CorporatePrayerSlot" sl WHERE sl."cohortId" = p_cohort AND sl.active LOOP
      v_opens := (v_day + s."timeOfDay") AT TIME ZONE 'Africa/Lagos';
      IF now() >= v_opens AND now() < v_opens + make_interval(mins => s."joinWindowMinutes") THEN
        PERFORM public.ensure_prayer_session(s.id, v_day);
      END IF;
    END LOOP;
  END LOOP;
  RETURN (SELECT x.id FROM public."CorporatePrayerSession" x
          JOIN public."CorporatePrayerSlot" sl ON sl.id = x."slotId" AND sl.active
          WHERE x."cohortId" = p_cohort AND x."prayerDate" >= v_today - 1 AND now() >= x."opensAt" AND now() < x."closesAt"
          ORDER BY x."opensAt" DESC LIMIT 1);
END;
$$;

-- The next slot to open today (or null). Used for the "next prayer" line.
CREATE OR REPLACE FUNCTION public.prayer_next_opening(p_cohort uuid)
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $$
  SELECT row_to_json(n) FROM (
    SELECT sl.id AS "slotId", sl.name, sl."slotType",
           ((public.prayer_lagos_today() + d.off + sl."timeOfDay") AT TIME ZONE 'Africa/Lagos') AS "opensAt"
    FROM public."CorporatePrayerSlot" sl
    CROSS JOIN (VALUES (0), (1)) AS d(off)
    WHERE sl."cohortId" = p_cohort AND sl.active AND public.prayer_running(p_cohort)
      AND ((public.prayer_lagos_today() + d.off + sl."timeOfDay") AT TIME ZONE 'Africa/Lagos') > now()
    ORDER BY ((public.prayer_lagos_today() + d.off + sl."timeOfDay") AT TIME ZONE 'Africa/Lagos') LIMIT 1
  ) n
$$;

REVOKE ALL ON FUNCTION public.prayer_lagos_today() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prayer_is_teen(public."Participant") FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prayer_running(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prayer_pool_members(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prayer_participant_hub(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prayer_user_hub(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prayer_counted_participants(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prayer_counted_supports(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prayer_user_cohort(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prayer_caller(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prayer_require_admin(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prayer_pick(uuid, text, uuid[], date, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ensure_prayer_session(uuid, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prayer_counts_json(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prayer_open_session(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prayer_next_opening(uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------
-- Admin functions (ADMIN session)
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
    'settings', COALESCE((SELECT json_build_object('telegramLink', x."telegramLink", 'liveWaitMinutes', x."liveWaitMinutes", 'liveMessage', x."liveMessage")
                          FROM public."CorporatePrayerSetting" x WHERE x."cohortId" = p_cohort_id),
                         json_build_object('telegramLink', NULL, 'liveWaitMinutes', 5, 'liveMessage', NULL)),
    'slots', COALESCE((SELECT json_agg(json_build_object(
        'id', sl.id, 'name', sl.name, 'time', to_char(sl."timeOfDay", 'HH24:MI'), 'slotType', sl."slotType",
        'timerMinutes', sl."timerMinutes", 'joinWindowMinutes', sl."joinWindowMinutes", 'targetMode', sl."targetMode",
        'notify', sl.notify, 'active', sl.active,
        'hasHistory', EXISTS (SELECT 1 FROM public."CorporatePrayerSession" h WHERE h."slotId" = sl.id),
        'today', (SELECT json_build_object('sessionId', se.id, 'opensAt', se."opensAt", 'closesAt', se."closesAt", 'counts', public.prayer_counts_json(se.id))
                  FROM public."CorporatePrayerSession" se WHERE se."slotId" = sl.id AND se."prayerDate" = v_today)
      ) ORDER BY sl."timeOfDay") FROM public."CorporatePrayerSlot" sl WHERE sl."cohortId" = p_cohort_id), '[]'::json),
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

CREATE OR REPLACE FUNCTION public.upsert_prayer_slot(
  p_token text, p_cohort_id uuid, p_id uuid, p_name text, p_time text, p_type text,
  p_timer integer, p_window integer, p_target_mode text, p_notify boolean, p_active boolean)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_time time;
  v_row public."CorporatePrayerSlot";
  v_name text := NULLIF(btrim(COALESCE(p_name, '')), '');
BEGIN
  PERFORM public.prayer_require_admin(p_token);
  IF p_type NOT IN ('VERSE', 'FAITH_PROJECT', 'LIVE') THEN RAISE EXCEPTION 'INVALID_TYPE'; END IF;
  BEGIN v_time := p_time::time; EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'INVALID_TIME'; END;
  IF COALESCE(p_timer, 15) NOT BETWEEN 1 AND 120 THEN RAISE EXCEPTION 'INVALID_TIMER'; END IF;
  IF COALESCE(p_window, 15) NOT BETWEEN 1 AND 240 THEN RAISE EXCEPTION 'INVALID_WINDOW'; END IF;
  IF v_name IS NOT NULL AND length(v_name) > 40 THEN RAISE EXCEPTION 'NAME_TOO_LONG'; END IF;
  IF COALESCE(p_active, TRUE) AND EXISTS (
       SELECT 1 FROM public."CorporatePrayerSlot" x
       WHERE x."cohortId" = p_cohort_id AND x.active AND x."timeOfDay" = v_time AND x.id IS DISTINCT FROM p_id) THEN
    RAISE EXCEPTION 'SLOT_TIME_TAKEN';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public."CorporatePrayerSlot" ("cohortId", name, "timeOfDay", "slotType", "timerMinutes", "joinWindowMinutes", "targetMode", notify, active)
    VALUES (p_cohort_id, v_name, v_time, p_type, COALESCE(p_timer, 15), COALESCE(p_window, 15),
            CASE WHEN p_type = 'FAITH_PROJECT' THEN COALESCE(p_target_mode, 'COHORT') ELSE NULL END,
            COALESCE(p_notify, TRUE), COALESCE(p_active, TRUE))
    RETURNING * INTO v_row;
  ELSE
    UPDATE public."CorporatePrayerSlot" SET
      name = v_name, "timeOfDay" = v_time, "slotType" = p_type,
      "timerMinutes" = COALESCE(p_timer, 15), "joinWindowMinutes" = COALESCE(p_window, 15),
      "targetMode" = CASE WHEN p_type = 'FAITH_PROJECT' THEN COALESCE(p_target_mode, 'COHORT') ELSE NULL END,
      notify = COALESCE(p_notify, TRUE), active = COALESCE(p_active, TRUE), "updatedAt" = now()
    WHERE id = p_id AND "cohortId" = p_cohort_id
    RETURNING * INTO v_row;
    IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
    -- Today's and later days' sessions that nobody has joined are dropped, so the new time, type or timer takes effect (they are made again
    -- when next needed). A session someone joined is history and stays. Switching the slot off ends one that is open right now.
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

CREATE OR REPLACE FUNCTION public.delete_prayer_slot(p_token text, p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  PERFORM public.prayer_require_admin(p_token);
  IF EXISTS (SELECT 1 FROM public."CorporatePrayerSession" WHERE "slotId" = p_id) THEN RAISE EXCEPTION 'SLOT_HAS_HISTORY'; END IF;
  DELETE FROM public."CorporatePrayerSlot" WHERE id = p_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_prayer_verses(p_token text)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  PERFORM public.prayer_require_admin(p_token);
  RETURN COALESCE((SELECT json_agg(json_build_object(
      'id', v.id, 'prayer', v.prayer, 'reference', v.reference, 'sortOrder', v."sortOrder", 'active', v.active,
      'used', (SELECT count(*) FROM public."CorporatePrayerSession" s WHERE s."verseId" = v.id))
    ORDER BY v."sortOrder", v."createdAt", v.id) FROM public."CorporatePrayerVerse" v), '[]'::json);
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_prayer_verse(p_token text, p_id uuid, p_prayer text, p_reference text, p_active boolean)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_row public."CorporatePrayerVerse";
  v_prayer text := NULLIF(btrim(COALESCE(p_prayer, '')), '');
  v_ref text := NULLIF(btrim(COALESCE(p_reference, '')), '');
BEGIN
  PERFORM public.prayer_require_admin(p_token);
  IF v_prayer IS NULL THEN RAISE EXCEPTION 'PRAYER_REQUIRED'; END IF;
  IF v_ref IS NULL THEN RAISE EXCEPTION 'REFERENCE_REQUIRED'; END IF;
  IF length(v_prayer) > 1500 THEN RAISE EXCEPTION 'PRAYER_TOO_LONG'; END IF;
  IF p_id IS NULL THEN
    INSERT INTO public."CorporatePrayerVerse" (prayer, reference, "sortOrder", active)
    VALUES (v_prayer, v_ref, COALESCE((SELECT max("sortOrder") + 1 FROM public."CorporatePrayerVerse"), 0), COALESCE(p_active, TRUE))
    RETURNING * INTO v_row;
  ELSE
    UPDATE public."CorporatePrayerVerse" SET prayer = v_prayer, reference = v_ref, active = COALESCE(p_active, TRUE), "updatedAt" = now()
    WHERE id = p_id RETURNING * INTO v_row;
    IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  END IF;
  RETURN row_to_json(v_row);
END;
$$;

-- Several verses at once: p_items is [{prayer, reference}, ...], added at the end in that order.
CREATE OR REPLACE FUNCTION public.add_prayer_verses(p_token text, p_items jsonb)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  item jsonb;
  v_next integer;
  v_count integer := 0;
BEGIN
  PERFORM public.prayer_require_admin(p_token);
  IF jsonb_typeof(p_items) <> 'array' THEN RAISE EXCEPTION 'INVALID_ITEMS'; END IF;
  SELECT COALESCE(max("sortOrder") + 1, 0) INTO v_next FROM public."CorporatePrayerVerse";
  FOR item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    IF NULLIF(btrim(COALESCE(item->>'prayer', '')), '') IS NULL OR NULLIF(btrim(COALESCE(item->>'reference', '')), '') IS NULL THEN
      RAISE EXCEPTION 'PRAYER_AND_REFERENCE_REQUIRED';
    END IF;
    INSERT INTO public."CorporatePrayerVerse" (prayer, reference, "sortOrder") VALUES (btrim(item->>'prayer'), btrim(item->>'reference'), v_next);
    v_next := v_next + 1;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.reorder_prayer_verses(p_token text, p_ids uuid[])
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  PERFORM public.prayer_require_admin(p_token);
  UPDATE public."CorporatePrayerVerse" v SET "sortOrder" = o.ord - 1, "updatedAt" = now()
  FROM unnest(p_ids) WITH ORDINALITY AS o(id, ord) WHERE v.id = o.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_prayer_verse(p_token text, p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  PERFORM public.prayer_require_admin(p_token);
  IF EXISTS (SELECT 1 FROM public."CorporatePrayerSession" WHERE "verseId" = p_id) THEN RAISE EXCEPTION 'VERSE_IN_USE'; END IF;
  DELETE FROM public."CorporatePrayerVerse" WHERE id = p_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_corporate_prayer_settings(p_token text, p_cohort_id uuid, p_telegram text, p_wait integer, p_message text)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_link text := NULLIF(btrim(COALESCE(p_telegram, '')), '');
  v_msg text := NULLIF(btrim(COALESCE(p_message, '')), '');
BEGIN
  PERFORM public.prayer_require_admin(p_token);
  IF COALESCE(p_wait, 5) NOT BETWEEN 0 AND 60 THEN RAISE EXCEPTION 'INVALID_WAIT'; END IF;
  IF v_link IS NOT NULL AND v_link !~* '^https://' THEN RAISE EXCEPTION 'LINK_MUST_BE_HTTPS'; END IF;
  IF v_msg IS NOT NULL AND length(v_msg) > 120 THEN RAISE EXCEPTION 'MESSAGE_TOO_LONG'; END IF;
  INSERT INTO public."CorporatePrayerSetting" ("cohortId", "telegramLink", "liveWaitMinutes", "liveMessage")
  VALUES (p_cohort_id, v_link, COALESCE(p_wait, 5), v_msg)
  ON CONFLICT ("cohortId") DO UPDATE SET "telegramLink" = EXCLUDED."telegramLink", "liveWaitMinutes" = EXCLUDED."liveWaitMinutes",
                                         "liveMessage" = EXCLUDED."liveMessage", "updatedAt" = now();
  RETURN json_build_object('telegramLink', v_link, 'liveWaitMinutes', COALESCE(p_wait, 5), 'liveMessage', v_msg);
END;
$$;

-- Coverage: where each pool's current cycle stands, who is still to come, and the hubs.
CREATE OR REPLACE FUNCTION public.prayer_coverage(p_token text, p_cohort_id uuid)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_result json;
BEGIN
  PERFORM public.prayer_require_admin(p_token);
  WITH cyc AS (
    SELECT pl.pool, COALESCE(c."cycleNo", 1) AS cycle_no
    FROM (VALUES ('FAITH'), ('NAME')) pl(pool)
    LEFT JOIN public."CorporatePrayerCycle" c ON c."cohortId" = p_cohort_id AND c.pool = pl.pool
  ), members AS (
    SELECT cyc.pool, cyc.cycle_no, m.participant_id,
           EXISTS (SELECT 1 FROM public."CorporatePrayerTarget" t WHERE t."cohortId" = p_cohort_id AND t.pool = cyc.pool AND t."cycleNo" = cyc.cycle_no AND t."participantId" = m.participant_id) AS done,
           EXISTS (SELECT 1 FROM public."CorporatePrayerSkip" s WHERE s."cohortId" = p_cohort_id AND s."participantId" = m.participant_id AND s."cycleNo" = cyc.cycle_no) AS skipped,
           (SELECT max(t."prayerDate") FROM public."CorporatePrayerTarget" t WHERE t."cohortId" = p_cohort_id AND t.pool = cyc.pool AND t."participantId" = m.participant_id) AS last_on
    FROM cyc CROSS JOIN LATERAL public.prayer_pool_members(p_cohort_id, cyc.pool) m
  )
  SELECT json_build_object(
    'cycles', (SELECT json_object_agg(cyc.pool, json_build_object(
        'cycleNo', cyc.cycle_no,
        'total', (SELECT count(*) FROM members m WHERE m.pool = cyc.pool AND (NOT m.skipped OR m.done)),
        'done', (SELECT count(*) FROM members m WHERE m.pool = cyc.pool AND m.done))) FROM cyc),
    'notYet', (SELECT json_object_agg(pool, people) FROM (
        SELECT m.pool, COALESCE(json_agg(json_build_object('id', p.id, 'name', p."fullName", 'skipped', m.skipped, 'lastOn', m.last_on) ORDER BY m.last_on NULLS FIRST, p."fullName"), '[]'::json) AS people
        FROM members m JOIN public."Participant" p ON p.id = m.participant_id WHERE NOT m.done GROUP BY m.pool) q),
    'doneList', (SELECT json_object_agg(pool, people) FROM (
        SELECT m.pool, COALESCE(json_agg(json_build_object('id', p.id, 'name', p."fullName", 'lastOn', m.last_on) ORDER BY m.last_on DESC, p."fullName"), '[]'::json) AS people
        FROM members m JOIN public."Participant" p ON p.id = m.participant_id WHERE m.done GROUP BY m.pool) q),
    'hubs', COALESCE((SELECT json_agg(json_build_object('hubKey', h.key, 'name', COALESCE(sh.name, 'No hub'),
          'participants', h.participants, 'supports', h.supports) ORDER BY sh.name NULLS LAST) FROM (
        SELECT k.key, sum(k.p) AS participants, sum(k.s) AS supports FROM (
          SELECT public.prayer_participant_hub(p_cohort_id, cp.participant_id) AS key, 1 AS p, 0 AS s FROM public.prayer_counted_participants(p_cohort_id) cp
          UNION ALL
          SELECT public.prayer_user_hub(p_cohort_id, cs.user_id), 0, 1 FROM public.prayer_counted_supports(p_cohort_id) cs) k
        GROUP BY k.key) h LEFT JOIN public."SupportHub" sh ON sh.id::text = h.key), '[]'::json)
  ) INTO v_result;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.restart_prayer_cycle(p_token text, p_cohort_id uuid, p_pool text)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  u "User" := public.prayer_require_admin(p_token);
  v_no integer;
BEGIN
  IF p_pool NOT IN ('FAITH', 'NAME') THEN RAISE EXCEPTION 'INVALID_POOL'; END IF;
  INSERT INTO public."CorporatePrayerCycle" ("cohortId", pool, "cycleNo", "restartedById") VALUES (p_cohort_id, p_pool, 2, u.id)
  ON CONFLICT ("cohortId", pool) DO UPDATE SET "cycleNo" = public."CorporatePrayerCycle"."cycleNo" + 1, "startedAt" = now(), "restartedById" = u.id
  RETURNING "cycleNo" INTO v_no;
  RETURN v_no;
END;
$$;

-- Leave one person out of the current cycle only. Their consent is untouched.
CREATE OR REPLACE FUNCTION public.skip_prayer_person(p_token text, p_cohort_id uuid, p_participant_id uuid, p_skip boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_cycle integer;
BEGIN
  PERFORM public.prayer_require_admin(p_token);
  FOR v_cycle IN SELECT COALESCE((SELECT c."cycleNo" FROM public."CorporatePrayerCycle" c WHERE c."cohortId" = p_cohort_id AND c.pool = pl.pool), 1) FROM (VALUES ('FAITH'), ('NAME')) pl(pool) LOOP
    IF COALESCE(p_skip, TRUE) THEN
      INSERT INTO public."CorporatePrayerSkip" ("cohortId", "participantId", "cycleNo") VALUES (p_cohort_id, p_participant_id, v_cycle) ON CONFLICT DO NOTHING;
    ELSE
      DELETE FROM public."CorporatePrayerSkip" WHERE "cohortId" = p_cohort_id AND "participantId" = p_participant_id AND "cycleNo" = v_cycle;
    END IF;
  END LOOP;
END;
$$;

-- What a slot looks like for a chosen person (or whoever is next), without making a session or touching the rotation.
CREATE OR REPLACE FUNCTION public.prayer_preview(p_token text, p_slot_id uuid, p_participant_id uuid)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  s public."CorporatePrayerSlot";
  v_pool text;
  v_person uuid := p_participant_id;
  v_verse public."CorporatePrayerVerse";
  v_n integer;
BEGIN
  PERFORM public.prayer_require_admin(p_token);
  SELECT * INTO s FROM public."CorporatePrayerSlot" WHERE id = p_slot_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  v_pool := CASE WHEN s."slotType" = 'FAITH_PROJECT' THEN 'FAITH' ELSE 'NAME' END;
  IF s."slotType" <> 'LIVE' AND v_person IS NULL THEN
    SELECT participant_id INTO v_person FROM public.prayer_pick(s."cohortId", v_pool, '{}'::uuid[], public.prayer_lagos_today(), FALSE);
  END IF;
  SELECT count(*) INTO v_n FROM public."CorporatePrayerVerse" WHERE active;
  IF s."slotType" <> 'LIVE' AND v_n > 0 THEN
    SELECT v.* INTO v_verse FROM public."CorporatePrayerVerse" v WHERE v.active
    ORDER BY v."sortOrder", v."createdAt", v.id
    OFFSET ((SELECT count(*) FROM public."CorporatePrayerSession" x WHERE x."slotId" = p_slot_id) % v_n) LIMIT 1;
  END IF;
  RETURN json_build_object(
    'slot', json_build_object('id', s.id, 'name', s.name, 'time', to_char(s."timeOfDay", 'HH24:MI'), 'slotType', s."slotType", 'timerMinutes', s."timerMinutes"),
    'person', (SELECT json_build_object('id', p.id, 'fullName', p."fullName", 'firstName', split_part(btrim(p."fullName"), ' ', 1), 'avatarUrl', p."avatarUrl")
               FROM public."Participant" p WHERE p.id = v_person),
    'projectText', CASE WHEN s."slotType" = 'FAITH_PROJECT' THEN (SELECT f.body FROM public."FaithProject" f WHERE f."participantId" = v_person AND f.status = 'SAVED' LIMIT 1) END,
    'verse', CASE WHEN v_verse.id IS NOT NULL THEN json_build_object('prayer', v_verse.prayer, 'reference', v_verse.reference) END,
    'live', CASE WHEN s."slotType" = 'LIVE' THEN (SELECT json_build_object('telegramLink', x."telegramLink", 'waitMinutes', x."liveWaitMinutes", 'message', x."liveMessage")
                                                  FROM public."CorporatePrayerSetting" x WHERE x."cohortId" = s."cohortId") END
  );
END;
$$;

-- ---------------------------------------------------------------------------------------------------------------------------
-- Prayer functions (a signed-in participant or support)
-- ---------------------------------------------------------------------------------------------------------------------------

-- A tiny answer the shells ask every minute: is a prayer open for me, and have I answered it?
CREATE OR REPLACE FUNCTION public.corporate_prayer_signal(p_token text)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  c record;
  v_session uuid;
  se public."CorporatePrayerSession";
  ci public."CorporatePrayerCheckin";
BEGIN
  SELECT * INTO c FROM public.prayer_caller(p_token);
  IF c.person_id IS NULL THEN RETURN json_build_object('open', NULL); END IF;
  v_session := public.prayer_open_session(c.cohort_id);
  -- A live prayer someone joined but has not answered stays on screen after the window closes (up to an hour).
  IF v_session IS NULL THEN
    SELECT s.* INTO se FROM public."CorporatePrayerSession" s
    JOIN public."CorporatePrayerCheckin" k ON k."sessionId" = s.id AND k."personKind" = c.kind AND k."personId" = c.person_id AND k."amenAt" IS NULL
    WHERE s."cohortId" = c.cohort_id AND s."slotType" = 'LIVE' AND s."closesAt" > now() - interval '1 hour' AND s."closesAt" <= now()
    ORDER BY s."closesAt" DESC LIMIT 1;
    v_session := se.id;
  END IF;
  IF v_session IS NULL THEN
    RETURN json_build_object('open', NULL, 'next', public.prayer_next_opening(c.cohort_id));
  END IF;
  SELECT * INTO se FROM public."CorporatePrayerSession" WHERE id = v_session;
  SELECT * INTO ci FROM public."CorporatePrayerCheckin" WHERE "sessionId" = v_session AND "personKind" = c.kind AND "personId" = c.person_id;
  RETURN json_build_object(
    'open', json_build_object('sessionId', se.id, 'slotType', se."slotType", 'opensAt', se."opensAt", 'closesAt', se."closesAt",
                              'checkedIn', ci."sessionId" IS NOT NULL, 'amen', ci."amenAt" IS NOT NULL, 'serverNow', now()),
    'next', public.prayer_next_opening(c.cohort_id));
END;
$$;

-- Everything the prayer screen needs, in one light call.
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
  v_verse public."CorporatePrayerVerse";
  v_mode text;
BEGIN
  SELECT * INTO c FROM public.prayer_caller(p_token);
  IF c.person_id IS NULL THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  SELECT * INTO se FROM public."CorporatePrayerSession" WHERE id = COALESCE(p_session, public.prayer_open_session(c.cohort_id)) AND "cohortId" = c.cohort_id;
  IF se.id IS NULL THEN
    RETURN json_build_object('state', 'none', 'serverNow', now(), 'next', public.prayer_next_opening(c.cohort_id));
  END IF;
  SELECT * INTO slot FROM public."CorporatePrayerSlot" WHERE id = se."slotId";
  SELECT * INTO ci FROM public."CorporatePrayerCheckin" WHERE "sessionId" = se.id AND "personKind" = c.kind AND "personId" = c.person_id;

  -- Who is being prayed for is not shown before the slot opens.
  IF se."slotType" <> 'LIVE' AND now() >= se."opensAt" THEN
    v_pool := CASE WHEN se."slotType" = 'FAITH_PROJECT' THEN 'FAITH' ELSE 'NAME' END;
    v_mode := CASE WHEN se."slotType" = 'FAITH_PROJECT' THEN COALESCE(slot."targetMode", 'COHORT') ELSE 'COHORT' END;
    v_key := CASE WHEN v_mode = 'COHORT' THEN 'COHORT' ELSE c.hub_key END;
    SELECT t."participantId" INTO v_target FROM public."CorporatePrayerTarget" t WHERE t."sessionId" = se.id AND t."hubKey" = v_key;
    IF v_target IS NULL AND v_mode = 'HUB' THEN
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
    SELECT * INTO v_verse FROM public."CorporatePrayerVerse" WHERE id = se."verseId";
  END IF;

  RETURN json_build_object(
    'role', c.kind,
    'serverNow', now(),
    'state', CASE WHEN now() < se."opensAt" THEN 'upcoming' WHEN now() < se."closesAt" THEN 'open' ELSE 'closed' END,
    'session', json_build_object('id', se.id, 'name', slot.name, 'slotType', se."slotType", 'timerMinutes', se."timerMinutes", 'opensAt', se."opensAt", 'closesAt', se."closesAt"),
    'person', (SELECT json_build_object('id', p.id, 'fullName', p."fullName", 'firstName', split_part(btrim(p."fullName"), ' ', 1), 'avatarUrl', p."avatarUrl")
               FROM public."Participant" p WHERE p.id = v_target),
    'projectText', CASE WHEN se."slotType" = 'FAITH_PROJECT' THEN (SELECT f.body FROM public."FaithProject" f WHERE f."participantId" = v_target AND f.status = 'SAVED' LIMIT 1) END,
    'verse', CASE WHEN v_verse.id IS NOT NULL THEN json_build_object('prayer', v_verse.prayer, 'reference', v_verse.reference) END,
    'me', CASE WHEN ci."sessionId" IS NOT NULL THEN json_build_object('checkedInAt', ci."checkedInAt", 'amenAt', ci."amenAt", 'linkTappedAt', ci."linkTappedAt") END,
    'counts', public.prayer_counts_json(se.id),
    'live', CASE WHEN se."slotType" = 'LIVE' THEN (SELECT json_build_object('telegramLink', x."telegramLink", 'waitMinutes', x."liveWaitMinutes", 'message', x."liveMessage")
                                                   FROM public."CorporatePrayerSetting" x WHERE x."cohortId" = se."cohortId") END,
    'next', public.prayer_next_opening(c.cohort_id));
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
  SELECT * INTO c FROM public.prayer_caller(p_token);
  IF c.person_id IS NULL THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  SELECT * INTO se FROM public."CorporatePrayerSession" WHERE id = p_session AND "cohortId" = c.cohort_id;
  IF se.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF now() < se."opensAt" THEN RAISE EXCEPTION 'NOT_OPEN_YET'; END IF;
  -- Someone who already checked in may come back after the window; a new person may not.
  IF now() >= se."closesAt" AND NOT EXISTS (
       SELECT 1 FROM public."CorporatePrayerCheckin" k WHERE k."sessionId" = se.id AND k."personKind" = c.kind AND k."personId" = c.person_id) THEN
    RAISE EXCEPTION 'ENDED';
  END IF;
  INSERT INTO public."CorporatePrayerCheckin" ("sessionId", "personKind", "personId")
  VALUES (se.id, c.kind, c.person_id) ON CONFLICT DO NOTHING;
  RETURN json_build_object('counts', public.prayer_counts_json(se.id), 'serverNow', now());
END;
$$;

-- The live prayer: the link was tapped, which starts the wait before "Prayed" unlocks.
CREATE OR REPLACE FUNCTION public.corporate_prayer_link_tap(p_token text, p_session uuid)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  c record;
  v_at timestamptz;
BEGIN
  SELECT * INTO c FROM public.prayer_caller(p_token);
  IF c.person_id IS NULL THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  UPDATE public."CorporatePrayerCheckin" SET "linkTappedAt" = COALESCE("linkTappedAt", now())
  WHERE "sessionId" = p_session AND "personKind" = c.kind AND "personId" = c.person_id
  RETURNING "linkTappedAt" INTO v_at;
  IF v_at IS NULL THEN RAISE EXCEPTION 'NOT_CHECKED_IN'; END IF;
  RETURN json_build_object('linkTappedAt', v_at, 'serverNow', now());
END;
$$;

-- Amen / Prayed. For the live prayer, "Prayed" waits for the configured minutes after the link tap; if the link could not be
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
  SELECT * INTO c FROM public.prayer_caller(p_token);
  IF c.person_id IS NULL THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  SELECT * INTO se FROM public."CorporatePrayerSession" WHERE id = p_session AND "cohortId" = c.cohort_id;
  IF se.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  SELECT * INTO ci FROM public."CorporatePrayerCheckin" WHERE "sessionId" = se.id AND "personKind" = c.kind AND "personId" = c.person_id;
  IF ci."sessionId" IS NULL THEN RAISE EXCEPTION 'NOT_CHECKED_IN'; END IF;
  IF se."slotType" = 'LIVE' AND ci."amenAt" IS NULL THEN
    SELECT COALESCE((SELECT x."liveWaitMinutes" FROM public."CorporatePrayerSetting" x WHERE x."cohortId" = se."cohortId"), 5) INTO v_wait;
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

-- The slow poll on the prayer screen: just the counts and whether the slot is still open.
CREATE OR REPLACE FUNCTION public.corporate_prayer_counts(p_token text, p_session uuid)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  c record;
  se public."CorporatePrayerSession";
BEGIN
  SELECT * INTO c FROM public.prayer_caller(p_token);
  IF c.person_id IS NULL THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  SELECT * INTO se FROM public."CorporatePrayerSession" WHERE id = p_session AND "cohortId" = c.cohort_id;
  IF se.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  RETURN json_build_object('counts', public.prayer_counts_json(se.id), 'serverNow', now(),
                           'state', CASE WHEN now() < se."opensAt" THEN 'upcoming' WHEN now() < se."closesAt" THEN 'open' ELSE 'closed' END);
END;
$$;

REVOKE ALL ON FUNCTION public.corporate_prayer_overview(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upsert_prayer_slot(text, uuid, uuid, text, text, text, integer, integer, text, boolean, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_prayer_slot(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_prayer_verses(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upsert_prayer_verse(text, uuid, text, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.add_prayer_verses(text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reorder_prayer_verses(text, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_prayer_verse(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_corporate_prayer_settings(text, uuid, text, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prayer_coverage(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.restart_prayer_cycle(text, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.skip_prayer_person(text, uuid, uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prayer_preview(text, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.corporate_prayer_signal(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.corporate_prayer_now(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.corporate_prayer_join(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.corporate_prayer_link_tap(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.corporate_prayer_amen(text, uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.corporate_prayer_counts(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.corporate_prayer_overview(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_prayer_slot(text, uuid, uuid, text, text, text, integer, integer, text, boolean, boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_prayer_slot(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_prayer_verses(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_prayer_verse(text, uuid, text, text, boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_prayer_verses(text, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reorder_prayer_verses(text, uuid[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_prayer_verse(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_corporate_prayer_settings(text, uuid, text, integer, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prayer_coverage(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.restart_prayer_cycle(text, uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.skip_prayer_person(text, uuid, uuid, boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prayer_preview(text, uuid, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.corporate_prayer_signal(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.corporate_prayer_now(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.corporate_prayer_join(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.corporate_prayer_link_tap(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.corporate_prayer_amen(text, uuid, boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.corporate_prayer_counts(text, uuid) TO anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------
-- Slot-time notifications. A per-minute job; it does nothing unless a notifying slot opens within the next minute.
-- It makes the session a minute early, so the first phones to open it find it ready, then sends one push and one bell row to
-- everyone counted (participants and supports) through the existing notify-users function. notifiedAt makes it once only.
-- ---------------------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.invoke_prayer_notify(p_participant_ids uuid[], p_user_ids uuid[], p_title text, p_body text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
  v_url text;
  v_key text;
BEGIN
  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'project_url';
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'push_reminders_service_key';
  IF v_url IS NULL OR v_key IS NULL THEN
    RAISE NOTICE 'corporate-prayer notify: vault secrets missing; skipping';
    RETURN;
  END IF;
  IF p_participant_ids IS NOT NULL AND array_length(p_participant_ids, 1) IS NOT NULL THEN
    PERFORM net.http_post(
      url := v_url || '/functions/v1/notify-users',
      headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', v_key, 'Authorization', 'Bearer ' || v_key),
      body := jsonb_build_object('participantIds', to_jsonb(p_participant_ids), 'title', p_title, 'body', p_body, 'path', '/me/pray', 'type', 'CORPORATE_PRAYER'),
      timeout_milliseconds := 25000);
  END IF;
  IF p_user_ids IS NOT NULL AND array_length(p_user_ids, 1) IS NOT NULL THEN
    PERFORM net.http_post(
      url := v_url || '/functions/v1/notify-users',
      headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', v_key, 'Authorization', 'Bearer ' || v_key),
      body := jsonb_build_object('userIds', to_jsonb(p_user_ids), 'title', p_title, 'body', p_body, 'path', '/support/pray', 'type', 'CORPORATE_PRAYER'),
      timeout_milliseconds := 25000);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.prayer_notify_ready()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
  SELECT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'project_url')
     AND EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'push_reminders_service_key')
$$;

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
  IF NOT EXISTS (SELECT 1 FROM public."CorporatePrayerSlot" WHERE active AND notify) THEN RETURN 0; END IF;
  -- Without the secrets nothing can be sent, so leave every slot unclaimed and try again next minute.
  IF NOT public.prayer_notify_ready() THEN RETURN 0; END IF;
  FOR s IN SELECT sl.* FROM public."CorporatePrayerSlot" sl WHERE sl.active AND sl.notify LOOP
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
    SELECT array_agg(cp.participant_id) INTO v_participants FROM public.prayer_counted_participants(s."cohortId") cp;
    SELECT array_agg(cs.user_id) INTO v_users FROM public.prayer_counted_supports(s."cohortId") cs;
    v_body := CASE WHEN s."slotType" = 'LIVE' THEN 'The live prayer is on. Tap to join.'
                   ELSE format('%s prayer is open. Join for %s minutes.', COALESCE(s.name, to_char(s."timeOfDay", 'HH24:MI')), s."timerMinutes") END;
    PERFORM public.invoke_prayer_notify(v_participants, v_users, 'Time to pray', v_body);
    v_sent := v_sent + 1;
  END LOOP;
  RETURN v_sent;
END;
$$;

REVOKE ALL ON FUNCTION public.invoke_prayer_notify(uuid[], uuid[], text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_prayer_slots() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prayer_notify_ready() FROM PUBLIC, anon, authenticated;

CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.unschedule('corporate_prayer_slots_every_minute')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'corporate_prayer_slots_every_minute');
SELECT cron.schedule('corporate_prayer_slots_every_minute', '* * * * *', $$SELECT public.notify_prayer_slots();$$);
