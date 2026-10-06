-- Planner: pull a cohort's classes forward into Sundays an event no longer blocks.
--
-- Same shape as planner_set_class_dates (admin only; Sundays; strictly increasing;
-- nothing in the past; p_apply = FALSE previews, TRUE applies and logs a
-- PlannerChange that planner_undo_change can reverse), with two differences:
-- every move must be to an EARLIER date, and the end date comes back by the weeks
-- recovered instead of always keeping a fresh spare week. It never shrinks below
-- the usual finish (first class + 10 weeks for ten classes).
--
-- Rollback: DROP FUNCTION public.planner_pull_forward(TEXT, UUID, JSONB, BOOLEAN);
-- (undo any applied pull-forward first if it should be reversed).

CREATE OR REPLACE FUNCTION public.planner_pull_forward(
  p_token TEXT,
  p_cohort_id UUID,
  p_dates JSONB,
  p_apply BOOLEAN DEFAULT FALSE
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  actor "User" := public.app_staff(p_token);
  v_today DATE := (NOW() AT TIME ZONE 'Africa/Lagos')::date;
  c "Cohort";
  w RECORD;
  item JSONB;
  v_new DATE;
  v_prev DATE;
  v_old_last DATE;
  v_new_last DATE;
  v_old_end DATE;
  v_new_end DATE;
  v_usual_end DATE;
  v_new_start DATE;
  v_first_week INTEGER;
  v_moves JSONB := '[]'::jsonb;
  v_week_ids INTEGER[] := '{}';
  v_week_final DATE[] := '{}';
  v_before JSONB;
  v_after JSONB;
  v_change_id UUID;
  v_summary TEXT;
  i INTEGER;
BEGIN
  IF actor.id IS NULL OR actor.role <> 'ADMIN'::"Role" THEN
    RAISE EXCEPTION 'NOT_AUTHORISED';
  END IF;

  SELECT * INTO c FROM "Cohort" WHERE id = p_cohort_id;
  IF c.id IS NULL THEN
    RAISE EXCEPTION 'That cohort was not found';
  END IF;
  IF c."startDate" IS NULL THEN
    RAISE EXCEPTION 'This cohort has no start date';
  END IF;
  IF p_dates IS NULL OR jsonb_typeof(p_dates) <> 'array' OR jsonb_array_length(p_dates) = 0 THEN
    RAISE EXCEPTION 'No class dates were given';
  END IF;

  SELECT min("weekNumber") INTO v_first_week FROM "Week" WHERE "cohortId" = c.id;
  IF v_first_week IS NULL THEN
    RAISE EXCEPTION 'This cohort has no classes';
  END IF;

  -- Every week's final date, in class order: the given date, or where it is now.
  v_prev := NULL;
  FOR w IN
    SELECT id, "weekNumber", public.week_class_date(c."startDate", "weekNumber", "classDate") AS dt
    FROM "Week" WHERE "cohortId" = c.id ORDER BY "weekNumber"
  LOOP
    v_new := w.dt;
    FOR item IN SELECT * FROM jsonb_array_elements(p_dates) LOOP
      IF (item->>'weekId')::int = w.id THEN
        v_new := (item->>'date')::date;
      END IF;
    END LOOP;

    IF v_new <> w.dt THEN
      IF EXTRACT(DOW FROM v_new) <> 0 THEN
        RAISE EXCEPTION 'Class % must be on a Sunday', w."weekNumber";
      END IF;
      IF w.dt < v_today THEN
        RAISE EXCEPTION 'Class % has already happened', w."weekNumber";
      END IF;
      IF v_new > w.dt THEN
        RAISE EXCEPTION 'Class % can only move earlier here', w."weekNumber";
      END IF;
      IF v_new < v_today THEN
        RAISE EXCEPTION 'Class % can''t be moved to a day that has passed', w."weekNumber";
      END IF;
      v_moves := v_moves || jsonb_build_object('weekNumber', w."weekNumber", 'from', w.dt, 'to', v_new);
    END IF;
    IF v_prev IS NOT NULL AND v_new <= v_prev THEN
      RAISE EXCEPTION 'Class % must come after class %', w."weekNumber", w."weekNumber" - 1;
    END IF;
    v_prev := v_new;

    v_week_ids := v_week_ids || w.id;
    v_week_final := v_week_final || v_new;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_dates) e
    WHERE NOT ((e->>'weekId')::int = ANY(v_week_ids))
  ) THEN
    RAISE EXCEPTION 'One of those classes doesn''t belong to this cohort';
  END IF;

  SELECT max(public.week_class_date(c."startDate", "weekNumber", "classDate")) INTO v_old_last
  FROM "Week" WHERE "cohortId" = c.id;
  v_new_last := v_week_final[array_length(v_week_final, 1)];
  v_new_start := CASE
    WHEN EXISTS (SELECT 1 FROM "Week" WHERE id = v_week_ids[1] AND "weekNumber" = v_first_week)
      THEN v_week_final[1] ELSE c."startDate" END;

  v_old_end := GREATEST(COALESCE(c."endDate", v_old_last + 7), v_old_last);
  -- Pulling forward gives back the weeks it recovers, but never shrinks the
  -- cycle below its usual finish: first class + (classes - 1 + 1 spare) weeks.
  v_usual_end := v_week_final[1] + 7 * array_length(v_week_final, 1);
  v_new_end := LEAST(v_old_end, GREATEST(v_new_last, v_usual_end, v_old_end - (v_old_last - v_new_last)));

  IF p_apply AND jsonb_array_length(v_moves) > 0 THEN
    SELECT jsonb_build_object(
      'weeks', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', id, 'classDate', "classDate")) FROM "Week" WHERE id = ANY(v_week_ids)), '[]'::jsonb),
      'cohorts', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', id, 'startDate', "startDate", 'endDate', "endDate")) FROM "Cohort" WHERE id = c.id), '[]'::jsonb)
    ) INTO v_before;

    UPDATE "Cohort" SET "startDate" = v_new_start, "endDate" = v_new_end WHERE id = c.id;
    FOR i IN 1 .. array_length(v_week_ids, 1) LOOP
      UPDATE "Week"
      SET "classDate" = CASE
        WHEN v_week_final[i] = v_new_start + ("weekNumber" - 1) * 7 THEN NULL
        ELSE v_week_final[i]
      END
      WHERE id = v_week_ids[i];
    END LOOP;

    SELECT jsonb_build_object(
      'weeks', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', id, 'classDate', "classDate")) FROM "Week" WHERE id = ANY(v_week_ids)), '[]'::jsonb),
      'cohorts', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', id, 'startDate', "startDate", 'endDate', "endDate")) FROM "Cohort" WHERE id = c.id), '[]'::jsonb)
    ) INTO v_after;

    v_summary := format('Pulled %s''s classes forward into freed Sundays', c.name);
    INSERT INTO "PlannerChange" (summary, "cohortId", "before", "after", "createdById")
    VALUES (v_summary, c.id, v_before, v_after, actor.id)
    RETURNING id INTO v_change_id;
  END IF;

  RETURN json_build_object(
    'cohortId', c.id,
    'cohortName', c.name,
    'moves', v_moves,
    'endBefore', v_old_end,
    'endAfter', v_new_end,
    'applied', p_apply AND jsonb_array_length(v_moves) > 0,
    'changeId', v_change_id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.planner_pull_forward(TEXT, UUID, JSONB, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.planner_pull_forward(TEXT, UUID, JSONB, BOOLEAN) TO anon, authenticated;
