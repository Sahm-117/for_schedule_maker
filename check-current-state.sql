-- Check what's actually in the database RIGHT NOW
-- Run this to see if the migration worked

-- 1. Check the specific pending change showing "Unknown User"
SELECT
    pc.id,
    pc."userId",
    pc."changeType",
    pc."changeData"->>'description' as description,
    u.id as user_id_from_join,
    u.name as user_name_from_join,
    u.email as user_email_from_join,
    CASE
        WHEN u.id IS NULL THEN '❌ USER NOT FOUND IN DATABASE'
        WHEN pc."userId" = 'a0000000-0000-4000-8000-000000000002'::uuid THEN '✅ SYSTEM ADMIN'
        ELSE '✅ REAL USER'
    END as status
FROM "PendingChange" pc
LEFT JOIN "User" u ON pc."userId" = u.id
ORDER BY pc."createdAt" DESC
LIMIT 10;

-- 2. Check if System Admin exists
SELECT
    '=== SYSTEM ADMIN CHECK ===' as step,
    id,
    name,
    email,
    role
FROM "User"
WHERE id = 'a0000000-0000-4000-8000-000000000002'::uuid;

-- 3. Check all users
SELECT
    '=== ALL USERS ===' as step,
    id,
    name,
    email,
    role
FROM "User"
ORDER BY "createdAt";

-- 4. Check if FK constraint exists
SELECT
    '=== FK CONSTRAINT CHECK ===' as step,
    constraint_name,
    table_name,
    constraint_type
FROM information_schema.table_constraints
WHERE table_name = 'PendingChange'
  AND constraint_type = 'FOREIGN KEY';