CREATE TABLE IF NOT EXISTS "Resource" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL CHECK (type IN ('link', 'pdf', 'doc', 'image', 'file')),
  url TEXT NOT NULL,
  "fileName" TEXT,
  "fileSize" BIGINT,
  "addedBy" UUID REFERENCES "User"(id) ON DELETE SET NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE "Resource" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read resources" ON "Resource" FOR SELECT USING (true);
CREATE POLICY "Anyone can insert resources" ON "Resource" FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can delete resources" ON "Resource" FOR DELETE USING (true);

-- Storage bucket creation (run separately in Storage dashboard if needed)
-- Bucket name: resources, Public: true
