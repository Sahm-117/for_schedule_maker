-- Faith Project categories are a shared programme catalogue. A category added
-- while viewing one cohort must be available when support reviews another.
-- Keep the original cohortId as provenance for existing records; it no longer
-- scopes availability. Archive duplicate active names rather than deleting them
-- so projects already categorised with an older record keep their history.

WITH duplicates AS (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY lower(trim(name))
      ORDER BY "createdAt" ASC, id ASC
    ) AS position
  FROM "FaithProjectCategory"
  WHERE "archivedAt" IS NULL
)
UPDATE "FaithProjectCategory" category
SET "archivedAt" = NOW(), "updatedAt" = NOW()
FROM duplicates
WHERE category.id = duplicates.id AND duplicates.position > 1;

DROP INDEX IF EXISTS faith_project_category_unique_active_name;
CREATE UNIQUE INDEX IF NOT EXISTS faith_project_category_unique_active_name
  ON "FaithProjectCategory" (lower(trim(name)))
  WHERE "archivedAt" IS NULL;
