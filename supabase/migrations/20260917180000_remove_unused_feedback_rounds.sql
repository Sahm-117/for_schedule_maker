-- Remove the survey-round pieces from 20260917140000, unused since feedback became
-- anonymous feedback only (20260917170000). Confirmed with Olamide on 2026-09-17.
-- FeedbackSubmission was empty and midFeedbackWeek only ever held its default.

DROP FUNCTION IF EXISTS public.submit_feedback(TEXT, TEXT, JSONB);
DROP FUNCTION IF EXISTS public.feedback_rounds(UUID);
DROP TABLE IF EXISTS "FeedbackSubmission";
ALTER TABLE "Cohort" DROP COLUMN IF EXISTS "midFeedbackWeek";

NOTIFY pgrst, 'reload schema';
