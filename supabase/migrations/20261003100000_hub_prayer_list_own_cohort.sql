-- The hub prayer list only shows Faith Projects from groups in the hub's own
-- cohort. Practice groups (made for real supports so they can try the app) sit
-- in the Practice cohort, and their made-up prayers were appearing in real hubs.
--
-- Rollback: restore hub_prayer_list from 20260926190000_hub_meeting_live.sql
-- (drop the "g.cohortId = hub.cohortId" join below).
DO $m$
DECLARE
  v_def TEXT;
BEGIN
  SELECT pg_get_functiondef('public.hub_prayer_list(uuid)'::regprocedure) INTO v_def;
  IF position('hub."cohortId"' IN v_def) = 0 THEN
    v_def := replace(
      v_def,
      'JOIN public."HubMembership" hm ON hm."userId" = g."supportId" AND hm."hubId" = p_hub_id',
      'JOIN public."HubMembership" hm ON hm."userId" = g."supportId" AND hm."hubId" = p_hub_id
  JOIN public."SupportHub" hub ON hub.id = hm."hubId" AND hub."cohortId" = g."cohortId"'
    );
    IF position('hub."cohortId"' IN v_def) = 0 THEN
      RAISE EXCEPTION 'hub_prayer_list did not change';
    END IF;
    EXECUTE v_def;
  END IF;
END
$m$;
