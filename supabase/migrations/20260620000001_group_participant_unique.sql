-- Enforce one group per participant.
-- Before adding the constraint, collapse any participant who is currently in
-- more than one group down to their most recent membership.
-- Idempotent.

-- 1. De-dupe: keep the most recently created membership per participant.
DELETE FROM "GroupParticipant" gp
USING (
  SELECT "participantId", MAX("createdAt") AS keep_at
  FROM "GroupParticipant"
  GROUP BY "participantId"
  HAVING COUNT(*) > 1
) dups
WHERE gp."participantId" = dups."participantId"
  AND gp."createdAt" < dups.keep_at;

-- 2. Add the uniqueness guard (skip if it already exists).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'group_participant_unique_participant'
  ) THEN
    ALTER TABLE "GroupParticipant"
      ADD CONSTRAINT group_participant_unique_participant UNIQUE ("participantId");
  END IF;
END $$;
