-- Final cleanup of any remaining orphaned pending changes
-- This will fix the "Unknown User" issue once and for all

-- 1. Check current pending changes with user lookup
SELECT 'CURRENT PENDING CHANGES WITH UNKNOWN USERS:' as info;
SELECT
    pc.id,
    pc."userId",
    pc."changeType",
    pc."createdAt",
    u.name as user_name,
    CASE
        WHEN u.id IS NULL THEN 'ORPHANED - NO USER FOUND'
        ELSE 'HAS VALID USER'
    END as status
FROM "PendingChange" pc
LEFT JOIN "User" u ON pc."userId" = u.id
ORDER BY pc."createdAt" DESC;

-- 2. Show all available users
SELECT 'AVAILABLE USERS:' as info;
SELECT id, name, email, role FROM "User";

-- 3. Fix ALL orphaned pending changes by pointing them to System Admin
UPDATE "PendingChange"
SET "userId" = 'a0000000-0000-4000-8000-000000000002'::UUID
WHERE "userId" NOT IN (SELECT id FROM "User")
   OR "userId" IS NULL;

-- 4. Alternative: If System Admin doesn't exist, use any available admin user
UPDATE "PendingChange"
SET "userId" = (
    SELECT id FROM "User"
    WHERE role = 'ADMIN'
    ORDER BY "createdAt" ASC
    LIMIT 1
)
WHERE "userId" NOT IN (SELECT id FROM "User")
   OR "userId" IS NULL;

-- 5. Verify the fix
SELECT 'AFTER CLEANUP - ALL PENDING CHANGES:' as info;
SELECT
    pc.id,
    pc."changeType",
    u.name as user_name,
    u.email as user_email,
    pc."createdAt"
FROM "PendingChange" pc
JOIN "User" u ON pc."userId" = u.id
ORDER BY pc."createdAt" DESC;

SELECT 'All pending changes should now have valid users!' as final_status;