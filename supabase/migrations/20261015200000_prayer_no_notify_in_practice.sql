-- Practice cohorts never send slot-time prayer notifications. Practice is a sandbox, but real supports and admins are enrolled in it,
-- so its prayer times were pinging real phones. The admin "send test prayer" button (practice_send_test_prayer) is unaffected.
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
  IF NOT EXISTS (SELECT 1 FROM public."CorporatePrayerSlot" sl WHERE sl.active AND sl.notify AND NOT sl."isTest"
                 AND NOT public.prayer_is_practice(sl."cohortId")) THEN RETURN 0; END IF;
  -- Without the secrets nothing can be sent, so leave every slot unclaimed and try again next minute.
  IF NOT public.prayer_notify_ready() THEN RETURN 0; END IF;
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
    v_body := CASE WHEN s."slotType" = 'LIVE' THEN 'The live prayer is on. Tap to join.'
                   ELSE format('%s prayer is open. Join for %s minutes.', COALESCE(s.name, to_char(s."timeOfDay", 'HH24:MI')), s."timerMinutes") END;
    PERFORM public.invoke_prayer_notify(v_participants, v_users, 'Time to pray', v_body);
    v_sent := v_sent + 1;
  END LOOP;
  RETURN v_sent;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_prayer_slots() FROM PUBLIC, anon, authenticated;
