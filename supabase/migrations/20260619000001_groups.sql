-- Groups module: per-cohort groups each assigned to a Support member
-- Idempotent.

CREATE TABLE IF NOT EXISTS "Group" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "cohortId" UUID NOT NULL REFERENCES "Cohort"(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  "supportId" UUID REFERENCES "User"(id) ON DELETE SET NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE("cohortId", name)
);

CREATE TABLE IF NOT EXISTS "GroupParticipant" (
  "groupId" UUID NOT NULL REFERENCES "Group"(id) ON DELETE CASCADE,
  "participantId" UUID NOT NULL REFERENCES "Participant"(id) ON DELETE CASCADE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("groupId", "participantId")
);

CREATE INDEX IF NOT EXISTS idx_group_cohort ON "Group"("cohortId");
CREATE INDEX IF NOT EXISTS idx_group_support ON "Group"("supportId");
CREATE INDEX IF NOT EXISTS idx_groupparticipant_group ON "GroupParticipant"("groupId");
CREATE INDEX IF NOT EXISTS idx_groupparticipant_participant ON "GroupParticipant"("participantId");

ALTER TABLE "Group" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all operations" ON "Group";
CREATE POLICY "Allow all operations" ON "Group" FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE "GroupParticipant" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all operations" ON "GroupParticipant";
CREATE POLICY "Allow all operations" ON "GroupParticipant" FOR ALL USING (true) WITH CHECK (true);
