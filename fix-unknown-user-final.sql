-- ========================================
-- FINAL FIX FOR UNKNOWN USER ISSUE
-- ========================================
-- Run this AFTER running diagnose-unknown-user.sql
-- This will fix ALL known causes of the Unknown User issue

-- STEP 1: Create System Admin user if it doesn't exist
INSERT INTO "User" (id, name, email, password_hash, role)
VALUES (
    'a0000000-0000-4000-8000-000000000002'::uuid,
    'System Admin',
    'system@fof.com',
    'hashed_system',
    'ADMIN'
)
ON CONFLICT (id) DO UPDATE
SET
    name = 'System Admin',
    role = 'ADMIN'
RETURNING id, name, email;

-- STEP 2: Get or create a fallback admin user (in case System Admin fails)
DO $$
DECLARE
    fallback_admin_id uuid;
BEGIN
    -- Try to find an existing admin
    SELECT id INTO fallback_admin_id
    FROM "User"
    WHERE role = 'ADMIN'
    ORDER BY "createdAt" ASC
    LIMIT 1;

    -- If no admin exists, create one
    IF fallback_admin_id IS NULL THEN
        INSERT INTO "User" (name, email, password_hash, role)
        VALUES ('Fallback Admin', 'fallback@fof.com', 'hashed_fallback', 'ADMIN')
        RETURNING id INTO fallback_admin_id;
    END IF;

    RAISE NOTICE 'Fallback admin ID: %', fallback_admin_id;
END $$;

-- STEP 3: Fix orphaned pending changes by pointing to System Admin
UPDATE "PendingChange"
SET "userId" = 'a0000000-0000-4000-8000-000000000002'::uuid
WHERE "userId" NOT IN (SELECT id FROM "User")
   OR "userId" IS NULL
   OR "userId"::text = 'demo_user_id'
   OR "userId"::text LIKE '%demo%';

-- STEP 4: Verify the fix worked
SELECT 'VERIFICATION: Checking all pending changes now have valid users...' AS step;
SELECT
    COUNT(*) AS total_pending_changes,
    COUNT(u.id) AS with_valid_user,
    COUNT(*) - COUNT(u.id) AS still_orphaned
FROM "PendingChange" pc
LEFT JOIN "User" u ON u.id = pc."userId";

-- STEP 5: Show the fixed pending changes
SELECT 'VERIFICATION: Current pending changes with user info...' AS step;
SELECT
    pc.id,
    pc."changeType",
    pc."changeData"->>'description' AS description,
    u.name AS user_name,
    u.email AS user_email,
    pc."createdAt"
FROM "PendingChange" pc
LEFT JOIN "User" u ON u.id = pc."userId"
ORDER BY pc."createdAt" DESC;

-- STEP 6: Final status
SELECT
    CASE
        WHEN (SELECT COUNT(*) FROM "PendingChange" pc LEFT JOIN "User" u ON u.id = pc."userId" WHERE u.id IS NULL) = 0
        THEN '✅ SUCCESS! All pending changes now have valid users!'
        ELSE '❌ FAILED! There are still orphaned pending changes. Please contact support.'
    END AS final_status;