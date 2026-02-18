-- Daily Telegram digest log table for idempotency and diagnostics.

CREATE TABLE IF NOT EXISTS "TelegramDigestLog" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "runDate" DATE NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Africa/Lagos',
  "weekNumber" INTEGER,
  "dayName" TEXT,
  status TEXT NOT NULL,
  details JSONB,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_telegram_digest_log_run_date_tz
  ON "TelegramDigestLog" ("runDate", timezone);

ALTER TABLE "TelegramDigestLog" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'TelegramDigestLog'
      AND policyname = 'Allow all operations'
  ) THEN
    CREATE POLICY "Allow all operations"
      ON "TelegramDigestLog"
      FOR ALL
      USING (true);
  END IF;
END
$$;
