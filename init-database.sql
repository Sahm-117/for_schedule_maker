-- Initialize FOF Schedule Editor Database
-- Run this in Supabase SQL Editor to set up the required weeks and days

-- 1. First, ensure all weeks exist (1-8)
INSERT INTO "Week" ("weekNumber")
SELECT generate_series(1, 8)
WHERE NOT EXISTS (
  SELECT 1 FROM "Week" WHERE "weekNumber" IN (1,2,3,4,5,6,7,8)
)
ON CONFLICT ("weekNumber") DO NOTHING;

-- 2. Create all days for all weeks (Sunday-first ordering for FOF weeks)
DO $$
DECLARE
    week_record RECORD;
    day_names TEXT[] := ARRAY['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    day_name TEXT;
BEGIN
    -- Loop through all weeks
    FOR week_record IN
        SELECT id, "weekNumber"
        FROM "Week"
        ORDER BY "weekNumber"
    LOOP
        -- Loop through all day names
        FOREACH day_name IN ARRAY day_names LOOP
            -- Insert day if it doesn't exist
            INSERT INTO "Day" ("weekId", "dayName")
            VALUES (week_record.id, day_name)
            ON CONFLICT ("weekId", "dayName") DO NOTHING;

            RAISE NOTICE 'Ensured day % exists for week %', day_name, week_record."weekNumber";
        END LOOP;
    END LOOP;
END $$;

-- 3. Ensure required tables exist
CREATE TABLE IF NOT EXISTS "PendingChange" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "weekId" TEXT NOT NULL,
    "changeType" TEXT NOT NULL,
    "changeData" JSONB NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "RejectedChange" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "weekId" TEXT NOT NULL,
    "changeType" TEXT NOT NULL,
    "changeData" JSONB NOT NULL,
    "userId" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rejectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 4. Create indexes for better performance
CREATE INDEX IF NOT EXISTS "PendingChange_weekId_idx" ON "PendingChange"("weekId");
CREATE INDEX IF NOT EXISTS "PendingChange_userId_idx" ON "PendingChange"("userId");
CREATE INDEX IF NOT EXISTS "PendingChange_changeType_idx" ON "PendingChange"("changeType");
CREATE INDEX IF NOT EXISTS "RejectedChange_weekId_idx" ON "RejectedChange"("weekId");
CREATE INDEX IF NOT EXISTS "RejectedChange_userId_idx" ON "RejectedChange"("userId");

-- 5. Verification queries
SELECT 'WEEKS CREATED:' as section, COUNT(*) as total FROM "Week";
SELECT 'DAYS CREATED:' as section, COUNT(*) as total FROM "Day";
SELECT 'ACTIVITIES:' as section, COUNT(*) as total FROM "Activity";

-- 6. Show detailed verification
SELECT
    w."weekNumber",
    COUNT(d.id) as total_days,
    STRING_AGG(d."dayName", ', ' ORDER BY
        CASE d."dayName"
            WHEN 'Sunday' THEN 1
            WHEN 'Monday' THEN 2
            WHEN 'Tuesday' THEN 3
            WHEN 'Wednesday' THEN 4
            WHEN 'Thursday' THEN 5
            WHEN 'Friday' THEN 6
            WHEN 'Saturday' THEN 7
        END
    ) as days
FROM "Week" w
LEFT JOIN "Day" d ON w.id = d."weekId"
GROUP BY w.id, w."weekNumber"
ORDER BY w."weekNumber";