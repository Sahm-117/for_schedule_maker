-- Planner: set a cohort's class dates by hand.
--
-- planner_set_class_dates: an admin gives new Sundays for some (or all) of a
-- real cohort's classes. Every class date must be a Sunday, the ten dates must
-- be strictly increasing, and a class that has already happened (or a date
-- before today) can't be touched. Called with p_apply = FALSE it only returns
-- the moves; with TRUE it applies them and records a PlannerChange (same
-- before/after shape as planner_push_back) that planner_undo_change can reverse.
--
-- How it writes: if class 1 moves, Cohort."startDate" becomes the new class 1
-- date. Then every week of the cohort gets its final date; a week stores
-- "classDate" only when it differs from startDate + (weekNumber - 1) * 7,
-- otherwise it goes back to NULL (see 20260929200000_week_class_date.sql).
-- End date rule: if the old end date was at most the old last class + 7 days
-- (i.e. it was just the spare week), the new end date is the new last class + 7
-- days; otherwise (the spare week was already used up and the cycle was
-- extended) the old end date moves by the same number of days as the last
-- class. Later cohorts are NOT moved; the Planner page warns about overlaps.
--
-- planner_set_planned_dates: saves class dates for a planned (not yet created)
-- cohort in AppSetting 'planner_planned_dates' as {"Cohort 11": ["2027-01-10", ...]}.
-- p_dates NULL removes that cohort's saved dates ("Reset to auto"). Staff read
-- the setting straight from AppSetting, like the other settings.
--
-- Rollback: DROP FUNCTION planner_set_class_dates, planner_set_planned_dates;
-- DELETE FROM "AppSetting" WHERE "settingKey" = 'planner_planned_dates'
-- (undo any applied class-date changes first if they should be reversed).

CREATE OR REPLACE FUNCTION public.planner_set_class_dates(
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
  v_new_end := CASE
    WHEN v_old_end <= v_old_last + 7 THEN v_new_last + 7
    ELSE v_old_end + (v_new_last - v_old_last)
  END;

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

    v_summary := format('Class dates changed for %s', c.name);
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

REVOKE ALL ON FUNCTION public.planner_set_class_dates(TEXT, UUID, JSONB, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.planner_set_class_dates(TEXT, UUID, JSONB, BOOLEAN) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.planner_set_planned_dates(
  p_token TEXT,
  p_name TEXT,
  p_dates JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  actor "User" := public.app_staff(p_token);
  v_current JSONB;
  v_prev DATE;
  v_d DATE;
  e JSONB;
BEGIN
  IF actor.id IS NULL OR actor.role <> 'ADMIN'::"Role" THEN
    RAISE EXCEPTION 'NOT_AUTHORISED';
  END IF;
  IF btrim(COALESCE(p_name, '')) = '' THEN
    RAISE EXCEPTION 'That planned cohort has no name';
  END IF;

  SELECT value INTO v_current FROM "AppSetting" WHERE "settingKey" = 'planner_planned_dates';
  IF v_current IS NULL OR jsonb_typeof(v_current) <> 'object' THEN
    v_current := '{}'::jsonb;
  END IF;

  IF p_dates IS NULL OR jsonb_typeof(p_dates) = 'null' THEN
    v_current := v_current - btrim(p_name);
  ELSE
    IF jsonb_typeof(p_dates) <> 'array' OR jsonb_array_length(p_dates) <> 10 THEN
      RAISE EXCEPTION 'A cohort needs 10 class dates';
    END IF;
    v_prev := NULL;
    FOR e IN SELECT * FROM jsonb_array_elements(p_dates) LOOP
      v_d := (e #>> '{}')::date;
      IF EXTRACT(DOW FROM v_d) <> 0 THEN
        RAISE EXCEPTION 'Every class must be on a Sunday';
      END IF;
      IF v_prev IS NOT NULL AND v_d <= v_prev THEN
        RAISE EXCEPTION 'Class dates must be in order';
      END IF;
      v_prev := v_d;
    END LOOP;
    v_current := jsonb_set(v_current, ARRAY[btrim(p_name)], p_dates, TRUE);
  END IF;

  INSERT INTO "AppSetting" ("settingKey", value, "updatedAt")
  VALUES ('planner_planned_dates', v_current, NOW())
  ON CONFLICT ("settingKey") DO UPDATE SET value = EXCLUDED.value, "updatedAt" = NOW();
END;
$function$;

REVOKE ALL ON FUNCTION public.planner_set_planned_dates(TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.planner_set_planned_dates(TEXT, TEXT, JSONB) TO anon, authenticated;
