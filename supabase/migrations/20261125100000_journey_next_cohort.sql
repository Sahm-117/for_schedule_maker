-- Adjust journey: "Next cohort" (owner request 2026-11-25, FLOW_MAP rule 141).
-- An admin can move someone who is not in a group to the next cohort from the Participants ⋮ menu (Adjust journey),
-- their profile, or the Add Participant form. The app archives them, sets an adult's sign-up to "Will join next
-- cohort" (same as the three-misses move, rule 119) and saves this journey entry with the reason.
--
-- Rollback: delete NEXT_COHORT rows, then restore the old check without 'NEXT_COHORT'.

ALTER TABLE public."ParticipantStageChange" DROP CONSTRAINT IF EXISTS "ParticipantStageChange_stage_check";
ALTER TABLE public."ParticipantStageChange" ADD CONSTRAINT "ParticipantStageChange_stage_check"
  CHECK (stage IN ('REGISTERED', 'ONBOARDED', 'ACTIVE', 'COMPLETED', 'REFERRED', 'INTEGRATED', 'NEXT_COHORT'));
