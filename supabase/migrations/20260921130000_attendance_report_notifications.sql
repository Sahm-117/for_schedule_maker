-- Attendance reports notify every active support serving the cohort. They also
-- require a short outcome note before an assigned follow-up can be completed.

ALTER TABLE public."AttendanceFollowUpTask"
  ADD COLUMN IF NOT EXISTS "completionNote" TEXT;

ALTER TABLE public."AttendanceSession"
  ADD COLUMN IF NOT EXISTS "reportNotifiedAt" TIMESTAMPTZ;

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
BEGIN
  SELECT w."cohortId", w."weekNumber", s."reportNotifiedAt"
  INTO v_cohort_id, v_week_number, v_already_notified_at
  FROM public."Week" w
  JOIN public."AttendanceSession" s ON s."weekId" = w.id
  WHERE w.id = p_week_id
  FOR UPDATE OF s;

  IF v_cohort_id IS NULL OR v_already_notified_at IS NOT NULL THEN RETURN; END IF;

  SELECT
    COUNT(*) FILTER (WHERE a.status IN ('PRESENT', 'LATE')),
    COUNT(*) FILTER (WHERE a.status = 'ABSENT')
  INTO v_attended_count, v_absent_count
  FROM public."AttendanceRecord" a
  JOIN public."Participant" p ON p.id = a."participantId"
  WHERE a."weekId" = p_week_id AND p."cohortId" = v_cohort_id AND p.status = 'ACTIVE';

  UPDATE public."AttendanceSession"
  SET "reportNotifiedAt" = NOW(), "updatedAt" = NOW()
  WHERE "weekId" = p_week_id;

  INSERT INTO public."Notification" ("userId", title, body, path, type)
  SELECT DISTINCT
    u.id,
    format('Attendance report · Week %s', v_week_number),
    format('%s attended · %s absent. Open your schedule for any follow-up assigned to you.', v_attended_count, v_absent_count),
    '/support/attendance',
    'ATTENDANCE_REPORT'
  FROM public."Group" g
  JOIN public."User" u ON u.id = g."supportId"
  WHERE g."cohortId" = v_cohort_id
    AND u.role = 'SUPPORT'
    AND u."isActive" IS NOT FALSE;
END;
$function$;

DROP FUNCTION IF EXISTS public.complete_attendance_follow_up_task(UUID, BOOLEAN);
CREATE OR REPLACE FUNCTION public.complete_attendance_follow_up_task(
  p_task_id UUID,
  p_done BOOLEAN,
  p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_id UUID;
  v_task public."AttendanceFollowUpTask";
  v_note TEXT;
BEGIN
  IF NOT public.app_is_staff() THEN
    RAISE EXCEPTION 'You must be signed in as a support or admin to update this task';
  END IF;

  v_actor_id := public.attendance_session_actor_id();
  SELECT * INTO v_task FROM public."AttendanceFollowUpTask" WHERE id = p_task_id;
  IF v_task.id IS NULL THEN RAISE EXCEPTION 'Attendance follow-up task was not found'; END IF;
  IF v_task.status = 'CANCELLED' THEN RAISE EXCEPTION 'This attendance follow-up task was cancelled'; END IF;
  IF v_task."supportId" <> v_actor_id AND NOT public.attendance_session_actor_is_admin() THEN
    RAISE EXCEPTION 'This follow-up is assigned to another support';
  END IF;

  v_note := NULLIF(BTRIM(COALESCE(p_note, '')), '');
  IF p_done AND v_note IS NULL THEN
    RAISE EXCEPTION 'Add a note explaining the absence before marking this follow-up done';
  END IF;

  UPDATE public."AttendanceFollowUpTask"
  SET status = CASE WHEN p_done THEN 'DONE' ELSE 'OPEN' END,
      "completionNote" = CASE WHEN p_done THEN v_note ELSE NULL END,
      "completedAt" = CASE WHEN p_done THEN NOW() ELSE NULL END,
      "completedById" = CASE WHEN p_done THEN v_actor_id ELSE NULL END,
      "updatedAt" = NOW()
  WHERE id = p_task_id
  RETURNING * INTO v_task;

  RETURN jsonb_build_object(
    'id', v_task.id,
    'attendanceRecordId', v_task."attendanceRecordId",
    'participantId', v_task."participantId",
    'weekId', v_task."weekId",
    'supportId', v_task."supportId",
    'dueAt', v_task."dueAt",
    'status', v_task.status,
    'completedAt', v_task."completedAt",
    'completionNote', v_task."completionNote"
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.finalize_shared_attendance(p_week_id INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_id UUID;
  v_cohort_id UUID;
  v_expected_count INTEGER;
  v_marked_count INTEGER;
  v_was_finalized BOOLEAN;
  v_session public."AttendanceSession";
BEGIN
  IF NOT public.app_is_staff() THEN RAISE EXCEPTION 'You must be signed in as a support or admin to finalise attendance'; END IF;
  SELECT "cohortId" INTO v_cohort_id FROM public."Week" WHERE id = p_week_id;
  IF v_cohort_id IS NULL THEN RAISE EXCEPTION 'Attendance week was not found'; END IF;
  SELECT COUNT(*) INTO v_expected_count FROM public."Participant" WHERE "cohortId" = v_cohort_id AND status = 'ACTIVE';
  SELECT COUNT(*) INTO v_marked_count
  FROM public."AttendanceRecord" a JOIN public."Participant" p ON p.id = a."participantId"
  WHERE a."weekId" = p_week_id AND p."cohortId" = v_cohort_id AND p.status = 'ACTIVE';
  IF v_expected_count = 0 OR v_marked_count <> v_expected_count THEN RAISE EXCEPTION 'Mark every participant before finalising attendance'; END IF;

  INSERT INTO public."AttendanceSession" ("weekId") VALUES (p_week_id) ON CONFLICT ("weekId") DO NOTHING;
  SELECT "finalizedAt" IS NOT NULL INTO v_was_finalized FROM public."AttendanceSession" WHERE "weekId" = p_week_id FOR UPDATE;
  v_actor_id := public.attendance_session_actor_id();
  UPDATE public."AttendanceSession"
  SET "finalizedAt" = COALESCE("finalizedAt", NOW()),
      "finalizedById" = COALESCE("finalizedById", v_actor_id),
      "finalizationMethod" = COALESCE("finalizationMethod", 'MANUAL'),
      "updatedAt" = NOW()
  WHERE "weekId" = p_week_id
  RETURNING * INTO v_session;

  PERFORM public.sync_attendance_follow_up_tasks(p_week_id);
  IF NOT v_was_finalized THEN PERFORM public.notify_attendance_report(p_week_id); END IF;
  RETURN jsonb_build_object('weekId', v_session."weekId", 'autoFinalizeAtNoon', v_session."autoFinalizeAtNoon", 'finalizedAt', v_session."finalizedAt", 'finalizedById', v_session."finalizedById", 'finalizationMethod', v_session."finalizationMethod", 'reopenedAt', v_session."reopenedAt");
END;
$function$;

CREATE OR REPLACE FUNCTION public.auto_finalize_sunday_attendance()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE v_week_id INTEGER;
BEGIN
  FOR v_week_id IN
    SELECT w.id
    FROM public."Week" w
    JOIN public."Cohort" c ON c.id = w."cohortId"
    LEFT JOIN public."AttendanceSession" s ON s."weekId" = w.id
    WHERE COALESCE(s."autoFinalizeAtNoon", TRUE) AND s."finalizedAt" IS NULL
      AND (timezone('Africa/Lagos', NOW()))::date = c."startDate" + ((w."weekNumber" - 1) * 7)
      AND (timezone('Africa/Lagos', NOW()))::time >= TIME '12:00'
      AND EXISTS (SELECT 1 FROM public."Participant" p WHERE p."cohortId" = c.id AND p.status = 'ACTIVE')
      AND NOT EXISTS (
        SELECT 1 FROM public."Participant" p
        WHERE p."cohortId" = c.id AND p.status = 'ACTIVE'
          AND NOT EXISTS (SELECT 1 FROM public."AttendanceRecord" a WHERE a."weekId" = w.id AND a."participantId" = p.id)
      )
  LOOP
    INSERT INTO public."AttendanceSession" ("weekId") VALUES (v_week_id) ON CONFLICT ("weekId") DO NOTHING;
    UPDATE public."AttendanceSession"
    SET "finalizedAt" = NOW(), "finalizationMethod" = 'AUTO', "updatedAt" = NOW()
    WHERE "weekId" = v_week_id AND "finalizedAt" IS NULL;
    IF FOUND THEN
      PERFORM public.sync_attendance_follow_up_tasks(v_week_id);
      PERFORM public.notify_attendance_report(v_week_id);
    END IF;
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.notify_attendance_report(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_attendance_follow_up_task(UUID, BOOLEAN, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_attendance_follow_up_task(UUID, BOOLEAN, TEXT) TO anon, authenticated;
