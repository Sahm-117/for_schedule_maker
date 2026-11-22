-- Three changes (Olamide, 2026-11-22):
-- 1. A teen's guardian can be linked to someone already in the system: a user (support or admin) or a participant.
--    Participant."guardianUserId" / "guardianParticipantId" (both optional; at most one is set).
-- 2. Any support can reopen Sunday class attendance, not only admins. reopen_shared_attendance(week, reason) now:
--    * lets an admin, or a support in that week's cohort (UserCohort), reopen;
--    * also reopens a class that closed on its own because the class day passed with no report sent (no session row,
--      or a session that was never finalised). Before, that case raised 'Attendance is already open' while staying locked;
--    * a support's reopen always runs a fresh timed window (attendanceWindowMinutes), so it closes again by itself, and
--      only cancels that support's own open follow-up tasks (an admin's reopen is unchanged: window only when the class
--      had one, all open tasks cancelled). Finalising again re-creates tasks (ON CONFLICT on the record);
--    * names who reopened it in the notice to supports.
--    Everything else is the live definition from 20261101100000_attendance_reopen_reason.sql.
-- 3. A support who missed (or did not report) their group's weekly meeting can open it for themselves, and a hub lead
--    (or an assistant with ATTENDANCE) can do the same for the hub meeting: open_missed_meeting(hub, group, week) adds the
--    same 48-hour MeetingRecordingOpening an admin can add (admin_open_meeting_recording), only once that week's meeting
--    window has ended (fof_meeting_window) and it was not submitted. Both now write the opening through one internal
--    helper, meeting_recording_upsert; admin_open_meeting_recording is otherwise the live definition (20261019140000).
--
-- Rollback:
--   ALTER TABLE public."Participant" DROP COLUMN "guardianUserId", DROP COLUMN "guardianParticipantId";
--   DROP FUNCTION public.open_missed_meeting(uuid, uuid, integer);
--   re-run reopen_shared_attendance(integer, text) from 20261101100000_attendance_reopen_reason.sql and
--   admin_open_meeting_recording from 20261019140000_meeting_recording_opening.sql; DROP FUNCTION public.meeting_recording_upsert.

-- 1. Guardian link ------------------------------------------------------------------------------------------------
ALTER TABLE public."Participant"
  ADD COLUMN IF NOT EXISTS "guardianUserId" UUID REFERENCES public."User"(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "guardianParticipantId" UUID REFERENCES public."Participant"(id) ON DELETE SET NULL;
DO $$ BEGIN
  ALTER TABLE public."Participant" ADD CONSTRAINT "Participant_one_guardian"
    CHECK ("guardianUserId" IS NULL OR "guardianParticipantId" IS NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Supports can reopen attendance --------------------------------------------------------------------------------
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
  v_actor_name TEXT;
  v_actor UUID := public.attendance_session_actor_id();
  v_is_admin BOOLEAN := public.app_is_admin();
BEGIN
  IF NOT public.app_is_staff() OR v_actor IS NULL THEN RAISE EXCEPTION 'Only supports and admins can reopen attendance'; END IF;
  IF v_reason IS NULL THEN RAISE EXCEPTION 'Give a reason for reopening attendance'; END IF;
  v_reason := left(v_reason, 500);
  SELECT w."cohortId" INTO v_cohort_id FROM public."Week" w WHERE w.id = p_week_id;
  IF v_cohort_id IS NULL THEN RAISE EXCEPTION 'Week was not found'; END IF;
  IF NOT v_is_admin AND NOT EXISTS (
    SELECT 1 FROM public."UserCohort" uc WHERE uc."userId" = v_actor AND uc."cohortId" = v_cohort_id
  ) THEN
    RAISE EXCEPTION 'Only supports in this cohort can reopen its attendance';
  END IF;

  SELECT COALESCE((value->>'attendanceWindowMinutes')::INTEGER, 15)
  INTO v_window_minutes
  FROM public."AppSetting" WHERE "settingKey" = 'programme_rules';
  v_window_minutes := GREATEST(1, COALESCE(v_window_minutes, 15));

  -- A class that closed on its own (the class day passed) may have no session row yet.
  INSERT INTO public."AttendanceSession" ("weekId") VALUES (p_week_id) ON CONFLICT ("weekId") DO NOTHING;

  -- Only a closed register can be reopened; checked on the locked row before anything is changed or sent.
  SELECT * INTO v_session FROM public."AttendanceSession" WHERE "weekId" = p_week_id FOR UPDATE;
  IF v_session.id IS NULL THEN RAISE EXCEPTION 'Attendance session was not found'; END IF;
  IF NOT public.attendance_week_locked(p_week_id) THEN RAISE EXCEPTION 'Attendance is already open'; END IF;

  UPDATE public."AttendanceSession"
  SET "finalizedAt" = NULL,
      "finalizedById" = NULL,
      "finalizationMethod" = NULL,
      "reportNotifiedAt" = NULL,
      -- A support's reopen is always timed, so it closes again by itself.
      "startedAt" = CASE WHEN v_is_admin THEN "startedAt" ELSE COALESCE("startedAt", NOW()) END,
      "closesAt" = CASE WHEN "closesAt" IS NOT NULL OR NOT v_is_admin THEN NOW() + make_interval(mins => v_window_minutes) END,
      "reopenedAt" = NOW(),
      "reopenedById" = v_actor,
      "reopenReason" = v_reason,
      "updatedAt" = NOW()
  WHERE "weekId" = p_week_id
  RETURNING * INTO v_session;

  UPDATE public."AttendanceFollowUpTask"
  SET status = 'CANCELLED', "updatedAt" = NOW()
  WHERE "weekId" = p_week_id AND status = 'OPEN'
    AND (v_is_admin OR "supportId" = v_actor);

  -- Tell the cohort's supports the class is open again.
  SELECT w."weekNumber" INTO v_week_number FROM public."Week" w WHERE w.id = p_week_id;

  SELECT split_part(btrim(COALESCE(u.name, '')), ' ', 1) INTO v_actor_name
  FROM public."User" u WHERE u.id = v_actor;

  SELECT array_agg(DISTINCT u.id) INTO v_user_ids
  FROM public."Group" g
  JOIN public."User" u ON u.id = g."supportId"
  WHERE g."cohortId" = v_cohort_id
    AND (u.role = 'SUPPORT' OR 'SUPPORT'::public."Role" = ANY(u.roles))
    AND u."isActive" IS NOT FALSE
    AND COALESCE(u."isTest", FALSE) = FALSE
    AND u.id IS DISTINCT FROM v_actor;

  IF v_user_ids IS NOT NULL AND array_length(v_user_ids, 1) IS NOT NULL THEN
    v_title := format('Attendance reopened · Week %s', v_week_number);
    v_body := format('%s reopened this class''s register. Open Attendance to check or update your group''s marks.',
                     COALESCE(NULLIF(v_actor_name, ''), 'Someone'));

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

-- 3. Open a missed meeting for yourself ----------------------------------------------------------------------------
-- One place that writes an opening (admins and the support/hub lead go through it). Internal: not callable from the app.
CREATE OR REPLACE FUNCTION public.meeting_recording_upsert(p_hub_id UUID, p_group_id UUID, p_week_id INT, p_until TIMESTAMPTZ, p_actor UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF p_hub_id IS NOT NULL THEN
    INSERT INTO public."MeetingRecordingOpening" ("hubId", "weekId", "openUntil", "openedById")
    VALUES (p_hub_id, p_week_id, p_until, p_actor)
    ON CONFLICT ("hubId", "weekId") WHERE "hubId" IS NOT NULL
    DO UPDATE SET "openUntil" = EXCLUDED."openUntil", "openedById" = EXCLUDED."openedById", "openedAt" = now();
  ELSE
    INSERT INTO public."MeetingRecordingOpening" ("groupId", "weekId", "openUntil", "openedById")
    VALUES (p_group_id, p_week_id, p_until, p_actor)
    ON CONFLICT ("groupId", "weekId") WHERE "groupId" IS NOT NULL
    DO UPDATE SET "openUntil" = EXCLUDED."openUntil", "openedById" = EXCLUDED."openedById", "openedAt" = now();
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.meeting_recording_upsert(UUID, UUID, INT, TIMESTAMPTZ, UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_open_meeting_recording(p_hub_id UUID, p_group_id UUID, p_week_id INT, p_hours INT DEFAULT 24)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_until TIMESTAMPTZ;
BEGIN
  IF NOT public.app_is_admin() THEN
    RAISE EXCEPTION 'Only admins can open recording';
  END IF;
  IF (p_hub_id IS NULL) = (p_group_id IS NULL) THEN
    RAISE EXCEPTION 'Give either a hub or a group';
  END IF;
  IF p_hours IS NULL OR p_hours < 1 OR p_hours > 168 THEN
    RAISE EXCEPTION 'Hours must be between 1 and 168';
  END IF;
  v_until := now() + make_interval(hours => p_hours);
  PERFORM public.meeting_recording_upsert(p_hub_id, p_group_id, p_week_id, v_until, public.app_current_user_id());
  RETURN v_until;
END;
$$;

CREATE OR REPLACE FUNCTION public.open_missed_meeting(p_hub_id UUID, p_group_id UUID, p_week_id INT)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor UUID := public.app_current_user_id();
  v_cohort UUID;
  v_day TEXT;
  v_time TEXT;
  v_window tstzrange;
  v_until TIMESTAMPTZ := now() + interval '48 hours';
BEGIN
  IF NOT public.app_is_staff() OR v_actor IS NULL THEN RAISE EXCEPTION 'NOT_AUTHORISED'; END IF;
  IF (p_hub_id IS NULL) = (p_group_id IS NULL) THEN RAISE EXCEPTION 'Give either a hub or a group'; END IF;

  IF p_group_id IS NOT NULL THEN
    SELECT g."cohortId", g."meetingDay", g."meetingTime" INTO v_cohort, v_day, v_time
    FROM public."Group" g WHERE g.id = p_group_id AND g."supportId" = v_actor;
    IF v_cohort IS NULL THEN RAISE EXCEPTION 'NOT_AUTHORISED: only this group''s support can open its meeting'; END IF;
  ELSE
    IF NOT public.app_hub_can(p_hub_id, 'ATTENDANCE') THEN
      RAISE EXCEPTION 'NOT_AUTHORISED: only this hub''s lead or assistant lead can open its meeting';
    END IF;
    SELECT h."cohortId", h."meetingDay", h."meetingTime" INTO v_cohort, v_day, v_time
    FROM public."SupportHub" h WHERE h.id = p_hub_id;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public."Week" w WHERE w.id = p_week_id AND w."cohortId" = v_cohort) THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;
  -- Only once that week's meeting window (10 minutes before the set time until midnight that day) has ended.
  IF v_day IS NULL OR v_time IS NULL THEN RAISE EXCEPTION 'MEETING_TIME_NOT_SET: set a meeting day and time first'; END IF;
  v_window := public.fof_meeting_window(v_day, v_time, p_week_id);
  IF v_window IS NULL OR upper(v_window) > now() THEN
    RAISE EXCEPTION 'NOT_PAST: this week''s meeting has not passed yet';
  END IF;

  IF p_group_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public."GroupPrayerStatus" s WHERE s."groupId" = p_group_id AND s."weekId" = p_week_id AND s.done) THEN
      RAISE EXCEPTION 'ALREADY_SUBMITTED';
    END IF;
  ELSIF EXISTS (SELECT 1 FROM public."SupportSession" s WHERE s."hubId" = p_hub_id AND s."weekId" = p_week_id
                AND s.type = 'SUNDAY_RECAP' AND s."submittedAt" IS NOT NULL) THEN
    RAISE EXCEPTION 'ALREADY_SUBMITTED';
  END IF;
  PERFORM public.meeting_recording_upsert(p_hub_id, p_group_id, p_week_id, v_until, v_actor);
  RETURN v_until;
END;
$$;

REVOKE ALL ON FUNCTION public.open_missed_meeting(UUID, UUID, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.open_missed_meeting(UUID, UUID, INT) TO anon, authenticated;
