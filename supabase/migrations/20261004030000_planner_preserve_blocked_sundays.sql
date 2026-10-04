-- Fix repeated push-backs moving existing gaps and creating phantom skips.
-- Same API, permissions, audit/undo and spare-week policy.

CREATE OR REPLACE FUNCTION public.planner_push_back(
  p_token TEXT,
  p_week_id INTEGER,
  p_event_id UUID,
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
  wk "Week";
  c "Cohort";
  d "Cohort";
  w RECORD;
  v_from DATE;
  v_next DATE;
  v_old_last DATE;
  v_new_last DATE;
  v_old_end DATE;
  v_new_end DATE;
  v_first_week INTEGER;
  v_new_start DATE;
  v_prev_end DATE;
  v_d_first DATE;
  v_d_last DATE;
  v_shift INTEGER;
  v_moves JSONB := '[]'::jsonb;
  v_later JSONB := '[]'::jsonb;
  -- Rows to write: weeks (id → new classDate) and cohorts (id → new start/end).
  v_week_ids INTEGER[] := '{}';
  v_week_new DATE[] := '{}';
  v_cohort_ids UUID[] := '{}';
  v_cohort_start DATE[] := '{}';
  v_cohort_end DATE[] := '{}';
  v_before JSONB;
  v_after JSONB;
  v_change_id UUID;
  v_summary TEXT;
  i INTEGER;
BEGIN
  IF actor.id IS NULL OR actor.role <> 'ADMIN'::"Role" THEN
    RAISE EXCEPTION 'NOT_AUTHORISED';
  END IF;

  SELECT * INTO wk FROM "Week" WHERE id = p_week_id;
  IF wk.id IS NULL THEN
    RAISE EXCEPTION 'That class was not found';
  END IF;
  -- Serialize applies to the same cohort, then re-read dates after acquiring the lock.
  IF p_apply THEN
    SELECT * INTO c FROM "Cohort" WHERE id = wk."cohortId" FOR UPDATE;
    SELECT * INTO wk FROM "Week" WHERE id = p_week_id;
  ELSE
    SELECT * INTO c FROM "Cohort" WHERE id = wk."cohortId";
  END IF;
  IF c."startDate" IS NULL THEN
    RAISE EXCEPTION 'This cohort has no start date';
  END IF;

  v_from := public.week_class_date(c."startDate", wk."weekNumber", wk."classDate");
  IF v_from < v_today THEN
    RAISE EXCEPTION 'That class has already happened';
  END IF;

  IF p_event_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "ChurchEvent" e WHERE e.id = p_event_id AND e."stopsFof"
      AND v_from BETWEEN e."startDate" AND e."endDate"
  ) THEN
    RAISE EXCEPTION 'This class no longer clashes with that event. Refresh the planner.';
  END IF;

  SELECT min("weekNumber"), max(public.week_class_date(c."startDate", "weekNumber", "classDate"))
  INTO v_first_week, v_old_last
  FROM "Week" WHERE "cohortId" = c.id;

  -- Keep existing later dates when they still fit. Move only collisions, and
  -- skip every blocked Sunday by its calendar date; never shift an old gap.
  v_next := v_from + 7;
  v_new_last := v_old_last;
  FOR w IN
    SELECT id, "weekNumber", public.week_class_date(c."startDate", "weekNumber", "classDate") AS dt
    FROM "Week" WHERE "cohortId" = c.id AND "weekNumber" >= wk."weekNumber"
    ORDER BY "weekNumber"
  LOOP
    v_next := GREATEST(v_next, w.dt);
    WHILE EXISTS (
      SELECT 1 FROM "ChurchEvent" e WHERE e."stopsFof"
        AND v_next BETWEEN e."startDate" AND e."endDate"
    ) LOOP
      v_next := v_next + 7;
    END LOOP;
    IF v_next <> w.dt THEN
      v_week_ids := v_week_ids || w.id;
      v_week_new := v_week_new || v_next;
      v_moves := v_moves || jsonb_build_object('weekNumber', w."weekNumber", 'from', w.dt, 'to', v_next);
    END IF;
    v_new_last := GREATEST(v_new_last, v_next);
    v_next := v_next + 7;
  END LOOP;

  -- 2. The spare week takes the first shift; after that the end date moves.
  v_old_end := GREATEST(COALESCE(c."endDate", v_old_last + 7), v_old_last);
  v_new_end := GREATEST(v_old_end, v_new_last);
  v_new_start := CASE WHEN wk."weekNumber" <= v_first_week THEN c."startDate" + (v_week_new[1] - v_from) ELSE c."startDate" END;
  v_cohort_ids := v_cohort_ids || c.id;
  v_cohort_start := v_cohort_start || v_new_start;
  v_cohort_end := v_cohort_end || v_new_end;

  -- 3. Later cohorts whose rest would start on or before the new end move back
  --    in whole weeks, and so on down the line. Test cohorts ("ZZ…") are left alone.
  v_prev_end := v_new_end;
  FOR d IN
    SELECT * FROM "Cohort"
    WHERE "startDate" IS NOT NULL AND "startDate" > c."startDate" AND id <> c.id AND name !~* '^\s*zz'
    ORDER BY "startDate"
  LOOP
    SELECT min(public.week_class_date(d."startDate", "weekNumber", "classDate")),
           max(public.week_class_date(d."startDate", "weekNumber", "classDate"))
    INTO v_d_first, v_d_last
    FROM "Week" WHERE "cohortId" = d.id;
    v_d_first := COALESCE(v_d_first, d."startDate");
    v_d_last := COALESCE(v_d_last, d."startDate" + 63);
    -- Rest starts 3 + 3 weeks and 6 days before the first class Sunday.
    EXIT WHEN v_d_first - 48 > v_prev_end;
    v_shift := CEIL((v_prev_end - (v_d_first - 48) + 1) / 7.0)::int * 7;

    FOR w IN SELECT id, "weekNumber", "classDate" FROM "Week" WHERE "cohortId" = d.id AND "classDate" IS NOT NULL LOOP
      v_week_ids := v_week_ids || w.id;
      v_week_new := v_week_new || (w."classDate" + v_shift);
    END LOOP;
    v_cohort_ids := v_cohort_ids || d.id;
    v_cohort_start := v_cohort_start || (d."startDate" + v_shift);
    v_cohort_end := v_cohort_end || (GREATEST(COALESCE(d."endDate", v_d_last + 7), v_d_last) + v_shift);
    v_later := v_later || jsonb_build_object(
      'cohortId', d.id, 'name', d.name, 'shiftDays', v_shift,
      'firstClassBefore', v_d_first, 'firstClassAfter', v_d_first + v_shift
    );
    v_prev_end := GREATEST(COALESCE(d."endDate", v_d_last + 7), v_d_last) + v_shift;
  END LOOP;

  IF p_apply THEN
    SELECT jsonb_build_object(
      'weeks', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', id, 'classDate', "classDate")) FROM "Week" WHERE id = ANY(v_week_ids)), '[]'::jsonb),
      'cohorts', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', id, 'startDate', "startDate", 'endDate', "endDate")) FROM "Cohort" WHERE id = ANY(v_cohort_ids)), '[]'::jsonb)
    ) INTO v_before;

    FOR i IN 1 .. COALESCE(array_length(v_week_ids, 1), 0) LOOP
      UPDATE "Week" SET "classDate" = v_week_new[i] WHERE id = v_week_ids[i];
    END LOOP;
    FOR i IN 1 .. array_length(v_cohort_ids, 1) LOOP
      UPDATE "Cohort" SET "startDate" = v_cohort_start[i], "endDate" = v_cohort_end[i] WHERE id = v_cohort_ids[i];
    END LOOP;

    SELECT jsonb_build_object(
      'weeks', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', id, 'classDate', "classDate")) FROM "Week" WHERE id = ANY(v_week_ids)), '[]'::jsonb),
      'cohorts', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', id, 'startDate', "startDate", 'endDate', "endDate")) FROM "Cohort" WHERE id = ANY(v_cohort_ids)), '[]'::jsonb)
    ) INTO v_after;

    v_summary := format('Rescheduled %s from class %s around blocked Sundays%s',
      c.name, wk."weekNumber",
      CASE WHEN jsonb_array_length(v_later) > 0 THEN ' (later cohorts moved too)' ELSE '' END);
    INSERT INTO "PlannerChange" (summary, "eventId", "cohortId", "before", "after", "createdById")
    VALUES (v_summary, p_event_id, c.id, v_before, v_after, actor.id)
    RETURNING id INTO v_change_id;
  END IF;

  RETURN json_build_object(
    'cohortId', c.id,
    'cohortName', c.name,
    'weekNumber', wk."weekNumber",
    'classDate', v_from,
    'moves', v_moves,
    'endBefore', v_old_end,
    'endAfter', v_new_end,
    'spareWeeksBefore', GREATEST(0, (v_old_end - v_old_last) / 7),
    'spareWeeksAfter', GREATEST(0, (v_new_end - v_new_last) / 7),
    'laterCohorts', v_later,
    'applied', p_apply,
    'changeId', v_change_id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.planner_push_back(TEXT, INTEGER, UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.planner_push_back(TEXT, INTEGER, UUID, BOOLEAN) TO anon, authenticated;

