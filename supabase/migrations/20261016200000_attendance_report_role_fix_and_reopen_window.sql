-- Two attendance fixes.
--
-- 1. notify_attendance_report ran with an empty search_path but wrote 'SUPPORT'::"Role" unqualified (introduced in
--    20261006120000_admin_support_tag_in_jobs.sql), so it failed with 'type "Role" does not exist'. close_attendance_windows calls it, so
--    the every-minute job rolled back on the first real Sunday window: the register never closed, unmarked people never became Absent,
--    and the page treated the register as locked by the clock while the database still allowed edits.
-- 2. reopen_shared_attendance cleared finalizedAt but left closesAt in the past, so the per-minute job simply finalised the week again
--    within a minute and "Reopen" did nothing. A reopen of a week that had a timed window now starts a fresh one (the programme's attendance
--    window length); a week that never had a timed window (closesAt NULL) reopens exactly as before and stays open until finalised.
CREATE OR REPLACE FUNCTION public.notify_attendance_report(p_week_id integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
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
    AND (u.role = 'SUPPORT' OR 'SUPPORT'::public."Role" = ANY(u.roles))
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

CREATE OR REPLACE FUNCTION public.reopen_shared_attendance(p_week_id integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_session public."AttendanceSession";
  v_window_minutes INTEGER;
BEGIN
  IF NOT public.attendance_session_actor_is_admin() THEN RAISE EXCEPTION 'Only admins can reopen attendance'; END IF;

  SELECT COALESCE((value->>'attendanceWindowMinutes')::INTEGER, 15)
  INTO v_window_minutes
  FROM public."AppSetting" WHERE "settingKey" = 'programme_rules';
  v_window_minutes := GREATEST(1, COALESCE(v_window_minutes, 15));

  UPDATE public."AttendanceSession"
  SET "finalizedAt" = NULL,
      "finalizedById" = NULL,
      "finalizationMethod" = NULL,
      "reportNotifiedAt" = NULL,
      "closesAt" = CASE WHEN "closesAt" IS NOT NULL THEN NOW() + make_interval(mins => v_window_minutes) END,
      "reopenedAt" = NOW(),
      "reopenedById" = public.attendance_session_actor_id(),
      "updatedAt" = NOW()
  WHERE "weekId" = p_week_id
  RETURNING * INTO v_session;
  IF v_session.id IS NULL THEN RAISE EXCEPTION 'Attendance session was not found'; END IF;

  UPDATE public."AttendanceFollowUpTask"
  SET status = 'CANCELLED', "updatedAt" = NOW()
  WHERE "weekId" = p_week_id AND status = 'OPEN';

  RETURN jsonb_build_object('weekId', v_session."weekId", 'autoFinalizeAtNoon', v_session."autoFinalizeAtNoon", 'finalizedAt', v_session."finalizedAt", 'finalizedById', v_session."finalizedById", 'finalizationMethod', v_session."finalizationMethod", 'reopenedAt', v_session."reopenedAt", 'startedAt', v_session."startedAt", 'closesAt', v_session."closesAt");
END;
$function$;
