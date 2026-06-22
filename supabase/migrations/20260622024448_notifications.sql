-- In-app notification feed.
--
-- Push notifications (announcements, follow-up assignment/issue/terminal-status,
-- reminders) only reach users with data on and push granted. This table mirrors
-- every push as a persisted, per-user in-app notification so users who miss the
-- push still see an unread badge + feed when they next open the app.
--
-- Written by the same edge functions that send the push (additive — the push
-- path is unchanged). Read by the frontend notificationsApi.

CREATE TABLE IF NOT EXISTS "Notification" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  path TEXT,
  type TEXT NOT NULL DEFAULT 'GENERAL',
  "isRead" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Badge + feed query: a user's notifications newest-first, with unread filtered.
CREATE INDEX IF NOT EXISTS idx_notification_user_unread_created
  ON "Notification"("userId", "isRead", "createdAt" DESC);

ALTER TABLE "Notification" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations" ON "Notification" FOR ALL USING (true);

-- Live badge updates: surface row changes over the realtime channel the app
-- already subscribes to. Guarded so re-running the migration is safe.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'Notification'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE "Notification";
  END IF;
END $$;
