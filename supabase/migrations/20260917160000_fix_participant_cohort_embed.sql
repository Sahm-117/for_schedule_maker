-- Fix: the app's "Participant with Cohort" embed (cohort:Cohort(name)) became
-- ambiguous once FeedbackSubmission, ParticipantWrapUp and ReflectionSummary each
-- had foreign keys to both Participant and Cohort. PostgREST then sees extra
-- many-to-many paths and rejects the embed (PGRST201), so participant lists fail.
-- Keep the participant keys (they cascade when a participant is deleted) and drop
-- the cohort keys; the cohortId columns stay as plain values.
-- Applied to the live database on 2026-09-17.

ALTER TABLE "FeedbackSubmission" DROP CONSTRAINT IF EXISTS "FeedbackSubmission_cohortId_fkey";
ALTER TABLE "ParticipantWrapUp" DROP CONSTRAINT IF EXISTS "ParticipantWrapUp_cohortId_fkey";
ALTER TABLE "ReflectionSummary" DROP CONSTRAINT IF EXISTS "ReflectionSummary_cohortId_fkey";

NOTIFY pgrst, 'reload schema';
