-- Follow-ups module: contacts, message templates, issues log
-- Run in Supabase SQL editor (idempotent)

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'FollowUpMessageStatus') THEN
    CREATE TYPE "FollowUpMessageStatus" AS ENUM ('NOT_SENT', 'SENT');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'FollowUpReplyStatus') THEN
    CREATE TYPE "FollowUpReplyStatus" AS ENUM ('NO_REPLY', 'REPLIED', 'NEEDS_REMINDER');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'FollowUpCallStatus') THEN
    CREATE TYPE "FollowUpCallStatus" AS ENUM ('NOT_CALLED', 'CALLED', 'MISSED_CALL', 'CALL_BACK_LATER', 'NOT_APPLICABLE');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'FollowUpRegistrationStatus') THEN
    CREATE TYPE "FollowUpRegistrationStatus" AS ENUM ('NOT_REGISTERED', 'PENDING_CONFIRMATION', 'REGISTERED', 'STILL_THINKING', 'NOT_INTERESTED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'FollowUpNextAction') THEN
    CREATE TYPE "FollowUpNextAction" AS ENUM ('SEND_MESSAGE', 'SEND_REMINDER', 'CALL', 'CLOSE');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'IssueStatus') THEN
    CREATE TYPE "IssueStatus" AS ENUM ('OPEN', 'RESOLVED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "FollowUpContact" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "fullName" TEXT NOT NULL,
  phone TEXT,
  source TEXT,
  "ownerId" UUID REFERENCES "User"(id) ON DELETE SET NULL,
  "messageStatus" "FollowUpMessageStatus" NOT NULL DEFAULT 'NOT_SENT',
  "replyStatus" "FollowUpReplyStatus" NOT NULL DEFAULT 'NO_REPLY',
  "callStatus" "FollowUpCallStatus" NOT NULL DEFAULT 'NOT_CALLED',
  "registrationStatus" "FollowUpRegistrationStatus" NOT NULL DEFAULT 'NOT_REGISTERED',
  "nextAction" "FollowUpNextAction" NOT NULL DEFAULT 'SEND_MESSAGE',
  "lastContactDate" DATE,
  "followUpCount" INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  "cohortId" UUID REFERENCES "Cohort"(id) ON DELETE SET NULL,
  "dueDate" DATE,
  "dueReminderSentAt" TIMESTAMPTZ,
  "archivedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_followupcontact_owner ON "FollowUpContact"("ownerId");
CREATE INDEX IF NOT EXISTS idx_followupcontact_cohort ON "FollowUpContact"("cohortId");
CREATE INDEX IF NOT EXISTS idx_followupcontact_archived ON "FollowUpContact"("archivedAt");
CREATE INDEX IF NOT EXISTS idx_followupcontact_due ON "FollowUpContact"("dueDate");

CREATE TABLE IF NOT EXISTS "MessageTemplate" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "useCase" TEXT NOT NULL,
  body TEXT NOT NULL,
  "whenToUse" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "FollowUpIssue" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "contactId" UUID REFERENCES "FollowUpContact"(id) ON DELETE CASCADE,
  "openedAt" DATE NOT NULL DEFAULT CURRENT_DATE,
  person TEXT,
  issue TEXT NOT NULL,
  "ownerId" UUID REFERENCES "User"(id) ON DELETE SET NULL,
  "neededFrom" TEXT,
  status "IssueStatus" NOT NULL DEFAULT 'OPEN',
  resolution TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_followupissue_contact ON "FollowUpIssue"("contactId");
CREATE INDEX IF NOT EXISTS idx_followupissue_status ON "FollowUpIssue"(status);

ALTER TABLE "FollowUpContact" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all operations" ON "FollowUpContact";
CREATE POLICY "Allow all operations" ON "FollowUpContact" FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE "MessageTemplate" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all operations" ON "MessageTemplate";
CREATE POLICY "Allow all operations" ON "MessageTemplate" FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE "FollowUpIssue" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all operations" ON "FollowUpIssue";
CREATE POLICY "Allow all operations" ON "FollowUpIssue" FOR ALL USING (true) WITH CHECK (true);

INSERT INTO "AppSetting" ("settingKey", value)
VALUES ('registration_link', '""'::jsonb)
ON CONFLICT ("settingKey") DO NOTHING;
