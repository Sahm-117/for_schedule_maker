-- One-time repair of the verified duplicate gap created by the old push-back.
-- Exact-state guards prevent overwriting a schedule edited after investigation.
DO $repair$
DECLARE
  c "Cohort";
  v_dates date[];
  v_ids integer[];
  v_blocked date[];
  v_before jsonb;
  v_after jsonb;
BEGIN
  SELECT * INTO c FROM "Cohort" WHERE id = 'feaac060-bd12-44fc-b681-9109d3b070fe' FOR UPDATE;
  IF c.id IS NULL THEN RETURN; END IF;
  PERFORM 1 FROM "Week" WHERE "cohortId" = c.id ORDER BY id FOR UPDATE;
  SELECT array_agg(public.week_class_date(c."startDate", "weekNumber", "classDate") ORDER BY "weekNumber"),
         array_agg(id ORDER BY "weekNumber") FILTER (WHERE "weekNumber" >= 4)
  INTO v_dates, v_ids FROM "Week" WHERE "cohortId" = c.id;
  IF c.name <> 'Cohort 10' OR c."startDate" IS DISTINCT FROM DATE '2026-10-11'
    OR c."endDate" IS DISTINCT FROM DATE '2027-01-03'
    OR v_dates IS DISTINCT FROM ARRAY['2026-10-11','2026-10-18','2026-11-08','2026-11-22','2026-11-29','2026-12-06','2026-12-13','2026-12-20','2026-12-27','2027-01-03']::date[]
    OR (SELECT array_agg("weekNumber" ORDER BY "weekNumber") FROM "Week" WHERE "cohortId"=c.id) IS DISTINCT FROM ARRAY[1,2,3,4,5,6,7,8,9,10]
  THEN RAISE EXCEPTION 'Cohort 10 changed since review; inspect before repairing'; END IF;
  SELECT array_agg(s::date ORDER BY s) INTO v_blocked
  FROM generate_series(DATE '2026-10-11', DATE '2027-01-03', INTERVAL '7 days') s
  WHERE EXISTS (SELECT 1 FROM "ChurchEvent" e WHERE e."stopsFof" AND s::date BETWEEN e."startDate" AND e."endDate");
  IF v_blocked IS DISTINCT FROM ARRAY['2026-10-25','2026-11-01']::date[] THEN
    RAISE EXCEPTION 'Blocking Sundays changed since review; inspect before repairing';
  END IF;
  SELECT jsonb_build_object(
    'weeks',(SELECT jsonb_agg(jsonb_build_object('id',id,'classDate',"classDate")) FROM "Week" WHERE id=ANY(v_ids)),
    'cohorts',jsonb_build_array(jsonb_build_object('id',c.id,'startDate',c."startDate",'endDate',c."endDate"))
  ) INTO v_before;
  UPDATE "Week" SET "classDate"=public.week_class_date(c."startDate","weekNumber","classDate")-7 WHERE id=ANY(v_ids);
  UPDATE "Cohort" SET "endDate"=DATE '2026-12-27' WHERE id=c.id;
  SELECT jsonb_build_object(
    'weeks',(SELECT jsonb_agg(jsonb_build_object('id',id,'classDate',"classDate")) FROM "Week" WHERE id=ANY(v_ids)),
    'cohorts',jsonb_build_array(jsonb_build_object('id',c.id,'startDate',c."startDate",'endDate',DATE '2026-12-27'))
  ) INTO v_after;
  INSERT INTO "PlannerChange" (summary,"cohortId","before","after")
  VALUES ('Corrected duplicate skipped Sunday: Cohort 10 classes 4–10 return one week earlier',c.id,v_before,v_after);
END;
$repair$;
