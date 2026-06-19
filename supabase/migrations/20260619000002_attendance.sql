-- Attendance module: weekly attendance per participant
-- Idempotent.

CREATE TABLE IF NOT EXISTS "AttendanceRecord" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "participantId" UUID NOT NULL REFERENCES "Participant"(id) ON DELETE CASCADE,
  "weekId" INTEGER NOT NULL REFERENCES "Week"(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  "markedById" UUID REFERENCES "User"(id) ON DELETE SET NULL,
  "markedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE("participantId", "weekId")
);

CREATE INDEX IF NOT EXISTS idx_attendance_week ON "AttendanceRecord"("weekId");
CREATE INDEX IF NOT EXISTS idx_attendance_participant ON "AttendanceRecord"("participantId");

ALTER TABLE "AttendanceRecord" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all operations" ON "AttendanceRecord";
CREATE POLICY "Allow all operations" ON "AttendanceRecord" FOR ALL USING (true) WITH CHECK (true);
