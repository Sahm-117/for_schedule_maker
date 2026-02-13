-- Labels system: global labels + many-to-many mapping to activities.
-- Apply this in Supabase SQL Editor, or via Supabase migrations tooling.

-- Labels table
CREATE TABLE IF NOT EXISTS "Label" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW()
);

-- Case-insensitive uniqueness on name
CREATE UNIQUE INDEX IF NOT EXISTS idx_label_name_lower_unique ON "Label"(lower(name));

-- Join table
CREATE TABLE IF NOT EXISTS "ActivityLabel" (
  "activityId" INTEGER NOT NULL REFERENCES "Activity"(id) ON DELETE CASCADE,
  "labelId" UUID NOT NULL REFERENCES "Label"(id) ON DELETE CASCADE,
  PRIMARY KEY ("activityId", "labelId")
);

CREATE INDEX IF NOT EXISTS idx_activitylabel_activity ON "ActivityLabel"("activityId");
CREATE INDEX IF NOT EXISTS idx_activitylabel_label ON "ActivityLabel"("labelId");

-- RLS
ALTER TABLE "Label" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ActivityLabel" ENABLE ROW LEVEL SECURITY;

-- Permissive policies (matches current app auth model)
CREATE POLICY "Allow all operations" ON "Label" FOR ALL USING (true);
CREATE POLICY "Allow all operations" ON "ActivityLabel" FOR ALL USING (true);

