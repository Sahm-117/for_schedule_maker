-- Check what users exist and find the user ID that's causing issues
-- Run this in your Supabase database

-- 1. Show all users
SELECT 'ALL USERS IN DATABASE:' as info;
SELECT id, name, email, role, "createdAt" FROM "User" ORDER BY "createdAt" DESC;

-- 2. Show latest pending changes with user lookup
SELECT 'LATEST PENDING CHANGES:' as info;
SELECT
    pc.id,
    pc."userId",
    pc."changeType",
    pc."createdAt",
    u.name as user_name,
    u.email as user_email,
    CASE
        WHEN u.id IS NULL THEN 'USER ID NOT FOUND IN USER TABLE'
        ELSE 'USER FOUND'
    END as lookup_status
FROM "PendingChange" pc
LEFT JOIN "User" u ON pc."userId" = u.id
ORDER BY pc."createdAt" DESC
LIMIT 5;

-- 3. Find any pending changes with missing users
SELECT 'ORPHANED PENDING CHANGES:' as info;
SELECT
    pc.id,
    pc."userId" as missing_user_id,
    pc."changeType",
    pc."createdAt"
FROM "PendingChange" pc
WHERE pc."userId" NOT IN (SELECT id FROM "User");

-- 4. Count summary
SELECT 'SUMMARY:' as info;
SELECT
    COUNT(*) as total_pending_changes,
    COUNT(u.id) as pending_changes_with_valid_users,
    COUNT(*) - COUNT(u.id) as orphaned_pending_changes
FROM "PendingChange" pc
LEFT JOIN "User" u ON pc."userId" = u.id;