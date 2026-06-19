-- Onboarding progress + event history
-- Idempotent.

CREATE TABLE IF NOT EXISTS "GroupOnboardingStatus" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "groupId" UUID NOT NULL REFERENCES "Group"(id) ON DELETE CASCADE,
  "groupCreated" BOOLEAN NOT NULL DEFAULT FALSE,
  "updatedById" UUID REFERENCES "User"(id) ON DELETE SET NULL,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "completedAt" TIMESTAMPTZ,
  UNIQUE("groupId")
);

CREATE TABLE IF NOT EXISTS "ParticipantOnboardingStatus" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "participantId" UUID NOT NULL REFERENCES "Participant"(id) ON DELETE CASCADE,
  contacted BOOLEAN NOT NULL DEFAULT FALSE,
  "addedToGroup" BOOLEAN NOT NULL DEFAULT FALSE,
  "introductionDone" BOOLEAN NOT NULL DEFAULT FALSE,
  "venueAcknowledged" BOOLEAN NOT NULL DEFAULT FALSE,
  "updatedById" UUID REFERENCES "User"(id) ON DELETE SET NULL,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE("participantId")
);

CREATE TABLE IF NOT EXISTS "OnboardingEvent" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  "groupId" UUID NOT NULL REFERENCES "Group"(id) ON DELETE CASCADE,
  "participantId" UUID REFERENCES "Participant"(id) ON DELETE SET NULL,
  "actorId" UUID REFERENCES "User"(id) ON DELETE SET NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_grouponboardingstatus_group ON "GroupOnboardingStatus"("groupId");
CREATE INDEX IF NOT EXISTS idx_participantonboardingstatus_participant ON "ParticipantOnboardingStatus"("participantId");
CREATE INDEX IF NOT EXISTS idx_onboardingevent_group ON "OnboardingEvent"("groupId");
CREATE INDEX IF NOT EXISTS idx_onboardingevent_actor ON "OnboardingEvent"("actorId");
CREATE INDEX IF NOT EXISTS idx_onboardingevent_createdat ON "OnboardingEvent"("createdAt");

ALTER TABLE "GroupOnboardingStatus" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all operations" ON "GroupOnboardingStatus";
CREATE POLICY "Allow all operations" ON "GroupOnboardingStatus" FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE "OnboardingEvent" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all operations" ON "OnboardingEvent";
CREATE POLICY "Allow all operations" ON "OnboardingEvent" FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE "ParticipantOnboardingStatus" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all operations" ON "ParticipantOnboardingStatus";
CREATE POLICY "Allow all operations" ON "ParticipantOnboardingStatus" FOR ALL USING (true) WITH CHECK (true);
