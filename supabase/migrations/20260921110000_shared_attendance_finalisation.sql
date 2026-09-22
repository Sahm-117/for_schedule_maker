-- Shared Sunday attendance: one cohort-wide register per programme week.
-- Supports can mark the register together; the database, not the browser clock,
-- locks a complete register once it has been finalised.

CREATE TABLE IF NOT EXISTS public."AttendanceSession" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "weekId" INTEGER NOT NULL UNIQUE REFERENCES public."Week"(id) ON DELETE CASCADE,
  "autoFinalizeAtNoon" BOOLEAN NOT NULL DEFAULT TRUE,
  "finalizedAt" TIMESTAMPTZ,
  "finalizedById" UUID REFERENCES public."User"(id) ON DELETE SET NULL,
  "finalizationMethod" TEXT CHECK ("finalizationMethod" IN ('MANUAL', 'AUTO')),
  "reopenedAt" TIMESTAMPTZ,
  "reopenedById" UUID REFERENCES public."User"(id) ON DELETE SET NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attendance_session_finalized
  ON public."AttendanceSession"("finalizedAt");

ALTER TABLE public."AttendanceSession" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff can read attendance sessions" ON public."AttendanceSession";
CREATE POLICY "Staff can read attendance sessions"
  ON public."AttendanceSession" FOR SELECT
  USING (public.app_is_staff());

-- Attendance records are now written through the RPCs below. That closes the
-- old direct-upsert escape hatch that could otherwise change a finalised sheet.
DROP POLICY IF EXISTS "Allow all operations" ON public."AttendanceRecord";
DROP POLICY IF EXISTS "Staff can read attendance records" ON public."AttendanceRecord";
CREATE POLICY "Staff can read attendance records"
  ON public."AttendanceRecord" FOR SELECT
  USING (public.app_is_staff());

GRANT SELECT ON public."AttendanceSession", public."AttendanceRecord" TO anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public."AttendanceSession", public."AttendanceRecord" FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.attendance_session_actor_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT s."userId"
  FROM public."AppSession" s
  JOIN public."User" u ON u.id = s."userId"
  WHERE s."tokenHash" = encode(extensions.digest(public.app_current_token(), 'sha256'), 'hex')
    AND s."expiresAt" > NOW()
    AND s."userId" IS NOT NULL
    AND u."isActive" IS NOT FALSE
  LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.attendance_session_actor_is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public."User" u
    WHERE u.id = public.attendance_session_actor_id()
      AND u.role = 'ADMIN'
      AND u."isActive" IS NOT FALSE
  );
$function$;

CREATE OR REPLACE FUNCTION public.mark_shared_attendance(
  p_participant_id UUID,
  p_week_id INTEGER,
  p_status TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_id UUID;
  v_cohort_id UUID;
  v_record public."AttendanceRecord";
BEGIN
  IF NOT public.app_is_staff() THEN
    RAISE EXCEPTION 'You must be signed in as a support or admin to mark attendance';
  END IF;

  IF p_status NOT IN ('PRESENT', 'ABSENT', 'LATE', 'EXCUSED') THEN
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

  INSERT INTO public."AttendanceSession" ("weekId") VALUES (p_week_id)
  ON CONFLICT ("weekId") DO NOTHING;

  IF EXISTS (
    SELECT 1 FROM public."AttendanceSession"
    WHERE "weekId" = p_week_id AND "finalizedAt" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Attendance has already been finalised';
  END IF;

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
    'markedAt', v_record."markedAt"
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
  v_session public."AttendanceSession";
BEGIN
  IF NOT public.app_is_staff() THEN
    RAISE EXCEPTION 'You must be signed in as a support or admin to finalise attendance';
  END IF;

  SELECT "cohortId" INTO v_cohort_id FROM public."Week" WHERE id = p_week_id;
  IF v_cohort_id IS NULL THEN RAISE EXCEPTION 'Attendance week was not found'; END IF;

  SELECT COUNT(*) INTO v_expected_count
  FROM public."Participant"
  WHERE "cohortId" = v_cohort_id AND status = 'ACTIVE';

  SELECT COUNT(*) INTO v_marked_count
  FROM public."AttendanceRecord" a
  JOIN public."Participant" p ON p.id = a."participantId"
  WHERE a."weekId" = p_week_id
    AND p."cohortId" = v_cohort_id
    AND p.status = 'ACTIVE';

  IF v_expected_count = 0 OR v_marked_count <> v_expected_count THEN
    RAISE EXCEPTION 'Mark every participant before finalising attendance';
  END IF;

  INSERT INTO public."AttendanceSession" ("weekId") VALUES (p_week_id)
  ON CONFLICT ("weekId") DO NOTHING;

  v_actor_id := public.attendance_session_actor_id();
  UPDATE public."AttendanceSession"
  SET "finalizedAt" = COALESCE("finalizedAt", NOW()),
      "finalizedById" = COALESCE("finalizedById", v_actor_id),
      "finalizationMethod" = COALESCE("finalizationMethod", 'MANUAL'),
      "updatedAt" = NOW()
  WHERE "weekId" = p_week_id
  RETURNING * INTO v_session;

  RETURN jsonb_build_object(
    'weekId', v_session."weekId",
    'autoFinalizeAtNoon', v_session."autoFinalizeAtNoon",
    'finalizedAt', v_session."finalizedAt",
    'finalizedById', v_session."finalizedById",
    'finalizationMethod', v_session."finalizationMethod",
    'reopenedAt', v_session."reopenedAt"
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_attendance_auto_finalize(
  p_week_id INTEGER,
  p_enabled BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE v_session public."AttendanceSession";
BEGIN
  IF NOT public.attendance_session_actor_is_admin() THEN
    RAISE EXCEPTION 'Only admins can change automatic finalisation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public."Week" WHERE id = p_week_id) THEN
    RAISE EXCEPTION 'Attendance week was not found';
  END IF;

  INSERT INTO public."AttendanceSession" ("weekId", "autoFinalizeAtNoon")
  VALUES (p_week_id, p_enabled)
  ON CONFLICT ("weekId") DO UPDATE
    SET "autoFinalizeAtNoon" = EXCLUDED."autoFinalizeAtNoon",
        "updatedAt" = NOW()
  RETURNING * INTO v_session;

  RETURN jsonb_build_object(
    'weekId', v_session."weekId",
    'autoFinalizeAtNoon', v_session."autoFinalizeAtNoon",
    'finalizedAt', v_session."finalizedAt",
    'finalizedById', v_session."finalizedById",
    'finalizationMethod', v_session."finalizationMethod",
    'reopenedAt', v_session."reopenedAt"
  );
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
  IF NOT public.attendance_session_actor_is_admin() THEN
    RAISE EXCEPTION 'Only admins can reopen attendance';
  END IF;

  UPDATE public."AttendanceSession"
  SET "finalizedAt" = NULL,
      "finalizedById" = NULL,
      "finalizationMethod" = NULL,
      "reopenedAt" = NOW(),
      "reopenedById" = public.attendance_session_actor_id(),
      "updatedAt" = NOW()
  WHERE "weekId" = p_week_id
  RETURNING * INTO v_session;

  IF v_session.id IS NULL THEN RAISE EXCEPTION 'Attendance session was not found'; END IF;

  RETURN jsonb_build_object(
    'weekId', v_session."weekId",
    'autoFinalizeAtNoon', v_session."autoFinalizeAtNoon",
    'finalizedAt', v_session."finalizedAt",
    'finalizedById', v_session."finalizedById",
    'finalizationMethod', v_session."finalizationMethod",
    'reopenedAt', v_session."reopenedAt"
  );
END;
$function$;

-- Called at 12:00 Africa/Lagos every Sunday (11:00 UTC). It only finalises
-- the programme week whose Sunday is today, and only if every active person is
-- already marked. Incomplete registers deliberately stay open for intervention.
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
    WHERE COALESCE(s."autoFinalizeAtNoon", TRUE)
      AND s."finalizedAt" IS NULL
      AND (timezone('Africa/Lagos', NOW()))::date = c."startDate" + ((w."weekNumber" - 1) * 7)
      AND (timezone('Africa/Lagos', NOW()))::time >= TIME '12:00'
      AND EXISTS (
        SELECT 1 FROM public."Participant" p
        WHERE p."cohortId" = c.id AND p.status = 'ACTIVE'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public."Participant" p
        WHERE p."cohortId" = c.id
          AND p.status = 'ACTIVE'
          AND NOT EXISTS (
            SELECT 1 FROM public."AttendanceRecord" a
            WHERE a."weekId" = w.id AND a."participantId" = p.id
          )
      )
  LOOP
    INSERT INTO public."AttendanceSession" ("weekId") VALUES (v_week_id)
    ON CONFLICT ("weekId") DO NOTHING;

    UPDATE public."AttendanceSession"
    SET "finalizedAt" = NOW(),
        "finalizationMethod" = 'AUTO',
        "updatedAt" = NOW()
    WHERE "weekId" = v_week_id
      AND "finalizedAt" IS NULL;
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.attendance_session_actor_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.attendance_session_actor_is_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_shared_attendance(UUID, INTEGER, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_shared_attendance(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_attendance_auto_finalize(INTEGER, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reopen_shared_attendance(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auto_finalize_sunday_attendance() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_shared_attendance(UUID, INTEGER, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_shared_attendance(INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_attendance_auto_finalize(INTEGER, BOOLEAN) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reopen_shared_attendance(INTEGER) TO anon, authenticated;

CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.unschedule('auto_finalize_sunday_attendance_noon')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'auto_finalize_sunday_attendance_noon');
SELECT cron.schedule(
  'auto_finalize_sunday_attendance_noon',
  '0 11 * * 0',
  $$SELECT public.auto_finalize_sunday_attendance();$$
);
