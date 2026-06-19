-- Faith Projects module: per-participant faith projects with status pipeline
-- Idempotent.

CREATE TABLE IF NOT EXISTS "FaithProject" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "participantId" UUID NOT NULL REFERENCES "Participant"(id) ON DELETE CASCADE,
  title TEXT,
  body TEXT,
  status TEXT NOT NULL DEFAULT 'NOT_DRAFTED',
  "updatedById" UUID REFERENCES "User"(id) ON DELETE SET NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_faithproject_participant ON "FaithProject"("participantId");
CREATE INDEX IF NOT EXISTS idx_faithproject_status ON "FaithProject"(status);

ALTER TABLE "FaithProject" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all operations" ON "FaithProject";
CREATE POLICY "Allow all operations" ON "FaithProject" FOR ALL USING (true) WITH CHECK (true);
