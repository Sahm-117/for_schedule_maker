-- Participant journey and department handoff.
--
-- DepartmentReferral: a participant's department choice is logged, then the
-- attached support or an admin confirms they joined. The dates give the
-- logged -> joined timeline, tracked until someone updates it.
--
-- ParticipantStageChange: a manual "Move journey stage" with who and when.
-- Most stages are worked out from records; this covers what records can't show.
--
-- ParticipantNote gains a CHECK_IN type for "Log a check-in".

CREATE TABLE IF NOT EXISTS "DepartmentReferral" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "participantId" UUID NOT NULL REFERENCES "Participant"(id) ON DELETE CASCADE,
  department TEXT NOT NULL CHECK (length(trim(department)) > 0),
  status TEXT NOT NULL DEFAULT 'LOGGED' CHECK (status IN ('LOGGED', 'JOINED', 'NOT_JOINED')),
  "loggedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "loggedById" UUID REFERENCES "User"(id) ON DELETE SET NULL,
  "joinedAt" TIMESTAMPTZ,
  "updatedById" UUID REFERENCES "User"(id) ON DELETE SET NULL,
  note TEXT,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("participantId", department)
);

CREATE INDEX IF NOT EXISTS idx_departmentreferral_participant ON "DepartmentReferral"("participantId");
CREATE INDEX IF NOT EXISTS idx_departmentreferral_open ON "DepartmentReferral"("loggedAt") WHERE status = 'LOGGED';

CREATE TABLE IF NOT EXISTS "ParticipantStageChange" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "participantId" UUID NOT NULL REFERENCES "Participant"(id) ON DELETE CASCADE,
  stage TEXT NOT NULL CHECK (stage IN ('REGISTERED', 'ONBOARDED', 'ACTIVE', 'COMPLETED', 'REFERRED', 'INTEGRATED')),
  note TEXT,
  "changedById" UUID REFERENCES "User"(id) ON DELETE SET NULL,
  "changedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_participantstagechange_participant ON "ParticipantStageChange"("participantId", "changedAt" DESC);

ALTER TABLE "DepartmentReferral" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all operations" ON "DepartmentReferral";
CREATE POLICY "Allow all operations" ON "DepartmentReferral" FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE "ParticipantStageChange" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all operations" ON "ParticipantStageChange";
CREATE POLICY "Allow all operations" ON "ParticipantStageChange" FOR ALL USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON "DepartmentReferral" TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON "ParticipantStageChange" TO anon, authenticated;

ALTER TABLE "ParticipantNote" DROP CONSTRAINT IF EXISTS "ParticipantNote_noteType_check";
ALTER TABLE "ParticipantNote" ADD CONSTRAINT "ParticipantNote_noteType_check"
  CHECK ("noteType" IN ('HANDOVER', 'MEETING', 'FAITH_COACH', 'FAITH_OFFICE', 'CHECK_IN'));

-- Department choices already captured at registration become logged referrals,
-- dated when the participant was registered.
INSERT INTO "DepartmentReferral" ("participantId", department, status, "loggedAt", note)
SELECT p.id, trim(d.department), 'LOGGED', COALESCE(p."registrationDate", p."createdAt"), 'Logged at registration'
FROM "Participant" p
CROSS JOIN LATERAL unnest(p.departments) AS d(department)
WHERE length(trim(d.department)) > 0
ON CONFLICT ("participantId", department) DO NOTHING;
