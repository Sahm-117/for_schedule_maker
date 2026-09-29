-- Planner step 3: Nigerian public holidays on the FOF Planner timeline.
--
-- Information only: holidays never clash with classes (church may still hold
-- FOF on Easter Sunday, say). The refresh-public-holidays edge function fills
-- this table from Google's public Nigerian holiday calendar, every 14 days by
-- cron and on an admin's "Refresh now". Eid and other moon-sighted dates are
-- marked isEstimate until the government announces them.

CREATE TABLE IF NOT EXISTS public."PublicHoliday" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  name TEXT NOT NULL,
  "isEstimate" BOOLEAN NOT NULL DEFAULT FALSE,
  source TEXT NOT NULL DEFAULT 'google-ng',
  "fetchedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (date, name)
);

CREATE INDEX IF NOT EXISTS "PublicHoliday_date_idx" ON public."PublicHoliday" (date);

ALTER TABLE public."PublicHoliday" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff can read public holidays" ON public."PublicHoliday";
CREATE POLICY "Staff can read public holidays" ON public."PublicHoliday" FOR SELECT USING (public.app_is_staff());

GRANT SELECT ON public."PublicHoliday" TO anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public."PublicHoliday" FROM anon, authenticated;

-- Cron: refresh every 14 days (1st and 15th of the month, 03:00 UTC), same
-- pg_net + vault pattern as 20260728000000_push_reminders_cron_and_dedupe.sql.
CREATE OR REPLACE FUNCTION public.invoke_refresh_public_holidays()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_url TEXT;
  v_key TEXT;
BEGIN
  SELECT decrypted_secret INTO v_url
    FROM vault.decrypted_secrets WHERE name = 'project_url';
  SELECT decrypted_secret INTO v_key
    FROM vault.decrypted_secrets WHERE name = 'push_reminders_service_key';

  IF v_url IS NULL OR v_key IS NULL THEN
    RAISE NOTICE 'refresh-public-holidays: vault secrets missing; skipping run';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := v_url || '/functions/v1/refresh-public-holidays',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', v_key,
      'Authorization', 'Bearer ' || v_key
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
END
$$;

REVOKE ALL ON FUNCTION public.invoke_refresh_public_holidays() FROM PUBLIC;

SELECT cron.unschedule('refresh_public_holidays_fortnightly')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'refresh_public_holidays_fortnightly');

SELECT cron.schedule(
  'refresh_public_holidays_fortnightly',
  '0 3 1,15 * *',
  $$select public.invoke_refresh_public_holidays();$$
);

-- Rollback: select cron.unschedule('refresh_public_holidays_fortnightly');
