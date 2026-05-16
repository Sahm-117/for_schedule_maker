-- Push notification subscriptions (Web Push / PWA)
CREATE TABLE IF NOT EXISTS "PushSubscription" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE("userId", endpoint)
);

CREATE INDEX IF NOT EXISTS idx_pushsub_user ON "PushSubscription"("userId");

ALTER TABLE "PushSubscription" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations" ON "PushSubscription" FOR ALL USING (true);

-- Notification timing settings stored in AppSetting:
-- key: 'remind_before_minutes', value: [15, 30, 60, 1440]
INSERT INTO "AppSetting" ("settingKey", value)
VALUES ('remind_before_minutes', '[60]'::jsonb)
ON CONFLICT ("settingKey") DO NOTHING;
