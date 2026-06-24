-- Hub topic reactions (thumbs-up). One like per user per topic.
CREATE TABLE IF NOT EXISTS "HubReaction" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "topicId" UUID NOT NULL REFERENCES "HubTopic"(id) ON DELETE CASCADE,
  "userId" UUID NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("topicId", "userId")
);

CREATE INDEX IF NOT EXISTS "HubReaction_topicId_idx" ON "HubReaction" ("topicId");
