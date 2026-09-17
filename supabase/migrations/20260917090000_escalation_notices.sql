-- Escalation alerts sent by the daily-checks job. One row per alert key
-- (e.g. "sunday-miss:<participant>:<week>"), so each alert goes out once
-- when a status changes rather than every morning. Only the job writes here
-- (service role); the app never reads it.

CREATE TABLE IF NOT EXISTS "EscalationNotice" (
  key TEXT PRIMARY KEY,
  "cohortId" UUID REFERENCES "Cohort"(id) ON DELETE CASCADE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_escalationnotice_cohort ON "EscalationNotice"("cohortId");

ALTER TABLE "EscalationNotice" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "EscalationNotice" FROM anon, authenticated;
