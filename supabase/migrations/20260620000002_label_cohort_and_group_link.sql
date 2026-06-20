-- Cohort-scope tags and link them to their group.
-- Auto group tags ("<group name> Support") carry cohortId + groupId; manual/legacy
-- tags keep both null and behave as global. Idempotent.

ALTER TABLE "Label" ADD COLUMN IF NOT EXISTS "cohortId" UUID REFERENCES "Cohort"(id) ON DELETE CASCADE;
ALTER TABLE "Label" ADD COLUMN IF NOT EXISTS "groupId"  UUID REFERENCES "Group"(id)  ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_label_cohort ON "Label"("cohortId");
CREATE INDEX IF NOT EXISTS idx_label_group  ON "Label"("groupId");

-- Move name-uniqueness from GLOBAL to PER-COHORT so each cohort can have its own
-- "Group 1 Support" while legacy/global tags share the null bucket.
DROP INDEX IF EXISTS idx_label_name_lower_unique;
CREATE UNIQUE INDEX IF NOT EXISTS idx_label_name_lower_cohort_unique
  ON "Label"(lower(name), COALESCE("cohortId", '00000000-0000-0000-0000-000000000000'::uuid));
