-- Comprehensive fix for Unknown User issues
-- Run this in Supabase SQL Editor

-- Step 1: Check current state
SELECT '=== CURRENT PENDING CHANGES WITH USER INFO ===' as step;
SELECT
    pc.id,
    pc."userId",
    pc."changeType",
    pc."changeData"->>'description' as description,
    u.name as user_name,
    u.email as user_email,
    CASE
        WHEN u.id IS NULL THEN '❌ ORPHANED - NO USER'
        ELSE '✅ HAS VALID USER'
    END as status
FROM "PendingChange" pc
LEFT JOIN "User" u ON pc."userId" = u.id
ORDER BY pc."createdAt" DESC;

-- Step 2: Show all available users
SELECT '=== AVAILABLE USERS ===' as step;
SELECT id, name, email, role FROM "User" ORDER BY "createdAt";

-- Step 3: Ensure System Admin user exists
INSERT INTO "User" (id, name, email, password_hash, role)
VALUES (
    'a0000000-0000-4000-8000-000000000002'::UUID,
    'System Admin',
    'system@fof.com',
    'hashed_system',
    'ADMIN'
)
ON CONFLICT (id) DO UPDATE
SET name = 'System Admin',
    role = 'ADMIN';

-- Step 4: Fix ALL orphaned pending changes
UPDATE "PendingChange"
SET "userId" = 'a0000000-0000-4000-8000-000000000002'::UUID
WHERE "userId" NOT IN (SELECT id FROM "User")
   OR "userId" IS NULL
   OR "userId"::text = 'demo_user_id';

-- Step 5: Verify the fix
SELECT '=== AFTER FIX - ALL PENDING CHANGES SHOULD HAVE USERS ===' as step;
SELECT
    pc.id,
    pc."changeType",
    pc."changeData"->>'description' as description,
    u.name as user_name,
    u.email as user_email,
    pc."createdAt"
FROM "PendingChange" pc
LEFT JOIN "User" u ON pc."userId" = u.id
ORDER BY pc."createdAt" DESC;

-- Step 6: Count results
SELECT
    COUNT(*) as total_pending_changes,
    COUNT(u.id) as with_valid_user,
    COUNT(*) - COUNT(u.id) as orphaned
FROM "PendingChange" pc
LEFT JOIN "User" u ON pc."userId" = u.id;

SELECT '✅ Fix complete! All pending changes should now have valid users.' as result;