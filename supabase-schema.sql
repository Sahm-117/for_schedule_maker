-- FOF Schedule Editor Database Schema for Supabase
-- Copy and paste this into Supabase SQL Editor

-- Create custom types (enums)
CREATE TYPE "Role" AS ENUM ('ADMIN', 'SOP_PREPARER', 'SUPPORT');
CREATE TYPE "Period" AS ENUM ('MORNING', 'AFTERNOON', 'EVENING');
CREATE TYPE "ChangeType" AS ENUM ('ADD', 'EDIT', 'DELETE');
CREATE TYPE "AnnouncementScope" AS ENUM ('ACTIVE_COHORT', 'ALL_USERS');

-- Users table
CREATE TABLE "User" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role "Role" DEFAULT 'SUPPORT',
    "createdAt" TIMESTAMP DEFAULT NOW(),
    "updatedAt" TIMESTAMP DEFAULT NOW()
);

CREATE TABLE "Cohort" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    "startDate" DATE,
    "endDate" DATE,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP DEFAULT NOW(),
    "updatedAt" TIMESTAMP DEFAULT NOW()
);

-- Weeks table
CREATE TABLE "Week" (
    id SERIAL PRIMARY KEY,
    "cohortId" UUID NOT NULL REFERENCES "Cohort"(id) ON DELETE CASCADE,
    "weekNumber" INTEGER NOT NULL,
    UNIQUE("cohortId", "weekNumber")
);

-- Days table
CREATE TABLE "Day" (
    id SERIAL PRIMARY KEY,
    "weekId" INTEGER NOT NULL REFERENCES "Week"(id) ON DELETE CASCADE,
    "dayName" TEXT NOT NULL,
    UNIQUE("weekId", "dayName")
);

-- Activities table
CREATE TABLE "Activity" (
    id SERIAL PRIMARY KEY,
    "dayId" INTEGER NOT NULL REFERENCES "Day"(id) ON DELETE CASCADE,
    time TEXT NOT NULL,
    description TEXT NOT NULL,
    period "Period" NOT NULL,
    "orderIndex" INTEGER NOT NULL
);

CREATE TABLE "SupportActivityCompletion" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "activityId" INTEGER NOT NULL REFERENCES "Activity"(id) ON DELETE CASCADE,
    "userId" UUID NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
    "completedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE("activityId", "userId")
);

CREATE TABLE "UserCohort" (
    "userId" UUID NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
    "cohortId" UUID NOT NULL REFERENCES "Cohort"(id) ON DELETE CASCADE,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY ("userId", "cohortId")
);

-- Labels table (admin-managed)
CREATE TABLE "Label" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    "createdAt" TIMESTAMP DEFAULT NOW(),
    "updatedAt" TIMESTAMP DEFAULT NOW()
);

-- Case-insensitive uniqueness on label name
CREATE UNIQUE INDEX idx_label_name_lower_unique ON "Label"(lower(name));

-- Activity <-> Label join table
CREATE TABLE "ActivityLabel" (
    "activityId" INTEGER NOT NULL REFERENCES "Activity"(id) ON DELETE CASCADE,
    "labelId" UUID NOT NULL REFERENCES "Label"(id) ON DELETE CASCADE,
    PRIMARY KEY ("activityId", "labelId")
);

CREATE INDEX idx_activitylabel_activity ON "ActivityLabel"("activityId");
CREATE INDEX idx_activitylabel_label ON "ActivityLabel"("labelId");

-- Pending changes table
CREATE TABLE "PendingChange" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "weekId" INTEGER NOT NULL,
    "changeType" "ChangeType" NOT NULL,
    "changeData" JSONB NOT NULL,
    "userId" UUID NOT NULL REFERENCES "User"(id),
    "createdAt" TIMESTAMP DEFAULT NOW()
);

-- Rejected changes table
CREATE TABLE "RejectedChange" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "weekId" INTEGER NOT NULL,
    "changeType" "ChangeType" NOT NULL,
    "changeData" JSONB NOT NULL,
    "userId" UUID NOT NULL REFERENCES "User"(id),
    "submittedAt" TIMESTAMP NOT NULL,
    "rejectedBy" TEXT NOT NULL,
    "rejectedAt" TIMESTAMP DEFAULT NOW(),
    "rejectionReason" TEXT NOT NULL,
    "isRead" BOOLEAN DEFAULT FALSE
);

-- App settings table
CREATE TABLE "AppSetting" (
    "settingKey" TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "Announcement" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  "sentAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "sentBy" UUID REFERENCES "User"(id) ON DELETE SET NULL,
  scope "AnnouncementScope" NOT NULL DEFAULT 'ACTIVE_COHORT',
  "cohortId" UUID REFERENCES "Cohort"(id) ON DELETE SET NULL
);

-- Create indexes for better performance
CREATE INDEX idx_activity_day_order ON "Activity"("dayId", "orderIndex");
CREATE INDEX idx_supportactivitycompletion_user ON "SupportActivityCompletion"("userId");
CREATE INDEX idx_supportactivitycompletion_activity ON "SupportActivityCompletion"("activityId");
CREATE INDEX idx_week_cohort ON "Week"("cohortId");
CREATE INDEX idx_usercohort_cohort ON "UserCohort"("cohortId");
CREATE INDEX idx_announcement_cohort ON "Announcement"("cohortId");

-- Insert default admin user (password: admin123)
INSERT INTO "User" (email, name, password_hash, role) VALUES
('admin@fof.com', 'Admin User', '$2b$10$8K1p/a9DLyfoaYJ8c7F1sO5.JxUn9UyO8LqFWF/iQ5.rHYnGb6DSa', 'ADMIN');

-- Insert default cohort and sample week
INSERT INTO "Cohort" (name, description, status)
VALUES ('Current Cohort', 'Default seeded cohort', 'ACTIVE');

INSERT INTO "Week" ("cohortId", "weekNumber")
SELECT id, 1 FROM "Cohort" WHERE name = 'Current Cohort' LIMIT 1;

-- Insert days for week 1
INSERT INTO "Day" ("weekId", "dayName") VALUES
(1, 'Monday'),
(1, 'Tuesday'),
(1, 'Wednesday'),
(1, 'Thursday'),
(1, 'Friday'),
(1, 'Saturday'),
(1, 'Sunday');

-- Enable Row Level Security (RLS) for security
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Week" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Day" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Activity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SupportActivityCompletion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Cohort" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UserCohort" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Label" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ActivityLabel" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PendingChange" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RejectedChange" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AppSetting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Announcement" ENABLE ROW LEVEL SECURITY;

-- Create policies (allow all for now - you can tighten security later)
CREATE POLICY "Allow all operations" ON "User" FOR ALL USING (true);
CREATE POLICY "Allow all operations" ON "Week" FOR ALL USING (true);
CREATE POLICY "Allow all operations" ON "Day" FOR ALL USING (true);
CREATE POLICY "Allow all operations" ON "Activity" FOR ALL USING (true);
CREATE POLICY "Allow all operations" ON "SupportActivityCompletion" FOR ALL USING (true);
CREATE POLICY "Allow all operations" ON "Cohort" FOR ALL USING (true);
CREATE POLICY "Allow all operations" ON "UserCohort" FOR ALL USING (true);
CREATE POLICY "Allow all operations" ON "Label" FOR ALL USING (true);
CREATE POLICY "Allow all operations" ON "ActivityLabel" FOR ALL USING (true);
CREATE POLICY "Allow all operations" ON "PendingChange" FOR ALL USING (true);
CREATE POLICY "Allow all operations" ON "RejectedChange" FOR ALL USING (true);
CREATE POLICY "Allow all operations" ON "AppSetting" FOR ALL USING (true);
CREATE POLICY "Allow all operations" ON "Announcement" FOR ALL USING (true);

-- Default app settings
INSERT INTO "AppSetting" ("settingKey", value)
VALUES ('daily_digest_enabled', 'true'::jsonb)
ON CONFLICT ("settingKey") DO NOTHING;

-- ============================================================
-- Follow-ups module (see supabase/migrations/20260610120000_follow_ups.sql)
-- ============================================================
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
