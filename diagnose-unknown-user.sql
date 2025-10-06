-- ========================================
-- STEP 1: DIAGNOSE THE UNKNOWN USER ISSUE
-- ========================================
-- Run this in Supabase SQL Editor to find the exact problem

-- 1. Are there any orphaned pending changes left?
SELECT 'STEP 1: Checking for orphaned pending changes...' AS step;
SELECT COUNT(*) AS orphaned_count
FROM "PendingChange" pc
LEFT JOIN "User" u ON u.id = pc."userId"
WHERE u.id IS NULL;

-- 2. Does the System Admin actually exist?
SELECT 'STEP 2: Checking if System Admin exists...' AS step;
SELECT id, name, email
FROM "User"
WHERE id = 'a0000000-0000-4000-8000-000000000002'::uuid;

-- 3. What are we sending to the UI right now?
SELECT 'STEP 3: Current pending changes with user info...' AS step;
SELECT
    pc.id,
    pc."userId",
    u.name,
    u.email,
    pc."createdAt",
    CASE
        WHEN u.id IS NULL THEN '❌ ORPHANED - NO USER FOUND'
        ELSE '✅ HAS VALID USER'
    END AS status
FROM "PendingChange" pc
LEFT JOIN "User" u ON u.id = pc."userId"
ORDER BY pc."createdAt" DESC
LIMIT 50;

-- 4. Show all users in the database
SELECT 'STEP 4: All users in database...' AS step;
SELECT id, name, email, role
FROM "User"
ORDER BY "createdAt";

-- 5. Check for any invalid UUID formats
SELECT 'STEP 5: Checking for invalid user IDs...' AS step;
SELECT
    pc.id,
    pc."userId",
    CASE
        WHEN pc."userId"::text = 'demo_user_id' THEN '❌ INVALID: demo_user_id'
        WHEN pc."userId" IS NULL THEN '❌ INVALID: NULL'
        ELSE '✅ Valid UUID format'
    END AS validation
FROM "PendingChange" pc
WHERE pc."userId" NOT IN (SELECT id FROM "User")
   OR pc."userId" IS NULL
   OR pc."userId"::text = 'demo_user_id';

SELECT '========================================' AS divider;
SELECT 'DIAGNOSIS COMPLETE!' AS status;
SELECT '========================================' AS divider;