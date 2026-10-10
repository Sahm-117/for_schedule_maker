-- Row-level security: evaluate the session helpers ONCE per query, not once per row.
--
-- Every policy called app_is_staff() / app_is_admin() / app_current_user_id() bare. Those are
-- STABLE SECURITY DEFINER functions, which Postgres does not inline, so each one ran a session
-- lookup for EVERY row it checked: reading the 836 activities cost ~41 ms of database time for
-- a staff session, against ~0.4 ms once the call is wrapped as (SELECT ...), which Postgres
-- runs once per statement. The result of the helpers cannot change inside one statement, so
-- who can see or change what is identical. Proven before applying: row counts for all 84 tables
-- that have policies, for four kinds of viewer (no token, admin, support, participant), were
-- the same before and after (336 pairs). Policy names, commands and roles are untouched.
--
-- Idempotent: a policy that already has a wrapped call is skipped.
-- Rollback: see docs/handoffs/2026-10-10_polling-load-shedding.md (every policy's old text is
-- the same expression without the (SELECT ...) around the three helper calls).
DO $$
DECLARE
  pol record; new_q text; new_c text; n_changed int := 0;
BEGIN
  FOR pol IN
    SELECT c.relname, p.polname,
           pg_get_expr(p.polqual, p.polrelid) AS q,
           pg_get_expr(p.polwithcheck, p.polrelid) AS wc
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
  LOOP
    -- Already wrapped (nothing to do), or no per-row helper call in it.
    IF coalesce(pol.q, '') ~ 'SELECT app_' OR coalesce(pol.wc, '') ~ 'SELECT app_' THEN CONTINUE; END IF;
    new_q := regexp_replace(pol.q, '\m(app_is_staff|app_is_admin|app_current_user_id)\(\)', '(SELECT \1())', 'g');
    new_c := regexp_replace(pol.wc, '\m(app_is_staff|app_is_admin|app_current_user_id)\(\)', '(SELECT \1())', 'g');
    IF new_q IS NOT DISTINCT FROM pol.q AND new_c IS NOT DISTINCT FROM pol.wc THEN CONTINUE; END IF;
    EXECUTE format('ALTER POLICY %I ON public.%I%s%s', pol.polname, pol.relname,
      CASE WHEN pol.q IS NOT NULL THEN ' USING (' || new_q || ')' ELSE '' END,
      CASE WHEN pol.wc IS NOT NULL THEN ' WITH CHECK (' || new_c || ')' ELSE '' END);
    n_changed := n_changed + 1;
  END LOOP;
  RAISE NOTICE 'policies rewritten: %', n_changed;
END $$;
