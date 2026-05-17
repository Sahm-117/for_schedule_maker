-- Announcements: admin-broadcast messages sent as push notifications.
CREATE TABLE IF NOT EXISTS "Announcement" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  "sentAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "sentBy" UUID REFERENCES "User"(id) ON DELETE SET NULL
);

ALTER TABLE "Announcement" ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read announcement history
CREATE POLICY "Allow read" ON "Announcement" FOR SELECT USING (true);
