-- The application uses custom authentication and calls Supabase as anon.
-- Replace the initial auth.uid()-based policies with the established project
-- policy pattern so participant handover context remains available in-app.

DROP POLICY IF EXISTS "Admins read participant handovers" ON "ParticipantHandover";
DROP POLICY IF EXISTS "Assigned supports read participant handovers" ON "ParticipantHandover";
DROP POLICY IF EXISTS "Admins read participant notes" ON "ParticipantNote";
DROP POLICY IF EXISTS "Assigned supports read participant notes" ON "ParticipantNote";
DROP POLICY IF EXISTS "Assigned supports add attributed participant notes" ON "ParticipantNote";
DROP POLICY IF EXISTS "Allow all operations" ON "ParticipantHandover";
DROP POLICY IF EXISTS "Allow all operations" ON "ParticipantNote";

CREATE POLICY "Allow all operations" ON "ParticipantHandover" FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations" ON "ParticipantNote" FOR ALL USING (true) WITH CHECK (true);
