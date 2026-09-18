-- Allow a PARTICIPANTS-audience announcement to target one group's roster
-- (Group -> GroupParticipant), separate from targetLabelId which targets a
-- support's tag. Null = whole audience. Idempotent.

ALTER TABLE "Announcement" ADD COLUMN IF NOT EXISTS "targetGroupId" UUID REFERENCES "Group"(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_announcement_target_group ON "Announcement"("targetGroupId");
