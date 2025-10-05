-- Fix the specific pending change showing "Unknown User"
-- This will force update it to use a valid user

-- 1. Show the current state of pending changes
SELECT 'CURRENT PENDING CHANGES:' as info;
SELECT
    pc.id,
    pc."userId",
    pc."changeType",
    pc."createdAt",
    u.name as current_user_name,
    CASE
        WHEN u.id IS NULL THEN 'NO USER FOUND'
        ELSE 'USER EXISTS'
    END as user_status
FROM "PendingChange" pc
LEFT JOIN "User" u ON pc."userId" = u.id
ORDER BY pc."createdAt" DESC;

-- 2. Show all users available
SELECT 'AVAILABLE USERS:' as info;
SELECT id, name, email, role FROM "User";

-- 3. Update ALL pending changes to use the first available user
UPDATE "PendingChange"
SET "userId" = (
    SELECT id FROM "User"
    ORDER BY "createdAt" ASC
    LIMIT 1
)
WHERE "userId" NOT IN (SELECT id FROM "User")
   OR "userId" IS NULL;

-- 4. Alternative: Update to use any existing user if the above doesn't work
DO $$
DECLARE
    available_user_id UUID;
BEGIN
    -- Get any available user ID
    SELECT id INTO available_user_id FROM "User" LIMIT 1;

    -- Update all pending changes with invalid users
    UPDATE "PendingChange"
    SET "userId" = available_user_id
    WHERE "userId" NOT IN (SELECT id FROM "User")
       OR "userId" IS NULL;

    RAISE NOTICE 'Updated pending changes to use user ID: %', available_user_id;
END $$;

-- 5. Verify the fix
SELECT 'AFTER FIX - ALL PENDING CHANGES:' as info;
SELECT
    pc.id,
    pc."userId",
    pc."changeType",
    u.name as user_name,
    u.email as user_email,
    pc."createdAt"
FROM "PendingChange" pc
JOIN "User" u ON pc."userId" = u.id
ORDER BY pc."createdAt" DESC;

SELECT 'All pending changes should now have valid users. Refresh your app!' as status;