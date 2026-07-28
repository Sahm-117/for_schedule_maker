-- Push reminders: server-side dedupe log + the pg_cron schedule that actually
-- invokes the push-reminders edge function.
--
-- Why: push-reminders was deployed months ago and its header claimed a cron ran
-- it every 10 minutes, but no such job was ever created — cron.job only ever
-- held telegram_daily_digest_0520_lagos, so activity reminders never fired once.
-- The schedule lives here, in a committed migration, so it is reproducible
-- rather than dashboard-only (which is how it went missing in the first place).

-- 1. Dedupe log.
--    The web-push `tag` only collapses notifications in the browser UI; it does
--    not stop a second send. With a 10-minute cron and a +/-5 minute match
--    window an activity can match two consecutive runs, so the guard must be
--    server-side. Same unique-insert pattern as "FollowUpOwnerReminderLog".
CREATE TABLE IF NOT EXISTS "PushReminderLog" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL,                 -- 'ACTIVITY' | 'GROUP_MEETING'
  "targetId" TEXT NOT NULL,           -- Activity.id / Group.id as text
  "userId" UUID NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "reminderDate" DATE NOT NULL,       -- Lagos date of the occurrence reminded about
  "intervalMinutes" INTEGER NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (kind, "targetId", "userId", "reminderDate", "intervalMinutes")
);

CREATE INDEX IF NOT EXISTS idx_pushreminderlog_date ON "PushReminderLog"("reminderDate");

-- This app uses custom auth, not Supabase Auth, so auth.uid() is null and
-- policies must be permissive (consistent with the other tables here).
ALTER TABLE "PushReminderLog" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all operations" ON "PushReminderLog";
CREATE POLICY "Allow all operations" ON "PushReminderLog" FOR ALL USING (true);

-- 2. Extensions (already present in production; declared for reproducibility).
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 3. Invoker.
--    Wrapped in a SECURITY DEFINER function that reads the key from Vault at run
--    time, rather than inlining the JWT in the cron command. The existing
--    telegram job inlines its key, which leaves a service-role JWT readable by
--    anyone who can SELECT from cron.job — deliberately not repeated here.
--
--    Bootstrap ONCE, out of band (never commit the real values):
--      select vault.create_secret('<service_role_jwt>', 'push_reminders_service_key');
--      select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
CREATE OR REPLACE FUNCTION public.invoke_push_reminders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_url text;
  v_key text;
BEGIN
  SELECT decrypted_secret INTO v_url
    FROM vault.decrypted_secrets WHERE name = 'project_url';
  SELECT decrypted_secret INTO v_key
    FROM vault.decrypted_secrets WHERE name = 'push_reminders_service_key';

  IF v_url IS NULL OR v_key IS NULL THEN
    RAISE NOTICE 'push-reminders: vault secrets missing; skipping run';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := v_url || '/functions/v1/push-reminders',
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

REVOKE ALL ON FUNCTION public.invoke_push_reminders() FROM PUBLIC;

-- 4. Schedule, every 10 minutes. The cron expression is UTC, which is fine:
--    the function derives all day/time matching in Africa/Lagos internally.
--    Idempotent so re-running the migration doesn't create a duplicate job.
SELECT cron.unschedule('push_reminders_every_10min')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'push_reminders_every_10min');

SELECT cron.schedule(
  'push_reminders_every_10min',
  '*/10 * * * *',
  $$select public.invoke_push_reminders();$$
);

-- 5. Retention — the log only exists to dedupe within a day, so don't keep it
--    forever.
SELECT cron.unschedule('push_reminder_log_cleanup')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'push_reminder_log_cleanup');

SELECT cron.schedule(
  'push_reminder_log_cleanup',
  '30 2 * * *',
  $$delete from "PushReminderLog" where "createdAt" < now() - interval '30 days';$$
);

-- Rollback (stops all reminder traffic instantly, no redeploy needed):
--   select cron.unschedule('push_reminders_every_10min');
