-- Attendance follow-up tasks are created when a Sunday register is finalised.
-- A task belongs to the absent participant's assigned group support, rather
-- than to whichever support happened to take the attendance register.

CREATE TABLE IF NOT EXISTS public."AttendanceFollowUpTask" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "attendanceRecordId" UUID NOT NULL UNIQUE REFERENCES public."AttendanceRecord"(id) ON DELETE CASCADE,
  "participantId" UUID NOT NULL REFERENCES public."Participant"(id) ON DELETE CASCADE,
  "weekId" INTEGER NOT NULL REFERENCES public."Week"(id) ON DELETE CASCADE,
  "supportId" UUID NOT NULL REFERENCES public."User"(id) ON DELETE CASCADE,
  "dueAt" TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'DONE', 'CANCELLED')),
  "completedAt" TIMESTAMPTZ,
  "completedById" UUID REFERENCES public."User"(id) ON DELETE SET NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attendance_follow_up_support_week
  ON public."AttendanceFollowUpTask"("supportId", "weekId", status);
CREATE INDEX IF NOT EXISTS idx_attendance_follow_up_week
  ON public."AttendanceFollowUpTask"("weekId", status);

ALTER TABLE public."AttendanceFollowUpTask" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff can read attendance follow-up tasks" ON public."AttendanceFollowUpTask";
CREATE POLICY "Staff can read attendance follow-up tasks"
  ON public."AttendanceFollowUpTask" FOR SELECT
  USING (public.app_is_staff());
GRANT SELECT ON public."AttendanceFollowUpTask" TO anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public."AttendanceFollowUpTask" FROM anon, authenticated;

-- Cancel open work from a reopened/changed register, then reopen or create one
-- task for each currently absent participant with an active assigned support.
CREATE OR REPLACE FUNCTION public.sync_attendance_follow_up_tasks(p_week_id INTEGER)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_cohort_id UUID;
  v_sunday_date DATE;
  v_due_at TIMESTAMPTZ;
  v_absence RECORD;
  v_support_id UUID;
BEGIN
  SELECT w."cohortId", c."startDate" + ((w."weekNumber" - 1) * 7)
  INTO v_cohort_id, v_sunday_date
  FROM public."Week" w
  JOIN public."Cohort" c ON c.id = w."cohortId"
  WHERE w.id = p_week_id;
  IF v_cohort_id IS NULL THEN
    RAISE EXCEPTION 'Attendance week was not found';
  END IF;

  -- Monday morning gives the assigned support a clear, actionable follow-up
  -- slot after Sunday class without depending on a browser's timezone.
  v_due_at := ((v_sunday_date + 1)::timestamp + TIME '09:00') AT TIME ZONE 'Africa/Lagos';

  UPDATE public."AttendanceFollowUpTask"
  SET status = 'CANCELLED', "updatedAt" = NOW()
  WHERE "weekId" = p_week_id AND status = 'OPEN';

  FOR v_absence IN
    SELECT a.id AS attendance_record_id, a."participantId"
    FROM public."AttendanceRecord" a
    JOIN public."Participant" p ON p.id = a."participantId"
    WHERE a."weekId" = p_week_id
      AND a.status = 'ABSENT'
      AND p."cohortId" = v_cohort_id
      AND p.status = 'ACTIVE'
  LOOP
    SELECT g."supportId" INTO v_support_id
    FROM public."GroupParticipant" gp
    JOIN public."Group" g ON g.id = gp."groupId" AND g."cohortId" = v_cohort_id
    JOIN public."User" u ON u.id = g."supportId" AND u."isActive" IS NOT FALSE
    WHERE gp."participantId" = v_absence."participantId"
    LIMIT 1;

    IF v_support_id IS NOT NULL THEN
      INSERT INTO public."AttendanceFollowUpTask" (
        "attendanceRecordId", "participantId", "weekId", "supportId", "dueAt"
      ) VALUES (
        v_absence.attendance_record_id, v_absence."participantId", p_week_id, v_support_id, v_due_at
      )
      ON CONFLICT ("attendanceRecordId") DO UPDATE
        SET "supportId" = EXCLUDED."supportId",
            "dueAt" = EXCLUDED."dueAt",
            status = CASE
              WHEN public."AttendanceFollowUpTask".status = 'DONE' THEN 'DONE'
              ELSE 'OPEN'
            END,
            "updatedAt" = NOW();
    END IF;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.complete_attendance_follow_up_task(
  p_task_id UUID,
  p_done BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_id UUID;
  v_task public."AttendanceFollowUpTask";
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

  UPDATE public."AttendanceFollowUpTask"
  SET status = CASE WHEN p_done THEN 'DONE' ELSE 'OPEN' END,
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
    'completedAt', v_task."completedAt"
  );
END;
$function$;

-- Re-declare the finalisation functions so both manual and noon finalisation
-- synchronise absence follow-ups as one atomic attendance outcome.
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
  v_actor_id := public.attendance_session_actor_id();
  UPDATE public."AttendanceSession"
  SET "finalizedAt" = COALESCE("finalizedAt", NOW()),
      "finalizedById" = COALESCE("finalizedById", v_actor_id),
      "finalizationMethod" = COALESCE("finalizationMethod", 'MANUAL'),
      "updatedAt" = NOW()
  WHERE "weekId" = p_week_id
  RETURNING * INTO v_session;

  PERFORM public.sync_attendance_follow_up_tasks(p_week_id);
  RETURN jsonb_build_object('weekId', v_session."weekId", 'autoFinalizeAtNoon', v_session."autoFinalizeAtNoon", 'finalizedAt', v_session."finalizedAt", 'finalizedById', v_session."finalizedById", 'finalizationMethod', v_session."finalizationMethod", 'reopenedAt', v_session."reopenedAt");
END;
$function$;

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
  SET "finalizedAt" = NULL, "finalizedById" = NULL, "finalizationMethod" = NULL,
      "reopenedAt" = NOW(), "reopenedById" = public.attendance_session_actor_id(), "updatedAt" = NOW()
  WHERE "weekId" = p_week_id RETURNING * INTO v_session;
  IF v_session.id IS NULL THEN RAISE EXCEPTION 'Attendance session was not found'; END IF;
  UPDATE public."AttendanceFollowUpTask" SET status = 'CANCELLED', "updatedAt" = NOW()
  WHERE "weekId" = p_week_id AND status = 'OPEN';
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
    IF FOUND THEN PERFORM public.sync_attendance_follow_up_tasks(v_week_id); END IF;
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.sync_attendance_follow_up_tasks(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_attendance_follow_up_task(UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_attendance_follow_up_task(UUID, BOOLEAN) TO anon, authenticated;
