-- After a Sunday, only admins change class attendance (FLOW_MAP rule 12).
--
-- Before this, a support could still move an Absent mark to Late or Left early after the register was finalised,
-- and could change any mark once the window had closed but before it was finalised. Now a support (anyone who is
-- not an admin) cannot change a class's marks once it is locked:
--   * the register is finalised, or
--   * its timed window has closed, or
--   * its class day has passed (Lagos time),
-- unless an admin has reopened it and the fresh window is still running. Admins (`app_is_admin`) are unaffected.
-- The background jobs only insert rows, so the update trigger does not touch them.
--
-- Rollback: re-apply `mark_shared_attendance` and `enforce_attendance_record_lock` from
-- 20260923000000_sunday_attendance_late_rule.sql, then DROP FUNCTION public.attendance_week_locked(integer).

-- Whether a week's class register is closed to supports right now.
CREATE OR REPLACE FUNCTION public.attendance_week_locked(p_week_id INTEGER)
 RETURNS BOOLEAN
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT CASE
    -- A running window (first start or an admin reopen) is open to supports.
    WHEN s."startedAt" IS NOT NULL AND s."finalizedAt" IS NULL AND s."closesAt" > NOW() THEN FALSE
    WHEN s."finalizedAt" IS NOT NULL THEN TRUE
    WHEN s."closesAt" IS NOT NULL AND s."closesAt" <= NOW() THEN TRUE
    ELSE public.week_class_date(c."startDate", w."weekNumber", w."classDate") < (NOW() AT TIME ZONE 'Africa/Lagos')::date
  END
  FROM public."Week" w
  JOIN public."Cohort" c ON c.id = w."cohortId"
  LEFT JOIN public."AttendanceSession" s ON s."weekId" = w.id
  WHERE w.id = p_week_id;
$function$;

REVOKE ALL ON FUNCTION public.attendance_week_locked(INTEGER) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.mark_shared_attendance(p_participant_id uuid, p_week_id integer, p_status text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor_id UUID;
  v_cohort_id UUID;
  v_record public."AttendanceRecord";
BEGIN
  IF NOT public.app_is_staff() THEN
    RAISE EXCEPTION 'You must be signed in as a support or admin to mark attendance';
  END IF;

  IF p_status NOT IN ('PRESENT', 'ABSENT', 'LATE', 'LEFT_EARLY', 'EXCUSED') THEN
    RAISE EXCEPTION 'Invalid attendance status';
  END IF;

  SELECT w."cohortId" INTO v_cohort_id
  FROM public."Week" w
  WHERE w.id = p_week_id;
  IF v_cohort_id IS NULL THEN
    RAISE EXCEPTION 'Attendance week was not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public."Participant" p
    WHERE p.id = p_participant_id
      AND p."cohortId" = v_cohort_id
      AND p.status = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'This participant is not in the active attendance list';
  END IF;

  IF NOT public.app_is_admin() AND COALESCE(public.attendance_week_locked(p_week_id), FALSE) THEN
    RAISE EXCEPTION 'ATTENDANCE_LOCKED: Attendance for this class is closed. To dispute a mark, message an admin.';
  END IF;

  INSERT INTO public."AttendanceSession" ("weekId") VALUES (p_week_id)
  ON CONFLICT ("weekId") DO NOTHING;

  v_actor_id := public.attendance_session_actor_id();
  INSERT INTO public."AttendanceRecord" ("participantId", "weekId", status, "markedById", "markedAt")
  VALUES (p_participant_id, p_week_id, p_status, v_actor_id, NOW())
  ON CONFLICT ("participantId", "weekId") DO UPDATE
    SET status = EXCLUDED.status,
        "markedById" = EXCLUDED."markedById",
        "markedAt" = EXCLUDED."markedAt"
  RETURNING * INTO v_record;

  UPDATE public."AttendanceSession" SET "updatedAt" = NOW() WHERE "weekId" = p_week_id;

  RETURN jsonb_build_object(
    'id', v_record.id,
    'participantId', v_record."participantId",
    'weekId', v_record."weekId",
    'status', v_record.status,
    'markedById', v_record."markedById",
    'markedAt', v_record."markedAt",
    'lateExcused', v_record."lateExcused"
  );
END;
$function$;

-- The same rule on any direct update of a record.
CREATE OR REPLACE FUNCTION public.enforce_attendance_record_lock()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT public.app_is_admin() AND COALESCE(public.attendance_week_locked(NEW."weekId"), FALSE) THEN
    RAISE EXCEPTION 'ATTENDANCE_LOCKED: Attendance for this class is closed. To dispute a mark, message an admin.';
  END IF;
  RETURN NEW;
END;
$function$;
