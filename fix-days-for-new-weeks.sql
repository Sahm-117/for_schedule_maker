-- Fix missing days for all weeks (including newly created weeks 2-8)
-- This ensures all weeks have all 7 days, starting with Sunday

DO $$
DECLARE
    week_record RECORD;
    day_names TEXT[] := ARRAY['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    day_name TEXT;
    day_order INTEGER;
BEGIN
    -- Loop through all weeks
    FOR week_record IN
        SELECT id, "weekNumber"
        FROM "Week"
        ORDER BY "weekNumber"
    LOOP
        -- Loop through all day names
        FOR day_order IN 1..7 LOOP
            day_name := day_names[day_order];

            -- Insert day if it doesn't exist
            INSERT INTO "Day" ("weekId", "dayName", "order")
            VALUES (week_record.id, day_name, day_order)
            ON CONFLICT ("weekId", "dayName") DO NOTHING;

            RAISE NOTICE 'Ensured day % exists for week %', day_name, week_record."weekNumber";
        END LOOP;
    END LOOP;
END $$;

-- Verify all days exist
SELECT
    w."weekNumber",
    COUNT(d.id) as total_days,
    STRING_AGG(d."dayName", ', ' ORDER BY d."order") as days
FROM "Week" w
LEFT JOIN "Day" d ON w.id = d."weekId"
GROUP BY w.id, w."weekNumber"
ORDER BY w."weekNumber";