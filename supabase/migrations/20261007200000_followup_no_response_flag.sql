-- No response, for a support who cannot reach someone.
--
--   FollowUpContact."noResponseAt": when a support (or admin) marked the person No response.
--   * An adult is released from the support (ownerId cleared) and left open, so they can
--     still be put in a group. The NO_RESPONSE status already keeps them out of assignment
--     and reassignment.
--   * A teen keeps their Teen Support and their status (TEENAGER), because a teen always
--     needs a same-gender Teen Support; the flag alone silences reminders and nudges.
--
-- Rollback: ALTER TABLE "FollowUpContact" DROP COLUMN "noResponseAt";

ALTER TABLE public."FollowUpContact" ADD COLUMN IF NOT EXISTS "noResponseAt" TIMESTAMPTZ;
