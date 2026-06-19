-- Group Prayers module: one prayer entry per week per cohort
-- Idempotent.

CREATE TABLE IF NOT EXISTS "GroupPrayer" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "cohortId" UUID NOT NULL REFERENCES "Cohort"(id) ON DELETE CASCADE,
  "weekId" INTEGER NOT NULL REFERENCES "Week"(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  "createdById" UUID REFERENCES "User"(id) ON DELETE SET NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE("cohortId", "weekId")
);

CREATE INDEX IF NOT EXISTS idx_groupprayer_cohort ON "GroupPrayer"("cohortId");
CREATE INDEX IF NOT EXISTS idx_groupprayer_week ON "GroupPrayer"("weekId");

ALTER TABLE "GroupPrayer" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all operations" ON "GroupPrayer";
CREATE POLICY "Allow all operations" ON "GroupPrayer" FOR ALL USING (true) WITH CHECK (true);
