-- Fixes from the code review of 20261030100000 and 20261030110000 (FLOW_MAP rules 12 and 119).
--
-- Attendance lock:
--   * a support can no longer press Start on a past class to open a fresh window (start_attendance_window checks
--     attendance_week_locked);
--   * an admin reopen of a week that never had a timed window now opens it to supports until it is finalised again.
-- Two-absence review:
--   * open from the Saturday before class 3 until the end of class 3's day (not every week after);
--   * once done it cannot be run again, so a second admin on an old page cannot move the people the first kept;
--   * marked done only when every chosen move went through;
--   * teens leave their group and are archived, but keep their teen sign-up status (rule 28);
--   * the support told is the first group that has a support;
--   * reminders link to Participants;
--   * an adult's contact gets the same fields as Will join next cohort does in the app (buildStatusPatch, rule 5:
--     message, reply and call steps reset, next action Close, not archived), and undo restores every one of them
--     from "AbsenceReviewMove"."prevContact".
--
-- Rollback: re-apply the functions from 20261030100000, 20261030110000 and start_attendance_window from
-- 20260923000000_sunday_attendance_late_rule.sql.

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
    -- An admin reopened a week that never had a timed window: open until it is finalised again.
    WHEN s."reopenedAt" IS NOT NULL THEN FALSE
    ELSE public.week_class_date(c."startDate", w."weekNumber", w."classDate") < (NOW() AT TIME ZONE 'Africa/Lagos')::date
  END
  FROM public."Week" w
  JOIN public."Cohort" c ON c.id = w."cohortId"
  LEFT JOIN public."AttendanceSession" s ON s."weekId" = w.id
  WHERE w.id = p_week_id;
$function$;

CREATE OR REPLACE FUNCTION public.start_attendance_window(p_week_id integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
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
  IF NOT public.app_is_admin() AND COALESCE(public.attendance_week_locked(p_week_id), FALSE) THEN
    RAISE EXCEPTION 'ATTENDANCE_LOCKED: Attendance for this class is closed. To dispute a mark, message an admin.';
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

ALTER TABLE public."AbsenceReviewMove" ADD COLUMN IF NOT EXISTS "prevContact" JSONB;

CREATE OR REPLACE FUNCTION public.absence_review_candidates(p_cohort_id UUID)
 RETURNS TABLE ("participantId" UUID, "fullName" TEXT, "ageRange" TEXT, "groupIds" UUID[], "groupName" TEXT,
                "supportId" UUID, "supportName" TEXT, "isTeenGroup" BOOLEAN)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  WITH early AS (
    SELECT w.id FROM public."Week" w WHERE w."cohortId" = p_cohort_id AND w."weekNumber" IN (1, 2)
  ), missed AS (
    SELECT a."participantId"
    FROM public."AttendanceRecord" a
    WHERE a."weekId" IN (SELECT id FROM early) AND a.status = 'ABSENT'
    GROUP BY a."participantId"
    HAVING COUNT(DISTINCT a."weekId") = 2
  )
  SELECT p.id, p."fullName", p."ageRange",
         array_agg(DISTINCT g.id),
         string_agg(DISTINCT g.name, ', '),
         (array_agg(g."supportId" ORDER BY g."createdAt") FILTER (WHERE g."supportId" IS NOT NULL))[1],
         (SELECT u.name FROM public."User" u WHERE u.id = (array_agg(g."supportId" ORDER BY g."createdAt") FILTER (WHERE g."supportId" IS NOT NULL))[1]),
         bool_or(COALESCE(g."isTeenGroup", FALSE))
  FROM missed m
  JOIN public."Participant" p ON p.id = m."participantId"
  JOIN public."GroupParticipant" gp ON gp."participantId" = p.id
  JOIN public."Group" g ON g.id = gp."groupId" AND g."cohortId" = p_cohort_id AND g."archivedAt" IS NULL
  WHERE p."cohortId" = p_cohort_id
    AND p.status = 'ACTIVE'
    AND p."isTest" IS NOT TRUE
    AND (SELECT COUNT(*) FROM early) = 2
  GROUP BY p.id, p."fullName", p."ageRange";
$function$;

CREATE OR REPLACE FUNCTION public.absence_review_state(p_token TEXT)
 RETURNS JSONB
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_admin public."User" := public.app_staff(p_token);
  v_cohort UUID := public.current_programme_cohort_id();
  v_today DATE := (NOW() AT TIME ZONE 'Africa/Lagos')::date;
  v_saturday DATE;
  v_done public."AbsenceReviewDone";
BEGIN
  IF v_admin.id IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  IF v_admin.role <> 'ADMIN'::public."Role" THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  IF v_cohort IS NULL THEN RETURN jsonb_build_object('open', FALSE); END IF;

  v_saturday := public.absence_review_saturday(v_cohort);
  SELECT * INTO v_done FROM public."AbsenceReviewDone" WHERE "cohortId" = v_cohort;

  RETURN jsonb_build_object(
    'cohortId', v_cohort,
    'cohortName', (SELECT name FROM public."Cohort" WHERE id = v_cohort),
    'saturday', v_saturday,
    'open', v_saturday IS NOT NULL AND v_today BETWEEN v_saturday AND v_saturday + 1 AND v_done."cohortId" IS NULL,
    'done', CASE WHEN v_done."cohortId" IS NULL THEN NULL ELSE jsonb_build_object(
      'at', v_done."doneAt", 'by', (SELECT name FROM public."User" WHERE id = v_done."doneById"),
      'moved', v_done."movedCount", 'kept', v_done."keptCount") END,
    'people', CASE WHEN v_saturday IS NULL OR v_today NOT BETWEEN v_saturday AND v_saturday + 1 OR v_done."cohortId" IS NOT NULL THEN '[]'::jsonb ELSE COALESCE((
      SELECT jsonb_agg(jsonb_build_object('participantId', c."participantId", 'fullName', c."fullName",
        'ageRange', c."ageRange", 'groupName', c."groupName", 'supportName', c."supportName",
        'isTeen', c."isTeenGroup" OR c."ageRange" = '10 - 17') ORDER BY c."groupName", c."fullName")
      FROM public.absence_review_candidates(v_cohort) c), '[]'::jsonb) END,
    'undoable', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', m.id, 'participantId', m."participantId",
        'fullName', (SELECT "fullName" FROM public."Participant" WHERE id = m."participantId"),
        'groupName', m."groupName", 'movedAt', m."movedAt") ORDER BY m."movedAt" DESC)
      FROM public."AbsenceReviewMove" m
      WHERE m."cohortId" = v_cohort AND m."undoneAt" IS NULL
        AND (m."movedAt" AT TIME ZONE 'Africa/Lagos')::date = v_today), '[]'::jsonb)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.absence_review_move(p_token TEXT, p_participant_ids UUID[])
 RETURNS JSONB
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_admin public."User" := public.app_staff(p_token);
  v_cohort UUID := public.current_programme_cohort_id();
  v_today DATE := (NOW() AT TIME ZONE 'Africa/Lagos')::date;
  v_saturday DATE;
  v_total INTEGER;
  c RECORD;
  v_contact public."FollowUpContact";
  v_moved TEXT[] := '{}';
  v_skipped JSONB := '[]'::jsonb;
BEGIN
  IF v_admin.id IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  IF v_admin.role <> 'ADMIN'::public."Role" THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  v_saturday := public.absence_review_saturday(v_cohort);
  IF v_cohort IS NULL OR v_saturday IS NULL OR v_today NOT BETWEEN v_saturday AND v_saturday + 1 THEN
    RAISE EXCEPTION 'The two-absence review is open from the Saturday before class 3 until the end of class 3''s day';
  END IF;
  -- One review per cohort: a second admin on an old page cannot move the people the first one kept.
  PERFORM 1 FROM public."Cohort" WHERE id = v_cohort FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public."AbsenceReviewDone" WHERE "cohortId" = v_cohort) THEN
    RAISE EXCEPTION 'This review was already done. Reload the page to see who was moved.';
  END IF;

  SELECT COUNT(*) INTO v_total FROM public.absence_review_candidates(v_cohort);

  FOR c IN SELECT * FROM public.absence_review_candidates(v_cohort) WHERE "participantId" = ANY (COALESCE(p_participant_ids, '{}')) LOOP
    BEGIN
      SELECT fc.* INTO v_contact FROM public."FollowUpContact" fc
      JOIN public."Participant" p ON p."followUpContactId" = fc.id WHERE p.id = c."participantId";

      INSERT INTO public."AbsenceReviewMove" ("cohortId", "participantId", "groupIds", "groupName", "supportId", "contactId",
        "prevContactStatus", "prevContactArchivedAt", "prevParticipantStatus", "movedById", "prevContact")
      VALUES (v_cohort, c."participantId", c."groupIds", c."groupName", c."supportId", v_contact.id,
        v_contact."registrationStatus", v_contact."archivedAt", 'ACTIVE', v_admin.id,
        CASE WHEN v_contact.id IS NULL THEN NULL ELSE jsonb_build_object(
          'registrationStatus', v_contact."registrationStatus", 'archivedAt', v_contact."archivedAt",
          'messageStatus', v_contact."messageStatus", 'replyStatus', v_contact."replyStatus", 'callStatus', v_contact."callStatus",
          'nextAction', v_contact."nextAction", 'teenOnboardedHow', v_contact."teenOnboardedHow") END);

      DELETE FROM public."GroupParticipant" WHERE "participantId" = c."participantId" AND "groupId" = ANY (c."groupIds");
      UPDATE public."Participant" SET status = 'ARCHIVED', "updatedAt" = NOW() WHERE id = c."participantId";
      -- Teens keep their teen sign-up status; their Teen Support decides about the next cohort (rule 28).
      IF v_contact.id IS NOT NULL AND NOT (c."isTeenGroup" OR c."ageRange" = '10 - 17') THEN
        UPDATE public."FollowUpContact"
        -- The same fields as buildStatusPatch('NEXT_COHORT') in the app (rule 5).
        SET "registrationStatus" = 'NEXT_COHORT', "archivedAt" = NULL, "messageStatus" = 'NOT_SENT', "replyStatus" = 'NO_REPLY',
            "callStatus" = 'NOT_CALLED', "nextAction" = 'CLOSE', "teenOnboardedHow" = NULL, "statusChangedAt" = NOW(), "updatedAt" = NOW()
        WHERE id = v_contact.id;
      END IF;

      v_moved := v_moved || c."fullName";
      IF c."supportId" IS NOT NULL THEN
        PERFORM public.absence_review_notify(ARRAY[c."supportId"],
          'Moved to next cohort',
          format('%s missed class 1 and class 2, so an admin has moved them out of %s and onto the next cohort.', c."fullName", c."groupName"),
          '/support/participants');
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_skipped := v_skipped || jsonb_build_object('name', c."fullName", 'reason', regexp_replace(SQLERRM, '^[A-Z_]+: ', ''));
    END;
  END LOOP;

  -- Done only when every chosen move went through; otherwise the list stays open so the rest can be tried again.
  IF jsonb_array_length(v_skipped) = 0 THEN
    INSERT INTO public."AbsenceReviewDone" ("cohortId", "doneById", "movedCount", "keptCount")
    VALUES (v_cohort, v_admin.id, COALESCE(array_length(v_moved, 1), 0),
            GREATEST(v_total - COALESCE(array_length(v_moved, 1), 0), 0));
  END IF;

  RETURN jsonb_build_object('moved', to_jsonb(v_moved), 'skipped', v_skipped);
END;
$function$;

CREATE OR REPLACE FUNCTION public.absence_review_remind()
 RETURNS VOID
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_cohort UUID := public.current_programme_cohort_id();
  v_today DATE := (NOW() AT TIME ZONE 'Africa/Lagos')::date;
  v_hour INTEGER := EXTRACT(HOUR FROM (NOW() AT TIME ZONE 'Africa/Lagos'))::int;
  v_count INTEGER;
BEGIN
  IF v_cohort IS NULL OR v_hour NOT BETWEEN 16 AND 19 THEN RETURN; END IF;
  IF public.absence_review_saturday(v_cohort) IS DISTINCT FROM v_today THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public."AbsenceReviewDone" WHERE "cohortId" = v_cohort) THEN RETURN; END IF;
  SELECT COUNT(*) INTO v_count FROM public.absence_review_candidates(v_cohort);
  IF v_count = 0 THEN RETURN; END IF;

  PERFORM public.absence_review_notify(
    (SELECT array_agg(id) FROM public.module_viewers('participants') AS id),
    'Two-absence review waiting',
    format('%s %s missed class 1 and class 2. Review and move them before tomorrow''s class.', v_count, CASE WHEN v_count = 1 THEN 'person' ELSE 'people' END),
    '/participants');
END;
$function$;

CREATE OR REPLACE FUNCTION public.absence_review_undo(p_token text, p_move_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_admin public."User" := public.app_staff(p_token);
  m public."AbsenceReviewMove";
  v_name TEXT;
BEGIN
  IF v_admin.id IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  IF v_admin.role <> 'ADMIN'::public."Role" THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  SELECT * INTO m FROM public."AbsenceReviewMove" WHERE id = p_move_id FOR UPDATE;
  IF m.id IS NULL OR m."undoneAt" IS NOT NULL THEN RAISE EXCEPTION 'That move was already undone'; END IF;
  IF (m."movedAt" AT TIME ZONE 'Africa/Lagos')::date <> (NOW() AT TIME ZONE 'Africa/Lagos')::date THEN
    RAISE EXCEPTION 'A move can only be undone on the day it was made';
  END IF;

  UPDATE public."Participant" SET status = m."prevParticipantStatus", "updatedAt" = NOW() WHERE id = m."participantId"
  RETURNING "fullName" INTO v_name;
  INSERT INTO public."GroupParticipant" ("groupId", "participantId")
  SELECT g.id, m."participantId" FROM public."Group" g WHERE g.id = ANY (m."groupIds") AND g."archivedAt" IS NULL
  ON CONFLICT DO NOTHING;
  -- Put back every field the move changed (older moves without a snapshot restore status and archive date only).
  IF m."contactId" IS NOT NULL AND m."prevContact" IS NOT NULL THEN
    UPDATE public."FollowUpContact"
    SET "registrationStatus" = (m."prevContact"->>'registrationStatus')::public."FollowUpRegistrationStatus",
        "archivedAt" = (m."prevContact"->>'archivedAt')::timestamptz,
        "messageStatus" = (m."prevContact"->>'messageStatus')::public."FollowUpMessageStatus",
        "replyStatus" = (m."prevContact"->>'replyStatus')::public."FollowUpReplyStatus",
        "callStatus" = (m."prevContact"->>'callStatus')::public."FollowUpCallStatus",
        "nextAction" = (m."prevContact"->>'nextAction')::public."FollowUpNextAction",
        "teenOnboardedHow" = m."prevContact"->>'teenOnboardedHow',
        "statusChangedAt" = NOW(), "updatedAt" = NOW()
    WHERE id = m."contactId";
  ELSIF m."contactId" IS NOT NULL THEN
    UPDATE public."FollowUpContact"
    SET "registrationStatus" = m."prevContactStatus"::public."FollowUpRegistrationStatus", "archivedAt" = m."prevContactArchivedAt", "statusChangedAt" = NOW(), "updatedAt" = NOW()
    WHERE id = m."contactId";
  END IF;
  UPDATE public."AbsenceReviewMove" SET "undoneAt" = NOW(), "undoneById" = v_admin.id WHERE id = m.id;
  UPDATE public."AbsenceReviewDone" SET "movedCount" = GREATEST("movedCount" - 1, 0), "keptCount" = "keptCount" + 1 WHERE "cohortId" = m."cohortId";

  IF m."supportId" IS NOT NULL THEN
    PERFORM public.absence_review_notify(ARRAY[m."supportId"], 'Back in your group',
      format('%s has been put back in %s. The move to next cohort was undone.', v_name, m."groupName"), '/support/participants');
  END IF;
END;
$function$;
