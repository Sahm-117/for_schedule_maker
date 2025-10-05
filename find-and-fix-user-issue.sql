-- Find and fix the specific user ID causing Unknown User issue
-- Run this right after creating a new activity to see the problematic user ID

-- 1. Show the latest pending change (the one you just created)
SELECT 'LATEST PENDING CHANGE:' as info;
SELECT
    pc.id,
    pc."userId" as problematic_user_id,
    pc."changeType",
    pc."createdAt",
    u.name as user_name_lookup,
    CASE
        WHEN u.id IS NULL THEN 'THIS USER ID DOES NOT EXIST IN USER TABLE'
        ELSE 'USER FOUND'
    END as diagnosis
FROM "PendingChange" pc
LEFT JOIN "User" u ON pc."userId" = u.id
ORDER BY pc."createdAt" DESC
LIMIT 1;

-- 2. Show all users in database for comparison
SELECT 'ALL AVAILABLE USERS:' as info;
SELECT id, name, email, role FROM "User";

-- 3. Fix the problematic pending change by updating it to use our system user
UPDATE "PendingChange"
SET "userId" = 'a0000000-0000-4000-8000-000000000002'::UUID
WHERE id IN (
    SELECT id FROM "PendingChange"
    ORDER BY "createdAt" DESC
    LIMIT 1
);

-- 4. Verify the fix worked
SELECT 'AFTER FIX:' as info;
SELECT
    pc.id,
    pc."userId",
    pc."changeType",
    u.name as user_name,
    u.email as user_email
FROM "PendingChange" pc
JOIN "User" u ON pc."userId" = u.id
ORDER BY pc."createdAt" DESC
LIMIT 1;

SELECT 'Fix applied! Refresh your app to see the proper user name.' as status;