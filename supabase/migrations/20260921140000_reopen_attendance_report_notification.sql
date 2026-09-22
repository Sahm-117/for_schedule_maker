-- A reopened register is a new report cycle. Clearing this marker lets the
-- corrected report notify supports again when the admin sends it.

CREATE OR REPLACE FUNCTION public.reopen_shared_attendance(p_week_id INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE v_session public."AttendanceSession";
BEGIN
  IF NOT public.attendance_session_actor_is_admin() THEN RAISE EXCEPTION 'Only admins can reopen attendance'; END IF;
  UPDATE public."AttendanceSession"
  SET "finalizedAt" = NULL,
      "finalizedById" = NULL,
      "finalizationMethod" = NULL,
      "reportNotifiedAt" = NULL,
      "reopenedAt" = NOW(),
      "reopenedById" = public.attendance_session_actor_id(),
      "updatedAt" = NOW()
  WHERE "weekId" = p_week_id
  RETURNING * INTO v_session;
  IF v_session.id IS NULL THEN RAISE EXCEPTION 'Attendance session was not found'; END IF;

  UPDATE public."AttendanceFollowUpTask"
  SET status = 'CANCELLED', "updatedAt" = NOW()
  WHERE "weekId" = p_week_id AND status = 'OPEN';

  RETURN jsonb_build_object('weekId', v_session."weekId", 'autoFinalizeAtNoon', v_session."autoFinalizeAtNoon", 'finalizedAt', v_session."finalizedAt", 'finalizedById', v_session."finalizedById", 'finalizationMethod', v_session."finalizationMethod", 'reopenedAt', v_session."reopenedAt");
END;
$function$;
