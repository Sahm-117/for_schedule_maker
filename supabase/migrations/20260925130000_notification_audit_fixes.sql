-- Notification audit fixes (see the notification audit artifact). Changes in
-- this file, each a CREATE OR REPLACE of the current live definition with
-- only the described change:
--
-- 1. class_start_time AppSetting: powers the Sat/Sun participant nudges'
--    "FOF class is at {time}" text (Settings > Programme > Timings). Default
--    '09:30' matches every live "Class N" Sunday activity's time.
-- 2. acknowledge_hub_message (from 20260925010000_hub_ack_notify_author.sql):
--    the push+bell title sent to a message's author now reads "{member name}
--    acknowledged your Hub message" instead of "{member name} got your
--    message" -- wording only, no behaviour change.
-- 3. notify_attendance_report (from 20260923000000_sunday_attendance_late_rule.sql):
--    used to insert the support-facing attendance report straight into
--    "Notification" (bell only, no push). It now posts to the notify-users
--    edge function instead, the same vault-secret + net.http_post pattern
--    invoke_attendance_absence_push (same migration) already uses -- that
--    function writes the in-app Notification row itself for a userIds
--    payload, so this function no longer inserts into "Notification"
--    directly (that would double up the bell row).

-- 1. Sunday class start time (Settings > Programme > Timings).
INSERT INTO "AppSetting" ("settingKey", value)
VALUES ('class_start_time', '"09:30"'::jsonb)
ON CONFLICT ("settingKey") DO NOTHING;

-- 2. acknowledge_hub_message: title wording only.
CREATE OR REPLACE FUNCTION public.acknowledge_hub_message(p_message_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_id UUID;
  v_hub_id UUID;
  v_author_id UUID;
  v_subject TEXT;
  v_actor_name TEXT;
  v_inserted INTEGER;
BEGIN
  IF NOT public.app_is_staff() THEN
    RAISE EXCEPTION 'You must be signed in as a support or admin';
  END IF;
  v_actor_id := public.app_current_user_id();

  SELECT "hubId", "authorId", subject INTO v_hub_id, v_author_id, v_subject
  FROM public."HubMessage" WHERE id = p_message_id;
  IF v_hub_id IS NULL THEN
    RAISE EXCEPTION 'Message was not found';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public."HubMembership" WHERE "hubId" = v_hub_id AND "userId" = v_actor_id) THEN
    RAISE EXCEPTION 'You must be a member of this hub to acknowledge its messages';
  END IF;

  INSERT INTO public."HubMessageAck" ("messageId", "userId")
  VALUES (p_message_id, v_actor_id)
  ON CONFLICT ("messageId", "userId") DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_inserted > 0 AND v_author_id IS NOT NULL AND v_author_id <> v_actor_id THEN
    SELECT name INTO v_actor_name FROM public."User" WHERE id = v_actor_id;
    PERFORM public.invoke_hub_message_push(
      ARRAY[v_author_id],
      COALESCE(v_actor_name, 'A member') || ' acknowledged your Hub message',
      v_subject
    );
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.acknowledge_hub_message(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.acknowledge_hub_message(UUID) TO anon, authenticated;

-- 3. notify_attendance_report: push+bell via notify-users, instead of a
-- direct bell-only "Notification" insert.
CREATE OR REPLACE FUNCTION public.notify_attendance_report(p_week_id INTEGER)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_cohort_id UUID;
  v_week_number INTEGER;
  v_attended_count INTEGER;
  v_absent_count INTEGER;
  v_already_notified_at TIMESTAMPTZ;
  v_title TEXT;
  v_body TEXT;
  v_user_ids UUID[];
  v_url text;
  v_key text;
BEGIN
  SELECT w."cohortId", w."weekNumber", s."reportNotifiedAt"
  INTO v_cohort_id, v_week_number, v_already_notified_at
  FROM public."Week" w
  JOIN public."AttendanceSession" s ON s."weekId" = w.id
  WHERE w.id = p_week_id
  FOR UPDATE OF s;

  IF v_cohort_id IS NULL OR v_already_notified_at IS NOT NULL THEN RETURN; END IF;

  SELECT
    COUNT(*) FILTER (WHERE a.status = 'PRESENT' OR (a.status IN ('LATE', 'LEFT_EARLY') AND a."lateExcused")),
    COUNT(*) FILTER (WHERE a.status = 'ABSENT')
  INTO v_attended_count, v_absent_count
  FROM public."AttendanceRecord" a
  JOIN public."Participant" p ON p.id = a."participantId"
  WHERE a."weekId" = p_week_id AND p."cohortId" = v_cohort_id AND p.status = 'ACTIVE';

  UPDATE public."AttendanceSession"
  SET "reportNotifiedAt" = NOW(), "updatedAt" = NOW()
  WHERE "weekId" = p_week_id;

  SELECT array_agg(DISTINCT u.id) INTO v_user_ids
  FROM public."Group" g
  JOIN public."User" u ON u.id = g."supportId"
  WHERE g."cohortId" = v_cohort_id
    AND u.role = 'SUPPORT'
    AND u."isActive" IS NOT FALSE;

  IF v_user_ids IS NULL OR array_length(v_user_ids, 1) IS NULL THEN RETURN; END IF;

  v_title := format('Attendance report · Week %s', v_week_number);
  v_body := format('%s attended · %s absent. Open your schedule for any follow-up assigned to you.', v_attended_count, v_absent_count);

  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'project_url';
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'push_reminders_service_key';

  IF v_url IS NULL OR v_key IS NULL THEN
    -- No push possible: still write the bell rows so nobody misses the report.
    RAISE NOTICE 'notify_attendance_report: vault secrets missing; bell only';
    INSERT INTO public."Notification" ("userId", title, body, path, type)
    SELECT uid, v_title, v_body, '/support/attendance', 'ATTENDANCE_REPORT' FROM unnest(v_user_ids) AS uid;
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := v_url || '/functions/v1/notify-users',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', v_key,
      'Authorization', 'Bearer ' || v_key
    ),
    body := jsonb_build_object(
      'userIds', to_jsonb(v_user_ids),
      'title', v_title,
      'body', v_body,
      'path', '/support/attendance',
      'type', 'ATTENDANCE_REPORT'
    ),
    timeout_milliseconds := 25000
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.notify_attendance_report(INTEGER) FROM PUBLIC;
