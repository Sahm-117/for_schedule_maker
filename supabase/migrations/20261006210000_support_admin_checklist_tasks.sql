-- Admin checklist tasks for supports.
--
-- Supports keep a weekly checklist (SupportChecklistItem) they write themselves.
-- An admin can now put a task on the checklist of chosen supports from the
-- Schedule page. Such a row is "from admin": createdById is set and differs from
-- userId. Rows of one task share a taskGroupId.
--
--   Columns: createdById, taskGroupId, dueDay (a weekday name), completionNote,
--   completedAt.
--   Guard: through the app's own requests (anon / authenticated) a non-admin may
--   only tick an admin task and write a note on it; they cannot rename it, move it,
--   change its due day, or delete it. The admin RPCs below run as the function
--   owner, so they are not held back; FK cascades and service scripts neither.
--   admin_add_checklist_task(p_token, p_label, p_week_ids, p_due_day, p_target)
--     admin only. p_target: {"kind":"ALL"} | {"kind":"TAG","tagId":...} |
--     {"kind":"USERS","userIds":[...]}. Supports are resolved NOW (people who join
--     later do not get it). ALL and TAG mean active supports enabled for that
--     week's cohort (UserCohort); chosen people are taken as given. One bell
--     alert per support. Duplicates (same label, same week) are skipped.
--   admin_checklist_tasks(p_token, p_week_id): admin only; the tasks of a week
--     with who has done them and their notes.
--   admin_delete_checklist_task(p_token, p_task_group_id, p_week_id): admin only;
--     removes the task from one week, or from every week when p_week_id is null.
--
-- Rollback: DROP FUNCTION admin_delete_checklist_task, admin_checklist_tasks,
-- admin_add_checklist_task; DROP TRIGGER support_checklist_admin_task_guard ON
-- "SupportChecklistItem"; DROP FUNCTION support_checklist_admin_task_guard;
-- ALTER TABLE "SupportChecklistItem" DROP COLUMN "createdById", DROP COLUMN
-- "taskGroupId", DROP COLUMN "dueDay", DROP COLUMN "completionNote", DROP COLUMN
-- "completedAt".

ALTER TABLE public."SupportChecklistItem"
  ADD COLUMN IF NOT EXISTS "createdById" UUID REFERENCES public."User"(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "taskGroupId" UUID,
  ADD COLUMN IF NOT EXISTS "dueDay" TEXT,
  ADD COLUMN IF NOT EXISTS "completionNote" TEXT,
  ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMPTZ;
ALTER TABLE public."SupportChecklistItem" DROP CONSTRAINT IF EXISTS "SupportChecklistItem_dueDay_check";
ALTER TABLE public."SupportChecklistItem" ADD CONSTRAINT "SupportChecklistItem_dueDay_check"
  CHECK ("dueDay" IS NULL OR "dueDay" IN ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'));
CREATE INDEX IF NOT EXISTS "SupportChecklistItem_taskGroup_idx" ON public."SupportChecklistItem" ("taskGroupId") WHERE "taskGroupId" IS NOT NULL;

-- ── Guard ────────────────────────────────────────────────────────────────────
-- SECURITY INVOKER on purpose: current_user must be the role that made the request
-- (anon / authenticated through the app), not the function owner.
CREATE OR REPLACE FUNCTION public.support_checklist_admin_task_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF OLD."createdById" IS NOT NULL
     AND OLD."createdById" IS DISTINCT FROM OLD."userId"
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
       OR NEW."dueDay" IS DISTINCT FROM OLD."dueDay" THEN
      RAISE EXCEPTION 'ADMIN_TASK_LOCKED';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS support_checklist_admin_task_guard ON public."SupportChecklistItem";
CREATE TRIGGER support_checklist_admin_task_guard
  BEFORE UPDATE OR DELETE ON public."SupportChecklistItem"
  FOR EACH ROW EXECUTE FUNCTION public.support_checklist_admin_task_guard();

-- ── Add a task ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_add_checklist_task(
  p_token text,
  p_label text,
  p_week_ids integer[],
  p_due_day text,
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
  v_rows INT := 0;
  v_skipped INT := 0;
  v_added INT;
  v_pos INT;
  w RECORD;
  u RECORD;
  v_title TEXT;
BEGIN
  IF actor.id IS NULL OR actor.role::text <> 'ADMIN' THEN
    RAISE EXCEPTION 'NOT_AUTHORISED';
  END IF;
  IF char_length(v_label) < 2 THEN RAISE EXCEPTION 'Write the task first'; END IF;
  IF char_length(v_label) > 140 THEN RAISE EXCEPTION 'Keep the task under 140 characters'; END IF;
  IF v_due IS NOT NULL AND v_due NOT IN ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday') THEN
    RAISE EXCEPTION 'Choose a weekday for the due day';
  END IF;
  IF p_week_ids IS NULL OR array_length(p_week_ids, 1) IS NULL THEN RAISE EXCEPTION 'Choose at least one week'; END IF;
  IF v_kind NOT IN ('ALL', 'TAG', 'USERS') THEN RAISE EXCEPTION 'Choose who the task is for'; END IF;
  IF v_kind = 'TAG' AND NOT EXISTS (SELECT 1 FROM "SupportTag" WHERE id = NULLIF(p_target->>'tagId', '')::uuid) THEN
    RAISE EXCEPTION 'That tag was not found';
  END IF;
  IF v_kind = 'USERS' AND jsonb_array_length(COALESCE(p_target->'userIds', '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'Choose at least one person';
  END IF;

  FOR w IN SELECT id, "cohortId", "weekNumber" FROM "Week" WHERE id = ANY(p_week_ids) ORDER BY "weekNumber" LOOP
    FOR u IN
      SELECT x.id FROM "User" x
      WHERE x."isActive" IS NOT FALSE AND x."isTest" IS NOT TRUE
        AND (x.role = 'SUPPORT' OR 'SUPPORT'::"Role" = ANY(x.roles))
        AND (
          (v_kind = 'USERS' AND x.id IN (SELECT jsonb_array_elements_text(p_target->'userIds')::uuid))
          OR (
            v_kind IN ('ALL', 'TAG')
            AND (v_kind = 'ALL' OR EXISTS (
                  SELECT 1 FROM "SupportTagMember" m
                  WHERE m."userId" = x.id AND m."tagId" = NULLIF(p_target->>'tagId', '')::uuid))
            -- Enabled for that week's cohort. A cohort with nobody enabled yet counts everyone.
            AND (NOT EXISTS (SELECT 1 FROM "UserCohort" c WHERE c."cohortId" = w."cohortId")
                 OR EXISTS (SELECT 1 FROM "UserCohort" c WHERE c."cohortId" = w."cohortId" AND c."userId" = x.id))
          )
        )
    LOOP
      SELECT COALESCE(MAX(position) + 1, 0) INTO v_pos FROM "SupportChecklistItem" WHERE "userId" = u.id AND "weekId" = w.id;
      INSERT INTO "SupportChecklistItem" ("userId", "weekId", label, done, position, "createdById", "taskGroupId", "dueDay")
      VALUES (u.id, w.id, v_label, FALSE, v_pos, actor.id, v_group, v_due)
      ON CONFLICT ("userId", "weekId", label) DO NOTHING;
      GET DIAGNOSTICS v_added = ROW_COUNT;
      v_rows := v_rows + v_added;
      IF v_added = 0 THEN v_skipped := v_skipped + 1; END IF;
    END LOOP;
  END LOOP;

  v_title := 'New task from the admin';
  INSERT INTO "Notification" ("userId", title, body, path, type)
  SELECT DISTINCT i."userId", v_title,
         v_label || CASE WHEN v_due IS NOT NULL THEN ' (due ' || v_due || ')' ELSE '' END,
         '/support/schedule?tab=checklist', 'GENERAL'
  FROM "SupportChecklistItem" i WHERE i."taskGroupId" = v_group;

  RETURN jsonb_build_object(
    'taskGroupId', v_group,
    'rows', v_rows,
    'skipped', v_skipped,
    'supports', (SELECT COUNT(DISTINCT "userId") FROM "SupportChecklistItem" WHERE "taskGroupId" = v_group)
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_add_checklist_task(text, text, integer[], text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_add_checklist_task(text, text, integer[], text, jsonb) TO anon, authenticated;

-- ── The tasks of a week, with who has done them ──────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_checklist_tasks(p_token text, p_week_id integer)
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
    SELECT jsonb_agg(t ORDER BY t."createdAt")
    FROM (
      SELECT i."taskGroupId" AS "taskGroupId",
             MIN(i.label) AS label,
             MIN(i."dueDay") AS "dueDay",
             MIN(i."createdAt") AS "createdAt",
             COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE i.done)::int AS done,
             jsonb_agg(jsonb_build_object(
               'userId', i."userId", 'name', u.name, 'done', COALESCE(i.done, FALSE),
               'note', i."completionNote", 'at', i."completedAt") ORDER BY u.name) AS people
      FROM "SupportChecklistItem" i
      JOIN "User" u ON u.id = i."userId"
      WHERE i."taskGroupId" IS NOT NULL AND i."createdById" IS NOT NULL AND i."createdById" IS DISTINCT FROM i."userId"
        AND i."weekId" = p_week_id
      GROUP BY i."taskGroupId"
    ) t
  ), '[]'::jsonb);
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_checklist_tasks(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_checklist_tasks(text, integer) TO anon, authenticated;

-- ── Remove a task ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_delete_checklist_task(p_token text, p_task_group_id uuid, p_week_id integer DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  actor "User" := public.app_staff(p_token);
  n INT;
BEGIN
  IF actor.id IS NULL OR actor.role::text <> 'ADMIN' THEN
    RAISE EXCEPTION 'NOT_AUTHORISED';
  END IF;
  DELETE FROM "SupportChecklistItem"
  WHERE "taskGroupId" = p_task_group_id AND (p_week_id IS NULL OR "weekId" = p_week_id);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_delete_checklist_task(text, uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_delete_checklist_task(text, uuid, integer) TO anon, authenticated;
