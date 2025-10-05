-- Debug script to check production database state
-- Run this in your production database (Supabase, Railway, etc.)

-- 1. Check all users
SELECT 'USERS IN DATABASE:' as info;
SELECT id, name, email, role, "createdAt" FROM "User" ORDER BY "createdAt" DESC;

-- 2. Check pending changes with user info
SELECT 'PENDING CHANGES WITH USER INFO:' as info;
SELECT
    pc.id as change_id,
    pc."userId" as user_id,
    pc."changeType",
    pc."createdAt",
    u.name as user_name,
    u.email as user_email,
    u.role as user_role,
    CASE
        WHEN u.id IS NULL THEN 'USER NOT FOUND - THIS CAUSES UNKNOWN USER'
        ELSE 'USER FOUND - SHOULD WORK'
    END as status
FROM "PendingChange" pc
LEFT JOIN "User" u ON pc."userId" = u.id
ORDER BY pc."createdAt" DESC
LIMIT 10;

-- 3. Check for orphaned pending changes
SELECT 'ORPHANED PENDING CHANGES (CAUSING UNKNOWN USER):' as info;
SELECT
    id as change_id,
    "userId" as orphaned_user_id,
    "changeType",
    "createdAt"
FROM "PendingChange"
WHERE "userId" NOT IN (SELECT id FROM "User")
OR "userId" IS NULL;

-- 4. Check activities with user info
SELECT 'ACTIVITIES WITH USER INFO:' as info;
SELECT
    a.id,
    a."userId",
    a.description,
    u.name as user_name,
    CASE
        WHEN u.id IS NULL THEN 'NO USER - POTENTIAL ISSUE'
        ELSE 'HAS USER'
    END as status
FROM "Activity" a
LEFT JOIN "User" u ON a."userId" = u.id
WHERE a."userId" IS NOT NULL
ORDER BY a.id DESC
LIMIT 5;

-- 5. Summary counts
SELECT 'SUMMARY COUNTS:' as info;
SELECT 'Total Users' as item, COUNT(*) as count FROM "User"
UNION ALL
SELECT 'Total Pending Changes', COUNT(*) FROM "PendingChange"
UNION ALL
SELECT 'Pending Changes with Valid Users', COUNT(*) FROM "PendingChange" pc WHERE pc."userId" IN (SELECT id FROM "User")
UNION ALL
SELECT 'Pending Changes with Missing Users (PROBLEMATIC)', COUNT(*) FROM "PendingChange" pc WHERE pc."userId" NOT IN (SELECT id FROM "User") OR pc."userId" IS NULL;