-- Two-absence review before class 3 (FLOW_MAP rule 119).
--
-- From the Saturday before week 3's class, the admin Dashboard and Participants page list everyone in a group in
-- the current cohort who was marked Absent for both class 1 and class 2. Late, Left early and Excused are not misses,
-- and an unmarked class is not a miss. Nothing moves by itself: an admin reviews the list, unticks anyone to keep,
-- and presses Move. Each person moved is
--   * taken out of their group(s) in the cohort,
--   * archived (Participant.status = 'ARCHIVED', as the existing Archive participant action does),
--   * set to Will join next cohort on their sign-up contact (registrationStatus NEXT_COHORT, reopened), so the
--     existing next-cohort carry-over offers them (rule 28),
-- and their support is told why. Every move is recorded in "AbsenceReviewMove" so it can be undone the same day
-- (Lagos time). Admins and Team members who can see Participants get a reminder at 4, 5, 6 and 7 pm (Lagos) that
-- Saturday while the review is not done.
--
-- Rollback: SELECT cron.unschedule('absence_review_remind_saturday'); DROP FUNCTION absence_review_state,
-- absence_review_move, absence_review_undo, absence_review_remind, absence_review_candidates,
-- absence_review_saturday, absence_review_notify; DROP TABLE "AbsenceReviewMove", "AbsenceReviewDone".

CREATE TABLE IF NOT EXISTS public."AbsenceReviewMove" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "cohortId" UUID NOT NULL REFERENCES public."Cohort"(id) ON DELETE CASCADE,
  "participantId" UUID NOT NULL REFERENCES public."Participant"(id) ON DELETE CASCADE,
  "groupIds" UUID[] NOT NULL DEFAULT '{}',
  "groupName" TEXT,
  "supportId" UUID REFERENCES public."User"(id) ON DELETE SET NULL,
  "contactId" UUID REFERENCES public."FollowUpContact"(id) ON DELETE SET NULL,
  "prevContactStatus" TEXT,
  "prevContactArchivedAt" TIMESTAMPTZ,
  "prevParticipantStatus" TEXT NOT NULL,
  "movedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "movedById" UUID REFERENCES public."User"(id) ON DELETE SET NULL,
  "undoneAt" TIMESTAMPTZ,
  "undoneById" UUID REFERENCES public."User"(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS absence_review_move_cohort_idx ON public."AbsenceReviewMove" ("cohortId");

CREATE TABLE IF NOT EXISTS public."AbsenceReviewDone" (
  "cohortId" UUID PRIMARY KEY REFERENCES public."Cohort"(id) ON DELETE CASCADE,
  "doneAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "doneById" UUID REFERENCES public."User"(id) ON DELETE SET NULL,
  "movedCount" INTEGER NOT NULL DEFAULT 0,
  "keptCount" INTEGER NOT NULL DEFAULT 0
);

-- Born locked (rule 11): reached only through the functions below.
ALTER TABLE public."AbsenceReviewMove" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."AbsenceReviewDone" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."AbsenceReviewMove", public."AbsenceReviewDone" FROM anon, authenticated;

-- The Saturday before a cohort's week 3 class, or NULL when the cohort has no week 3.
CREATE OR REPLACE FUNCTION public.absence_review_saturday(p_cohort_id UUID)
 RETURNS DATE
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT public.week_class_date(c."startDate", w."weekNumber", w."classDate") - 1
  FROM public."Week" w
  JOIN public."Cohort" c ON c.id = w."cohortId"
  WHERE w."cohortId" = p_cohort_id AND w."weekNumber" = 3
  LIMIT 1;
$function$;

-- Everyone in a group in the cohort marked Absent for both class 1 and class 2 (not test people, still active).
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
         (array_agg(g."supportId" ORDER BY g."createdAt"))[1],
         (SELECT u.name FROM public."User" u WHERE u.id = (array_agg(g."supportId" ORDER BY g."createdAt"))[1]),
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

-- Bell, phone and Telegram through notify-users, or the bell alone when the vault secrets are missing (rule 10).
CREATE OR REPLACE FUNCTION public.absence_review_notify(p_user_ids UUID[], p_title TEXT, p_body TEXT, p_path TEXT)
 RETURNS VOID
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_url TEXT;
  v_key TEXT;
BEGIN
  IF p_user_ids IS NULL OR array_length(p_user_ids, 1) IS NULL THEN RETURN; END IF;
  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'project_url';
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'push_reminders_service_key';
  IF v_url IS NULL OR v_key IS NULL THEN
    INSERT INTO public."Notification" ("userId", title, body, path, type)
    SELECT uid, p_title, p_body, p_path, 'ABSENCE_REVIEW' FROM unnest(p_user_ids) AS uid;
    RETURN;
  END IF;
  PERFORM net.http_post(
    url := v_url || '/functions/v1/notify-users',
    headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', v_key, 'Authorization', 'Bearer ' || v_key),
    body := jsonb_build_object('userIds', to_jsonb(p_user_ids), 'title', p_title, 'body', p_body, 'path', p_path, 'type', 'ABSENCE_REVIEW'),
    timeout_milliseconds := 25000
  );
END;
$function$;

-- What the Dashboard and Participants page show: whether the review is open, the people, and today's undoable moves.
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
    'open', v_saturday IS NOT NULL AND v_today >= v_saturday AND v_done."cohortId" IS NULL,
    'done', CASE WHEN v_done."cohortId" IS NULL THEN NULL ELSE jsonb_build_object(
      'at', v_done."doneAt", 'by', (SELECT name FROM public."User" WHERE id = v_done."doneById"),
      'moved', v_done."movedCount", 'kept', v_done."keptCount") END,
    'people', CASE WHEN v_saturday IS NULL OR v_today < v_saturday THEN '[]'::jsonb ELSE COALESCE((
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

-- Move the ticked people. Only people still on the list are moved; the rest of the list counts as kept.
-- Returns { moved: [names], skipped: [{ name, reason }] }.
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
  IF v_cohort IS NULL OR v_saturday IS NULL OR v_today < v_saturday THEN
    RAISE EXCEPTION 'The two-absence review opens on the Saturday before class 3';
  END IF;

  SELECT COUNT(*) INTO v_total FROM public.absence_review_candidates(v_cohort);

  FOR c IN SELECT * FROM public.absence_review_candidates(v_cohort) WHERE "participantId" = ANY (COALESCE(p_participant_ids, '{}')) LOOP
    BEGIN
      SELECT fc.* INTO v_contact FROM public."FollowUpContact" fc
      JOIN public."Participant" p ON p."followUpContactId" = fc.id WHERE p.id = c."participantId";

      INSERT INTO public."AbsenceReviewMove" ("cohortId", "participantId", "groupIds", "groupName", "supportId", "contactId",
        "prevContactStatus", "prevContactArchivedAt", "prevParticipantStatus", "movedById")
      VALUES (v_cohort, c."participantId", c."groupIds", c."groupName", c."supportId", v_contact.id,
        v_contact."registrationStatus", v_contact."archivedAt", 'ACTIVE', v_admin.id);

      DELETE FROM public."GroupParticipant" WHERE "participantId" = c."participantId" AND "groupId" = ANY (c."groupIds");
      UPDATE public."Participant" SET status = 'ARCHIVED', "updatedAt" = NOW() WHERE id = c."participantId";
      IF v_contact.id IS NOT NULL THEN
        UPDATE public."FollowUpContact"
        SET "registrationStatus" = 'NEXT_COHORT', "archivedAt" = NULL, "statusChangedAt" = NOW(), "updatedAt" = NOW()
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

  INSERT INTO public."AbsenceReviewDone" ("cohortId", "doneById", "movedCount", "keptCount")
  VALUES (v_cohort, v_admin.id, COALESCE(array_length(v_moved, 1), 0), GREATEST(v_total - COALESCE(array_length(v_moved, 1), 0), 0))
  ON CONFLICT ("cohortId") DO UPDATE
    SET "doneAt" = NOW(), "doneById" = EXCLUDED."doneById",
        "movedCount" = public."AbsenceReviewDone"."movedCount" + EXCLUDED."movedCount", "keptCount" = EXCLUDED."keptCount";

  RETURN jsonb_build_object('moved', to_jsonb(v_moved), 'skipped', v_skipped);
END;
$function$;

-- Put one moved person back, the same day (Lagos) only.
CREATE OR REPLACE FUNCTION public.absence_review_undo(p_token TEXT, p_move_id UUID)
 RETURNS VOID
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
  IF m."contactId" IS NOT NULL THEN
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

-- Hourly on Saturday afternoon (cron below): remind admins while the review is open and not done.
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
    '/dashboard');
END;
$function$;

REVOKE ALL ON FUNCTION public.absence_review_saturday(UUID), public.absence_review_candidates(UUID),
  public.absence_review_notify(UUID[], TEXT, TEXT, TEXT), public.absence_review_remind() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.absence_review_state(TEXT), public.absence_review_move(TEXT, UUID[]),
  public.absence_review_undo(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.absence_review_state(TEXT), public.absence_review_move(TEXT, UUID[]),
  public.absence_review_undo(TEXT, UUID) TO anon, authenticated;

-- 4, 5, 6 and 7 pm Lagos (UTC+1) on Saturdays; the function itself checks it is the right Saturday.
SELECT cron.unschedule('absence_review_remind_saturday') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'absence_review_remind_saturday');
SELECT cron.schedule('absence_review_remind_saturday', '0 15-18 * * 6', $$SELECT public.absence_review_remind();$$);
