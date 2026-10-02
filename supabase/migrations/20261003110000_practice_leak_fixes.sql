-- Two more places where practice / demo data could show up in real views.
--
-- 1. set_hub_prayer_focus checked that a Faith Project is "on the hub's prayer
--    list" by support only, so a practice Faith Project could be put on screen in
--    a real hub. It now requires the group to be in the hub's own cohort, the
--    same rule hub_prayer_list uses (20261003100000).
-- 2. birthdays_list under "All cohorts" included the ZZ Demo cohort's people.
--    Cohorts named "ZZ..." are left out, as on the Planner.
--
-- Rollback: restore both functions from their earlier migrations
-- (20260926190000_hub_meeting_live.sql, 20261002400000_birthdays.sql).
DO $m$
DECLARE
  v_def TEXT;
BEGIN
  SELECT pg_get_functiondef('public.set_hub_prayer_focus(uuid,integer,uuid)'::regprocedure) INTO v_def;
  IF position('hm."cohortId"' IN v_def) = 0 THEN
    v_def := replace(
      v_def,
      'JOIN public."HubMembership" hm ON hm."userId" = g."supportId" AND hm."hubId" = p_hub_id',
      'JOIN public."HubMembership" hm ON hm."userId" = g."supportId" AND hm."hubId" = p_hub_id AND hm."cohortId" = g."cohortId"'
    );
    IF position('hm."cohortId"' IN v_def) = 0 THEN RAISE EXCEPTION 'set_hub_prayer_focus did not change'; END IF;
    EXECUTE v_def;
  END IF;

  SELECT pg_get_functiondef('public.birthdays_list(text,uuid)'::regprocedure) INTO v_def;
  IF position('^zz' IN v_def) = 0 THEN
    v_def := replace(
      v_def,
      'COALESCE(c."isPractice", FALSE) = FALSE',
      'COALESCE(c."isPractice", FALSE) = FALSE AND c.name !~* ''^zz\y'''
    );
    IF position('^zz' IN v_def) = 0 THEN RAISE EXCEPTION 'birthdays_list did not change'; END IF;
    EXECUTE v_def;
  END IF;
END
$m$;
