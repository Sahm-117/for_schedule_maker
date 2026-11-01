-- Reopening a class register now needs a reason, keeps it, and tells that cohort's supports it is open again
-- (admin review, Attendance 3). Same reopen as before (fresh window, follow-up tasks cancelled, report flag cleared);
-- only admins can call it, as before. Admins were never held by attendance_week_locked, so nothing about the lock
-- changes: it still lets supports in only while the fresh window runs.
--   * AttendanceSession."reopenReason" holds the latest reason (who and when are the existing reopenedById and reopenedAt).
--   * reopen_shared_attendance(week, reason) is the new action. It rejects an empty reason.
--   * The old one-argument reopen_shared_attendance(week) is kept for app tabs opened before this release; it reopens
--     with a placeholder reason. The current app always sends a reason.
--   * The notice goes to the cohort's group supports (the same people as the attendance report; test accounts left out),
--     bell row plus push through notify-users, the way notify_attendance_report sends. The reason is not put in the notice.
--
-- Rollback:
--   DROP FUNCTION public.reopen_shared_attendance(integer, text);
--   (then re-run the reopen_shared_attendance(integer) definition from 20261016200000_attendance_report_role_fix_and_reopen_window.sql)
--   ALTER TABLE public."AttendanceSession" DROP COLUMN "reopenReason";

ALTER TABLE public."AttendanceSession" ADD COLUMN IF NOT EXISTS "reopenReason" TEXT;

CREATE OR REPLACE FUNCTION public.reopen_shared_attendance(p_week_id integer, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_session public."AttendanceSession";
  v_window_minutes INTEGER;
  v_reason TEXT := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_cohort_id UUID;
  v_week_number INTEGER;
  v_user_ids UUID[];
  v_title TEXT;
  v_body TEXT;
  v_url text;
  v_key text;
BEGIN
  IF NOT public.attendance_session_actor_is_admin() THEN RAISE EXCEPTION 'Only admins can reopen attendance'; END IF;
  IF v_reason IS NULL THEN RAISE EXCEPTION 'Give a reason for reopening attendance'; END IF;
  v_reason := left(v_reason, 500);

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
      "reopenReason" = v_reason,
      "updatedAt" = NOW()
  WHERE "weekId" = p_week_id
  RETURNING * INTO v_session;
  IF v_session.id IS NULL THEN RAISE EXCEPTION 'Attendance session was not found'; END IF;

  UPDATE public."AttendanceFollowUpTask"
  SET status = 'CANCELLED', "updatedAt" = NOW()
  WHERE "weekId" = p_week_id AND status = 'OPEN';

  -- Tell the cohort's supports the class is open again.
  SELECT w."cohortId", w."weekNumber" INTO v_cohort_id, v_week_number
  FROM public."Week" w WHERE w.id = p_week_id;

  SELECT array_agg(DISTINCT u.id) INTO v_user_ids
  FROM public."Group" g
  JOIN public."User" u ON u.id = g."supportId"
  WHERE g."cohortId" = v_cohort_id
    AND (u.role = 'SUPPORT' OR 'SUPPORT'::public."Role" = ANY(u.roles))
    AND u."isActive" IS NOT FALSE
    AND COALESCE(u."isTest", FALSE) = FALSE;

  IF v_user_ids IS NOT NULL AND array_length(v_user_ids, 1) IS NOT NULL THEN
    v_title := format('Attendance reopened · Week %s', v_week_number);
    v_body := 'An admin reopened this class''s register. Open Attendance to check or update your group''s marks.';

    SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'project_url';
    SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'push_reminders_service_key';

    IF v_url IS NULL OR v_key IS NULL THEN
      -- No push possible: still write the bell rows.
      RAISE NOTICE 'reopen_shared_attendance: vault secrets missing; bell only';
      INSERT INTO public."Notification" ("userId", title, body, path, type)
      SELECT uid, v_title, v_body, '/support/attendance', 'ATTENDANCE_REPORT' FROM unnest(v_user_ids) AS uid;
    ELSE
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
    END IF;
  END IF;

  RETURN jsonb_build_object('weekId', v_session."weekId", 'autoFinalizeAtNoon', v_session."autoFinalizeAtNoon", 'finalizedAt', v_session."finalizedAt", 'finalizedById', v_session."finalizedById", 'finalizationMethod', v_session."finalizationMethod", 'reopenedAt', v_session."reopenedAt", 'reopenReason', v_session."reopenReason", 'startedAt', v_session."startedAt", 'closesAt', v_session."closesAt");
END;
$function$;

REVOKE ALL ON FUNCTION public.reopen_shared_attendance(integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reopen_shared_attendance(integer, text) TO anon, authenticated;

-- The old one-argument action (an app tab opened before this release) still reopens, with a placeholder reason.
CREATE OR REPLACE FUNCTION public.reopen_shared_attendance(p_week_id integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  RETURN public.reopen_shared_attendance(p_week_id, 'Reopened from an older version of the app (no reason given)');
END;
$function$;
