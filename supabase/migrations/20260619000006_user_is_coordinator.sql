-- Mark Support users who can onboard other supports.
-- Idempotent.

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "isCoordinator" BOOLEAN NOT NULL DEFAULT FALSE;
