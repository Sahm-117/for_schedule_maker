-- Generic application settings used by frontend/admin controls.

CREATE TABLE IF NOT EXISTS "AppSetting" (
  "settingKey" TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE "AppSetting" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'AppSetting'
      AND policyname = 'Allow all operations'
  ) THEN
    CREATE POLICY "Allow all operations"
      ON "AppSetting"
      FOR ALL
      USING (true);
  END IF;
END
$$;

INSERT INTO "AppSetting" ("settingKey", value)
VALUES ('daily_digest_enabled', 'true'::jsonb)
ON CONFLICT ("settingKey") DO NOTHING;
