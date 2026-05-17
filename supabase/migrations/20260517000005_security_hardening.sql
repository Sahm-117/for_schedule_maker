-- Security hardening migration
-- Run in Supabase SQL Editor

-- Fix function search_path vulnerability
ALTER FUNCTION public.update_updated_at_column() SET search_path = public, pg_temp;

-- Enable RLS on tables missing it (shown as critical in Supabase advisor)
ALTER TABLE IF EXISTS "ActivityTeam" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "Team" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated access" ON "ActivityTeam";
CREATE POLICY "Authenticated access" ON "ActivityTeam"
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated access" ON "Team";
CREATE POLICY "Authenticated access" ON "Team"
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Harden overly permissive policies — require authenticated role
-- This blocks unauthenticated (anon) clients from writing to any table.

DROP POLICY IF EXISTS "Allow all operations" ON "Activity";
CREATE POLICY "Allow all operations" ON "Activity"
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all operations" ON "ActivityLabel";
CREATE POLICY "Allow all operations" ON "ActivityLabel"
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow insert" ON "Announcement";
CREATE POLICY "Allow insert" ON "Announcement"
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all operations" ON "AppSetting";
CREATE POLICY "Allow all operations" ON "AppSetting"
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all operations" ON "Day";
CREATE POLICY "Allow all operations" ON "Day"
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all operations" ON "Label";
CREATE POLICY "Allow all operations" ON "Label"
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all operations" ON "PendingChange";
CREATE POLICY "Allow all operations" ON "PendingChange"
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all operations" ON "PushSubscription";
CREATE POLICY "Allow all operations" ON "PushSubscription"
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all operations" ON "RejectedChange";
CREATE POLICY "Allow all operations" ON "RejectedChange"
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all operations" ON "TelegramDigestLog";
CREATE POLICY "Allow all operations" ON "TelegramDigestLog"
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all operations" ON "User";
CREATE POLICY "Allow all operations" ON "User"
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all operations" ON "UserLabel";
CREATE POLICY "Allow all operations" ON "UserLabel"
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all operations" ON "Week";
CREATE POLICY "Allow all operations" ON "Week"
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Tighten Resource write operations to admin-only
DROP POLICY IF EXISTS "Anyone can delete resources" ON "Resource";
DROP POLICY IF EXISTS "Anyone can insert resources" ON "Resource";

CREATE POLICY "Admins can insert resources" ON "Resource"
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'ADMIN')
  );

CREATE POLICY "Admins can delete resources" ON "Resource"
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'ADMIN')
  );

-- Fix tables with RLS enabled but no policies (blocked all access)
DROP POLICY IF EXISTS "Authenticated access" ON notification_settings;
CREATE POLICY "Authenticated access" ON notification_settings
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated access" ON push_subscriptions;
CREATE POLICY "Authenticated access" ON push_subscriptions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- NOTE: pg_net extension in public schema cannot be safely moved via migration.
-- To resolve that warning: Supabase Dashboard → Database → Extensions → pg_net → move to 'extensions' schema.
-- Low risk as pg_net is only invoked by edge functions using the service role key.
