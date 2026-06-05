DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AnnouncementScope') THEN
    CREATE TYPE "AnnouncementScope" AS ENUM ('ACTIVE_COHORT', 'ALL_USERS');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "Cohort" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  "startDate" DATE,
  "endDate" DATE,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE "Cohort" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all operations" ON "Cohort";
CREATE POLICY "Allow all operations" ON "Cohort" FOR ALL USING (true);

ALTER TABLE "Week" ADD COLUMN IF NOT EXISTS "cohortId" UUID;

INSERT INTO "Cohort" (name, description, status)
SELECT 'Current Cohort', 'Backfilled default cohort', 'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM "Cohort");

UPDATE "Week"
SET "cohortId" = (SELECT id FROM "Cohort" ORDER BY "createdAt" ASC LIMIT 1)
WHERE "cohortId" IS NULL;

ALTER TABLE "Week"
  ALTER COLUMN "cohortId" SET NOT NULL;

ALTER TABLE "Week"
  DROP CONSTRAINT IF EXISTS "Week_weekNumber_key";

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'Week_cohortId_weekNumber_key'
  ) THEN
    ALTER TABLE "Week"
      ADD CONSTRAINT "Week_cohortId_weekNumber_key" UNIQUE ("cohortId", "weekNumber");
  END IF;
END $$;

ALTER TABLE "Week"
  DROP CONSTRAINT IF EXISTS "Week_cohortId_fkey";

ALTER TABLE "Week"
  ADD CONSTRAINT "Week_cohortId_fkey"
  FOREIGN KEY ("cohortId") REFERENCES "Cohort"(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_week_cohort ON "Week"("cohortId");

CREATE TABLE IF NOT EXISTS "UserCohort" (
  "userId" UUID NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "cohortId" UUID NOT NULL REFERENCES "Cohort"(id) ON DELETE CASCADE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("userId", "cohortId")
);

ALTER TABLE "UserCohort" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all operations" ON "UserCohort";
CREATE POLICY "Allow all operations" ON "UserCohort" FOR ALL USING (true);
CREATE INDEX IF NOT EXISTS idx_usercohort_cohort ON "UserCohort"("cohortId");

INSERT INTO "UserCohort" ("userId", "cohortId")
SELECT u.id, c.id
FROM "User" u
CROSS JOIN LATERAL (SELECT id FROM "Cohort" ORDER BY "createdAt" ASC LIMIT 1) c
WHERE u.role = 'SUPPORT'
ON CONFLICT ("userId", "cohortId") DO NOTHING;

ALTER TABLE "Announcement"
  ADD COLUMN IF NOT EXISTS scope "AnnouncementScope" NOT NULL DEFAULT 'ACTIVE_COHORT';

ALTER TABLE "Announcement"
  ADD COLUMN IF NOT EXISTS "cohortId" UUID REFERENCES "Cohort"(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_announcement_cohort ON "Announcement"("cohortId");
