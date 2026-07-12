-- Add image attachment + category to MessageTemplate
-- category: 'FOLLOW_UP' (existing, default) or 'ONBOARDING' (new section)

ALTER TABLE "MessageTemplate"
  ADD COLUMN IF NOT EXISTS "imageUrl"   TEXT,
  ADD COLUMN IF NOT EXISTS "imageName"  TEXT,
  ADD COLUMN IF NOT EXISTS category     TEXT NOT NULL DEFAULT 'FOLLOW_UP';
