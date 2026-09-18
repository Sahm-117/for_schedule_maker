-- Phase D: take away the privileges the browser roles hold but never use.
--
-- TRUNCATE, TRIGGER and REFERENCES are granted to anon and authenticated on 58
-- tables. Nothing in the app has ever needed any of them:
--
--   TRUNCATE   -- PostgREST has no truncate verb, and no code path truncates
--   TRIGGER    -- creating triggers on a table, which is a schema change
--   REFERENCES -- pointing a foreign key at a table, likewise
--
-- TRUNCATE is the one worth singling out. Row level security does not govern
-- it: policies filter rows, while TRUNCATE is decided by the privilege alone.
-- Every other verb the browser can reach is now behind app_is_staff(), so this
-- is the last thing on these tables that a policy could not have stopped. It is
-- not reachable through PostgREST today, so this is depth rather than an open
-- door being shut.
--
-- SELECT, INSERT, UPDATE and DELETE are deliberately left alone. They are what
-- the app runs on, and they are now governed by the policies from the batches
-- before this. Revoking DELETE where the app happens not to delete today would
-- buy nothing -- the policy already refuses an anonymous caller -- while
-- risking a broken feature the moment a delete path was missed.

DO $$
DECLARE
  t RECORD;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format(
      'REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.%I FROM anon, authenticated',
      t.tablename
    );
  END LOOP;
END;
$$;
