-- Participant registration fields: capture the same details the church
-- registration platform / Google Form collect, so manually-added and imported
-- participants carry email, gender, age range, departments, registration date
-- and SMART request. Idempotent.

ALTER TABLE "Participant"
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS gender TEXT,
  ADD COLUMN IF NOT EXISTS "ageRange" TEXT,
  ADD COLUMN IF NOT EXISTS departments TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "registrationDate" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "smartRequest" TEXT;
