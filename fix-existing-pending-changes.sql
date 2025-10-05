-- Fix existing pending changes that still show "Unknown User"
-- Run this in your Supabase database

-- First, let's see what we're dealing with
SELECT 'CURRENT PENDING CHANGES STATUS:' as info;
SELECT
    pc.id,
    pc."userId",
    pc."changeType",
    pc."createdAt",
    u.name as user_name,
    CASE
        WHEN u.id IS NULL THEN 'MISSING USER - CAUSES UNKNOWN USER'
        ELSE 'USER FOUND'
    END as status
FROM "PendingChange" pc
LEFT JOIN "User" u ON pc."userId" = u.id
ORDER BY pc."createdAt" DESC;

-- Show available users
SELECT 'AVAILABLE USERS:' as info;
SELECT id, name, email, role FROM "User";

-- Fix all orphaned pending changes by pointing them to our system user
UPDATE "PendingChange"
SET "userId" = 'a0000000-0000-4000-8000-000000000002'::UUID
WHERE "userId" IS NULL
   OR "userId" NOT IN (SELECT id FROM "User");

-- Verify the fix
SELECT 'AFTER FIX - PENDING CHANGES:' as info;
SELECT
    pc.id,
    pc."changeType",
    u.name as user_name,
    u.email as user_email,
    pc."createdAt"
FROM "PendingChange" pc
JOIN "User" u ON pc."userId" = u.id
ORDER BY pc."createdAt" DESC;

SELECT 'Fix complete! All pending changes should now show proper user names.' as final_status;