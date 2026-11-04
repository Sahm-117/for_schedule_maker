-- Corporate prayers, Option B part 2: the Wall on the daily prayer, hiding a message, and what the person prayed for gets.
--
-- The Wall: people praying can leave a short word (up to 140 characters, at most 5 per prayer) for the person they are praying
-- for. Everyone praying for that person sees it with first names; the person prayed for sees the words only once the prayer has
-- ended, with how many prayed (a number, never who). An admin, or a hub's lead for messages from their own hub, can hide a
-- message: it disappears for everyone, the writer is not told. Live (Telegram) prayers have no wall.
-- When a daily prayer's window closes, the person prayed for gets one bell and push: "N people prayed for you today".
-- The daily prayer's notification now says it is not a call.
--
-- Rollback: drop the four corporate_prayer_wall* / prayer_amen_for_target functions and the table "CorporatePrayerWallPost",
-- drop the column "CorporatePrayerTarget"."summarySentAt", and re-create corporate_prayer_signal and notify_prayer_slots from
-- 20261104100000_prayer_option_b.sql / 20261022170000_prayers_start_day_after_class.sql.

-- No foreign key to Participant or User on purpose (rule 55: no second route between existing tables); ids are checked in the functions.
CREATE TABLE IF NOT EXISTS public."CorporatePrayerWallPost" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "sessionId" uuid NOT NULL REFERENCES public."CorporatePrayerSession"(id) ON DELETE CASCADE,
  "targetId" uuid,
  "authorKind" text NOT NULL CHECK ("authorKind" IN ('PARTICIPANT', 'SUPPORT')),
  "authorId" uuid NOT NULL,
  "authorHub" text,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 140),
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "hiddenAt" timestamptz,
  "hiddenById" uuid
);
CREATE INDEX IF NOT EXISTS idx_prayerwall_session_target ON public."CorporatePrayerWallPost" ("sessionId", "targetId", "createdAt");
ALTER TABLE public."CorporatePrayerWallPost" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."CorporatePrayerWallPost" FROM PUBLIC, anon, authenticated;

ALTER TABLE public."CorporatePrayerTarget" ADD COLUMN IF NOT EXISTS "summarySentAt" timestamptz;

-- How many said Amen for the person a hub prayed for (the whole session when one person is prayed for by everyone).
CREATE OR REPLACE FUNCTION public.prayer_amen_for_target(p_session uuid, p_hub_key text)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
  SELECT count(*)::integer FROM public."CorporatePrayerCheckin" k
  JOIN public."CorporatePrayerSession" s ON s.id = k."sessionId"
  WHERE k."sessionId" = p_session AND k."amenAt" IS NOT NULL
    AND (p_hub_key = 'COHORT'
         OR public.prayer_session_target(p_session, CASE WHEN k."personKind" = 'PARTICIPANT' THEN public.prayer_participant_hub(s."cohortId", k."personId")
                                                          ELSE public.prayer_user_hub(s."cohortId", k."personId") END)
            = (SELECT t."participantId" FROM public."CorporatePrayerTarget" t WHERE t."sessionId" = p_session AND t."hubKey" = p_hub_key))
$$;
REVOKE ALL ON FUNCTION public.prayer_amen_for_target(uuid, text) FROM PUBLIC, anon, authenticated;

-- The Wall for the person the caller prays for. For the person prayed for: the words and the count, only after the prayer ended.
CREATE OR REPLACE FUNCTION public.corporate_prayer_wall(p_token text, p_session uuid)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  c record;
  se public."CorporatePrayerSession";
  v_target uuid;
  v_is_target boolean;
  v_admin boolean := FALSE;
  v_posts json;
  v_key text;
BEGIN
  SELECT * INTO c FROM public.prayer_caller(p_token, public.prayer_session_cohort(p_session));
  IF c.person_id IS NULL THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  SELECT * INTO se FROM public."CorporatePrayerSession" WHERE id = p_session AND "cohortId" = c.cohort_id;
  IF se.id IS NULL OR se."slotType" = 'LIVE' OR now() < se."opensAt" THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  v_is_target := c.kind = 'PARTICIPANT' AND public.prayer_is_target(se.id, c.person_id);
  -- The person prayed for reads the words left for them; everyone else the Wall of the person their hub prays for.
  v_target := CASE WHEN v_is_target THEN c.person_id ELSE public.prayer_session_target(se.id, c.hub_key) END;
  IF NOT v_is_target AND NOT public.prayer_in_audience(se."audienceAll", se."hubIds", c.hub_key)
     AND NOT EXISTS (SELECT 1 FROM public."CorporatePrayerCheckin" k WHERE k."sessionId" = se.id AND k."personKind" = c.kind AND k."personId" = c.person_id) THEN
    RAISE EXCEPTION 'NOT_ALLOWED';
  END IF;
  IF v_is_target AND now() < se."closesAt" THEN
    RETURN json_build_object('forMe', TRUE, 'ended', FALSE, 'posts', '[]'::json, 'counts', public.prayer_counts_json(se.id), 'serverNow', now());
  END IF;
  IF c.kind = 'SUPPORT' THEN
    SELECT 'ADMIN'::"Role" = ANY (public.app_user_roles(u)) INTO v_admin FROM public."User" u WHERE u.id = c.person_id;
  END IF;

  SELECT COALESCE(json_agg(row_to_json(x) ORDER BY x."at"), '[]'::json) INTO v_posts FROM (
    SELECT w.id, w.body, w."createdAt" AS "at",
           (w."authorKind" = c.kind AND w."authorId" = c.person_id) AS mine,
           split_part(btrim(COALESCE(p."fullName", u.name, '')), ' ', 1) AS "firstName",
           COALESCE(p."fullName", u.name, '') AS "fullName",
           COALESCE(p."avatarUrl", u."avatarUrl") AS "avatarUrl",
           (NOT v_is_target AND (COALESCE(v_admin, FALSE)
             OR (c.kind = 'SUPPORT' AND EXISTS (SELECT 1 FROM public."SupportHub" h WHERE h.id::text = w."authorHub" AND h."leadUserId" = c.person_id)))) AS "canHide"
    FROM public."CorporatePrayerWallPost" w
    LEFT JOIN public."Participant" p ON w."authorKind" = 'PARTICIPANT' AND p.id = w."authorId"
    LEFT JOIN public."User" u ON w."authorKind" = 'SUPPORT' AND u.id = w."authorId"
    WHERE w."sessionId" = se.id AND w."targetId" IS NOT DISTINCT FROM v_target AND w."hiddenAt" IS NULL
    ORDER BY w."createdAt" DESC LIMIT 60
  ) x;

  IF v_is_target THEN
    SELECT t."hubKey" INTO v_key FROM public."CorporatePrayerTarget" t WHERE t."sessionId" = se.id AND t."participantId" = c.person_id LIMIT 1;
    RETURN json_build_object('forMe', TRUE, 'ended', TRUE, 'posts', v_posts, 'prayedForYou', public.prayer_amen_for_target(se.id, COALESCE(v_key, 'COHORT')),
                             'opensAt', se."opensAt", 'hasProject', public.prayer_blocks_pool(se.blocks) = 'FAITH', 'serverNow', now());
  END IF;
  RETURN json_build_object('forMe', FALSE, 'posts', v_posts, 'counts', public.prayer_counts_json(se.id), 'serverNow', now());
END;
$$;

CREATE OR REPLACE FUNCTION public.corporate_prayer_wall_post(p_token text, p_session uuid, p_body text)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  c record;
  se public."CorporatePrayerSession";
  v_body text := btrim(regexp_replace(COALESCE(p_body, ''), '\s+', ' ', 'g'));
  v_target uuid;
BEGIN
  SELECT * INTO c FROM public.prayer_caller(p_token, public.prayer_session_cohort(p_session));
  IF c.person_id IS NULL THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  SELECT * INTO se FROM public."CorporatePrayerSession" WHERE id = p_session AND "cohortId" = c.cohort_id;
  IF se.id IS NULL OR se."slotType" = 'LIVE' THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  -- Only someone praying it (checked in) can write, while it can still be prayed.
  IF NOT EXISTS (SELECT 1 FROM public."CorporatePrayerCheckin" k WHERE k."sessionId" = se.id AND k."personKind" = c.kind AND k."personId" = c.person_id) THEN
    RAISE EXCEPTION 'NOT_CHECKED_IN';
  END IF;
  IF now() >= public.prayer_late_until(se.id) THEN RAISE EXCEPTION 'ENDED'; END IF;
  IF char_length(v_body) = 0 THEN RAISE EXCEPTION 'EMPTY_MESSAGE'; END IF;
  IF char_length(v_body) > 140 THEN RAISE EXCEPTION 'MESSAGE_TOO_LONG'; END IF;
  IF (SELECT count(*) FROM public."CorporatePrayerWallPost" w WHERE w."sessionId" = se.id AND w."authorKind" = c.kind AND w."authorId" = c.person_id) >= 5 THEN
    RAISE EXCEPTION 'TOO_MANY_MESSAGES';
  END IF;
  IF c.kind = 'PARTICIPANT' AND public.prayer_is_target(se.id, c.person_id) THEN RAISE EXCEPTION 'IS_YOU'; END IF;
  v_target := public.prayer_session_target(se.id, c.hub_key);
  INSERT INTO public."CorporatePrayerWallPost" ("sessionId", "targetId", "authorKind", "authorId", "authorHub", body)
  VALUES (se.id, v_target, c.kind, c.person_id, c.hub_key, v_body);
  RETURN public.corporate_prayer_wall(p_token, p_session);
END;
$$;

-- An admin (who also supports, so they are on the prayer screen), or the lead of the writer's hub, hides a message.
CREATE OR REPLACE FUNCTION public.corporate_prayer_wall_hide(p_token text, p_post uuid)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  w public."CorporatePrayerWallPost";
  c record;
  v_user "User" := public.app_staff(p_token);
  v_ok boolean := FALSE;
BEGIN
  SELECT * INTO w FROM public."CorporatePrayerWallPost" WHERE id = p_post;
  IF w.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_user.id IS NOT NULL THEN
    v_ok := 'ADMIN'::"Role" = ANY (public.app_user_roles(v_user))
            OR EXISTS (SELECT 1 FROM public."SupportHub" h WHERE h.id::text = w."authorHub" AND h."leadUserId" = v_user.id);
  END IF;
  IF NOT v_ok THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  UPDATE public."CorporatePrayerWallPost" SET "hiddenAt" = COALESCE("hiddenAt", now()), "hiddenById" = COALESCE("hiddenById", v_user.id) WHERE id = w.id;
  RETURN json_build_object('ok', TRUE);
END;
$$;

-- The signal gains "forMe": today's prayer for the caller that has ended (the Home card offers the words left for them).
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
  v_for_me json;
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

  IF c.kind = 'PARTICIPANT' THEN
    SELECT json_build_object('sessionId', s.id, 'opensAt', s."opensAt", 'closesAt', s."closesAt", 'serverNow', now())
      INTO v_for_me
    FROM public."CorporatePrayerSession" s
    JOIN public."CorporatePrayerTarget" t ON t."sessionId" = s.id AND t."participantId" = c.person_id
    WHERE s."cohortId" = c.cohort_id AND s."slotType" <> 'LIVE' AND s."prayerDate" >= v_today - 1
      AND s."closesAt" <= now() AND s."closesAt" > now() - interval '18 hours'
    ORDER BY s."closesAt" DESC LIMIT 1;
  END IF;

  RETURN json_build_object('open', v_open, 'unfinished', v_unfinished, 'missed', v_missed, 'forMe', v_for_me,
                           'next', public.prayer_next_opening(c.cohort_id, c.hub_key));
END;
$$;

-- The per-minute job: the daily prayer's notification says it is not a call, and when a daily prayer closes the person prayed for
-- is told how many prayed (once per person, only if anyone did). Same claims and checks as before for the slot notifications.
CREATE OR REPLACE FUNCTION public.notify_prayer_slots()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_today date := public.prayer_lagos_today();
  s record;
  t record;
  v_opens timestamptz;
  v_session uuid;
  v_claimed uuid;
  v_participants uuid[];
  v_users uuid[];
  v_sent integer := 0;
  v_body text;
  v_n integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public."CorporatePrayerSlot" sl WHERE sl.active AND sl.notify AND NOT sl."isTest"
                 AND NOT public.prayer_is_practice(sl."cohortId")) THEN RETURN 0; END IF;
  -- Without the secrets nothing can be sent, so leave every slot unclaimed and try again next minute.
  IF NOT public.prayer_notify_ready() THEN RETURN 0; END IF;

  -- "N people prayed for you": a daily prayer that closed in the last ten minutes, each person prayed for once.
  FOR t IN SELECT tg."sessionId", tg."hubKey", tg."participantId" FROM public."CorporatePrayerTarget" tg
           JOIN public."CorporatePrayerSession" x ON x.id = tg."sessionId"
           JOIN public."CorporatePrayerSlot" sl ON sl.id = x."slotId" AND sl.notify AND NOT sl."isTest"
           WHERE tg."summarySentAt" IS NULL AND x."slotType" <> 'LIVE'
             AND x."closesAt" <= now() AND x."closesAt" > now() - interval '10 minutes'
             AND NOT public.prayer_is_practice(x."cohortId") LOOP
    UPDATE public."CorporatePrayerTarget" SET "summarySentAt" = now()
    WHERE "sessionId" = t."sessionId" AND "hubKey" = t."hubKey" AND "summarySentAt" IS NULL RETURNING "sessionId" INTO v_claimed;
    CONTINUE WHEN v_claimed IS NULL;
    v_n := public.prayer_amen_for_target(t."sessionId", t."hubKey");
    CONTINUE WHEN v_n = 0;
    PERFORM public.invoke_prayer_notify(ARRAY[t."participantId"], NULL, 'People prayed for you',
      format('%s %s prayed for you today. Tap to read the words they left.', v_n, CASE WHEN v_n = 1 THEN 'person' ELSE 'people' END));
    v_sent := v_sent + 1;
  END LOOP;

  FOR s IN SELECT sl.* FROM public."CorporatePrayerSlot" sl WHERE sl.active AND sl.notify AND NOT sl."isTest"
                AND NOT public.prayer_is_practice(sl."cohortId") LOOP
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
    v_body := CASE WHEN s."slotType" = 'LIVE' THEN 'The live prayer is on Telegram. Tap to join.'
                   ELSE format('%s prayer has started. It is not a call: pray where you are, %s minutes if you can.', COALESCE(s.name, to_char(s."timeOfDay", 'HH24:MI')), s."timerMinutes") END;
    PERFORM public.invoke_prayer_notify(v_participants, v_users, 'Time to pray', v_body);
    v_sent := v_sent + 1;
  END LOOP;
  RETURN v_sent;
END;
$$;

REVOKE ALL ON FUNCTION public.corporate_prayer_wall(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.corporate_prayer_wall_post(text, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.corporate_prayer_wall_hide(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.corporate_prayer_wall(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.corporate_prayer_wall_post(text, uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.corporate_prayer_wall_hide(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.corporate_prayer_signal(text, uuid) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_prayer_slots() FROM PUBLIC, anon, authenticated;
