-- FOF Schedule Editor - Database Update Script
-- This script adds the missing 7 weeks and fixes day ordering

-- Insert weeks 2-8 (week 1 already exists)
INSERT INTO "Week" ("weekNumber")
SELECT generate_series(2, 8)
WHERE NOT EXISTS (SELECT 1 FROM "Week" WHERE "weekNumber" IN (2,3,4,5,6,7,8));

-- Function to insert days in correct order (Sunday first) for a given week
CREATE OR REPLACE FUNCTION insert_days_for_week(week_num INTEGER) RETURNS VOID AS $$
DECLARE
    week_id INTEGER;
BEGIN
    SELECT id INTO week_id FROM "Week" WHERE "weekNumber" = week_num;

    IF week_id IS NOT NULL THEN
        -- Insert days in FOF order: Sunday > Monday > Tuesday > Wednesday > Thursday > Friday > Saturday
        INSERT INTO "Day" ("weekId", "dayName")
        SELECT week_id, 'Sunday'
        WHERE NOT EXISTS (SELECT 1 FROM "Day" WHERE "weekId" = week_id AND "dayName" = 'Sunday');

        INSERT INTO "Day" ("weekId", "dayName")
        SELECT week_id, 'Monday'
        WHERE NOT EXISTS (SELECT 1 FROM "Day" WHERE "weekId" = week_id AND "dayName" = 'Monday');

        INSERT INTO "Day" ("weekId", "dayName")
        SELECT week_id, 'Tuesday'
        WHERE NOT EXISTS (SELECT 1 FROM "Day" WHERE "weekId" = week_id AND "dayName" = 'Tuesday');

        INSERT INTO "Day" ("weekId", "dayName")
        SELECT week_id, 'Wednesday'
        WHERE NOT EXISTS (SELECT 1 FROM "Day" WHERE "weekId" = week_id AND "dayName" = 'Wednesday');

        INSERT INTO "Day" ("weekId", "dayName")
        SELECT week_id, 'Thursday'
        WHERE NOT EXISTS (SELECT 1 FROM "Day" WHERE "weekId" = week_id AND "dayName" = 'Thursday');

        INSERT INTO "Day" ("weekId", "dayName")
        SELECT week_id, 'Friday'
        WHERE NOT EXISTS (SELECT 1 FROM "Day" WHERE "weekId" = week_id AND "dayName" = 'Friday');

        INSERT INTO "Day" ("weekId", "dayName")
        SELECT week_id, 'Saturday'
        WHERE NOT EXISTS (SELECT 1 FROM "Day" WHERE "weekId" = week_id AND "dayName" = 'Saturday');
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Insert days for all weeks (1-8) in correct order
DO $$
BEGIN
    FOR i IN 1..8 LOOP
        PERFORM insert_days_for_week(i);
    END LOOP;
END $$;

-- Drop the temporary function
DROP FUNCTION insert_days_for_week(INTEGER);

-- Also need to update the frontend to ensure proper day ordering
-- The Supabase API should order days correctly when fetching