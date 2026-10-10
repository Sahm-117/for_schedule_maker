-- CorporatePrayerSkip had foreign keys to both Participant and Cohort. PostgREST reads a table with two
-- such keys as a many-to-many route between them, so every `Participant ... cohort:Cohort(name)` embed
-- in the app became ambiguous (PGRST201) and failed: the Dashboard registration cards, the Participants
-- page and anything else that embeds the cohort of a participant.
-- Dropping the cohortId key leaves a single Participant -> Cohort route. The column and its use stay;
-- the row still goes when its participant goes (participantId keeps ON DELETE CASCADE).
-- Rollback: ALTER TABLE "CorporatePrayerSkip" ADD CONSTRAINT "CorporatePrayerSkip_cohortId_fkey"
--   FOREIGN KEY ("cohortId") REFERENCES "Cohort"(id) ON DELETE CASCADE;  (brings the bug back)
ALTER TABLE "CorporatePrayerSkip" DROP CONSTRAINT IF EXISTS "CorporatePrayerSkip_cohortId_fkey";
NOTIFY pgrst, 'reload schema';
