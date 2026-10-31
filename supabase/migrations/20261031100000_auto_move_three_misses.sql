-- Three missed classes move a participant to the next cohort automatically (FLOW_MAP rule 119, owner request
-- 2026-10-31). This replaces the admin's two-absence review before class 3.
--
-- 1. The Saturday before class 3 (4 pm Lagos, the existing absence_review_remind_saturday job) warns, once:
--    each support about their people who were Absent for class 1 and class 2, each of those participants, and the
--    admins (module_viewers('participants')). Nobody moves on that day.
-- 2. On class 3's day from 4 pm Lagos, once class 3's register is finalised, absence_auto_move moves everyone in a
--    group who was Absent for class 1, class 2 and class 3 (absence_auto_candidates). Late, Left early, Excused and
--    unmarked are not misses. The move is the one the admin used to make (out of their groups, archived; an adult's
--    sign-up contact set to join the next cohort as buildStatusPatch('NEXT_COHORT') does; a teen keeps their teen
--    status). It is recorded in AbsenceReviewMove with no actor, AbsenceReviewDone marks it done, and their support
--    and the admins are told (naming anyone who could not be moved, to archive by hand; the run is not repeated).
--    If the register is finalised late, the move still runs up to two days later.
-- 3. An admin can undo a move for three Lagos days (the move's day and the two after), not just the same day.
--
-- absence_review_move (the manual move) is left in place but no screen calls it any more.
-- Rollback: SELECT cron.unschedule('absence_auto_move'); restore absence_review_state, absence_review_undo and
-- absence_review_remind from 20261030130000; DROP FUNCTION absence_auto_move, absence_auto_move_due,
-- absence_auto_candidates, absence_notify_participants.

-- Everyone in a group in this cohort marked Absent for class 1, class 2 and class 3.
CREATE OR REPLACE FUNCTION public.absence_auto_candidates(p_cohort_id UUID)
 RETURNS TABLE("participantId" UUID, "fullName" TEXT, "ageRange" TEXT, "groupIds" UUID[], "groupName" TEXT, "supportId" UUID, "supportName" TEXT, "isTeenGroup" BOOLEAN)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  WITH early AS (
    SELECT w.id FROM public."Week" w WHERE w."cohortId" = p_cohort_id AND w."weekNumber" IN (1, 2, 3)
  ), missed AS (
    SELECT a."participantId"
    FROM public."AttendanceRecord" a
    WHERE a."weekId" IN (SELECT id FROM early) AND a.status = 'ABSENT'
    GROUP BY a."participantId"
    HAVING COUNT(DISTINCT a."weekId") = 3
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
    AND (SELECT COUNT(*) FROM early) = 3
  GROUP BY p.id, p."fullName", p."ageRange";
$function$;
REVOKE ALL ON FUNCTION public.absence_auto_candidates(UUID) FROM PUBLIC, anon, authenticated;

-- A bell and push to participants (their Home), through notify-users.
CREATE OR REPLACE FUNCTION public.absence_notify_participants(p_participant_ids UUID[], p_title TEXT, p_body TEXT, p_path TEXT)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_url TEXT;
  v_key TEXT;
BEGIN
  IF p_participant_ids IS NULL OR array_length(p_participant_ids, 1) IS NULL THEN RETURN; END IF;
  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'project_url';
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'push_reminders_service_key';
  IF v_url IS NULL OR v_key IS NULL THEN RETURN; END IF;
  PERFORM net.http_post(
    url := v_url || '/functions/v1/notify-users',
    headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', v_key, 'Authorization', 'Bearer ' || v_key),
    body := jsonb_build_object('participantIds', to_jsonb(p_participant_ids), 'title', p_title, 'body', p_body, 'path', p_path, 'type', 'ABSENCE_WARNING'),
    timeout_milliseconds := 25000
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.absence_notify_participants(UUID[], TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;

-- The move itself. Runs once per cohort; called by absence_auto_move_due on schedule.
CREATE OR REPLACE FUNCTION public.absence_auto_move(p_cohort_id UUID)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  c RECORD;
  s RECORD;
  v_contact public."FollowUpContact";
  v_moved TEXT[] := '{}';
  v_told JSONB := '[]'::jsonb;
  v_skipped JSONB := '[]'::jsonb;
BEGIN
  -- One run per cohort, even if two scheduled runs overlap.
  PERFORM 1 FROM public."Cohort" WHERE id = p_cohort_id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public."AbsenceReviewDone" WHERE "cohortId" = p_cohort_id) THEN
    RETURN jsonb_build_object('alreadyDone', TRUE);
  END IF;

  FOR c IN SELECT * FROM public.absence_auto_candidates(p_cohort_id) LOOP
    BEGIN
      v_contact := NULL;
      SELECT fc.* INTO v_contact FROM public."FollowUpContact" fc
      JOIN public."Participant" p ON p."followUpContactId" = fc.id WHERE p.id = c."participantId";

      INSERT INTO public."AbsenceReviewMove" ("cohortId", "participantId", "groupIds", "groupName", "supportId", "contactId",
        "prevContactStatus", "prevContactArchivedAt", "prevParticipantStatus", "movedById", "prevContact")
      VALUES (p_cohort_id, c."participantId", c."groupIds", c."groupName", c."supportId", v_contact.id,
        v_contact."registrationStatus", v_contact."archivedAt", 'ACTIVE', NULL,
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
      v_told := v_told || jsonb_build_object('supportId', c."supportId", 'who', c."fullName" || ' (' || COALESCE(c."groupName", 'no group') || ')');
    EXCEPTION WHEN OTHERS THEN
      v_skipped := v_skipped || jsonb_build_object('name', c."fullName", 'reason', regexp_replace(SQLERRM, '^[A-Z_]+: ', ''));
    END;
  END LOOP;

  INSERT INTO public."AbsenceReviewDone" ("cohortId", "doneById", "movedCount", "keptCount")
  VALUES (p_cohort_id, NULL, COALESCE(array_length(v_moved, 1), 0), 0);

  -- Each support hears once, about all of theirs.
  FOR s IN SELECT t."supportId", string_agg(t.who, ', ' ORDER BY t.who) AS who
           FROM jsonb_to_recordset(v_told) AS t("supportId" UUID, who TEXT) WHERE t."supportId" IS NOT NULL GROUP BY t."supportId" LOOP
    PERFORM public.absence_review_notify(ARRAY[s."supportId"], 'Moved to next cohort',
      format('%s missed class 1, class 2 and class 3, so they have moved to the next cohort automatically. If the register was wrong, an admin can undo it for three days.', s.who),
      '/support/participants');
  END LOOP;

  IF COALESCE(array_length(v_moved, 1), 0) > 0 OR jsonb_array_length(v_skipped) > 0 THEN
    PERFORM public.absence_review_notify(
      (SELECT array_agg(id) FROM public.module_viewers('participants') AS id),
      format('%s moved to next cohort', COALESCE(array_length(v_moved, 1), 0)),
      format('%s missed class 1, class 2 and class 3 and moved automatically.%s You can undo a move from Participants for three days.',
        CASE WHEN COALESCE(array_length(v_moved, 1), 0) = 1 THEN '1 person' ELSE COALESCE(array_length(v_moved, 1), 0) || ' people' END,
        CASE WHEN jsonb_array_length(v_skipped) > 0 THEN format(' Not moved, please archive by hand: %s.',
          (SELECT string_agg(x->>'name', ', ') FROM jsonb_array_elements(v_skipped) AS x)) ELSE '' END),
      '/participants');
  END IF;

  RETURN jsonb_build_object('moved', to_jsonb(v_moved), 'skipped', v_skipped);
END;
$function$;
REVOKE ALL ON FUNCTION public.absence_auto_move(UUID) FROM PUBLIC, anon, authenticated;

-- The scheduled check: from 4 pm Lagos on class 3's day (and up to two days after, if the register is finalised
-- late), once class 3's register is finalised, run the move for the current cohort.
CREATE OR REPLACE FUNCTION public.absence_auto_move_due()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_cohort UUID := public.current_programme_cohort_id();
  v_now TIMESTAMP := NOW() AT TIME ZONE 'Africa/Lagos';
  v_class3 DATE;
  v_week3 INTEGER;
BEGIN
  IF v_cohort IS NULL THEN RETURN NULL; END IF;
  SELECT public.week_class_date(c."startDate", w."weekNumber", w."classDate"), w.id INTO v_class3, v_week3
  FROM public."Week" w JOIN public."Cohort" c ON c.id = w."cohortId"
  WHERE w."cohortId" = v_cohort AND w."weekNumber" = 3 LIMIT 1;
  IF v_class3 IS NULL OR v_now < v_class3 + TIME '16:00' OR v_now::date > v_class3 + 2 THEN RETURN NULL; END IF;
  IF EXISTS (SELECT 1 FROM public."AbsenceReviewDone" WHERE "cohortId" = v_cohort) THEN RETURN NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM public."AttendanceSession" WHERE "weekId" = v_week3 AND "finalizedAt" IS NOT NULL) THEN RETURN NULL; END IF;
  RETURN public.absence_auto_move(v_cohort);
END;
$function$;
REVOKE ALL ON FUNCTION public.absence_auto_move_due() FROM PUBLIC, anon, authenticated;

-- The Saturday warning: once, at the 4 pm run of the existing job.
CREATE OR REPLACE FUNCTION public.absence_review_remind()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_cohort UUID := public.current_programme_cohort_id();
  v_today DATE := (NOW() AT TIME ZONE 'Africa/Lagos')::date;
  v_hour INTEGER := EXTRACT(HOUR FROM (NOW() AT TIME ZONE 'Africa/Lagos'))::int;
  v_count INTEGER;
  s RECORD;
BEGIN
  IF v_cohort IS NULL OR v_hour <> 16 THEN RETURN; END IF;
  IF public.absence_review_saturday(v_cohort) IS DISTINCT FROM v_today THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public."AbsenceReviewDone" WHERE "cohortId" = v_cohort) THEN RETURN; END IF;
  SELECT COUNT(*) INTO v_count FROM public.absence_review_candidates(v_cohort);
  IF v_count = 0 THEN RETURN; END IF;

  FOR s IN SELECT "supportId", string_agg("fullName", ', ' ORDER BY "fullName") AS who, COUNT(*) AS n
           FROM public.absence_review_candidates(v_cohort) WHERE "supportId" IS NOT NULL GROUP BY "supportId" LOOP
    PERFORM public.absence_review_notify(ARRAY[s."supportId"],
      'Missed class 1 and class 2',
      format('%s missed class 1 and class 2. %s Please reach out today.', s.who,
        CASE WHEN s.n = 1 THEN 'If they also miss class 3 tomorrow, they move to the next cohort automatically at 4 pm.'
             ELSE 'Anyone who also misses class 3 tomorrow moves to the next cohort automatically at 4 pm.' END),
      '/support/participants');
  END LOOP;

  PERFORM public.absence_notify_participants(
    (SELECT array_agg("participantId") FROM public.absence_review_candidates(v_cohort)),
    'Please come to class tomorrow',
    'You have missed class 1 and class 2. If you miss class 3 tomorrow too, you will move to the next cohort and can start again there.',
    '/me');

  PERFORM public.absence_review_notify(
    (SELECT array_agg(id) FROM public.module_viewers('participants') AS id),
    'Missed class 1 and class 2',
    format('%s %s missed class 1 and class 2. Anyone also absent from class 3 tomorrow moves to the next cohort automatically at 4 pm. They and their supports have been told.',
      v_count, CASE WHEN v_count = 1 THEN 'person' ELSE 'people' END),
    '/participants');
END;
$function$;

-- What the admin card shows: the warning list until the move, then who moved (undo for three days).
CREATE OR REPLACE FUNCTION public.absence_review_state(p_token text)
 RETURNS jsonb
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
  v_warning BOOLEAN;
BEGIN
  IF v_admin.id IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  IF v_admin.role <> 'ADMIN'::public."Role" THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  IF v_cohort IS NULL THEN RETURN jsonb_build_object('open', FALSE); END IF;

  v_saturday := public.absence_review_saturday(v_cohort);
  SELECT * INTO v_done FROM public."AbsenceReviewDone" WHERE "cohortId" = v_cohort;
  -- From the Saturday before class 3 until the automatic move has run.
  v_warning := v_saturday IS NOT NULL AND v_today BETWEEN v_saturday AND v_saturday + 3 AND v_done."cohortId" IS NULL;

  RETURN jsonb_build_object(
    'cohortId', v_cohort,
    'cohortName', (SELECT name FROM public."Cohort" WHERE id = v_cohort),
    'saturday', v_saturday,
    'moveAt', CASE WHEN v_saturday IS NULL THEN NULL ELSE to_char(v_saturday + 1, 'YYYY-MM-DD') || 'T16:00:00+01:00' END,
    'open', v_warning,
    'done', CASE WHEN v_done."cohortId" IS NULL THEN NULL ELSE jsonb_build_object(
      'at', v_done."doneAt", 'by', (SELECT name FROM public."User" WHERE id = v_done."doneById"),
      'automatic', v_done."doneById" IS NULL,
      'moved', v_done."movedCount", 'kept', v_done."keptCount") END,
    'people', CASE WHEN NOT v_warning THEN '[]'::jsonb ELSE COALESCE((
      SELECT jsonb_agg(jsonb_build_object('participantId', c."participantId", 'fullName', c."fullName",
        'ageRange', c."ageRange", 'groupName', c."groupName", 'supportName', c."supportName",
        'isTeen', c."isTeenGroup" OR c."ageRange" = '10 - 17') ORDER BY c."groupName", c."fullName")
      FROM public.absence_review_candidates(v_cohort) c), '[]'::jsonb) END,
    'undoable', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', m.id, 'participantId', m."participantId",
        'fullName', (SELECT "fullName" FROM public."Participant" WHERE id = m."participantId"),
        'groupName', m."groupName", 'movedAt', m."movedAt",
        'undoUntil', to_char((m."movedAt" AT TIME ZONE 'Africa/Lagos')::date + 2, 'YYYY-MM-DD')) ORDER BY m."movedAt" DESC)
      FROM public."AbsenceReviewMove" m
      WHERE m."cohortId" = v_cohort AND m."undoneAt" IS NULL
        AND (m."movedAt" AT TIME ZONE 'Africa/Lagos')::date >= v_today - 2), '[]'::jsonb)
  );
END;
$function$;

-- Undo for three Lagos days: the move's day and the two after.
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
  IF (NOW() AT TIME ZONE 'Africa/Lagos')::date > (m."movedAt" AT TIME ZONE 'Africa/Lagos')::date + 2 THEN
    RAISE EXCEPTION 'A move can only be undone within three days';
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

-- Every 15 minutes; it does nothing outside class 3's afternoon and the two days after.
SELECT cron.schedule('absence_auto_move', '*/15 * * * *', $$SELECT public.absence_auto_move_due();$$);
