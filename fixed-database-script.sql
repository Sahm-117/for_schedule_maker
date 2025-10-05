-- Fixed database script for FOF Schedule Editor
-- This script fixes all database issues without the problematic "order" column

-- 1. First, ensure all weeks exist (1-8)
INSERT INTO "Week" ("weekNumber")
SELECT generate_series(1, 8)
WHERE NOT EXISTS (
  SELECT 1 FROM "Week" WHERE "weekNumber" IN (1,2,3,4,5,6,7,8)
)
ON CONFLICT ("weekNumber") DO NOTHING;

-- 2. Create all days for all weeks (without order column)
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

-- 3. Ensure PendingChange table exists with correct structure
CREATE TABLE IF NOT EXISTS "PendingChange" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "weekId" TEXT NOT NULL,
    "changeType" TEXT NOT NULL,
    "changeData" JSONB NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 4. Create indexes for better performance
CREATE INDEX IF NOT EXISTS "PendingChange_weekId_idx" ON "PendingChange"("weekId");
CREATE INDEX IF NOT EXISTS "PendingChange_userId_idx" ON "PendingChange"("userId");
CREATE INDEX IF NOT EXISTS "PendingChange_changeType_idx" ON "PendingChange"("changeType");

-- 5. Ensure RejectedChange table exists
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

-- 6. Create indexes for RejectedChange
CREATE INDEX IF NOT EXISTS "RejectedChange_weekId_idx" ON "RejectedChange"("weekId");
CREATE INDEX IF NOT EXISTS "RejectedChange_userId_idx" ON "RejectedChange"("userId");

-- 7. Add foreign key constraints if they don't exist
DO $$
BEGIN
    -- Add foreign key for PendingChange -> Week
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'PendingChange_weekId_fkey'
    ) THEN
        ALTER TABLE "PendingChange" ADD CONSTRAINT "PendingChange_weekId_fkey"
        FOREIGN KEY ("weekId") REFERENCES "Week"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    -- Add foreign key for RejectedChange -> Week
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'RejectedChange_weekId_fkey'
    ) THEN
        ALTER TABLE "RejectedChange" ADD CONSTRAINT "RejectedChange_weekId_fkey"
        FOREIGN KEY ("weekId") REFERENCES "Week"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Foreign key constraints may already exist or there was an error: %', SQLERRM;
END $$;

-- 8. Verification queries
SELECT 'WEEKS:' as section, COUNT(*) as total FROM "Week";
SELECT 'DAYS:' as section, COUNT(*) as total FROM "Day";
SELECT 'ACTIVITIES:' as section, COUNT(*) as total FROM "Activity";
SELECT 'PENDING_CHANGES:' as section, COUNT(*) as total FROM "PendingChange";

-- Detailed verification showing days for each week
SELECT
    w."weekNumber",
    COUNT(d.id) as total_days,
    STRING_AGG(d."dayName", ', ') as days
FROM "Week" w
LEFT JOIN "Day" d ON w.id = d."weekId"
GROUP BY w.id, w."weekNumber"
ORDER BY w."weekNumber";