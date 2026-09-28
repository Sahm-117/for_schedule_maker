-- Data fix: some User and FollowUpContact rows still hold age ranges typed
-- without spaces ("25-34"), from before fill_profile_from_form started
-- normalising to the spaced form ("25 - 34") the app and AGE_RANGE_OPTIONS use.
-- Idempotent: only rewrites rows that don't already match the spaced form.

UPDATE "User"
SET "ageRange" = regexp_replace(trim("ageRange"), '\s*-\s*', ' - ')
WHERE "ageRange" IS NOT NULL
  AND trim("ageRange") ~ '-'
  AND "ageRange" <> regexp_replace(trim("ageRange"), '\s*-\s*', ' - ');

UPDATE "FollowUpContact"
SET "ageRange" = regexp_replace(trim("ageRange"), '\s*-\s*', ' - ')
WHERE "ageRange" IS NOT NULL
  AND trim("ageRange") ~ '-'
  AND "ageRange" <> regexp_replace(trim("ageRange"), '\s*-\s*', ' - ');
