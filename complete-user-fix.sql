-- Complete fix for Unknown User issue
-- This will identify the problem user ID and create the missing user

-- 1. Show the problematic pending change
SELECT 'PROBLEMATIC PENDING CHANGE:' as info;
SELECT
    pc.id,
    pc."userId" as missing_user_id,
    pc."changeType",
    pc."createdAt"
FROM "PendingChange" pc
ORDER BY pc."createdAt" DESC
LIMIT 1;

-- 2. Show current users in database
SELECT 'CURRENT USERS IN DATABASE:' as info;
SELECT id, name, email, role FROM "User";

-- 3. Get the problematic user ID from the latest pending change
DO $$
DECLARE
    problematic_user_id UUID;
BEGIN
    -- Get the user ID from the latest pending change
    SELECT "userId" INTO problematic_user_id
    FROM "PendingChange"
    ORDER BY "createdAt" DESC
    LIMIT 1;

    -- Create a user with this ID if it doesn't exist
    IF problematic_user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "User" WHERE id = problematic_user_id) THEN
        INSERT INTO "User" (id, email, name, password_hash, role, "createdAt", "updatedAt")
        VALUES (
            problematic_user_id,
            'user@recovered.com',
            'Recovered User',
            '$2b$10$example.hash.for.recovered.user',
            'SUPPORT',
            NOW(),
            NOW()
        );

        RAISE NOTICE 'Created missing user with ID: %', problematic_user_id;
    END IF;
END $$;

-- 4. Verify the fix
SELECT 'AFTER CREATING MISSING USER:' as info;
SELECT id, name, email, role FROM "User";

-- 5. Check if pending change now has valid user
SELECT 'PENDING CHANGE STATUS AFTER FIX:' as info;
SELECT
    pc.id,
    pc."userId",
    pc."changeType",
    u.name as user_name,
    u.email as user_email,
    'USER NOW EXISTS' as status
FROM "PendingChange" pc
JOIN "User" u ON pc."userId" = u.id
ORDER BY pc."createdAt" DESC
LIMIT 1;

SELECT 'Unknown User issue should now be fixed! Refresh your app.' as final_status;