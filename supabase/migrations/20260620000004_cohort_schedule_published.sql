-- Per-cohort flag: when false (default), supports cannot see their tagged
-- schedule activities yet (admin is still planning). Flip true to publish.
ALTER TABLE "Cohort" ADD COLUMN IF NOT EXISTS "schedulePublished" BOOLEAN NOT NULL DEFAULT false;
