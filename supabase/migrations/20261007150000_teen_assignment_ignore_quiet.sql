-- For now, teen assignment does not skip "quiet" Teen Supports (not in the app for 7 days).
-- They are told through push and the bell once they open the app; waiting teens would
-- otherwise sit unplaced. Adult assignment is unchanged.
--
-- Rollback: re-apply assign_teen_contacts from 20261006180000_teen_assignment.sql
-- (it has the two "AND NOT public.followup_owner_is_quiet(u.id)" lines this removes).

DO $patch$
DECLARE
  v_def TEXT;
  v_new TEXT;
BEGIN
  SELECT pg_get_functiondef('public.assign_teen_contacts(uuid)'::regprocedure) INTO v_def;
  v_new := replace(v_def, 'AND NOT public.followup_owner_is_quiet(u.id)', 'AND TRUE /* quiet check off for teens, see 20261007150000 */');
  IF v_new = v_def THEN
    RAISE EXCEPTION 'assign_teen_contacts: quiet check not found';
  END IF;
  IF (length(v_def) - length(replace(v_def, 'followup_owner_is_quiet', ''))) / length('followup_owner_is_quiet') <> 2 THEN
    RAISE EXCEPTION 'assign_teen_contacts: expected two quiet checks';
  END IF;
  EXECUTE v_new;
END
$patch$;
