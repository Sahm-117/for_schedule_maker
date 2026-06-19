-- Group Prayer Focus module: support-selected participant focus per group/week
-- Idempotent.

CREATE TABLE IF NOT EXISTS "GroupPrayerFocus" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "groupId" UUID NOT NULL REFERENCES "Group"(id) ON DELETE CASCADE,
  "weekId" INTEGER NOT NULL REFERENCES "Week"(id) ON DELETE CASCADE,
  "participantId" UUID NOT NULL REFERENCES "Participant"(id) ON DELETE CASCADE,
  "setById" UUID REFERENCES "User"(id) ON DELETE SET NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE("groupId", "weekId")
);

CREATE INDEX IF NOT EXISTS idx_groupprayerfocus_group ON "GroupPrayerFocus"("groupId");
CREATE INDEX IF NOT EXISTS idx_groupprayerfocus_week ON "GroupPrayerFocus"("weekId");
CREATE INDEX IF NOT EXISTS idx_groupprayerfocus_participant ON "GroupPrayerFocus"("participantId");

ALTER TABLE "GroupPrayerFocus" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all operations" ON "GroupPrayerFocus";
CREATE POLICY "Allow all operations" ON "GroupPrayerFocus" FOR ALL USING (true) WITH CHECK (true);
