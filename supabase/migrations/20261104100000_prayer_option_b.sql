-- Corporate prayers, Option B (the owner's "every click" design, 4 Nov 2026).
--
-- Live prayer (Telegram): the app only opens the link. Tapping Join is that prayer's Amen (it counts for the streak), there is no
-- "Prayed" button any more, and after ten minutes without a tap "I can't join tonight" records that and lets the screen close.
-- Counts: opened (check-in) and tapped Join.
-- Daily prayer (in the app): Amen opens 3 minutes after you start (15 is suggested on screen). A prayer you missed, or did not finish
-- before its window closed, can still be prayed until midnight that Lagos day, and it counts.
-- The signal tells the app what to show: the open prayer, one you started and have not said Amen to, or one you missed.
--
-- Rollback: re-create the functions from 20261011100000_corporate_prayers.sql / 20261014100000_corporate_prayers_templates.sql
-- (live definitions as of 4 Nov are kept in the handoff), drop corporate_prayer_cant_join, prayer_late_until,
-- prayer_session_target and prayer_is_target, and drop the column "cantJoinAt".

ALTER TABLE public."CorporatePrayerCheckin" ADD COLUMN IF NOT EXISTS "cantJoinAt" timestamptz;

-- Until when a daily prayer can still be prayed: the end of its Lagos day (or its own close, if that is later).
CREATE OR REPLACE FUNCTION public.prayer_late_until(p_session uuid)
RETURNS timestamptz LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
  SELECT CASE WHEN s."slotType" = 'LIVE' THEN s."closesAt"
              ELSE GREATEST(s."closesAt", ((s."prayerDate" + 1)::timestamp AT TIME ZONE 'Africa/Lagos')) END
  FROM public."CorporatePrayerSession" s WHERE s.id = p_session
$$;
REVOKE ALL ON FUNCTION public.prayer_late_until(uuid) FROM PUBLIC, anon, authenticated;

-- The person a caller in this hub prays for in a session (same order as corporate_prayer_now).
CREATE OR REPLACE FUNCTION public.prayer_session_target(p_session uuid, p_hub text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
  SELECT t."participantId" FROM public."CorporatePrayerTarget" t
  WHERE t."sessionId" = p_session
  ORDER BY (t."hubKey" = 'COHORT') DESC, (t."hubKey" = p_hub) DESC, (t."hubKey" = 'NO_HUB') DESC, t."hubKey"
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.prayer_session_target(uuid, text) FROM PUBLIC, anon, authenticated;

-- Is this participant one of the people prayed for in a session? In per-hub mode a hub may pray for someone from another hub,
-- so this looks at every target, not only the caller's own hub.
CREATE OR REPLACE FUNCTION public.prayer_is_target(p_session uuid, p_participant uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
  SELECT EXISTS (SELECT 1 FROM public."CorporatePrayerTarget" t WHERE t."sessionId" = p_session AND t."participantId" = p_participant)
$$;
REVOKE ALL ON FUNCTION public.prayer_is_target(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.prayer_counts_json(p_session uuid)
RETURNS json LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
  SELECT json_build_object(
    'joined', count(c."sessionId"),
    'praying', count(c."sessionId") FILTER (WHERE c."amenAt" IS NULL AND c."cantJoinAt" IS NULL AND c."checkedInAt" > now() - make_interval(mins => GREATEST(s."timerMinutes", 15) + 5)),
    'amen', count(c."sessionId") FILTER (WHERE c."amenAt" IS NOT NULL),
    'tapped', count(c."sessionId") FILTER (WHERE c."linkTappedAt" IS NOT NULL))
  FROM public."CorporatePrayerSession" s
  LEFT JOIN public."CorporatePrayerCheckin" c ON c."sessionId" = s.id
  WHERE s.id = p_session
  GROUP BY s."timerMinutes"
$$;
REVOKE ALL ON FUNCTION public.prayer_counts_json(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.corporate_prayer_join(p_token text, p_session uuid)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  c record;
  se public."CorporatePrayerSession";
  v_in boolean;
BEGIN
  SELECT * INTO c FROM public.prayer_caller(p_token, public.prayer_session_cohort(p_session));
  IF c.person_id IS NULL THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  SELECT * INTO se FROM public."CorporatePrayerSession" WHERE id = p_session AND "cohortId" = c.cohort_id;
  IF se.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF now() < se."opensAt" THEN RAISE EXCEPTION 'NOT_OPEN_YET'; END IF;
  v_in := EXISTS (SELECT 1 FROM public."CorporatePrayerCheckin" k WHERE k."sessionId" = se.id AND k."personKind" = c.kind AND k."personId" = c.person_id);
  -- Someone already in may come back. A new person may join a daily prayer until midnight (a missed prayer still counts), a live one only while it is on.
  IF NOT v_in AND now() >= public.prayer_late_until(se.id) THEN RAISE EXCEPTION 'ENDED'; END IF;
  IF NOT v_in AND NOT public.prayer_in_audience(se."audienceAll", se."hubIds", c.hub_key) THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  -- The person being prayed for is not one of the people praying.
  IF NOT v_in AND c.kind = 'PARTICIPANT' AND se."slotType" <> 'LIVE' AND public.prayer_is_target(se.id, c.person_id) THEN
    RAISE EXCEPTION 'IS_YOU';
  END IF;
  INSERT INTO public."CorporatePrayerCheckin" ("sessionId", "personKind", "personId")
  VALUES (se.id, c.kind, c.person_id) ON CONFLICT DO NOTHING;
  RETURN json_build_object('counts', public.prayer_counts_json(se.id), 'serverNow', now());
END;
$$;

-- Tapping Join on a live prayer is its Amen: the app cannot see the call, so the tap is what counts.
CREATE OR REPLACE FUNCTION public.corporate_prayer_link_tap(p_token text, p_session uuid)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  c record;
  v_at timestamptz;
BEGIN
  SELECT * INTO c FROM public.prayer_caller(p_token, public.prayer_session_cohort(p_session));
  IF c.person_id IS NULL THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  UPDATE public."CorporatePrayerCheckin" k
  SET "linkTappedAt" = COALESCE(k."linkTappedAt", now()),
      "amenAt" = CASE WHEN s."slotType" = 'LIVE' THEN COALESCE(k."amenAt", now()) ELSE k."amenAt" END,
      "withoutLink" = CASE WHEN s."slotType" = 'LIVE' AND k."amenAt" IS NULL THEN FALSE ELSE k."withoutLink" END,
      "cantJoinAt" = NULL
  FROM public."CorporatePrayerSession" s
  WHERE s.id = k."sessionId" AND k."sessionId" = p_session AND k."personKind" = c.kind AND k."personId" = c.person_id
  RETURNING k."linkTappedAt" INTO v_at;
  IF v_at IS NULL THEN RAISE EXCEPTION 'NOT_CHECKED_IN'; END IF;
  RETURN json_build_object('linkTappedAt', v_at, 'counts', public.prayer_counts_json(p_session), 'serverNow', now());
END;
$$;

-- "I can't join tonight": only on a live prayer, only after ten minutes without tapping Join. It lets the screen close; it is not a prayer.
CREATE OR REPLACE FUNCTION public.corporate_prayer_cant_join(p_token text, p_session uuid)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  c record;
  se public."CorporatePrayerSession";
  ci public."CorporatePrayerCheckin";
BEGIN
  SELECT * INTO c FROM public.prayer_caller(p_token, public.prayer_session_cohort(p_session));
  IF c.person_id IS NULL THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  SELECT * INTO se FROM public."CorporatePrayerSession" WHERE id = p_session AND "cohortId" = c.cohort_id;
  IF se.id IS NULL OR se."slotType" <> 'LIVE' THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  SELECT * INTO ci FROM public."CorporatePrayerCheckin" WHERE "sessionId" = se.id AND "personKind" = c.kind AND "personId" = c.person_id;
  IF ci."sessionId" IS NULL THEN RAISE EXCEPTION 'NOT_CHECKED_IN'; END IF;
  IF ci."linkTappedAt" IS NULL THEN
    IF now() < ci."checkedInAt" + interval '10 minutes' THEN RAISE EXCEPTION 'TOO_EARLY'; END IF;
    UPDATE public."CorporatePrayerCheckin" SET "cantJoinAt" = COALESCE("cantJoinAt", now())
    WHERE "sessionId" = se.id AND "personKind" = c.kind AND "personId" = c.person_id;
  END IF;
  RETURN json_build_object('counts', public.prayer_counts_json(se.id), 'serverNow', now());
END;
$$;

-- Amen on a daily prayer opens 3 minutes after you started (or the slot's whole timer, if that is shorter). It still works after the
-- window has closed. A live prayer keeps the old path for phones still on the previous version of the app.
CREATE OR REPLACE FUNCTION public.corporate_prayer_amen(p_token text, p_session uuid, p_without_link boolean DEFAULT FALSE)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
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
  IF ci."amenAt" IS NULL THEN
    IF se."slotType" = 'LIVE' THEN
      SELECT COALESCE((SELECT x."liveWaitMinutes" FROM public."CorporatePrayerSlot" x WHERE x.id = se."slotId"), 5) INTO v_wait;
      IF ci."linkTappedAt" IS NOT NULL THEN
        IF now() < ci."linkTappedAt" + make_interval(mins => v_wait) THEN RAISE EXCEPTION 'TOO_EARLY'; END IF;
      ELSIF COALESCE(p_without_link, FALSE) THEN
        IF now() < ci."checkedInAt" + interval '10 minutes' THEN RAISE EXCEPTION 'TOO_EARLY'; END IF;
      ELSE
        RAISE EXCEPTION 'OPEN_THE_LINK_FIRST';
      END IF;
    ELSIF now() < ci."checkedInAt" + make_interval(mins => LEAST(3, se."timerMinutes")) THEN
      RAISE EXCEPTION 'AMEN_TOO_SOON';
    END IF;
  END IF;
  UPDATE public."CorporatePrayerCheckin" SET "amenAt" = COALESCE("amenAt", now()), "withoutLink" = ("linkTappedAt" IS NULL)
  WHERE "sessionId" = se.id AND "personKind" = c.kind AND "personId" = c.person_id;
  RETURN json_build_object('counts', public.prayer_counts_json(se.id), 'serverNow', now());
END;
$$;

-- The prayer screen's one read. Adds: isMe (you are the person being prayed for), lateUntil, cantJoinAt, amenAfterMinutes.
CREATE OR REPLACE FUNCTION public.corporate_prayer_now(p_token text, p_session uuid)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
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
    'session', json_build_object('id', se.id, 'name', slot.name, 'slotType', se."slotType", 'timerMinutes', se."timerMinutes",
                                 'opensAt', se."opensAt", 'closesAt', se."closesAt", 'lateUntil', public.prayer_late_until(se.id),
                                 'amenAfterMinutes', LEAST(3, se."timerMinutes")),
    'person', (SELECT json_build_object('id', p.id, 'fullName', p."fullName", 'firstName', split_part(btrim(p."fullName"), ' ', 1), 'avatarUrl', p."avatarUrl")
               FROM public."Participant" p WHERE p.id = v_target),
    'isMe', (c.kind = 'PARTICIPANT' AND se."slotType" <> 'LIVE' AND now() >= se."opensAt" AND public.prayer_is_target(se.id, c.person_id)),
    'blocks', v_blocks,
    'me', CASE WHEN ci."sessionId" IS NOT NULL THEN json_build_object('checkedInAt', ci."checkedInAt", 'amenAt', ci."amenAt", 'linkTappedAt', ci."linkTappedAt", 'cantJoinAt', ci."cantJoinAt") END,
    'counts', public.prayer_counts_json(se.id),
    'live', CASE WHEN se."slotType" = 'LIVE' THEN json_build_object('telegramLink', slot."telegramLink", 'waitMinutes', slot."liveWaitMinutes", 'message', slot."liveMessage") END,
    'next', public.prayer_next_opening(c.cohort_id, c.hub_key));
END;
$$;

-- The minute-by-minute check. "open" is the prayer on now; "unfinished" a daily prayer you started and have not said Amen to
-- (its window closed); "missed" the latest daily prayer today you did not open, which you can still pray until midnight.
CREATE OR REPLACE FUNCTION public.corporate_prayer_signal(p_token text, p_cohort uuid DEFAULT NULL)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  c record;
  v_session uuid;
  se public."CorporatePrayerSession";
  ci public."CorporatePrayerCheckin";
  v_open json;
  v_unfinished json;
  v_missed json;
  v_today date := public.prayer_lagos_today();
  v_running boolean;
BEGIN
  SELECT * INTO c FROM public.prayer_caller(p_token, p_cohort);
  IF c.person_id IS NULL THEN RETURN json_build_object('open', NULL); END IF;
  v_running := public.prayer_running(c.cohort_id);
  v_session := public.prayer_open_session(c.cohort_id, c.hub_key);
  IF v_session IS NOT NULL THEN
    SELECT * INTO se FROM public."CorporatePrayerSession" WHERE id = v_session;
    SELECT * INTO ci FROM public."CorporatePrayerCheckin" WHERE "sessionId" = v_session AND "personKind" = c.kind AND "personId" = c.person_id;
    v_open := json_build_object('sessionId', se.id, 'slotType', se."slotType", 'opensAt', se."opensAt", 'closesAt', se."closesAt",
                                'lateUntil', public.prayer_late_until(se.id),
                                'checkedIn', ci."sessionId" IS NOT NULL,
                                -- Old apps hide the live pop-up on "amen"; "I can't join tonight" closes it too.
                                'amen', (ci."amenAt" IS NOT NULL OR ci."cantJoinAt" IS NOT NULL),
                                'tapped', ci."linkTappedAt" IS NOT NULL, 'cantJoin', ci."cantJoinAt" IS NOT NULL,
                                'isMe', (c.kind = 'PARTICIPANT' AND se."slotType" <> 'LIVE' AND public.prayer_is_target(se.id, c.person_id)),
                                'serverNow', now());
  END IF;

  SELECT json_build_object('sessionId', s.id, 'slotType', s."slotType", 'opensAt', s."opensAt", 'closesAt', s."closesAt",
                           'lateUntil', public.prayer_late_until(s.id), 'checkedIn', TRUE, 'amen', FALSE, 'serverNow', now())
    INTO v_unfinished
  FROM public."CorporatePrayerSession" s
  JOIN public."CorporatePrayerCheckin" k ON k."sessionId" = s.id AND k."personKind" = c.kind AND k."personId" = c.person_id AND k."amenAt" IS NULL
  WHERE s."cohortId" = c.cohort_id AND s."slotType" <> 'LIVE' AND s."prayerDate" >= v_today - 1
    AND s."closesAt" <= now() AND now() < public.prayer_late_until(s.id) AND s.id IS DISTINCT FROM v_session
  ORDER BY s."opensAt" DESC LIMIT 1;

  SELECT json_build_object('sessionId', s.id, 'slotType', s."slotType", 'name', sl.name, 'opensAt', s."opensAt", 'closesAt', s."closesAt",
                           'lateUntil', public.prayer_late_until(s.id), 'serverNow', now())
    INTO v_missed
  FROM public."CorporatePrayerSession" s
  JOIN public."CorporatePrayerSlot" sl ON sl.id = s."slotId" AND sl.active
  WHERE s."cohortId" = c.cohort_id AND s."slotType" <> 'LIVE' AND s."prayerDate" >= v_today - 1
    AND (v_running OR sl."isTest")
    AND s."closesAt" <= now() AND now() < public.prayer_late_until(s.id)
    AND public.prayer_in_audience(s."audienceAll", s."hubIds", c.hub_key)
    AND NOT EXISTS (SELECT 1 FROM public."CorporatePrayerCheckin" k WHERE k."sessionId" = s.id AND k."personKind" = c.kind AND k."personId" = c.person_id)
    AND NOT (c.kind = 'PARTICIPANT' AND public.prayer_is_target(s.id, c.person_id))
  ORDER BY s."opensAt" DESC LIMIT 1;

  RETURN json_build_object('open', v_open, 'unfinished', v_unfinished, 'missed', v_missed,
                           'next', public.prayer_next_opening(c.cohort_id, c.hub_key));
END;
$$;

REVOKE ALL ON FUNCTION public.corporate_prayer_cant_join(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.corporate_prayer_cant_join(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.corporate_prayer_join(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.corporate_prayer_link_tap(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.corporate_prayer_amen(text, uuid, boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.corporate_prayer_now(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.corporate_prayer_signal(text, uuid) TO anon, authenticated;
