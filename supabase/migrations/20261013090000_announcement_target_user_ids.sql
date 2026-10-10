-- An announcement can now target several supports at once (the composer's multi-select).
-- Additive and nullable: existing rows and the single-person `targetUserId` keep working unchanged.
-- Rollback: ALTER TABLE "Announcement" DROP COLUMN "targetUserIds";
ALTER TABLE "Announcement" ADD COLUMN IF NOT EXISTS "targetUserIds" uuid[];
NOTIFY pgrst, 'reload schema';
