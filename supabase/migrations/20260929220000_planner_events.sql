-- Planner step 4: church events, clashes and "Push back".
--
-- ChurchEvent: an admin adds an event (name, from/to) with a "Stops FOF"
-- switch. Only Stops-FOF events that land on a class Sunday are clashes; the
-- clash itself is worked out on the Planner page from the week class dates.
--
-- planner_push_back moves the clashing class and every later class of that
-- cohort one Sunday later. The spare week absorbs the first shift (the
-- cohort's endDate stays); after that the endDate moves and any later cohort
-- whose rest would now start on or before it moves back too, and so on. Called
-- with p_apply = FALSE it only returns "what moves"; with TRUE it applies it and
-- records a PlannerChange (before/after) that planner_undo_change can reverse.
--
-- Weeks keep classDate NULL until moved (see 20260929200000_week_class_date.sql).
-- A later cohort that moves has its startDate, endDate and any set classDates
-- shifted, so its unmoved weeks follow the new startDate.
--
-- Rollback: DROP FUNCTION planner_undo_change, planner_push_back,
-- planner_delete_event, planner_save_event; DROP TABLE "PlannerChange",
-- "ChurchEvent" (undo any applied changes first if they should be reversed).

CREATE TABLE IF NOT EXISTS public."ChurchEvent" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  "startDate" DATE NOT NULL,
  "endDate" DATE NOT NULL,
  "stopsFof" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdById" UUID REFERENCES public."User"(id) ON DELETE SET NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ("endDate" >= "startDate")
);

CREATE INDEX IF NOT EXISTS "ChurchEvent_dates_idx" ON public."ChurchEvent" ("startDate", "endDate");

ALTER TABLE public."ChurchEvent" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff can read church events" ON public."ChurchEvent";
CREATE POLICY "Staff can read church events" ON public."ChurchEvent" FOR SELECT USING (public.app_is_staff());
GRANT SELECT ON public."ChurchEvent" TO anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public."ChurchEvent" FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public."PlannerChange" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  summary TEXT NOT NULL,
  "eventId" UUID REFERENCES public."ChurchEvent"(id) ON DELETE SET NULL,
  "cohortId" UUID REFERENCES public."Cohort"(id) ON DELETE CASCADE,
  "before" JSONB NOT NULL,
  "after" JSONB NOT NULL,
  "createdById" UUID REFERENCES public."User"(id) ON DELETE SET NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "undoneAt" TIMESTAMPTZ,
  "undoneById" UUID REFERENCES public."User"(id) ON DELETE SET NULL
);

ALTER TABLE public."PlannerChange" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff can read planner changes" ON public."PlannerChange";
CREATE POLICY "Staff can read planner changes" ON public."PlannerChange" FOR SELECT USING (public.app_is_staff());
GRANT SELECT ON public."PlannerChange" TO anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public."PlannerChange" FROM anon, authenticated;

-- ── Save / delete a church event (admins only) ───────────────────────────────
CREATE OR REPLACE FUNCTION public.planner_save_event(
  p_token TEXT,
  p_id UUID,
  p_name TEXT,
  p_start DATE,
  p_end DATE,
  p_stops_fof BOOLEAN
)
RETURNS public."ChurchEvent"
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  actor "User" := public.app_staff(p_token);
  saved "ChurchEvent";
BEGIN
  IF actor.id IS NULL OR actor.role <> 'ADMIN'::"Role" THEN
    RAISE EXCEPTION 'NOT_AUTHORISED';
  END IF;
  IF btrim(COALESCE(p_name, '')) = '' THEN
    RAISE EXCEPTION 'Give the event a name';
  END IF;
  IF p_start IS NULL OR p_end IS NULL OR p_end < p_start THEN
    RAISE EXCEPTION 'The end date can''t be before the start date';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO "ChurchEvent" (name, "startDate", "endDate", "stopsFof", "createdById")
    VALUES (btrim(p_name), p_start, p_end, COALESCE(p_stops_fof, FALSE), actor.id)
    RETURNING * INTO saved;
  ELSE
    UPDATE "ChurchEvent"
    SET name = btrim(p_name), "startDate" = p_start, "endDate" = p_end,
        "stopsFof" = COALESCE(p_stops_fof, FALSE), "updatedAt" = NOW()
    WHERE id = p_id
    RETURNING * INTO saved;
    IF saved.id IS NULL THEN
      RAISE EXCEPTION 'That event no longer exists';
    END IF;
  END IF;
  RETURN saved;
END;
$function$;

REVOKE ALL ON FUNCTION public.planner_save_event(TEXT, UUID, TEXT, DATE, DATE, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.planner_save_event(TEXT, UUID, TEXT, DATE, DATE, BOOLEAN) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.planner_delete_event(p_token TEXT, p_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  actor "User" := public.app_staff(p_token);
BEGIN
  IF actor.id IS NULL OR actor.role <> 'ADMIN'::"Role" THEN
    RAISE EXCEPTION 'NOT_AUTHORISED';
  END IF;
  DELETE FROM "ChurchEvent" WHERE id = p_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.planner_delete_event(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.planner_delete_event(TEXT, UUID) TO anon, authenticated;

-- ── Push back ────────────────────────────────────────────────────────────────
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
  SELECT * INTO c FROM "Cohort" WHERE id = wk."cohortId";
  IF c."startDate" IS NULL THEN
    RAISE EXCEPTION 'This cohort has no start date';
  END IF;

  v_from := public.week_class_date(c."startDate", wk."weekNumber", wk."classDate");
  IF v_from < v_today THEN
    RAISE EXCEPTION 'That class has already happened';
  END IF;

  SELECT min("weekNumber"), max(public.week_class_date(c."startDate", "weekNumber", "classDate"))
  INTO v_first_week, v_old_last
  FROM "Week" WHERE "cohortId" = c.id;

  -- 1. This class and every later one in the cohort move one Sunday later.
  v_new_last := v_old_last;
  FOR w IN
    SELECT id, "weekNumber", public.week_class_date(c."startDate", "weekNumber", "classDate") AS dt
    FROM "Week" WHERE "cohortId" = c.id AND "weekNumber" >= wk."weekNumber"
    ORDER BY "weekNumber"
  LOOP
    v_week_ids := v_week_ids || w.id;
    v_week_new := v_week_new || (w.dt + 7);
    v_moves := v_moves || jsonb_build_object('weekNumber', w."weekNumber", 'from', w.dt, 'to', w.dt + 7);
    v_new_last := GREATEST(v_new_last, w.dt + 7);
  END LOOP;

  -- 2. The spare week takes the first shift; after that the end date moves.
  v_old_end := GREATEST(COALESCE(c."endDate", v_old_last + 7), v_old_last);
  v_new_end := GREATEST(v_old_end, v_new_last);
  v_new_start := CASE WHEN wk."weekNumber" <= v_first_week THEN c."startDate" + 7 ELSE c."startDate" END;
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

    v_summary := format('Pushed %s''s class %s and later back a week%s',
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

-- ── Undo the latest change ───────────────────────────────────────────────────
-- Only the most recent change that hasn't been undone, and only while the
-- dates it touched are still exactly as it left them.
CREATE OR REPLACE FUNCTION public.planner_undo_change(p_token TEXT, p_change_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  actor "User" := public.app_staff(p_token);
  ch "PlannerChange";
  item JSONB;
BEGIN
  IF actor.id IS NULL OR actor.role <> 'ADMIN'::"Role" THEN
    RAISE EXCEPTION 'NOT_AUTHORISED';
  END IF;

  SELECT * INTO ch FROM "PlannerChange" WHERE id = p_change_id FOR UPDATE;
  IF ch.id IS NULL OR ch."undoneAt" IS NOT NULL THEN
    RAISE EXCEPTION 'That change has already been undone';
  END IF;
  IF EXISTS (SELECT 1 FROM "PlannerChange" WHERE "undoneAt" IS NULL AND "createdAt" > ch."createdAt") THEN
    RAISE EXCEPTION 'Only the latest change can be undone';
  END IF;

  FOR item IN SELECT * FROM jsonb_array_elements(ch."after"->'weeks') LOOP
    IF (SELECT "classDate" FROM "Week" WHERE id = (item->>'id')::int) IS DISTINCT FROM (item->>'classDate')::date THEN
      RAISE EXCEPTION 'Class dates have changed since, so this can''t be undone safely';
    END IF;
  END LOOP;
  FOR item IN SELECT * FROM jsonb_array_elements(ch."after"->'cohorts') LOOP
    IF (SELECT ROW("startDate", "endDate") FROM "Cohort" WHERE id = (item->>'id')::uuid)
       IS DISTINCT FROM ROW((item->>'startDate')::date, (item->>'endDate')::date) THEN
      RAISE EXCEPTION 'Cohort dates have changed since, so this can''t be undone safely';
    END IF;
  END LOOP;

  FOR item IN SELECT * FROM jsonb_array_elements(ch."before"->'weeks') LOOP
    UPDATE "Week" SET "classDate" = (item->>'classDate')::date WHERE id = (item->>'id')::int;
  END LOOP;
  FOR item IN SELECT * FROM jsonb_array_elements(ch."before"->'cohorts') LOOP
    UPDATE "Cohort" SET "startDate" = (item->>'startDate')::date, "endDate" = (item->>'endDate')::date
    WHERE id = (item->>'id')::uuid;
  END LOOP;

  UPDATE "PlannerChange" SET "undoneAt" = NOW(), "undoneById" = actor.id WHERE id = ch.id;
END;
$function$;

REVOKE ALL ON FUNCTION public.planner_undo_change(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.planner_undo_change(TEXT, UUID) TO anon, authenticated;
