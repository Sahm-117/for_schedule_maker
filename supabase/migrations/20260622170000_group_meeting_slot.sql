-- Add lockable weekly meeting slot fields to Group (idempotent)
ALTER TABLE "Group"
  ADD COLUMN IF NOT EXISTS "meetingDay" TEXT,           -- 'WEDNESDAY' | 'FRIDAY' | 'SATURDAY'
  ADD COLUMN IF NOT EXISTS "meetingTime" TEXT,          -- 'HH:MM' 24h e.g. '17:30'
  ADD COLUMN IF NOT EXISTS "meetingDurationMins" INTEGER; -- 45 or 60
