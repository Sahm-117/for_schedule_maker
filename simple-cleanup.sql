-- Simple cleanup script - remove all pending changes
-- This will clear the "Unknown User" entries

-- 1. First, let's see what we have
SELECT * FROM "PendingChange";

-- 2. Delete all pending changes (since they're all from testing anyway)
DELETE FROM "PendingChange";

-- 3. Delete all rejected changes too
DELETE FROM "RejectedChange";

-- 4. Verify they're gone
SELECT 'PENDING CHANGES LEFT:' as status, COUNT(*) as count FROM "PendingChange";
SELECT 'REJECTED CHANGES LEFT:' as status, COUNT(*) as count FROM "RejectedChange";

-- 5. Your users and schedule data are still safe
SELECT 'USERS:' as status, COUNT(*) as count FROM "User";
SELECT 'WEEKS:' as status, COUNT(*) as count FROM "Week";
SELECT 'ACTIVITIES:' as status, COUNT(*) as count FROM "Activity";