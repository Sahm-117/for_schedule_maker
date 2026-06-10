-- Follow-up template context and issue reporting enhancements
-- Run in Supabase SQL editor (idempotent)

ALTER TABLE "Cohort"
  ADD COLUMN IF NOT EXISTS venue TEXT;

ALTER TABLE "FollowUpIssue"
  ADD COLUMN IF NOT EXISTS "reportedById" UUID REFERENCES "User"(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_followupissue_reported_by ON "FollowUpIssue"("reportedById");
