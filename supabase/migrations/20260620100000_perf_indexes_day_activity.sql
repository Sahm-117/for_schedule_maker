-- Performance: index the two hottest foreign keys on the schedule read path.
--
-- The schedule loads Week -> Day (by weekId) -> Activity (by dayId) on every
-- dashboard/schedule open and on every realtime refresh. Day.weekId had no
-- index at all, and Activity.dayId was only covered by a composite index in the
-- full schema file (idx_activity_day_order on (dayId, orderIndex)) which is not
-- guaranteed to exist on the live DB since the full schema is not applied as an
-- incremental migration.
--
-- Both statements are IF NOT EXISTS so this is safe/idempotent: if a covering
-- index already exists for Activity.dayId, Postgres keeps it and this is a
-- harmless no-op. Adding these prevents sequential scans as the cohort grows.

CREATE INDEX IF NOT EXISTS idx_day_week ON "Day"("weekId");
CREATE INDEX IF NOT EXISTS idx_activity_day ON "Activity"("dayId");
