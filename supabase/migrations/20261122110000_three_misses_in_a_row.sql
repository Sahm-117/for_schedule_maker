-- Three missed classes IN A ROW move a participant to the next cohort, at any point in the cohort (FLOW_MAP rule 119,
-- owner request 2026-11-22). Before, the check ran once, after class 3, for people absent at classes 1, 2 and 3.
--
-- * After every class from week 3 on (4 pm Lagos on its class day, once that week's register is finalised, and up to two
--   days later if it is finalised late), absence_streak_move moves everyone marked Absent at that class and at the two
--   classes before it (by week number). Late, Left early, Excused and unmarked are not misses, so they break a run.
--   The move itself is the existing one (out of their groups, archived, an adult's contact set to join the next cohort,
--   a teen keeps their teen status; recorded in AbsenceReviewMove with no actor, undo for three days).
-- * Each (cohort, week) runs once: AbsenceAutoRun. Cohorts whose week 3 run already happened (AbsenceReviewDone) are
--   recorded as done for week 3, so nothing repeats. Owner chose: start with the next class (Cohort 10 week 6,
--   22 Nov 2026); nobody is moved for weeks that already passed.
-- * The day before each class from week 3 on (the existing Saturday 4 pm run), absence_review_remind warns anyone
--   absent at the last two classes, their support and the admins, naming the weeks.
-- * absence_review_state (the admin card) shows that warning list for the next class until it has run, with its week
--   number, and the moves still undoable.
--
-- Rollback: DROP FUNCTION absence_streak_candidates, absence_streak_move; DROP TABLE "AbsenceAutoRun"; re-run
-- absence_auto_move_due, absence_review_remind and absence_review_state from 20261031100000_auto_move_three_misses.sql.

CREATE TABLE IF NOT EXISTS public."AbsenceAutoRun" (
  "cohortId" UUID NOT NULL REFERENCES public."Cohort"(id) ON DELETE CASCADE,
  "weekId" INTEGER NOT NULL REFERENCES public."Week"(id) ON DELETE CASCADE,
  "ranAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "movedCount" INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY ("cohortId", "weekId")
);
-- Born locked (rule 11).
ALTER TABLE public."AbsenceAutoRun" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."AbsenceAutoRun" FROM anon, authenticated;

-- The week 3 runs that already happened count as done.
INSERT INTO public."AbsenceAutoRun" ("cohortId", "weekId", "ranAt", "movedCount")
SELECT d."cohortId", w.id, d."doneAt", d."movedCount"
FROM public."AbsenceReviewDone" d
JOIN public."Week" w ON w."cohortId" = d."cohortId" AND w."weekNumber" = 3
ON CONFLICT DO NOTHING;

-- Everyone in this cohort marked Absent at every one of the p_count classes ending with week p_week_number.
CREATE OR REPLACE FUNCTION public.absence_streak_candidates(p_cohort_id uuid, p_week_number integer, p_count integer)
 RETURNS TABLE("participantId" uuid, "fullName" text, "ageRange" text, "groupIds" uuid[], "groupName" text, "supportId" uuid, "supportName" text, "isTeenGroup" boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  WITH span AS (
    SELECT w.id FROM public."Week" w
    WHERE w."cohortId" = p_cohort_id AND w."weekNumber" BETWEEN p_week_number - p_count + 1 AND p_week_number
  ), missed AS (
    SELECT a."participantId"
    FROM public."AttendanceRecord" a
    WHERE a."weekId" IN (SELECT id FROM span) AND a.status = 'ABSENT'
    GROUP BY a."participantId"
    HAVING COUNT(DISTINCT a."weekId") = p_count
  )
  SELECT p.id, p."fullName", p."ageRange",
         COALESCE(array_agg(DISTINCT g.id) FILTER (WHERE g.id IS NOT NULL), '{}'::uuid[]),
         string_agg(DISTINCT g.name, ', '),
         (array_agg(g."supportId" ORDER BY g."createdAt") FILTER (WHERE g."supportId" IS NOT NULL))[1],
         (SELECT u.name FROM public."User" u WHERE u.id = (array_agg(g."supportId" ORDER BY g."createdAt") FILTER (WHERE g."supportId" IS NOT NULL))[1]),
         COALESCE(bool_or(g."isTeenGroup"), FALSE)
  FROM missed m
  JOIN public."Participant" p ON p.id = m."participantId"
  -- People in no group are included too (owner's decision, 1 Nov 2026): their group columns come back empty.
  LEFT JOIN (public."GroupParticipant" gp
    JOIN public."Group" g ON g.id = gp."groupId" AND g."archivedAt" IS NULL)
    ON gp."participantId" = p.id AND g."cohortId" = p_cohort_id
  WHERE p."cohortId" = p_cohort_id
    AND p.status = 'ACTIVE'
    AND p."isTest" IS NOT TRUE
    AND p_count >= 1
    AND (SELECT COUNT(*) FROM span) = p_count
  GROUP BY p.id, p."fullName", p."ageRange";
$function$;
REVOKE ALL ON FUNCTION public.absence_streak_candidates(uuid, integer, integer) FROM PUBLIC, anon, authenticated;

-- The move for one class: everyone Absent at it and the two before. The body is absence_auto_move's (20261031100000),
-- with the candidates, the run record and the wording changed.
CREATE OR REPLACE FUNCTION public.absence_streak_move(p_cohort_id uuid, p_week_id integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  c RECORD;
  s RECORD;
  v_week integer;
  v_weeks text;
  v_contact public."FollowUpContact";
  v_moved TEXT[] := '{}';
  v_told JSONB := '[]'::jsonb;
  v_skipped JSONB := '[]'::jsonb;
BEGIN
  -- One run per cohort and week, even if two scheduled runs overlap.
  PERFORM 1 FROM public."Cohort" WHERE id = p_cohort_id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public."AbsenceAutoRun" WHERE "cohortId" = p_cohort_id AND "weekId" = p_week_id) THEN
    RETURN jsonb_build_object('alreadyDone', TRUE);
  END IF;
  SELECT w."weekNumber" INTO v_week FROM public."Week" w WHERE w.id = p_week_id AND w."cohortId" = p_cohort_id;
  IF v_week IS NULL OR v_week < 3 THEN RETURN NULL; END IF;
  v_weeks := format('Week %s, Week %s and Week %s', v_week - 2, v_week - 1, v_week);

  FOR c IN SELECT * FROM public.absence_streak_candidates(p_cohort_id, v_week, 3) LOOP
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

  INSERT INTO public."AbsenceAutoRun" ("cohortId", "weekId", "movedCount")
  VALUES (p_cohort_id, p_week_id, COALESCE(array_length(v_moved, 1), 0));

  -- Each support hears once, about all of theirs.
  FOR s IN SELECT t."supportId", string_agg(t.who, ', ' ORDER BY t.who) AS who
           FROM jsonb_to_recordset(v_told) AS t("supportId" UUID, who TEXT) WHERE t."supportId" IS NOT NULL GROUP BY t."supportId" LOOP
    PERFORM public.absence_review_notify(ARRAY[s."supportId"], 'Moved to next cohort',
      format('%s missed %s in a row, so they have moved to the next cohort automatically. If the register was wrong, an admin can undo it for three days.', s.who, v_weeks),
      '/support/participants');
  END LOOP;

  IF COALESCE(array_length(v_moved, 1), 0) > 0 OR jsonb_array_length(v_skipped) > 0 THEN
    PERFORM public.absence_review_notify(
      (SELECT array_agg(id) FROM public.module_viewers('participants') AS id),
      format('%s moved to next cohort', COALESCE(array_length(v_moved, 1), 0)),
      format('%s missed %s in a row and moved automatically.%s You can undo a move from Participants for three days.',
        CASE WHEN COALESCE(array_length(v_moved, 1), 0) = 1 THEN '1 person' ELSE COALESCE(array_length(v_moved, 1), 0) || ' people' END,
        v_weeks,
        CASE WHEN jsonb_array_length(v_skipped) > 0 THEN format(' Not moved, please archive by hand: %s.',
          (SELECT string_agg(x->>'name', ', ') FROM jsonb_array_elements(v_skipped) AS x)) ELSE '' END),
      '/participants');
  END IF;

  RETURN jsonb_build_object('week', v_week, 'moved', to_jsonb(v_moved), 'skipped', v_skipped);
END;
$function$;
REVOKE ALL ON FUNCTION public.absence_streak_move(uuid, integer) FROM PUBLIC, anon, authenticated;

-- The scheduled check (every 15 minutes, the existing absence_auto_move job): for the current cohort, each class from
-- week 3 on whose day is today or up to two days ago, from 4 pm on its day, once its register is finalised.
CREATE OR REPLACE FUNCTION public.absence_auto_move_due()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_cohort UUID := public.current_programme_cohort_id();
  v_now TIMESTAMP := NOW() AT TIME ZONE 'Africa/Lagos';
  r RECORD;
  v_out JSONB := '[]'::jsonb;
BEGIN
  IF v_cohort IS NULL THEN RETURN NULL; END IF;
  FOR r IN
    SELECT w.id, public.week_class_date(c."startDate", w."weekNumber", w."classDate") AS d
    FROM public."Week" w JOIN public."Cohort" c ON c.id = w."cohortId"
    WHERE w."cohortId" = v_cohort AND w."weekNumber" >= 3
    ORDER BY w."weekNumber"
  LOOP
    CONTINUE WHEN r.d IS NULL OR v_now < r.d + TIME '16:00' OR v_now::date > r.d + 2;
    CONTINUE WHEN EXISTS (SELECT 1 FROM public."AbsenceAutoRun" WHERE "cohortId" = v_cohort AND "weekId" = r.id);
    CONTINUE WHEN NOT EXISTS (SELECT 1 FROM public."AttendanceSession" WHERE "weekId" = r.id AND "finalizedAt" IS NOT NULL);
    v_out := v_out || COALESCE(public.absence_streak_move(v_cohort, r.id), 'null'::jsonb);
  END LOOP;
  RETURN CASE WHEN jsonb_array_length(v_out) = 0 THEN NULL ELSE v_out END;
END;
$function$;
REVOKE ALL ON FUNCTION public.absence_auto_move_due() FROM PUBLIC, anon, authenticated;

-- The day-before warning: once, at the 4 pm run of the existing Saturday job, for tomorrow's class (week 3 on).
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
  v_week_id INTEGER;
  v_week INTEGER;
  v_two TEXT;
  v_count INTEGER;
  s RECORD;
BEGIN
  IF v_cohort IS NULL OR v_hour <> 16 THEN RETURN; END IF;
  SELECT w.id, w."weekNumber" INTO v_week_id, v_week
  FROM public."Week" w JOIN public."Cohort" c ON c.id = w."cohortId"
  WHERE w."cohortId" = v_cohort AND w."weekNumber" >= 3
    AND public.week_class_date(c."startDate", w."weekNumber", w."classDate") = v_today + 1
  LIMIT 1;
  IF v_week_id IS NULL THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public."AbsenceAutoRun" WHERE "cohortId" = v_cohort AND "weekId" = v_week_id) THEN RETURN; END IF;
  SELECT COUNT(*) INTO v_count FROM public.absence_streak_candidates(v_cohort, v_week - 1, 2);
  IF v_count = 0 THEN RETURN; END IF;
  v_two := format('Week %s and Week %s', v_week - 2, v_week - 1);

  FOR s IN SELECT "supportId", string_agg("fullName", ', ' ORDER BY "fullName") AS who, COUNT(*) AS n
           FROM public.absence_streak_candidates(v_cohort, v_week - 1, 2) WHERE "supportId" IS NOT NULL GROUP BY "supportId" LOOP
    PERFORM public.absence_review_notify(ARRAY[s."supportId"],
      format('Missed %s', v_two),
      format('%s missed %s. %s Please reach out today.', s.who, v_two,
        CASE WHEN s.n = 1 THEN format('If they also miss Week %s tomorrow, they move to the next cohort automatically at 4 pm.', v_week)
             ELSE format('Anyone who also misses Week %s tomorrow moves to the next cohort automatically at 4 pm.', v_week) END),
      '/support/participants');
  END LOOP;

  PERFORM public.absence_notify_participants(
    (SELECT array_agg("participantId") FROM public.absence_streak_candidates(v_cohort, v_week - 1, 2)),
    'Please come to class tomorrow',
    format('You have missed %s. If you miss Week %s tomorrow too, you will move to the next cohort and can start again there.', v_two, v_week),
    '/me');

  PERFORM public.absence_review_notify(
    (SELECT array_agg(id) FROM public.module_viewers('participants') AS id),
    format('Missed %s', v_two),
    format('%s %s missed %s. Anyone also absent from Week %s tomorrow moves to the next cohort automatically at 4 pm. They and their supports have been told.',
      v_count, CASE WHEN v_count = 1 THEN 'person' ELSE 'people' END, v_two, v_week),
    '/participants');
END;
$function$;

-- What the admin card shows: the warning list for the next class (from the day before until it has run, up to two days
-- after it), then the moves still undoable. Same shape as before, plus weekNumber.
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
  v_week_id INTEGER;
  v_week INTEGER;
  v_date DATE;
  v_last public."AbsenceAutoRun";
  v_warning BOOLEAN;
BEGIN
  IF v_admin.id IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  IF v_admin.role <> 'ADMIN'::public."Role" THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  IF v_cohort IS NULL THEN RETURN jsonb_build_object('open', FALSE); END IF;

  -- The next class (week 3 on) that has not run yet and is no more than two days past.
  SELECT w.id, w."weekNumber", public.week_class_date(c."startDate", w."weekNumber", w."classDate")
    INTO v_week_id, v_week, v_date
  FROM public."Week" w JOIN public."Cohort" c ON c.id = w."cohortId"
  WHERE w."cohortId" = v_cohort AND w."weekNumber" >= 3
    AND public.week_class_date(c."startDate", w."weekNumber", w."classDate") >= v_today - 2
    AND NOT EXISTS (SELECT 1 FROM public."AbsenceAutoRun" r WHERE r."cohortId" = v_cohort AND r."weekId" = w.id)
  ORDER BY w."weekNumber"
  LIMIT 1;
  v_warning := v_date IS NOT NULL AND v_today BETWEEN v_date - 1 AND v_date + 2;
  SELECT * INTO v_last FROM public."AbsenceAutoRun" WHERE "cohortId" = v_cohort ORDER BY "ranAt" DESC LIMIT 1;

  RETURN jsonb_build_object(
    'cohortId', v_cohort,
    'cohortName', (SELECT name FROM public."Cohort" WHERE id = v_cohort),
    'weekNumber', v_week,
    'saturday', CASE WHEN v_date IS NULL THEN NULL ELSE v_date - 1 END,
    'moveAt', CASE WHEN v_date IS NULL THEN NULL ELSE to_char(v_date, 'YYYY-MM-DD') || 'T16:00:00+01:00' END,
    'open', v_warning,
    'done', CASE WHEN v_last."cohortId" IS NULL THEN NULL ELSE jsonb_build_object(
      'at', v_last."ranAt", 'by', NULL, 'automatic', TRUE, 'moved', v_last."movedCount", 'kept', 0) END,
    'people', CASE WHEN NOT v_warning THEN '[]'::jsonb ELSE COALESCE((
      SELECT jsonb_agg(jsonb_build_object('participantId', c."participantId", 'fullName', c."fullName",
        'ageRange', c."ageRange", 'groupName', c."groupName", 'supportName', c."supportName",
        'isTeen', c."isTeenGroup" OR c."ageRange" = '10 - 17') ORDER BY c."groupName", c."fullName")
      FROM public.absence_streak_candidates(v_cohort, v_week - 1, 2) c), '[]'::jsonb) END,
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
