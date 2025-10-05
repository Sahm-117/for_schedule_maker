-- Clean up problematic users and pending changes
-- Run this in Supabase SQL Editor

-- 1. First, let's see what users we have
SELECT 'CURRENT USERS:' as status;
SELECT id, name, email, role, "createdAt" FROM "User";

-- 2. Delete the problematic user (Olamide 2 with tisnotaname email)
DELETE FROM "User"
WHERE email = 'tisnotaname@gmail.com' OR name = 'Olamide 2';

-- 3. Clean up any pending changes from deleted users
DELETE FROM "PendingChange"
WHERE "userId" NOT IN (SELECT id FROM "User");

-- 4. Clean up any rejected changes from deleted users
DELETE FROM "RejectedChange"
WHERE "userId" NOT IN (SELECT id FROM "User");

-- 5. Verify cleanup
SELECT 'REMAINING USERS:' as status;
SELECT id, name, email, role, "createdAt" FROM "User";

SELECT 'REMAINING PENDING CHANGES:' as status, COUNT(*) as count FROM "PendingChange";
SELECT 'REMAINING REJECTED CHANGES:' as status, COUNT(*) as count FROM "RejectedChange";