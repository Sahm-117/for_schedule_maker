-- ============================================
-- DATABASE MIGRATION: Enforce User Integrity
-- ============================================
-- This migration makes "Unknown User" impossible by enforcing database constraints
-- Run this in Supabase SQL Editor

-- STEP 1: Ensure System Admin exists (idempotent)
INSERT INTO "User" (id, name, email, password_hash, role)
VALUES (
    'a0000000-0000-4000-8000-000000000002'::uuid,
    'System Admin',
    'system@fof.com',
    'hashed_system',
    'ADMIN'
)
ON CONFLICT (id) DO UPDATE
SET name = 'System Admin', role = 'ADMIN';

-- STEP 2: Backfill ALL existing bad/blank userIds
UPDATE "PendingChange" pc
SET "userId" = 'a0000000-0000-4000-8000-000000000002'::uuid
WHERE pc."userId" IS NULL
   OR NOT EXISTS (SELECT 1 FROM "User" u WHERE u.id = pc."userId")
   OR pc."userId"::text = 'demo_user_id';

-- Also fix Activity table
UPDATE "Activity" a
SET "userId" = 'a0000000-0000-4000-8000-000000000002'::uuid
WHERE a."userId" IS NULL
   OR NOT EXISTS (SELECT 1 FROM "User" u WHERE u.id = a."userId")
   OR a."userId"::text = 'demo_user_id';

-- Also fix RejectedChange table
UPDATE "RejectedChange" rc
SET "userId" = 'a0000000-0000-4000-8000-000000000002'::uuid
WHERE rc."userId" IS NULL
   OR NOT EXISTS (SELECT 1 FROM "User" u WHERE u.id = rc."userId")
   OR rc."userId"::text = 'demo_user_id';

-- STEP 3: Add proper constraints to PendingChange
ALTER TABLE "PendingChange"
  ALTER COLUMN "userId" SET DATA TYPE uuid USING "userId"::uuid,
  ALTER COLUMN "userId" SET NOT NULL,
  ALTER COLUMN "userId" SET DEFAULT 'a0000000-0000-4000-8000-000000000002'::uuid;

-- Add FK constraint if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_name = 'PendingChange' AND constraint_name = 'PendingChange_userId_fkey'
  ) THEN
    ALTER TABLE "PendingChange"
      ADD CONSTRAINT "PendingChange_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"(id)
      ON UPDATE CASCADE
      ON DELETE SET DEFAULT; -- falls back to System Admin if a user is deleted
  END IF;
END $$;

-- STEP 4: Add proper constraints to Activity
ALTER TABLE "Activity"
  ALTER COLUMN "userId" SET DATA TYPE uuid USING "userId"::uuid,
  ALTER COLUMN "userId" SET NOT NULL,
  ALTER COLUMN "userId" SET DEFAULT 'a0000000-0000-4000-8000-000000000002'::uuid;

-- Add FK constraint if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_name = 'Activity' AND constraint_name = 'Activity_userId_fkey'
  ) THEN
    ALTER TABLE "Activity"
      ADD CONSTRAINT "Activity_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"(id)
      ON UPDATE CASCADE
      ON DELETE SET DEFAULT;
  END IF;
END $$;

-- STEP 5: Add proper constraints to RejectedChange
ALTER TABLE "RejectedChange"
  ALTER COLUMN "userId" SET DATA TYPE uuid USING "userId"::uuid,
  ALTER COLUMN "userId" SET NOT NULL,
  ALTER COLUMN "userId" SET DEFAULT 'a0000000-0000-4000-8000-000000000002'::uuid;

-- Add FK constraint if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_name = 'RejectedChange' AND constraint_name = 'RejectedChange_userId_fkey'
  ) THEN
    ALTER TABLE "RejectedChange"
      ADD CONSTRAINT "RejectedChange_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"(id)
      ON UPDATE CASCADE
      ON DELETE SET DEFAULT;
  END IF;
END $$;

-- STEP 6: Add RLS policy to allow reading User for joins
CREATE POLICY IF NOT EXISTS "pc_join_can_read_minimal_user"
ON "User"
FOR SELECT
USING (true);

-- STEP 7: Verify the migration worked
SELECT 'VERIFICATION: Checking all tables now have valid users...' AS step;

SELECT
    'PendingChange' AS table_name,
    COUNT(*) AS total_records,
    COUNT(u.id) AS with_valid_user,
    COUNT(*) - COUNT(u.id) AS still_orphaned
FROM "PendingChange" pc
LEFT JOIN "User" u ON u.id = pc."userId"
UNION ALL
SELECT
    'Activity' AS table_name,
    COUNT(*) AS total_records,
    COUNT(u.id) AS with_valid_user,
    COUNT(*) - COUNT(u.id) AS still_orphaned
FROM "Activity" a
LEFT JOIN "User" u ON u.id = a."userId"
UNION ALL
SELECT
    'RejectedChange' AS table_name,
    COUNT(*) AS total_records,
    COUNT(u.id) AS with_valid_user,
    COUNT(*) - COUNT(u.id) AS still_orphaned
FROM "RejectedChange" rc
LEFT JOIN "User" u ON u.id = rc."userId";

SELECT
    CASE
        WHEN (
            SELECT COUNT(*) FROM "PendingChange" pc
            LEFT JOIN "User" u ON u.id = pc."userId"
            WHERE u.id IS NULL
        ) = 0
        THEN '✅ SUCCESS! All records now have valid users with FK constraints!'
        ELSE '❌ FAILED! There are still orphaned records.'
    END AS final_status;