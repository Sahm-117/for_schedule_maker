-- ========================================
-- Team Color Tagging System - Supabase Migration
-- ========================================
-- Run this SQL in your Supabase SQL Editor
-- Dashboard → SQL Editor → New Query → Paste and Run
-- ========================================

-- 1. Create Team table
CREATE TABLE IF NOT EXISTS "Team" (
  "id" SERIAL PRIMARY KEY,
  "name" TEXT UNIQUE NOT NULL,
  "color" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. Create ActivityTeam junction table (many-to-many relationship)
CREATE TABLE IF NOT EXISTS "ActivityTeam" (
  "activityId" INTEGER NOT NULL,
  "teamId" INTEGER NOT NULL,
  "order" INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY ("activityId", "teamId"),
  CONSTRAINT "ActivityTeam_activityId_fkey"
    FOREIGN KEY ("activityId")
    REFERENCES "Activity"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT "ActivityTeam_teamId_fkey"
    FOREIGN KEY ("teamId")
    REFERENCES "Team"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE
);

-- 3. Create indexes for performance
CREATE INDEX IF NOT EXISTS "ActivityTeam_activityId_idx" ON "ActivityTeam"("activityId");
CREATE INDEX IF NOT EXISTS "ActivityTeam_teamId_idx" ON "ActivityTeam"("teamId");

-- 4. Create trigger to auto-update updatedAt timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW."updatedAt" = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_team_updated_at BEFORE UPDATE ON "Team"
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ========================================
-- Verification (run these separately after table creation)
-- ========================================

-- Check if tables were created
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('Team', 'ActivityTeam');

-- Check Team table structure
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'Team'
ORDER BY ordinal_position;

-- Check ActivityTeam table structure
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'ActivityTeam'
ORDER BY ordinal_position;
