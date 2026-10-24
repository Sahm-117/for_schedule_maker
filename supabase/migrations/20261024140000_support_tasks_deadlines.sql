-- Tasks on a support's list get a real deadline date, and need no class week.
--
-- Until now a SupportChecklistItem always belonged to a class week (weekId) and could only name a weekday
-- (dueDay). The 3 rest weeks between cohorts have no Week row, so nothing could be set for them. A task may now
-- carry a calendar date (dueDate) and a cohort, with weekId left empty. Class-week tasks work as before.
--
--   "weekId"   now optional
--   "dueDate"  the deadline day (Lagos calendar day)
--   "cohortId" which cohort a week-less task belongs to
--   A week-less task must have both a cohort and a date.
--
-- admin_add_support_task(p_token, p_label, p_week_ids, p_cohort_id, p_due_day, p_due_dates, p_target)
--   admin only. Adds the task to each person for every chosen class week (p_week_ids, with the weekday p_due_day)
--   and for every chosen date (p_due_dates, week-less, in p_cohort_id). Adds a target kind LEADERS: supports who
--   lead an unarchived group in the cohort. Resolved NOW; people who join later do not get it (FLOW_MAP rule 21).
-- admin_rest_tasks(p_token, p_cohort_id): the admin's week-less tasks for a cohort, with who has done them.
-- admin_delete_checklist_task (existing) already removes a task from every week when no week is given, so it also
-- removes week-less tasks.
--
-- Rollback: DROP FUNCTION admin_rest_tasks(text, uuid); DROP FUNCTION admin_add_support_task(text, text, integer[],
-- uuid, text, date[], jsonb); DROP INDEX "SupportChecklistItem_dated_unique"; delete the week-less rows; then
-- ALTER TABLE "SupportChecklistItem" DROP CONSTRAINT "SupportChecklistItem_week_or_date", DROP COLUMN "dueDate",
-- DROP COLUMN "cohortId", ALTER COLUMN "weekId" SET NOT NULL; re-create support_checklist_admin_task_guard from
-- 20261006210000.

ALTER TABLE public."SupportChecklistItem" ALTER COLUMN "weekId" DROP NOT NULL;
ALTER TABLE public."SupportChecklistItem"
  ADD COLUMN IF NOT EXISTS "dueDate" DATE,
  ADD COLUMN IF NOT EXISTS "cohortId" UUID REFERENCES public."Cohort"(id) ON DELETE CASCADE;
ALTER TABLE public."SupportChecklistItem" DROP CONSTRAINT IF EXISTS "SupportChecklistItem_week_or_date";
ALTER TABLE public."SupportChecklistItem" ADD CONSTRAINT "SupportChecklistItem_week_or_date"
  CHECK ("weekId" IS NOT NULL OR ("cohortId" IS NOT NULL AND "dueDate" IS NOT NULL));
-- The existing unique key ("userId", "weekId", "label") does not stop duplicates when weekId is empty.
CREATE UNIQUE INDEX IF NOT EXISTS "SupportChecklistItem_dated_unique"
  ON public."SupportChecklistItem" ("userId", "cohortId", label, "dueDate") WHERE "weekId" IS NULL;
CREATE INDEX IF NOT EXISTS "SupportChecklistItem_user_cohort_date"
  ON public."SupportChecklistItem" ("userId", "cohortId", "dueDate") WHERE "weekId" IS NULL;

-- Supports still cannot change an admin task apart from ticking it and writing a note.
CREATE OR REPLACE FUNCTION public.support_checklist_admin_task_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF OLD."taskGroupId" IS NOT NULL
     AND current_user IN ('anon', 'authenticated')
     AND NOT public.app_is_admin() THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'ADMIN_TASK_LOCKED';
    END IF;
    IF NEW.label IS DISTINCT FROM OLD.label
       OR NEW."userId" IS DISTINCT FROM OLD."userId"
       OR NEW."weekId" IS DISTINCT FROM OLD."weekId"
       OR NEW.position IS DISTINCT FROM OLD.position
       OR NEW."createdById" IS DISTINCT FROM OLD."createdById"
       OR NEW."taskGroupId" IS DISTINCT FROM OLD."taskGroupId"
       OR NEW."dueDay" IS DISTINCT FROM OLD."dueDay"
       OR NEW."dueDate" IS DISTINCT FROM OLD."dueDate"
       OR NEW."cohortId" IS DISTINCT FROM OLD."cohortId" THEN
      RAISE EXCEPTION 'ADMIN_TASK_LOCKED';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;

-- ── Add a task for class weeks and/or dates ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_add_support_task(
  p_token text,
  p_label text,
  p_week_ids integer[],
  p_cohort_id uuid,
  p_due_day text,
  p_due_dates date[],
  p_target jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  actor "User" := public.app_staff(p_token);
  v_label TEXT := regexp_replace(btrim(COALESCE(p_label, '')), '\s+', ' ', 'g');
  v_due TEXT := NULLIF(btrim(COALESCE(p_due_day, '')), '');
  v_kind TEXT := COALESCE(p_target->>'kind', 'ALL');
  v_group UUID := gen_random_uuid();
  v_weeks INT[] := COALESCE(p_week_ids, ARRAY[]::INT[]);
  v_dates DATE[] := COALESCE(p_due_dates, ARRAY[]::DATE[]);
  v_rows INT := 0;
  v_skipped INT := 0;
  v_added INT;
  v_pos INT;
  w RECORD;
  d DATE;
  u RECORD;
BEGIN
  IF actor.id IS NULL OR actor.role::text <> 'ADMIN' THEN
    RAISE EXCEPTION 'NOT_AUTHORISED';
  END IF;
  IF char_length(v_label) < 2 THEN RAISE EXCEPTION 'Write the task first'; END IF;
  IF char_length(v_label) > 140 THEN RAISE EXCEPTION 'Keep the task under 140 characters'; END IF;
  IF v_due IS NOT NULL AND v_due NOT IN ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday') THEN
    RAISE EXCEPTION 'Choose a weekday for the due day';
  END IF;
  IF array_length(v_weeks, 1) IS NULL AND array_length(v_dates, 1) IS NULL THEN RAISE EXCEPTION 'Choose at least one week or date'; END IF;
  IF array_length(v_dates, 1) IS NOT NULL AND p_cohort_id IS NULL THEN RAISE EXCEPTION 'Choose a cohort for the dates'; END IF;
  IF v_kind NOT IN ('ALL', 'TAG', 'USERS', 'LEADERS') THEN RAISE EXCEPTION 'Choose who the task is for'; END IF;
  IF v_kind = 'TAG' AND NOT EXISTS (SELECT 1 FROM "SupportTag" WHERE id = NULLIF(p_target->>'tagId', '')::uuid) THEN
    RAISE EXCEPTION 'That tag was not found';
  END IF;
  IF v_kind = 'USERS' AND jsonb_array_length(COALESCE(p_target->'userIds', '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'Choose at least one person';
  END IF;

  -- One loop over (cohort, week or date) slots; a class-week slot has a week id, a dated slot has a date.
  FOR w IN
    SELECT wk.id AS week_id, wk."cohortId" AS cohort_id, NULL::date AS due_date, wk."weekNumber" AS ord
    FROM "Week" wk WHERE wk.id = ANY(v_weeks)
    UNION ALL
    SELECT NULL::int, p_cohort_id, x, 1000 + row_number() OVER (ORDER BY x)::int
    FROM unnest(v_dates) AS x
    ORDER BY ord
  LOOP
    FOR u IN
      SELECT x.id FROM "User" x
      WHERE x."isActive" IS NOT FALSE AND x."isTest" IS NOT TRUE
        AND (x.role = 'SUPPORT' OR 'SUPPORT'::"Role" = ANY(x.roles))
        AND (
          (v_kind = 'USERS' AND x.id IN (SELECT jsonb_array_elements_text(p_target->'userIds')::uuid))
          OR (v_kind = 'LEADERS' AND EXISTS (
                SELECT 1 FROM "Group" g WHERE g."cohortId" = w.cohort_id AND g."supportId" = x.id AND g."archivedAt" IS NULL))
          OR (
            v_kind IN ('ALL', 'TAG')
            AND (v_kind = 'ALL' OR EXISTS (
                  SELECT 1 FROM "SupportTagMember" m
                  WHERE m."userId" = x.id AND m."tagId" = NULLIF(p_target->>'tagId', '')::uuid))
            -- Enabled for that cohort. A cohort with nobody enabled yet counts everyone.
            AND (NOT EXISTS (SELECT 1 FROM "UserCohort" c WHERE c."cohortId" = w.cohort_id)
                 OR EXISTS (SELECT 1 FROM "UserCohort" c WHERE c."cohortId" = w.cohort_id AND c."userId" = x.id))
          )
        )
    LOOP
      SELECT COALESCE(MAX(position) + 1, 0) INTO v_pos FROM "SupportChecklistItem"
      WHERE "userId" = u.id AND (("weekId" = w.week_id) OR (w.week_id IS NULL AND "weekId" IS NULL AND "cohortId" = w.cohort_id));
      IF w.week_id IS NOT NULL THEN
        INSERT INTO "SupportChecklistItem" ("userId", "weekId", "cohortId", label, done, position, "createdById", "taskGroupId", "dueDay")
        VALUES (u.id, w.week_id, w.cohort_id, v_label, FALSE, v_pos, actor.id, v_group, v_due)
        ON CONFLICT ("userId", "weekId", label) DO NOTHING;
      ELSE
        INSERT INTO "SupportChecklistItem" ("userId", "weekId", "cohortId", label, done, position, "createdById", "taskGroupId", "dueDate")
        VALUES (u.id, NULL, w.cohort_id, v_label, FALSE, v_pos, actor.id, v_group, w.due_date)
        ON CONFLICT ("userId", "cohortId", label, "dueDate") WHERE "weekId" IS NULL DO NOTHING;
      END IF;
      GET DIAGNOSTICS v_added = ROW_COUNT;
      v_rows := v_rows + v_added;
      IF v_added = 0 THEN v_skipped := v_skipped + 1; END IF;
    END LOOP;
  END LOOP;

  INSERT INTO "Notification" ("userId", title, body, path, type)
  SELECT i."userId", 'New task from the admin',
         v_label || CASE
           WHEN MIN(i."dueDate") IS NOT NULL THEN ' (due ' || to_char(MIN(i."dueDate"), 'FMDay FMDD Mon') || ')'
           WHEN v_due IS NOT NULL THEN ' (due ' || v_due || ')'
           ELSE '' END,
         '/support/schedule?tab=checklist', 'GENERAL'
  FROM "SupportChecklistItem" i WHERE i."taskGroupId" = v_group
  GROUP BY i."userId";

  RETURN jsonb_build_object(
    'taskGroupId', v_group,
    'rows', v_rows,
    'skipped', v_skipped,
    'supports', (SELECT COUNT(DISTINCT "userId") FROM "SupportChecklistItem" WHERE "taskGroupId" = v_group)
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_add_support_task(text, text, integer[], uuid, text, date[], jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_add_support_task(text, text, integer[], uuid, text, date[], jsonb) TO anon, authenticated;

-- ── The admin's week-less (rest-week) tasks for a cohort, with who has done them ──
CREATE OR REPLACE FUNCTION public.admin_rest_tasks(p_token text, p_cohort_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  actor "User" := public.app_staff(p_token);
BEGIN
  IF actor.id IS NULL OR actor.role::text <> 'ADMIN' THEN
    RAISE EXCEPTION 'NOT_AUTHORISED';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(t ORDER BY t."dueDate", t."createdAt")
    FROM (
      SELECT i."taskGroupId" AS "taskGroupId",
             MIN(i.label) AS label,
             MIN(i."dueDate") AS "dueDate",
             MIN(i."createdAt") AS "createdAt",
             COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE i.done)::int AS done,
             jsonb_agg(jsonb_build_object(
               'userId', i."userId", 'name', u.name, 'done', COALESCE(i.done, FALSE),
               'note', i."completionNote", 'at', i."completedAt") ORDER BY u.name) AS people
      FROM "SupportChecklistItem" i
      JOIN "User" u ON u.id = i."userId"
      WHERE i."taskGroupId" IS NOT NULL AND i."weekId" IS NULL AND i."cohortId" = p_cohort_id
      GROUP BY i."taskGroupId", i."dueDate"
    ) t
  ), '[]'::jsonb);
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_rest_tasks(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_rest_tasks(text, uuid) TO anon, authenticated;
