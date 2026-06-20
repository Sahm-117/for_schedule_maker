-- Allow an announcement to target a specific tag (Label). When set, only users
-- holding that tag (plus admins) see it. Null = whole audience. Idempotent.

ALTER TABLE "Announcement" ADD COLUMN IF NOT EXISTS "targetLabelId" UUID REFERENCES "Label"(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_announcement_target_label ON "Announcement"("targetLabelId");
