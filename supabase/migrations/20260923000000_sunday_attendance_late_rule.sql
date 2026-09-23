-- Sunday class countdown + "late counts as missed" rule.
--
-- A support taps Start; the register stays open for a fixed window
-- (programme_rules.attendanceWindowMinutes, default 15) and then closes
-- itself via pg_cron. Anyone still unmarked at close becomes Absent. Late and
-- Left early now count as missed for the certificate unless an admin excuses
-- the lateness after an appeal -- the appeal note is admin-only, never seen
-- by the support or the participant, at the database level.

-- 1. Session timing.
ALTER TABLE public."AttendanceSession"
  ADD COLUMN IF NOT EXISTS "startedAt" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "startedById" UUID REFERENCES public."User"(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "closesAt" TIMESTAMPTZ;

-- 2. Record: Left early + the excusal flag.
ALTER TABLE public."AttendanceRecord"
  ADD COLUMN IF NOT EXISTS "lateExcused" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "lateExcusedAt" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "lateExcusedById" UUID REFERENCES public."User"(id) ON DELETE SET NULL;

-- The column never had a formal check; add one now that also covers the new
-- status, rather than leaving validation to the RPC alone.
DO $$
BEGIN
  ALTER TABLE public."AttendanceRecord"
    ADD CONSTRAINT attendance_record_status_check
    CHECK (status IN ('PRESENT', 'ABSENT', 'LATE', 'LEFT_EARLY', 'EXCUSED'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3. The appeal note. Born locked to admins only -- supports and
-- participants never see it, at the RLS level, not just in the UI.
CREATE TABLE IF NOT EXISTS public."AttendanceExcusal" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "attendanceRecordId" UUID NOT NULL UNIQUE REFERENCES public."AttendanceRecord"(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  "excusedById" UUID REFERENCES public."User"(id) ON DELETE SET NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public."AttendanceExcusal" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can read attendance excusals" ON public."AttendanceExcusal";
CREATE POLICY "Admins can read attendance excusals"
  ON public."AttendanceExcusal" FOR SELECT
  USING (public.app_is_admin());

GRANT SELECT ON public."AttendanceExcusal" TO anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public."AttendanceExcusal" FROM anon, authenticated;

-- 4. Lock: once a week is finalised, a non-admin can only move an Absent
-- record to Late or Left early. Everything else needs an admin (who can
-- reopen the week, or -- for this one correction -- write straight through).
CREATE OR REPLACE FUNCTION public.enforce_attendance_record_lock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_finalized BOOLEAN;
BEGIN
  SELECT (s."finalizedAt" IS NOT NULL) INTO v_finalized
  FROM public."AttendanceSession" s
  WHERE s."weekId" = NEW."weekId";

  IF COALESCE(v_finalized, FALSE) AND NOT public.app_is_admin() THEN
    IF OLD.status IS DISTINCT FROM 'ABSENT' OR NEW.status NOT IN ('LATE', 'LEFT_EARLY') THEN
      RAISE EXCEPTION 'This attendance record is locked. Only Absent can be corrected to Late or Left early.';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS attendance_record_lock ON public."AttendanceRecord";
CREATE TRIGGER attendance_record_lock
  BEFORE UPDATE ON public."AttendanceRecord"
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_attendance_record_lock();

REVOKE ALL ON FUNCTION public.enforce_attendance_record_lock() FROM PUBLIC;

-- 5. mark_shared_attendance: accept LEFT_EARLY, and let the one permitted
-- post-finalisation correction (Absent -> Late/Left early) through without
-- requiring an admin reopen first. The trigger above is the actual gate;
-- this check exists to fail with a clear message before doing any work.
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
  v_existing_status TEXT;
  v_finalized BOOLEAN;
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

  INSERT INTO public."AttendanceSession" ("weekId") VALUES (p_week_id)
  ON CONFLICT ("weekId") DO NOTHING;

  SELECT "finalizedAt" IS NOT NULL INTO v_finalized
  FROM public."AttendanceSession" WHERE "weekId" = p_week_id;

  IF COALESCE(v_finalized, FALSE) AND NOT public.app_is_admin() THEN
    SELECT status INTO v_existing_status
    FROM public."AttendanceRecord"
    WHERE "participantId" = p_participant_id AND "weekId" = p_week_id;

    IF v_existing_status IS DISTINCT FROM 'ABSENT' OR p_status NOT IN ('LATE', 'LEFT_EARLY') THEN
      RAISE EXCEPTION 'Attendance has already been finalised';
    END IF;
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
    'markedAt', v_record."markedAt",
    'lateExcused', v_record."lateExcused"
  );
END;
$function$;

-- 6. Programme-rule-driven start of the register. First tap wins; later taps
-- just hand back the session that is already running.
CREATE OR REPLACE FUNCTION public.start_attendance_window(p_week_id INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_id UUID;
  v_window_minutes INTEGER;
  v_session public."AttendanceSession";
BEGIN
  IF NOT public.app_is_staff() THEN
    RAISE EXCEPTION 'You must be signed in as a support or admin to start attendance';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public."Week" WHERE id = p_week_id) THEN
    RAISE EXCEPTION 'Attendance week was not found';
  END IF;

  SELECT COALESCE((value->>'attendanceWindowMinutes')::INTEGER, 15)
  INTO v_window_minutes
  FROM public."AppSetting" WHERE "settingKey" = 'programme_rules';
  v_window_minutes := GREATEST(1, COALESCE(v_window_minutes, 15));

  v_actor_id := public.attendance_session_actor_id();

  INSERT INTO public."AttendanceSession" ("weekId", "startedAt", "startedById", "closesAt")
  VALUES (p_week_id, NOW(), v_actor_id, NOW() + make_interval(mins => v_window_minutes))
  ON CONFLICT ("weekId") DO NOTHING;

  -- First tap wins: only fill in start/close times if nobody has already.
  UPDATE public."AttendanceSession"
  SET "startedAt" = COALESCE("startedAt", NOW()),
      "startedById" = COALESCE("startedById", v_actor_id),
      "closesAt" = COALESCE("closesAt", NOW() + make_interval(mins => v_window_minutes)),
      "updatedAt" = NOW()
  WHERE "weekId" = p_week_id AND "startedAt" IS NULL;

  SELECT * INTO v_session FROM public."AttendanceSession" WHERE "weekId" = p_week_id;

  RETURN jsonb_build_object(
    'weekId', v_session."weekId",
    'startedAt', v_session."startedAt",
    'startedById', v_session."startedById",
    'closesAt', v_session."closesAt",
    'autoFinalizeAtNoon', v_session."autoFinalizeAtNoon",
    'finalizedAt', v_session."finalizedAt",
    'finalizedById', v_session."finalizedById",
    'finalizationMethod', v_session."finalizationMethod",
    'reopenedAt', v_session."reopenedAt"
  );
END;
$function$;

-- 7. Admin-only appeal: excuse a Late/Left early record so it counts as
-- attended again. Note is required and never returned to non-admin callers
-- (the RPC itself is admin-only, and the table's RLS keeps it that way even
-- if something else ever reads AttendanceExcusal directly).
CREATE OR REPLACE FUNCTION public.excuse_lateness(p_record_id UUID, p_note TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_id UUID;
  v_note TEXT;
  v_record public."AttendanceRecord";
BEGIN
  IF NOT public.app_is_admin() THEN
    RAISE EXCEPTION 'Only admins can excuse lateness';
  END IF;

  v_note := NULLIF(BTRIM(COALESCE(p_note, '')), '');
  IF v_note IS NULL THEN
    RAISE EXCEPTION 'Add a note before excusing this record';
  END IF;

  SELECT * INTO v_record FROM public."AttendanceRecord" WHERE id = p_record_id;
  IF v_record.id IS NULL THEN RAISE EXCEPTION 'Attendance record was not found'; END IF;
  IF v_record.status NOT IN ('LATE', 'LEFT_EARLY') THEN
    RAISE EXCEPTION 'Only a Late or Left early record can be excused';
  END IF;

  v_actor_id := public.attendance_session_actor_id();

  UPDATE public."AttendanceRecord"
  SET "lateExcused" = TRUE, "lateExcusedAt" = NOW(), "lateExcusedById" = v_actor_id
  WHERE id = p_record_id
  RETURNING * INTO v_record;

  INSERT INTO public."AttendanceExcusal" ("attendanceRecordId", note, "excusedById")
  VALUES (p_record_id, v_note, v_actor_id)
  ON CONFLICT ("attendanceRecordId") DO UPDATE
    SET note = EXCLUDED.note, "excusedById" = EXCLUDED."excusedById", "createdAt" = NOW();

  RETURN jsonb_build_object(
    'id', v_record.id,
    'participantId', v_record."participantId",
    'weekId', v_record."weekId",
    'status', v_record.status,
    'lateExcused', v_record."lateExcused",
    'lateExcusedAt', v_record."lateExcusedAt",
    'lateExcusedById', v_record."lateExcusedById"
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.mark_shared_attendance(UUID, INTEGER, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.start_attendance_window(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.excuse_lateness(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_shared_attendance(UUID, INTEGER, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_attendance_window(INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.excuse_lateness(UUID, TEXT) TO anon, authenticated;

-- 8. Push helper -- same vault-secret pattern as invoke_push_reminders
-- (20260728000000): read the URL/service key from Vault and post, rather
-- than inlining a JWT in the cron command.
CREATE OR REPLACE FUNCTION public.invoke_attendance_absence_push(p_participant_ids UUID[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_url text;
  v_key text;
BEGIN
  IF p_participant_ids IS NULL OR array_length(p_participant_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'project_url';
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'push_reminders_service_key';

  IF v_url IS NULL OR v_key IS NULL THEN
    RAISE NOTICE 'attendance-absence-push: vault secrets missing; skipping run';
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
      'participantIds', to_jsonb(p_participant_ids),
      'title', 'Marked absent',
      'body', 'You were marked absent for Sunday class. Speak to your support if this needs a look.',
      'path', '/me/journey',
      'type', 'ATTENDANCE_ABSENT'
    ),
    timeout_milliseconds := 25000
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.invoke_attendance_absence_push(UUID[]) FROM PUBLIC;

-- 9. The minute-by-minute close. Only touches sessions that were actually
-- started and are past their close time and not already finalised -- a week
-- nobody started is left to the existing noon fallback.
CREATE OR REPLACE FUNCTION public.close_attendance_windows()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_week RECORD;
  v_absent_ids UUID[];
BEGIN
  FOR v_week IN
    SELECT s."weekId", w."cohortId"
    FROM public."AttendanceSession" s
    JOIN public."Week" w ON w.id = s."weekId"
    WHERE s."startedAt" IS NOT NULL
      AND s."closesAt" IS NOT NULL
      AND s."closesAt" <= NOW()
      AND s."finalizedAt" IS NULL
  LOOP
    WITH inserted AS (
      INSERT INTO public."AttendanceRecord" ("participantId", "weekId", status, "markedAt")
      SELECT p.id, v_week."weekId", 'ABSENT', NOW()
      FROM public."Participant" p
      WHERE p."cohortId" = v_week."cohortId"
        AND p.status = 'ACTIVE'
        AND NOT EXISTS (
          SELECT 1 FROM public."AttendanceRecord" a
          WHERE a."weekId" = v_week."weekId" AND a."participantId" = p.id
        )
      RETURNING "participantId"
    )
    SELECT array_agg("participantId") INTO v_absent_ids FROM inserted;

    UPDATE public."AttendanceSession"
    SET "finalizedAt" = NOW(),
        "finalizationMethod" = 'AUTO',
        "updatedAt" = NOW()
    WHERE "weekId" = v_week."weekId"
      AND "finalizedAt" IS NULL;

    PERFORM public.sync_attendance_follow_up_tasks(v_week."weekId");
    PERFORM public.notify_attendance_report(v_week."weekId");

    IF v_absent_ids IS NOT NULL AND array_length(v_absent_ids, 1) > 0 THEN
      PERFORM public.invoke_attendance_absence_push(v_absent_ids);
    END IF;
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.close_attendance_windows() FROM PUBLIC;

-- notify_attendance_report previously read "attended" as PRESENT or LATE --
-- exactly the rule this migration reverses. Left early is added to the same
-- count, and both now require the excusal to count, so the support-facing
-- report text matches what the dashboards show.
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
    COUNT(*) FILTER (WHERE a.status = 'PRESENT' OR (a.status IN ('LATE', 'LEFT_EARLY') AND a."lateExcused")),
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

REVOKE ALL ON FUNCTION public.notify_attendance_report(INTEGER) FROM PUBLIC;

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule('close_attendance_windows_every_minute')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'close_attendance_windows_every_minute');

SELECT cron.schedule(
  'close_attendance_windows_every_minute',
  '* * * * *',
  $$SELECT public.close_attendance_windows();$$
);

-- 10. cohort_health: breakdown gains Left early, and an "attended" count that
-- applies the excusal rule (Present, or an excused Late/Left early).
CREATE OR REPLACE FUNCTION public.cohort_health(p_cohort_id UUID)
RETURNS JSON
LANGUAGE sql
STABLE
AS $$
  WITH
  cohort AS (
    SELECT id, name, "startDate", "endDate", status, "schedulePublished"
    FROM "Cohort" WHERE id = p_cohort_id
  ),
  weeks AS (
    SELECT id, "weekNumber", ("recapDocumentUrl" IS NOT NULL) AS "recapUploaded"
    FROM "Week" WHERE "cohortId" = p_cohort_id
  ),
  people AS (
    SELECT id, status FROM "Participant" WHERE "cohortId" = p_cohort_id
  ),
  membership AS (
    SELECT gp."groupId", gp."participantId"
    FROM "GroupParticipant" gp
    JOIN "Group" g ON g.id = gp."groupId" AND g."cohortId" = p_cohort_id
    JOIN people p ON p.id = gp."participantId" AND p.status = 'ACTIVE'
  ),
  groups AS (
    SELECT g.id, g.name, g."supportId", u.name AS "supportName",
           (SELECT count(*) FROM membership m WHERE m."groupId" = g.id) AS members
    FROM "Group" g
    LEFT JOIN "User" u ON u.id = g."supportId"
    WHERE g."cohortId" = p_cohort_id
  ),
  attendance AS (
    SELECT a."weekId", m."groupId",
           count(*) AS marked,
           count(*) FILTER (WHERE a.status = 'PRESENT') AS present,
           count(*) FILTER (WHERE a.status = 'LATE') AS late,
           count(*) FILTER (WHERE a.status = 'LEFT_EARLY') AS "leftEarly",
           count(*) FILTER (WHERE a.status = 'ABSENT') AS absent,
           count(*) FILTER (
             WHERE a.status = 'PRESENT' OR (a.status IN ('LATE', 'LEFT_EARLY') AND a."lateExcused")
           ) AS attended
    FROM "AttendanceRecord" a
    JOIN membership m ON m."participantId" = a."participantId"
    JOIN weeks w ON w.id = a."weekId"
    GROUP BY a."weekId", m."groupId"
  ),
  meetings AS (
    SELECT s."weekId", s."groupId"
    FROM "GroupPrayerStatus" s
    JOIN weeks w ON w.id = s."weekId"
    WHERE s.done
  ),
  contacts AS (
    SELECT * FROM "FollowUpContact" WHERE "cohortId" = p_cohort_id
  )
  SELECT json_build_object(
    'cohort', (SELECT row_to_json(c) FROM cohort c),
    'weeks', COALESCE((SELECT json_agg(w ORDER BY w."weekNumber") FROM weeks w), '[]'::json),
    'participants', json_build_object(
      'active', (SELECT count(*) FROM people WHERE status = 'ACTIVE'),
      'archived', (SELECT count(*) FROM people WHERE status <> 'ACTIVE'),
      'inGroups', (SELECT count(DISTINCT "participantId") FROM membership)
    ),
    'groups', COALESCE((SELECT json_agg(g ORDER BY g.name) FROM groups g), '[]'::json),
    'attendance', COALESCE((SELECT json_agg(a) FROM attendance a), '[]'::json),
    'meetings', COALESCE((SELECT json_agg(m) FROM meetings m), '[]'::json),
    'faithProjects', COALESCE((
      SELECT json_object_agg(status, n) FROM (
        SELECT f.status, count(*) AS n
        FROM "FaithProject" f JOIN people p ON p.id = f."participantId" AND p.status = 'ACTIVE'
        GROUP BY f.status
      ) x
    ), '{}'::json),
    'followUps', json_build_object(
      'total', (SELECT count(*) FROM contacts),
      'contacted', (SELECT count(*) FROM contacts
                    WHERE "messageStatus" = 'SENT' OR "replyStatus" <> 'NO_REPLY'
                       OR "callStatus" IN ('CALLED', 'CALL_BACK_LATER', 'MISSED_CALL')),
      'replied', (SELECT count(*) FROM contacts WHERE "replyStatus" = 'REPLIED'),
      'registered', (SELECT count(*) FROM contacts WHERE "registrationStatus" = 'REGISTERED'),
      'open', (SELECT count(*) FROM contacts WHERE "archivedAt" IS NULL)
    ),
    'nextCohortPeople', (SELECT count(*) FROM "FollowUpContact"
                         WHERE "registrationStatus" = 'NEXT_COHORT' AND "archivedAt" IS NULL
                           AND "cohortId" IS DISTINCT FROM p_cohort_id),
    'openFlags', (SELECT count(*) FROM "ParticipantFlag" f JOIN people p ON p.id = f."participantId" WHERE f."clearedAt" IS NULL),
    'pendingCover', (SELECT count(*) FROM "CoverRequest" WHERE status = 'PENDING' AND "endsAt" >= now()),
    'sheetSyncProblems', (SELECT count(*) FROM "FollowUpContact"
                          WHERE "createdAt" >= now() - interval '7 days'
                            AND (("sheetSyncError" IS NOT NULL AND "sheetSyncedAt" IS NULL) OR "sheetSyncWarning" IS NOT NULL))
  );
$$;

GRANT EXECUTE ON FUNCTION public.cohort_health(UUID) TO anon, authenticated;

-- 11. cohort_people: each Sunday mark now carries whether a Late/Left early
-- was excused, so the programme rules can tell attended from missed.
CREATE OR REPLACE FUNCTION public.cohort_people(p_cohort_id UUID)
RETURNS JSON
LANGUAGE sql
STABLE
AS $$
  WITH
  people AS (
    SELECT p.id, p."fullName", p.status, p.departments, p."createdAt",
           (SELECT gp."groupId" FROM "GroupParticipant" gp
              JOIN "Group" g ON g.id = gp."groupId" AND g."cohortId" = p_cohort_id
             WHERE gp."participantId" = p.id LIMIT 1) AS "groupId",
           COALESCE(o.contacted AND o."addedToGroup" AND o."introductionDone" AND o."venueAcknowledged", false) AS onboarded
    FROM "Participant" p
    LEFT JOIN "ParticipantOnboardingStatus" o ON o."participantId" = p.id
    WHERE p."cohortId" = p_cohort_id
  ),
  weeks AS (
    SELECT id FROM "Week" WHERE "cohortId" = p_cohort_id
  ),
  onboarding AS (
    SELECT g.id AS "groupId", g."supportId",
           s."groupCreated", s."completedAt",
           (SELECT max(e."createdAt") FROM "OnboardingEvent" e
             WHERE e."groupId" = g.id AND e.type = 'GROUP_ASSIGNED'
               AND e."createdAt" <= COALESCE(s."completedAt", now())) AS "assignedAt"
    FROM "Group" g
    LEFT JOIN "GroupOnboardingStatus" s ON s."groupId" = g.id
    WHERE g."cohortId" = p_cohort_id
  )
  SELECT json_build_object(
    'participants', COALESCE((SELECT json_agg(p ORDER BY p."fullName") FROM people p), '[]'::json),
    'sunday', COALESCE((
      SELECT json_agg(json_build_object(
        'participantId', a."participantId", 'weekId', a."weekId", 'status', a.status, 'lateExcused', a."lateExcused"
      ))
      FROM "AttendanceRecord" a
      JOIN people p ON p.id = a."participantId"
      JOIN weeks w ON w.id = a."weekId"
    ), '[]'::json),
    'meeting', COALESCE((
      SELECT json_agg(json_build_object('participantId', m."participantId", 'weekId', m."weekId", 'status', m.status))
      FROM "MeetingAttendance" m
      JOIN people p ON p.id = m."participantId"
      JOIN weeks w ON w.id = m."weekId"
    ), '[]'::json),
    'onboarding', COALESCE((SELECT json_agg(o) FROM onboarding o), '[]'::json)
  );
$$;

GRANT EXECUTE ON FUNCTION public.cohort_people(UUID) TO anon, authenticated;

-- 12. participant_home: Sunday marks carry lateExcused (never the note), and
-- an openWindow tells the app when to show the countdown card.
CREATE OR REPLACE FUNCTION public.participant_home(p_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  person_id UUID := public.app_participant_id(p_token);
  person "Participant";
  cohort "Cohort";
  grp "Group";
  support "User";
BEGIN
  IF person_id IS NULL THEN
    RAISE EXCEPTION 'SESSION_EXPIRED';
  END IF;

  SELECT * INTO person FROM "Participant" WHERE id = person_id;
  SELECT * INTO cohort FROM "Cohort" WHERE id = person."cohortId";
  SELECT g.* INTO grp
  FROM "GroupParticipant" gp
  JOIN "Group" g ON g.id = gp."groupId" AND g."cohortId" = person."cohortId"
  WHERE gp."participantId" = person_id
  LIMIT 1;
  SELECT * INTO support FROM "User" WHERE id = grp."supportId";

  RETURN json_build_object(
    'now', NOW(),
    'participant', json_build_object('id', person.id, 'name', person."fullName", 'phone', person.phone),
    'cohort', CASE WHEN cohort.id IS NULL THEN NULL ELSE json_build_object(
      'id', cohort.id, 'name', cohort.name, 'startDate', cohort."startDate", 'endDate', cohort."endDate",
      'status', cohort.status, 'venue', cohort.venue
    ) END,
    'group', CASE WHEN grp.id IS NULL THEN NULL ELSE json_build_object(
      'id', grp.id, 'name', grp.name, 'meetingDay', grp."meetingDay", 'meetingTime', grp."meetingTime",
      'meetingDurationMins', grp."meetingDurationMins", 'callPlatform', grp."callPlatform", 'callLink', grp."callLink",
      'supportName', support.name, 'supportPhone', support.phone
    ) END,
    'weeks', COALESCE((
      SELECT json_agg(json_build_object(
        'id', w.id,
        'weekNumber', w."weekNumber",
        'title', w.title,
        'classTime', (
          SELECT a.time FROM "Day" d JOIN "Activity" a ON a."dayId" = d.id
          WHERE d."weekId" = w.id AND d."dayName" = 'Sunday' AND a.description ~* '^\s*class\s*[0-9]|introductory class'
          ORDER BY a.time LIMIT 1
        ),
        'expectations', w.expectations,
        'shared', w."shareWithParticipants",
        'released', rel.released,
        'releasedAt', rel."releasedAt",
        'recapSummary', CASE WHEN rel.released THEN w."recapSummary" END,
        'discussionPrompt', CASE WHEN rel.released THEN w."discussionPrompt" END,
        'recapDocumentUrl', CASE WHEN rel.released THEN w."recapDocumentUrl" END,
        'recapDocumentName', CASE WHEN rel.released THEN w."recapDocumentName" END
      ) ORDER BY w."weekNumber")
      FROM "Week" w
      CROSS JOIN LATERAL (
        SELECT
          COALESCE(w."shareWithParticipants" AND (
            btrim(COALESCE(w."recapSummary", '')) <> ''
            OR w."recapDocumentUrl" IS NOT NULL
          ), FALSE) AS released,
          NULL::TIMESTAMPTZ AS "releasedAt"
        FROM (SELECT 1) one
      ) rel
      WHERE w."cohortId" = person."cohortId"
    ), '[]'::json),
    'reflections', COALESCE((
      SELECT json_agg(json_build_object(
        'weekId', r."weekId", 'stoodOut', r."stoodOut", 'goal', r.goal, 'goalCheck', r."goalCheck",
        'goalDoneAt', r."goalDoneAt", 'createdAt', r."createdAt", 'updatedAt', r."updatedAt"
      ))
      FROM "Reflection" r WHERE r."participantId" = person_id
    ), '[]'::json),
    'sunday', COALESCE((
      SELECT json_agg(json_build_object('weekId', a."weekId", 'status', a.status, 'lateExcused', a."lateExcused"))
      FROM "AttendanceRecord" a JOIN "Week" w ON w.id = a."weekId" AND w."cohortId" = person."cohortId"
      WHERE a."participantId" = person_id
    ), '[]'::json),
    'meeting', COALESCE((
      SELECT json_agg(json_build_object('weekId', m."weekId", 'status', m.status))
      FROM "MeetingAttendance" m JOIN "Week" w ON w.id = m."weekId" AND w."cohortId" = person."cohortId"
      WHERE m."participantId" = person_id
    ), '[]'::json),
    'openWindow', (
      SELECT jsonb_build_object(
        'weekId', s."weekId",
        'closesAt', s."closesAt",
        'myStatus', (SELECT a.status FROM "AttendanceRecord" a WHERE a."weekId" = s."weekId" AND a."participantId" = person_id)
      )
      FROM "AttendanceSession" s
      JOIN "Week" w2 ON w2.id = s."weekId" AND w2."cohortId" = person."cohortId"
      WHERE s."startedAt" IS NOT NULL AND s."closesAt" > NOW() AND s."finalizedAt" IS NULL
      ORDER BY s."startedAt" DESC LIMIT 1
    ),
    'faithProjectStatus', (SELECT f.status FROM "FaithProject" f WHERE f."participantId" = person_id ORDER BY f."updatedAt" DESC LIMIT 1),
    'rules', (SELECT value FROM "AppSetting" WHERE "settingKey" = 'programme_rules'),
    'scriptures', COALESCE((
      SELECT json_agg(json_build_object('dayNumber', sc."dayNumber", 'imageUrl', sc."imageUrl") ORDER BY sc."dayNumber")
      FROM "Scripture" sc
    ), '[]'::json),
    'members', COALESCE((
      SELECT json_agg(json_build_object('name', m."fullName") ORDER BY m."fullName")
      FROM "GroupParticipant" gp JOIN "Participant" m ON m.id = gp."participantId"
      WHERE gp."groupId" = grp.id AND m.id <> person_id AND m.status = 'ACTIVE'
    ), '[]'::json),
    'profile', json_build_object(
      'email', person.email,
      'avatarUrl', person."avatarUrl",
      'gender', person.gender,
      'ageRange', person."ageRange",
      'dateOfBirth', person."dateOfBirth",
      'occupation', COALESCE(person.occupation, (SELECT f.occupation FROM "FollowUpContact" f WHERE f.id = person."followUpContactId"))
    ),
    'faithUnread', EXISTS (
      SELECT 1 FROM "ParticipantNote" n
      WHERE n."participantId" = person_id AND n."noteType" = 'FAITH_COACH' AND NOT n."byParticipant"
        AND n."createdAt" > GREATEST(
          COALESCE((SELECT t."coachLastReadAt" FROM "ParticipantThreadRead" t WHERE t."participantId" = person_id), '-infinity'::timestamptz),
          '2026-09-17T02:00:00Z'::timestamptz)
    ),
    'reminders', (
      SELECT json_build_object(
        'meetingRemindMinutes', COALESCE(rs."meetingRemindMinutes", '[60]'::jsonb),
        'recapReleased', COALESCE(rs."recapReleased", TRUE)
      )
      FROM (SELECT 1) one LEFT JOIN "ParticipantReminderSetting" rs ON rs."participantId" = person_id
    ),
    'resources', COALESCE((
      SELECT json_agg(json_build_object('id', r.id, 'title', r.title, 'description', r.description, 'type', r.type, 'url', r.url, 'fileName', r."fileName") ORDER BY r.title)
      FROM "Resource" r WHERE r."visibleToParticipants"
    ), '[]'::json),
    'announcement', (
      SELECT json_build_object('id', a.id, 'subject', a.subject, 'body', a.body, 'linkUrl', a."linkUrl", 'linkLabel', a."linkLabel")
      FROM "Announcement" a
      WHERE a."showOnHome" AND a."homeUntil" > NOW() AND a.audience IN ('PARTICIPANTS', 'EVERYONE')
        AND (a.scope = 'ALL_USERS' OR a."cohortId" IS NULL OR a."cohortId" = person."cohortId")
      ORDER BY a."sentAt" DESC LIMIT 1
    ),
    'wrapUp', json_build_object(
      'submitted', EXISTS (SELECT 1 FROM "ParticipantWrapUp" w WHERE w."participantId" = person_id AND w."cohortId" = person."cohortId")
    ),
    'profileFields', public.participant_profile_fields(person_id),
    'profileCompletion', public.profile_completion_for(person_id),
    'lastCheckIn', (
      SELECT json_build_object('response', c.response, 'sundayMisses', c."sundayMisses", 'meetingMisses', c."meetingMisses", 'createdAt', c."createdAt")
      FROM "ParticipantCheckIn" c WHERE c."participantId" = person_id
      ORDER BY c."createdAt" DESC LIMIT 1
    )
  );
END;
$function$
;
