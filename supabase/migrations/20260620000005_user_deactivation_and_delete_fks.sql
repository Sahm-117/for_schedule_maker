ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS "deactivatedAt" TIMESTAMPTZ;

ALTER TABLE "PendingChange"
  DROP CONSTRAINT IF EXISTS "PendingChange_userId_fkey";

ALTER TABLE "PendingChange"
  ADD CONSTRAINT "PendingChange_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE CASCADE;

ALTER TABLE "RejectedChange"
  DROP CONSTRAINT IF EXISTS "RejectedChange_userId_fkey";

ALTER TABLE "RejectedChange"
  ADD CONSTRAINT "RejectedChange_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE CASCADE;
