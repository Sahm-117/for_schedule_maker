-- Corporate prayers start the day after the start week's class (the Monday after a Sunday class), not on the class day.
-- Everything reads the start through faith_prayers_start_date: the daily slots (prayer_running), the
-- "happy to be prayed for?" pop-up (counted back from it), participant_home, participant_faith and the admin overview.
-- FLOW_MAP rule 50.
--
-- Rollback: re-create faith_prayers_start_date without the "+ 1".

CREATE OR REPLACE FUNCTION public.faith_prayers_start_date(p_cohort_id uuid)
 RETURNS date
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT public.week_class_date(c."startDate", s."prayersStartWeekNumber", w."classDate") + 1
  FROM "FaithProjectSetting" s
  JOIN "Cohort" c ON c.id = s."cohortId"
  LEFT JOIN "Week" w ON w."cohortId" = c.id AND w."weekNumber" = s."prayersStartWeekNumber"
  WHERE s."cohortId" = p_cohort_id AND s."prayersStartWeekNumber" IS NOT NULL;
$function$;
