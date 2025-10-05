-- Clean up orphaned pending changes with invalid user IDs
-- Run this in Supabase SQL Editor to remove "Unknown User" entries

-- 1. Delete pending changes with invalid user IDs
DELETE FROM "PendingChange"
WHERE "userId" IN ('current_user_id', 'demo_user_id')
   OR "userId" NOT IN (SELECT "id" FROM "User");

-- 2. Delete rejected changes with invalid user IDs (if any)
DELETE FROM "RejectedChange"
WHERE "userId" IN ('current_user_id', 'demo_user_id')
   OR "userId" NOT IN (SELECT "id" FROM "User");

-- 3. Show remaining pending changes (should be empty now)
SELECT 'REMAINING PENDING CHANGES:' as status, COUNT(*) as count FROM "PendingChange";

-- 4. Show remaining rejected changes
SELECT 'REMAINING REJECTED CHANGES:' as status, COUNT(*) as count FROM "RejectedChange";

-- 5. Verify user count is still intact
SELECT 'TOTAL USERS:' as status, COUNT(*) as count FROM "User";