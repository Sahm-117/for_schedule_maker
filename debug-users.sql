-- Debug script to check current user and pending change state
-- Run this to understand the current data situation

-- 1. Check all users in the system
SELECT 'CURRENT USERS:' as status;
SELECT id, name, email, role, "createdAt" FROM "User";

-- 2. Check pending changes and their user relationships
SELECT 'PENDING CHANGES WITH USER INFO:' as status;
SELECT
    pc.id,
    pc."userId",
    pc."changeType",
    pc."changeData",
    pc."createdAt",
    u.name as user_name,
    u.email as user_email
FROM "PendingChange" pc
LEFT JOIN "User" u ON pc."userId" = u.id;

-- 3. Check for orphaned pending changes (without valid user)
SELECT 'ORPHANED PENDING CHANGES:' as status;
SELECT
    pc.id,
    pc."userId",
    pc."changeType",
    pc."createdAt"
FROM "PendingChange" pc
WHERE pc."userId" NOT IN (SELECT id FROM "User");

-- 4. Check activities with user info
SELECT 'ACTIVITIES WITH USER INFO:' as status;
SELECT
    a.id,
    a."userId",
    a.description,
    a.time,
    u.name as user_name,
    u.email as user_email
FROM "Activity" a
LEFT JOIN "User" u ON a."userId" = u.id
WHERE a."userId" IS NOT NULL
LIMIT 10;