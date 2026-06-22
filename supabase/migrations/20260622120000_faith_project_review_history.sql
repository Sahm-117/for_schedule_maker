-- Add review history to FaithProject.
-- Each entry: { actorId, actorName, action: 'APPROVED'|'NEEDS_REFINEMENT', note, at }
ALTER TABLE "FaithProject"
  ADD COLUMN IF NOT EXISTS "reviewHistory" JSONB NOT NULL DEFAULT '[]'::jsonb;
