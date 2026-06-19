-- Group Prayer Status module: per-group per-week prayer completion tracking
-- Idempotent.

CREATE TABLE IF NOT EXISTS "GroupPrayerStatus" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "groupId" UUID NOT NULL REFERENCES "Group"(id) ON DELETE CASCADE,
  "weekId" INTEGER NOT NULL REFERENCES "Week"(id) ON DELETE CASCADE,
  done BOOLEAN NOT NULL DEFAULT FALSE,
  "markedById" UUID REFERENCES "User"(id) ON DELETE SET NULL,
  "markedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE("groupId", "weekId")
);

CREATE INDEX IF NOT EXISTS idx_groupprayerstatus_group ON "GroupPrayerStatus"("groupId");
CREATE INDEX IF NOT EXISTS idx_groupprayerstatus_week ON "GroupPrayerStatus"("weekId");

ALTER TABLE "GroupPrayerStatus" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all operations" ON "GroupPrayerStatus";
CREATE POLICY "Allow all operations" ON "GroupPrayerStatus" FOR ALL USING (true) WITH CHECK (true);
