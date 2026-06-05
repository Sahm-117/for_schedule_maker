CREATE TABLE IF NOT EXISTS "SupportActivityCompletion" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "activityId" INTEGER NOT NULL REFERENCES "Activity"(id) ON DELETE CASCADE,
  "userId" UUID NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "completedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("activityId", "userId")
);

CREATE INDEX IF NOT EXISTS idx_supportactivitycompletion_user ON "SupportActivityCompletion"("userId");
CREATE INDEX IF NOT EXISTS idx_supportactivitycompletion_activity ON "SupportActivityCompletion"("activityId");

ALTER TABLE "SupportActivityCompletion" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations" ON "SupportActivityCompletion";
CREATE POLICY "Allow all operations" ON "SupportActivityCompletion" FOR ALL USING (true);
