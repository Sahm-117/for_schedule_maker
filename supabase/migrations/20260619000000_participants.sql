-- Participants module: people who have joined the programme
-- Idempotent. Run in Supabase SQL editor.

CREATE TABLE IF NOT EXISTS "Participant" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "fullName" TEXT NOT NULL,
  phone TEXT,
  "cohortId" UUID REFERENCES "Cohort"(id) ON DELETE SET NULL,
  source TEXT NOT NULL DEFAULT 'MANUAL',
  "followUpContactId" UUID REFERENCES "FollowUpContact"(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  notes TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_participant_cohort ON "Participant"("cohortId");
CREATE INDEX IF NOT EXISTS idx_participant_followupcontact ON "Participant"("followUpContactId");
CREATE INDEX IF NOT EXISTS idx_participant_status ON "Participant"(status);

ALTER TABLE "Participant" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all operations" ON "Participant";
CREATE POLICY "Allow all operations" ON "Participant" FOR ALL USING (true) WITH CHECK (true);
