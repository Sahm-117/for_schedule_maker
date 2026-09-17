-- When each person last read a faith project's conversation, per trail:
-- 'coach' (support <-> participant) and 'office' (support <-> back office).
-- The apps show a dot on the faith project when the other side has written
-- since then.

CREATE TABLE IF NOT EXISTS "FaithThreadRead" (
  "userId" UUID NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "participantId" UUID NOT NULL REFERENCES "Participant"(id) ON DELETE CASCADE,
  trail TEXT NOT NULL CHECK (trail IN ('coach', 'office')),
  "lastReadAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("userId", "participantId", trail)
);

ALTER TABLE "FaithThreadRead" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all operations" ON "FaithThreadRead";
CREATE POLICY "Allow all operations" ON "FaithThreadRead" FOR ALL USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE ON "FaithThreadRead" TO anon, authenticated;
