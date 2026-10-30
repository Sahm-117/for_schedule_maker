-- Check-ups after a cohort (FLOW_MAP rule 121).
--
-- When a cohort's third rest week begins (the rest weeks follow the cohort's cycle end, exactly as the Planner and
-- the support Schedule's "Rest weeks" lay them out), every support who led an unarchived group in that cohort gets
-- one admin task, due on the last day of rest week 3: check in with each person from their group. It is an ordinary
-- admin rest-week task (taskGroupId set, so "From admin" and locked), so it shows on the support's Schedule under
-- Rest weeks and admins see who has done it in Schedule > Add task for supports > Already added. Then, once a month
-- for three months after rest week 3 began, the same supports get a reminder to check in again.
--
-- Runs from a daily job (`post_cohort_checkups_daily`). A cohort gets its task from the first day of rest week 3
-- until a week after it ends (a catch-up week if the job missed some days), so older cohorts are never back-filled;
-- a cohort with no group leader is tried again the next day. A reminder more than a week late is skipped, not sent.
-- Real cohorts only (`api_real_cohort`: not Practice, not "ZZ"), not archived; test and inactive supports left out.
-- The support Schedule loads open dated tasks from earlier cohorts too (supportChecklistApi.getForCohort), so the
-- task still shows once the next cohort has become the current one.
--
-- The rest-week dates here, `restWeeksAfter` in frontend/src/utils/checklist.ts and the Planner (utils/planner.ts)
-- must stay the same: change them together.
--
-- Rollback: SELECT cron.unschedule('post_cohort_checkups_daily'); DROP FUNCTION post_cohort_checkups_run,
-- checkup_rest_week3, fof_notify; DROP TABLE "CohortCheckup". Tasks already given stay on supports' lists.

CREATE TABLE IF NOT EXISTS public."CohortCheckup" (
  "cohortId" UUID PRIMARY KEY REFERENCES public."Cohort"(id) ON DELETE CASCADE,
  "taskGroupId" UUID NOT NULL,
  "restWeek3Start" DATE NOT NULL,
  "taskAddedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "supports" INTEGER NOT NULL DEFAULT 0,
  "remindersSent" INTEGER NOT NULL DEFAULT 0,
  "lastReminderAt" TIMESTAMPTZ
);
ALTER TABLE public."CohortCheckup" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."CohortCheckup" FROM anon, authenticated;

-- Bell, phone and Telegram through notify-users, or the bell alone when the vault secrets are missing (rule 10).
CREATE OR REPLACE FUNCTION public.fof_notify(p_user_ids UUID[], p_title TEXT, p_body TEXT, p_path TEXT, p_type TEXT)
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
    SELECT uid, p_title, p_body, p_path, p_type FROM unnest(p_user_ids) AS uid;
    RETURN;
  END IF;
  PERFORM net.http_post(
    url := v_url || '/functions/v1/notify-users',
    headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', v_key, 'Authorization', 'Bearer ' || v_key),
    body := jsonb_build_object('userIds', to_jsonb(p_user_ids), 'title', p_title, 'body', p_body, 'path', p_path, 'type', p_type),
    timeout_milliseconds := 25000
  );
END;
$function$;

-- The Monday that rest week 3 after a cohort begins. The cycle ends on the cohort's end date (or, with none, a spare
-- week after its last class), never before its last class; the rest weeks follow (utils/checklist.ts restWeeksAfter).
CREATE OR REPLACE FUNCTION public.checkup_rest_week3(p_cohort_id UUID)
 RETURNS DATE
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  WITH last_class AS (
    SELECT MAX(public.week_class_date(c."startDate", w."weekNumber", w."classDate")) AS d, c."endDate"::date AS end_date
    FROM public."Cohort" c JOIN public."Week" w ON w."cohortId" = c.id
    WHERE c.id = p_cohort_id AND c."startDate" IS NOT NULL
    GROUP BY c."endDate"
  )
  SELECT GREATEST(COALESCE(end_date, d + 7), d) + 1 + 14 FROM last_class WHERE d IS NOT NULL;
$function$;

-- The daily job: give the check-up task when rest week 3 begins, then the monthly reminders.
CREATE OR REPLACE FUNCTION public.post_cohort_checkups_run()
 RETURNS JSONB
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_today DATE := (NOW() AT TIME ZONE 'Africa/Lagos')::date;
  c RECORD;
  k RECORD;
  v_start DATE;
  v_group UUID;
  v_label TEXT := 'Check-up: check in with each person from your group and note how they are doing';
  v_leaders UUID[];
  v_added INTEGER;
  v_done JSONB := '[]'::jsonb;
  v_next DATE;
BEGIN
  -- 1. The task, for a cohort whose rest week 3 is this week.
  FOR c IN
    SELECT co.id, co.name FROM public."Cohort" co
    WHERE co.status <> 'ARCHIVED' AND public.api_real_cohort(co.id)
      AND NOT EXISTS (SELECT 1 FROM public."CohortCheckup" x WHERE x."cohortId" = co.id)
  LOOP
    v_start := public.checkup_rest_week3(c.id);
    CONTINUE WHEN v_start IS NULL OR v_today NOT BETWEEN v_start AND v_start + 13;

    SELECT array_agg(DISTINCT u.id) INTO v_leaders
    FROM public."Group" g JOIN public."User" u ON u.id = g."supportId"
    WHERE g."cohortId" = c.id AND g."archivedAt" IS NULL
      AND u."isActive" IS NOT FALSE AND u."isTest" IS NOT TRUE
      AND (u.role = 'SUPPORT' OR 'SUPPORT'::public."Role" = ANY(u.roles));
    -- No group leader yet (groups unassigned, or only test supports): try again tomorrow.
    CONTINUE WHEN v_leaders IS NULL;

    v_group := gen_random_uuid();
    INSERT INTO public."SupportChecklistItem" ("userId", "weekId", "cohortId", label, done, position, "createdById", "taskGroupId", "dueDate")
    SELECT uid, NULL, c.id, v_label, FALSE,
           COALESCE((SELECT MAX(i.position) + 1 FROM public."SupportChecklistItem" i
                     WHERE i."userId" = uid AND i."weekId" IS NULL AND i."cohortId" = c.id), 0),
           NULL, v_group, GREATEST(v_start + 6, v_today + 2)
    FROM unnest(COALESCE(v_leaders, '{}')) AS uid
    ON CONFLICT ("userId", "cohortId", label, "dueDate") WHERE "weekId" IS NULL DO NOTHING;
    GET DIAGNOSTICS v_added = ROW_COUNT;

    INSERT INTO public."CohortCheckup" ("cohortId", "taskGroupId", "restWeek3Start", "supports")
    VALUES (c.id, v_group, v_start, cardinality(v_leaders));

    PERFORM public.fof_notify(v_leaders, 'Check-up on your group',
      format('%s has finished. This week, check in with each person from your group and tick the task when done (due %s).',
             c.name, to_char(GREATEST(v_start + 6, v_today + 2), 'FMDay FMDD Mon')),
      '/support/schedule?tab=checklist&rest=1', 'CHECKUP');
    PERFORM public.fof_notify((SELECT array_agg(id) FROM public.module_viewers('schedule') AS id), 'Check-up tasks given',
      format('%s %s from %s %s a check-up task due %s. See who has done it in Schedule, Add task for supports.',
             cardinality(v_leaders), CASE WHEN cardinality(v_leaders) = 1 THEN 'support' ELSE 'supports' END, c.name,
             CASE WHEN cardinality(v_leaders) = 1 THEN 'has' ELSE 'have' END, to_char(GREATEST(v_start + 6, v_today + 2), 'FMDay FMDD Mon')),
      '/schedule', 'CHECKUP');
    v_done := v_done || jsonb_build_object('cohort', c.name, 'task', v_added);
  END LOOP;

  -- 2. Monthly reminders: 1, 2 and 3 months after rest week 3 began, each sent at most a week late.
  FOR k IN
    SELECT x.*, co.name FROM public."CohortCheckup" x JOIN public."Cohort" co ON co.id = x."cohortId"
    WHERE x."remindersSent" < 3 AND co.status <> 'ARCHIVED'
  LOOP
    v_next := (k."restWeek3Start" + make_interval(months => k."remindersSent" + 1))::date;
    CONTINUE WHEN v_today < v_next;
    IF v_today <= v_next + 6 THEN
      SELECT array_agg(DISTINCT u.id) INTO v_leaders
      FROM public."Group" g JOIN public."User" u ON u.id = g."supportId"
      WHERE g."cohortId" = k."cohortId" AND g."archivedAt" IS NULL
        AND u."isActive" IS NOT FALSE AND u."isTest" IS NOT TRUE
        AND (u.role = 'SUPPORT' OR 'SUPPORT'::public."Role" = ANY(u.roles));
      IF v_leaders IS NOT NULL THEN
        PERFORM public.fof_notify(v_leaders, 'Monthly check-up',
          format('Check-up %s of 3 for your %s group: send each person a message or call this week to see how they are doing.',
                 k."remindersSent" + 1, k.name),
          '/support/schedule?tab=checklist', 'CHECKUP');
        v_done := v_done || jsonb_build_object('cohort', k.name, 'reminder', k."remindersSent" + 1, 'supports', cardinality(v_leaders));
      END IF;
    END IF;
    -- A reminder more than a week late is counted as passed, so the next one keeps its own date.
    UPDATE public."CohortCheckup" SET "remindersSent" = "remindersSent" + 1, "lastReminderAt" = NOW() WHERE "cohortId" = k."cohortId";
  END LOOP;

  RETURN v_done;
END;
$function$;

-- The two-absence review sends through the same helper (one copy of the vault lookup and fallback).
CREATE OR REPLACE FUNCTION public.absence_review_notify(p_user_ids UUID[], p_title TEXT, p_body TEXT, p_path TEXT)
 RETURNS VOID
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT public.fof_notify(p_user_ids, p_title, p_body, p_path, 'ABSENCE_REVIEW');
$function$;

REVOKE ALL ON FUNCTION public.fof_notify(UUID[], TEXT, TEXT, TEXT, TEXT), public.checkup_rest_week3(UUID),
  public.post_cohort_checkups_run(), public.absence_review_notify(UUID[], TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;

-- Every day at 8:17 am Lagos (7:17 UTC).
SELECT cron.unschedule('post_cohort_checkups_daily') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'post_cohort_checkups_daily');
SELECT cron.schedule('post_cohort_checkups_daily', '17 7 * * *', $$SELECT public.post_cohort_checkups_run();$$);
