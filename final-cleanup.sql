-- Final cleanup script to completely resolve Unknown User issues
-- This will clean up orphaned records and create proper user relationships

-- 1. Check current state
SELECT 'CURRENT STATE BEFORE CLEANUP:' as status;
SELECT 'Users:' as table_name, COUNT(*) as count FROM "User"
UNION ALL
SELECT 'PendingChanges:', COUNT(*) FROM "PendingChange"
UNION ALL
SELECT 'RejectedChanges:', COUNT(*) FROM "RejectedChange"
UNION ALL
SELECT 'Activities with userId:', COUNT(*) FROM "Activity" WHERE "userId" IS NOT NULL;

-- 2. Create a system/admin user if none exists
INSERT INTO "User" (id, email, name, password_hash, role, "createdAt", "updatedAt")
SELECT
    'system-admin-user-id',
    'admin@test.com',
    'Admin User',
    '$2b$10$example.hash.for.admin123',
    'ADMIN',
    NOW(),
    NOW()
WHERE NOT EXISTS (
    SELECT 1 FROM "User" WHERE role = 'ADMIN' AND email = 'admin@test.com'
);

-- 3. Create a system user for orphaned records
INSERT INTO "User" (id, email, name, password_hash, role, "createdAt", "updatedAt")
SELECT
    'system-user-fallback-id',
    'system@internal.com',
    'System User',
    '$2b$10$example.hash.for.system',
    'SUPPORT',
    NOW(),
    NOW()
WHERE NOT EXISTS (
    SELECT 1 FROM "User" WHERE id = 'system-user-fallback-id'
);

-- 4. Update orphaned pending changes to point to system user
UPDATE "PendingChange"
SET "userId" = 'system-user-fallback-id'
WHERE "userId" NOT IN (SELECT id FROM "User");

-- 5. Update orphaned rejected changes to point to system user
UPDATE "RejectedChange"
SET "userId" = 'system-user-fallback-id'
WHERE "userId" NOT IN (SELECT id FROM "User");

-- 6. Update orphaned activities to point to system user
UPDATE "Activity"
SET "userId" = 'system-user-fallback-id'
WHERE "userId" IS NOT NULL AND "userId" NOT IN (SELECT id FROM "User");

-- 7. Verify final state
SELECT 'FINAL STATE AFTER CLEANUP:' as status;
SELECT 'Users:' as table_name, COUNT(*) as count FROM "User"
UNION ALL
SELECT 'PendingChanges:', COUNT(*) FROM "PendingChange"
UNION ALL
SELECT 'RejectedChanges:', COUNT(*) FROM "RejectedChange"
UNION ALL
SELECT 'Activities with userId:', COUNT(*) FROM "Activity" WHERE "userId" IS NOT NULL;

-- 8. Check that all pending changes now have valid users
SELECT 'PENDING CHANGES WITH MISSING USERS:' as status, COUNT(*) as count
FROM "PendingChange" pc
WHERE pc."userId" NOT IN (SELECT id FROM "User");

-- 9. Show sample of pending changes with user info
SELECT 'SAMPLE PENDING CHANGES:' as status;
SELECT
    pc.id,
    pc."changeType",
    u.name as user_name,
    u.email as user_email,
    pc."createdAt"
FROM "PendingChange" pc
JOIN "User" u ON pc."userId" = u.id
LIMIT 5;