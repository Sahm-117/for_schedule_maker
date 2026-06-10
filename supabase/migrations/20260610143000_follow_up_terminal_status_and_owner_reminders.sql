-- Follow-up terminal status expansion and owner reminder dedupe
-- Run in Supabase SQL editor (idempotent)

DO $$
BEGIN
  ALTER TYPE "FollowUpRegistrationStatus" ADD VALUE IF NOT EXISTS 'NOT_A_TCN_MEMBER';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "FollowUpOwnerReminderLog" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "reminderDate" DATE NOT NULL,
  kind TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("userId", "reminderDate", kind)
);

CREATE INDEX IF NOT EXISTS idx_followupownerreminderlog_user_date
  ON "FollowUpOwnerReminderLog"("userId", "reminderDate");

ALTER TABLE "FollowUpOwnerReminderLog" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all operations" ON "FollowUpOwnerReminderLog";
CREATE POLICY "Allow all operations" ON "FollowUpOwnerReminderLog" FOR ALL USING (true) WITH CHECK (true);
