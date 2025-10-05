-- Production Migration Script
-- Run this in your production database (Supabase, Railway, etc.) to fix Unknown User issue

-- Step 1: Add userId column to Activity table
ALTER TABLE "Activity" ADD COLUMN "userId" TEXT;

-- Step 2: Create system users for data integrity
INSERT INTO "User" (id, email, name, password_hash, role, "createdAt", "updatedAt")
SELECT
    'system-admin-user-id',
    'admin@system.com',
    'System Admin',
    '$2b$10$example.hash.for.admin123',
    'ADMIN',
    NOW(),
    NOW()
WHERE NOT EXISTS (
    SELECT 1 FROM "User" WHERE id = 'system-admin-user-id'
);

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

-- Step 3: Update orphaned pending changes to point to system user
UPDATE "PendingChange"
SET "userId" = 'system-user-fallback-id'
WHERE "userId" NOT IN (SELECT id FROM "User") OR "userId" IS NULL;

-- Step 4: Update orphaned rejected changes to point to system user
UPDATE "RejectedChange"
SET "userId" = 'system-user-fallback-id'
WHERE "userId" NOT IN (SELECT id FROM "User") OR "userId" IS NULL;

-- Step 5: Verify the fix
SELECT 'MIGRATION COMPLETE - VERIFICATION:' as status;

SELECT 'Users after migration:' as info;
SELECT id, name, email, role FROM "User";

SELECT 'Pending changes after fix:' as info;
SELECT
    pc.id,
    pc."changeType",
    u.name as user_name,
    u.email as user_email
FROM "PendingChange" pc
JOIN "User" u ON pc."userId" = u.id
LIMIT 5;

SELECT 'Orphaned pending changes (should be 0):' as info;
SELECT COUNT(*) as orphaned_count
FROM "PendingChange"
WHERE "userId" NOT IN (SELECT id FROM "User") OR "userId" IS NULL;

-- Success message
SELECT 'Unknown User issue should now be fixed!' as final_status;