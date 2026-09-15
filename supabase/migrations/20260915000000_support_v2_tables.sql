-- Support V2 redesign: data for the new support screens.
-- Additive and idempotent. Existing columns, constraints and live writes are untouched,
-- so the currently deployed app keeps working before the new frontend ships.

-- Group call: platform + recurring link per group.
ALTER TABLE "Group"
  ADD COLUMN IF NOT EXISTS "callPlatform" TEXT,
  ADD COLUMN IF NOT EXISTS "callLink" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Group_callPlatform_check') THEN
    ALTER TABLE "Group" ADD CONSTRAINT "Group_callPlatform_check"
      CHECK ("callPlatform" IS NULL OR "callPlatform" IN ('WHATSAPP', 'GOOGLE_MEET'));
  END IF;
END $$;

-- Weekly recap text used by Meeting Mode.
ALTER TABLE "Week"
  ADD COLUMN IF NOT EXISTS "recapSummary" TEXT,
  ADD COLUMN IF NOT EXISTS "discussionPrompt" TEXT;

-- Lead details captured by supports on Mobilisation › Register a lead.
ALTER TABLE "FollowUpContact"
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS gender TEXT,
  ADD COLUMN IF NOT EXISTS "ageRange" TEXT,
  ADD COLUMN IF NOT EXISTS occupation TEXT,
  ADD COLUMN IF NOT EXISTS "registeredById" UUID REFERENCES "User"(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_followupcontact_registeredby ON "FollowUpContact"("registeredById");

-- Faith project trail notes: participant-facing coaching trail and support ↔ back office trail.
ALTER TABLE "ParticipantNote" DROP CONSTRAINT IF EXISTS "ParticipantNote_noteType_check";
ALTER TABLE "ParticipantNote" ADD CONSTRAINT "ParticipantNote_noteType_check"
  CHECK ("noteType" IN ('HANDOVER', 'MEETING', 'FAITH_COACH', 'FAITH_OFFICE'));

-- Who joined the weekly group meeting (separate from Sunday class AttendanceRecord).
CREATE TABLE IF NOT EXISTS "MeetingAttendance" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "participantId" UUID NOT NULL REFERENCES "Participant"(id) ON DELETE CASCADE,
  "groupId" UUID REFERENCES "Group"(id) ON DELETE SET NULL,
  "weekId" INTEGER NOT NULL REFERENCES "Week"(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('JOINED', 'EXCUSED', 'MISSED')),
  "markedById" UUID REFERENCES "User"(id) ON DELETE SET NULL,
  "markedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("participantId", "weekId")
);

CREATE INDEX IF NOT EXISTS idx_meetingattendance_week ON "MeetingAttendance"("weekId");
CREATE INDEX IF NOT EXISTS idx_meetingattendance_group_week ON "MeetingAttendance"("groupId", "weekId");

-- "Needs attention" flags raised by supports on participants.
CREATE TABLE IF NOT EXISTS "ParticipantFlag" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "participantId" UUID NOT NULL REFERENCES "Participant"(id) ON DELETE CASCADE,
  "groupId" UUID REFERENCES "Group"(id) ON DELETE SET NULL,
  "weekId" INTEGER REFERENCES "Week"(id) ON DELETE SET NULL,
  reason TEXT NOT NULL CHECK (length(trim(reason)) > 0),
  note TEXT,
  "raisedById" UUID REFERENCES "User"(id) ON DELETE SET NULL,
  "raisedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "clearedById" UUID REFERENCES "User"(id) ON DELETE SET NULL,
  "clearedAt" TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_participantflag_participant ON "ParticipantFlag"("participantId", "raisedAt" DESC);
CREATE INDEX IF NOT EXISTS idx_participantflag_open ON "ParticipantFlag"("raisedAt" DESC) WHERE "clearedAt" IS NULL;

-- Each support's own weekly checklist.
CREATE TABLE IF NOT EXISTS "SupportChecklistItem" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "weekId" INTEGER NOT NULL REFERENCES "Week"(id) ON DELETE CASCADE,
  label TEXT NOT NULL CHECK (length(trim(label)) > 0),
  done BOOLEAN NOT NULL DEFAULT FALSE,
  position INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("userId", "weekId", label)
);

CREATE INDEX IF NOT EXISTS idx_supportchecklist_user_week ON "SupportChecklistItem"("userId", "weekId");

-- Cover requests sent by supports to operations.
CREATE TABLE IF NOT EXISTS "CoverRequest" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "supportId" UUID NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "cohortId" UUID REFERENCES "Cohort"(id) ON DELETE SET NULL,
  reason TEXT NOT NULL CHECK (length(trim(reason)) > 0),
  "startsAt" TIMESTAMPTZ NOT NULL,
  "endsAt" TIMESTAMPTZ NOT NULL,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'DECLINED')),
  "reviewedById" UUID REFERENCES "User"(id) ON DELETE SET NULL,
  "reviewedAt" TIMESTAMPTZ,
  "reviewNote" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ("endsAt" > "startsAt")
);

CREATE INDEX IF NOT EXISTS idx_coverrequest_support ON "CoverRequest"("supportId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_coverrequest_status ON "CoverRequest"(status, "createdAt" DESC);

-- This app uses custom authentication rather than Supabase Auth. Keep RLS
-- consistent with the rest of the operational schema.
ALTER TABLE "MeetingAttendance" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all operations" ON "MeetingAttendance";
CREATE POLICY "Allow all operations" ON "MeetingAttendance" FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE "ParticipantFlag" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all operations" ON "ParticipantFlag";
CREATE POLICY "Allow all operations" ON "ParticipantFlag" FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE "SupportChecklistItem" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all operations" ON "SupportChecklistItem";
CREATE POLICY "Allow all operations" ON "SupportChecklistItem" FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE "CoverRequest" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all operations" ON "CoverRequest";
CREATE POLICY "Allow all operations" ON "CoverRequest" FOR ALL USING (true) WITH CHECK (true);
