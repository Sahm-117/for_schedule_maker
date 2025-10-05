-- Check what's preventing user deletion
-- Run this to see what records are associated with the user

-- 1. Show the user we want to delete
SELECT 'USER TO DELETE:' as info;
SELECT id, name, email, role FROM "User"
WHERE email = 'irojaholamide@gmail.com';

-- 2. Check PendingChange records for this user
SELECT 'PENDING CHANGES FOR THIS USER:' as info;
SELECT COUNT(*) as count FROM "PendingChange"
WHERE "userId" IN (SELECT id FROM "User" WHERE email = 'irojaholamide@gmail.com');

SELECT pc.id, pc."changeType", pc."createdAt"
FROM "PendingChange" pc
JOIN "User" u ON pc."userId" = u.id
WHERE u.email = 'irojaholamide@gmail.com'
ORDER BY pc."createdAt" DESC;

-- 3. Check Activity records for this user
SELECT 'ACTIVITY RECORDS FOR THIS USER:' as info;
SELECT COUNT(*) as count FROM "Activity"
WHERE "userId" IN (SELECT id FROM "User" WHERE email = 'irojaholamide@gmail.com');

SELECT a.id, a.title, a."createdAt"
FROM "Activity" a
JOIN "User" u ON a."userId" = u.id
WHERE u.email = 'irojaholamide@gmail.com'
ORDER BY a."createdAt" DESC
LIMIT 5;

-- 4. Check RejectedChange records for this user
SELECT 'REJECTED CHANGES FOR THIS USER:' as info;
SELECT COUNT(*) as count FROM "RejectedChange"
WHERE "userId" IN (SELECT id FROM "User" WHERE email = 'irojaholamide@gmail.com');

-- 5. Show summary of what's blocking deletion
SELECT 'SUMMARY - RECORDS PREVENTING DELETION:' as info;
SELECT
    (SELECT COUNT(*) FROM "PendingChange" WHERE "userId" IN (SELECT id FROM "User" WHERE email = 'irojaholamide@gmail.com')) as pending_changes,
    (SELECT COUNT(*) FROM "Activity" WHERE "userId" IN (SELECT id FROM "User" WHERE email = 'irojaholamide@gmail.com')) as activities,
    (SELECT COUNT(*) FROM "RejectedChange" WHERE "userId" IN (SELECT id FROM "User" WHERE email = 'irojaholamide@gmail.com')) as rejected_changes;