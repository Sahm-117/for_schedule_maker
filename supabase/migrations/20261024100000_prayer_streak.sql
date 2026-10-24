-- Corporate prayer streak and milestones.
--
-- A day counts when the person finishes at least one prayer (says Amen) on that Lagos day. The streak is worked out on read
-- from "CorporatePrayerCheckin" (no counter to drift, no nightly job):
--   * only days that had a prayer session count as prayer days; days with none (before the start, an admin switching slots off)
--     never break a streak;
--   * today is never a miss while it is still going;
--   * each Monday-to-Sunday week covers ONE missed day (the rest day) as long as a streak is running;
--   * a second miss in the same week ends the streak. The total prayers finished never resets.
-- Milestones 5, 10, 21, 30 days in a row, and "Full cohort" (stored as 70: prayed on every prayer day of the programme, no miss and
-- no rest day used, through its last day), are stored per cohort in "PrayerMilestone" the first time they are seen, so the celebration shows once. "Tell my group" is the person's own choice and posts to the group discussion in their name; their
-- support is always told.
--
-- Participants (not teens) and supports are both covered, the same people prayer_caller allows.
--
-- Rollback: DROP FUNCTION prayer_streak(text), prayer_milestone_seen(text, integer, boolean), prayer_streak_calc(text, uuid, uuid, text);
-- DROP TABLE "PrayerMilestone".

CREATE TABLE IF NOT EXISTS public."PrayerMilestone" (
  "personKind" text NOT NULL CHECK ("personKind" IN ('PARTICIPANT', 'SUPPORT')),
  "personId" uuid NOT NULL,
  "cohortId" uuid NOT NULL,
  milestone integer NOT NULL CHECK (milestone IN (5, 10, 21, 30, 70)),
  "earnedOn" date NOT NULL,
  "seenAt" timestamptz,
  "toldGroupAt" timestamptz,
  "supportNotifiedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("personKind", "personId", "cohortId", milestone)
);

REVOKE ALL ON TABLE public."PrayerMilestone" FROM anon, authenticated;
ALTER TABLE public."PrayerMilestone" ENABLE ROW LEVEL SECURITY;

-- The streak numbers for one person in one cohort. Internal.
DROP FUNCTION IF EXISTS public.prayer_streak_calc(text, uuid, uuid, text);
CREATE OR REPLACE FUNCTION public.prayer_streak_calc(p_kind text, p_person uuid, p_cohort uuid, p_hub text)
RETURNS TABLE (cur integer, best integer, total integer, rest_used boolean, reached jsonb, last_day date, days jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  r record;
  v_today date := public.prayer_lagos_today();
  v_run integer := 0;
  v_best integer := 0;
  v_rest_week date;
  v_week date;
  v_reached jsonb := '{}'::jsonb;
  v_last date;
  v_days jsonb := '[]'::jsonb;
  v_n integer;
  v_missed boolean := FALSE;
  v_end date;
BEGIN
  SELECT c."endDate"::date INTO v_end FROM public."Cohort" c WHERE c.id = p_cohort;
  FOR r IN
    SELECT s."prayerDate" AS d, COALESCE(bool_or(k."amenAt" IS NOT NULL), FALSE) AS prayed
    FROM public."CorporatePrayerSession" s
    JOIN public."CorporatePrayerSlot" sl ON sl.id = s."slotId" AND NOT sl."isTest"
    LEFT JOIN public."CorporatePrayerCheckin" k
      ON k."sessionId" = s.id AND k."personKind" = p_kind AND k."personId" = p_person
    WHERE s."cohortId" = p_cohort AND s."prayerDate" <= v_today
      AND (public.prayer_in_audience(s."audienceAll", s."hubIds", p_hub) OR k."sessionId" IS NOT NULL)
    GROUP BY s."prayerDate"
    ORDER BY s."prayerDate"
  LOOP
    IF r.prayed THEN
      v_run := v_run + 1;
      v_last := r.d;
      v_best := GREATEST(v_best, v_run);
      FOREACH v_n IN ARRAY ARRAY[5, 10, 21, 30, 70] LOOP
        IF v_run = v_n AND NOT (v_reached ? v_n::text) THEN
          v_reached := v_reached || jsonb_build_object(v_n::text, r.d);
        END IF;
      END LOOP;
    ELSIF r.d < v_today THEN
      v_missed := TRUE;
      v_week := date_trunc('week', r.d)::date;
      IF v_run > 0 AND v_rest_week IS DISTINCT FROM v_week THEN
        v_rest_week := v_week;
      ELSE
        v_run := 0;
      END IF;
    END IF;
    IF r.d > v_today - 7 THEN
      v_days := v_days || jsonb_build_array(jsonb_build_object('date', r.d, 'prayed', r.prayed));
    END IF;
  END LOOP;

  -- Full cohort: every prayer day prayed, through the cohort's last day.
  IF NOT v_missed AND v_end IS NOT NULL AND v_last = v_end AND NOT (v_reached ? '70') THEN
    v_reached := v_reached || jsonb_build_object('70', v_end);
  END IF;

  RETURN QUERY SELECT
    v_run, v_best,
    (SELECT count(*)::integer FROM public."CorporatePrayerCheckin" k
       JOIN public."CorporatePrayerSession" s ON s.id = k."sessionId"
       JOIN public."CorporatePrayerSlot" sl ON sl.id = s."slotId" AND NOT sl."isTest"
       WHERE s."cohortId" = p_cohort AND k."personKind" = p_kind AND k."personId" = p_person AND k."amenAt" IS NOT NULL),
    v_rest_week IS NOT DISTINCT FROM date_trunc('week', v_today)::date,
    v_reached, v_last, v_days;
END;
$$;

-- Everything the Faith, Journey and Home cards and the prayer screen need, in one call.
CREATE OR REPLACE FUNCTION public.prayer_streak(p_token text)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  c record;
  v_today date := public.prayer_lagos_today();
  s record;
  v_group uuid;
  v_group_name text;
  v_group_total integer := 0;
  v_slots json;
  v_milestones json;
  v_pending json;
  v_key text;
  v_name text;
  v_avatar text;
BEGIN
  SELECT * INTO c FROM public.prayer_caller(p_token);
  IF c.person_id IS NULL THEN RETURN json_build_object('available', FALSE); END IF;
  IF NOT public.prayer_running(c.cohort_id) THEN
    RETURN json_build_object('available', FALSE, 'notStarted', TRUE);
  END IF;

  SELECT * INTO s FROM public.prayer_streak_calc(c.kind, c.person_id, c.cohort_id, c.hub_key);

  IF c.kind = 'PARTICIPANT' THEN
    SELECT p."fullName", p."avatarUrl" INTO v_name, v_avatar FROM public."Participant" p WHERE p.id = c.person_id;
  ELSE
    SELECT u.name, u."avatarUrl" INTO v_name, v_avatar FROM public."User" u WHERE u.id = c.person_id;
  END IF;

  -- Remember each milestone the first time it is seen.
  FOR v_key IN SELECT jsonb_object_keys(s.reached) LOOP
    INSERT INTO public."PrayerMilestone" ("personKind", "personId", "cohortId", milestone, "earnedOn")
    VALUES (c.kind, c.person_id, c.cohort_id, v_key::integer, (s.reached ->> v_key)::date)
    ON CONFLICT DO NOTHING;
  END LOOP;

  SELECT COALESCE(json_agg(json_build_object('milestone', m.milestone, 'earnedOn', m."earnedOn") ORDER BY m.milestone), '[]'::json)
    INTO v_milestones FROM public."PrayerMilestone" m WHERE m."personKind" = c.kind AND m."personId" = c.person_id AND m."cohortId" = c.cohort_id;
  SELECT json_build_object('milestone', m.milestone, 'earnedOn', m."earnedOn") INTO v_pending
    FROM public."PrayerMilestone" m WHERE m."personKind" = c.kind AND m."personId" = c.person_id AND m."cohortId" = c.cohort_id AND m."seenAt" IS NULL
    ORDER BY m.milestone DESC LIMIT 1;

  -- The group whose prayers add up: a participant's own group, a support's group.
  IF c.kind = 'PARTICIPANT' THEN
    SELECT g.id, g.name INTO v_group, v_group_name FROM public."GroupParticipant" gp JOIN public."Group" g ON g.id = gp."groupId"
    WHERE gp."participantId" = c.person_id AND g."cohortId" = c.cohort_id LIMIT 1;
  ELSE
    SELECT g.id, g.name INTO v_group, v_group_name FROM public."Group" g WHERE g."supportId" = c.person_id AND g."cohortId" = c.cohort_id LIMIT 1;
  END IF;
  IF v_group IS NOT NULL THEN
    SELECT count(*)::integer INTO v_group_total
    FROM public."CorporatePrayerCheckin" k
    JOIN public."CorporatePrayerSession" x ON x.id = k."sessionId"
    JOIN public."CorporatePrayerSlot" xs ON xs.id = x."slotId" AND NOT xs."isTest"
    JOIN public."GroupParticipant" gp ON gp."participantId" = k."personId" AND gp."groupId" = v_group
    WHERE k."personKind" = 'PARTICIPANT' AND k."amenAt" IS NOT NULL AND x."cohortId" = c.cohort_id AND x."prayerDate" > v_today - 7;
  END IF;

  -- Today's slots, with whether this person has finished each one.
  SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t."opensAt"), '[]'::json) INTO v_slots FROM (
    SELECT sl.id AS "slotId", sl.name, sl."slotType",
           ((v_today + sl."timeOfDay") AT TIME ZONE 'Africa/Lagos') AS "opensAt",
           ((v_today + sl."timeOfDay") AT TIME ZONE 'Africa/Lagos') + make_interval(mins => sl."joinWindowMinutes") AS "closesAt",
           x.id AS "sessionId",
           (k."amenAt" IS NOT NULL) AS amen,
           (k."sessionId" IS NOT NULL AND k."amenAt" IS NULL) AS joined
    FROM public."CorporatePrayerSlot" sl
    LEFT JOIN public."CorporatePrayerSession" x ON x."slotId" = sl.id AND x."prayerDate" = v_today
    LEFT JOIN public."CorporatePrayerCheckin" k ON k."sessionId" = x.id AND k."personKind" = c.kind AND k."personId" = c.person_id
    WHERE sl."cohortId" = c.cohort_id AND sl.active AND NOT sl."isTest"
      AND public.prayer_in_audience(sl."audienceAll", sl."hubIds", c.hub_key)
  ) t;

  RETURN json_build_object(
    'available', TRUE,
    'role', c.kind,
    'name', v_name,
    'avatarUrl', v_avatar,
    'cohortName', (SELECT co.name FROM public."Cohort" co WHERE co.id = c.cohort_id),
    'serverNow', now(),
    'today', v_today,
    'current', s.cur,
    'best', s.best,
    'total', s.total,
    'restUsed', s.rest_used,
    'prayedToday', (s.last_day = v_today),
    'days', s.days,
    'milestones', v_milestones,
    'pending', v_pending,
    'groupName', v_group_name,
    'groupWeekTotal', v_group_total,
    'programmeDays', (SELECT GREATEST(0, (co."endDate"::date - public.faith_prayers_start_date(c.cohort_id) + 1)) FROM public."Cohort" co WHERE co.id = c.cohort_id),
    'slots', v_slots);
END;
$$;

-- The person has seen the celebration. p_tell_group posts a short line to their group discussion in their name (participants only);
-- their support is told either way, once.
CREATE OR REPLACE FUNCTION public.prayer_milestone_seen(p_token text, p_milestone integer, p_tell_group boolean DEFAULT FALSE)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  c record;
  m public."PrayerMilestone";
  v_group uuid;
  v_support uuid;
  v_first text;
  v_line text;
  v_url text;
  v_key text;
BEGIN
  SELECT * INTO c FROM public.prayer_caller(p_token);
  IF c.person_id IS NULL THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  SELECT * INTO m FROM public."PrayerMilestone" WHERE "personKind" = c.kind AND "personId" = c.person_id AND "cohortId" = c.cohort_id AND milestone = p_milestone FOR UPDATE;
  IF m.milestone IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;

  -- The celebration shows the highest badge; any lower one reached in the same stretch counts as seen with it.
  UPDATE public."PrayerMilestone" SET "seenAt" = COALESCE("seenAt", now())
  WHERE "personKind" = c.kind AND "personId" = c.person_id AND "cohortId" = c.cohort_id AND milestone <= p_milestone;

  IF c.kind = 'PARTICIPANT' THEN
    SELECT g.id, g."supportId" INTO v_group, v_support FROM public."GroupParticipant" gp JOIN public."Group" g ON g.id = gp."groupId"
    WHERE gp."participantId" = c.person_id AND g."cohortId" = c.cohort_id LIMIT 1;
    SELECT COALESCE(NULLIF(split_part(btrim(p."fullName"), ' ', 1), ''), 'A participant') INTO v_first FROM public."Participant" p WHERE p.id = c.person_id;
    v_line := CASE WHEN p_milestone = 70 THEN 'on every prayer day of the programme' ELSE p_milestone || ' days in a row' END;

    IF COALESCE(p_tell_group, FALSE) AND v_group IS NOT NULL AND m."toldGroupAt" IS NULL THEN
      INSERT INTO public."GroupPost" ("groupId", "authorParticipantId", body)
      VALUES (v_group, c.person_id, 'I have prayed ' || v_line || ' with the group. Thank you for praying with me.');
      UPDATE public."PrayerMilestone" SET "toldGroupAt" = now() WHERE "personKind" = c.kind AND "personId" = c.person_id AND "cohortId" = c.cohort_id AND milestone = p_milestone;
    END IF;

    IF v_support IS NOT NULL AND m."supportNotifiedAt" IS NULL THEN
      UPDATE public."PrayerMilestone" SET "supportNotifiedAt" = now() WHERE "personKind" = c.kind AND "personId" = c.person_id AND "cohortId" = c.cohort_id AND milestone = p_milestone;
      SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'project_url';
      SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'push_reminders_service_key';
      IF v_url IS NOT NULL AND v_key IS NOT NULL THEN
        PERFORM net.http_post(
          url := v_url || '/functions/v1/notify-users',
          headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', v_key, 'Authorization', 'Bearer ' || v_key),
          body := jsonb_build_object('userIds', to_jsonb(ARRAY[v_support]), 'title', v_first || ' has prayed ' || v_line,
                                     'body', 'A prayer milestone in your group.', 'path', '/support/participants', 'type', 'CORPORATE_PRAYER'),
          timeout_milliseconds := 25000);
      END IF;
    END IF;
  END IF;

  RETURN json_build_object('ok', TRUE);
END;
$$;

REVOKE ALL ON FUNCTION public.prayer_streak_calc(text, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prayer_streak(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prayer_milestone_seen(text, integer, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prayer_streak(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prayer_milestone_seen(text, integer, boolean) TO anon, authenticated;
