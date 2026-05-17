-- Nuclear RLS reset — drops all existing policies on every table and recreates
-- a single clean "authenticated users only" policy per table.
-- This resolves conflicts left by partial runs of previous migrations.
-- Run manually in Supabase SQL Editor.

DO $$
DECLARE
  tbl TEXT;
  pol RECORD;
  tables TEXT[] := ARRAY[
    'Week','Day','Activity','ActivityLabel','Label',
    'User','UserLabel','PendingChange','RejectedChange',
    'PushSubscription','AppSetting','Announcement',
    'TelegramDigestLog','ActivityTeam','Team',
    'notification_settings','push_subscriptions'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    FOR pol IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = tbl
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol.policyname, tbl);
    END LOOP;
    EXECUTE format(
      'CREATE POLICY "Allow all operations" ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
      tbl
    );
  END LOOP;
END $$;

-- Resource: keep SELECT open, restrict writes to admin only
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'Resource'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON "Resource"', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "Resource: read" ON "Resource" FOR SELECT TO authenticated USING (true);
CREATE POLICY "Resource: insert" ON "Resource" FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'ADMIN'));
CREATE POLICY "Resource: delete" ON "Resource" FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'ADMIN'));
