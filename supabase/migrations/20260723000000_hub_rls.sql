-- Enable RLS on Hub tables. These were created without RLS in
-- 20260622150000_hub.sql and 20260624180000_hub_reactions.sql, leaving them
-- publicly readable/writable (flagged by Supabase's security advisor).
-- Follows the same permissive-policy convention as every other table
-- (e.g. "Notification" in 20260622024448_notifications.sql) — auth is
-- enforced at the app layer, not via per-role Postgres policies.

ALTER TABLE "HubTopic" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "HubComment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "HubReply" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "HubReaction" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations" ON "HubTopic" FOR ALL USING (true);
CREATE POLICY "Allow all operations" ON "HubComment" FOR ALL USING (true);
CREATE POLICY "Allow all operations" ON "HubReply" FOR ALL USING (true);
CREATE POLICY "Allow all operations" ON "HubReaction" FOR ALL USING (true);
