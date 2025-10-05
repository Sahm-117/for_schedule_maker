-- Clean up problematic users and pending changes
-- Run this in Supabase SQL Editor

-- 1. First, let's see what users we have
SELECT 'CURRENT USERS:' as status;
SELECT id, name, email, role, "createdAt" FROM "User";

-- 2. First delete related records to avoid foreign key constraint violations
-- Delete activities created by the problematic user
DELETE FROM "Activity"
WHERE "userId" = 'e1e543a2-dc09-4693-b4a5-075f1a53cefa';

-- Delete pending changes for the problematic user
DELETE FROM "PendingChange"
WHERE "userId" = 'e1e543a2-dc09-4693-b4a5-075f1a53cefa';

-- Delete rejected changes for the problematic user
DELETE FROM "RejectedChange"
WHERE "userId" = 'e1e543a2-dc09-4693-b4a5-075f1a53cefa';

-- 3. Now delete the problematic user
DELETE FROM "User"
WHERE id = 'e1e543a2-dc09-4693-b4a5-075f1a53cefa';

-- 4. Clean up any remaining orphaned records
DELETE FROM "Activity"
WHERE "userId" IS NOT NULL AND "userId" NOT IN (SELECT id FROM "User");

DELETE FROM "PendingChange"
WHERE "userId" NOT IN (SELECT id FROM "User");

DELETE FROM "RejectedChange"
WHERE "userId" NOT IN (SELECT id FROM "User");

-- 5. Verify cleanup
SELECT 'REMAINING USERS:' as status;
SELECT id, name, email, role, "createdAt" FROM "User";

SELECT 'REMAINING PENDING CHANGES:' as status, COUNT(*) as count FROM "PendingChange";
SELECT 'REMAINING REJECTED CHANGES:' as status, COUNT(*) as count FROM "RejectedChange";
SELECT 'REMAINING ACTIVITIES WITH USERID:' as status, COUNT(*) as count FROM "Activity" WHERE "userId" IS NOT NULL;