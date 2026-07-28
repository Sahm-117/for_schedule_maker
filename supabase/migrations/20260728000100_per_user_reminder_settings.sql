-- Per-user reminder timings.
--
-- Why: the reminder-timing picker lives on each support's own profile page, but
-- it read and wrote a single global AppSetting row ('remind_before_minutes').
-- One support changing their timings therefore changed them for all 20 users,
-- last-write-wins. Nobody noticed because reminders had never actually fired
-- (see 20260728000000_push_reminders_cron_and_dedupe.sql).
--
-- Default is a single reminder an hour ahead: users opt IN to extra nudges
-- rather than having to switch unwanted ones off. Keep this default in sync with
-- DEFAULT_REMIND_BEFORE_MINUTES in frontend/src/services/supabase-api.ts and in
-- supabase/functions/push-reminders/index.ts.
--
-- An empty array is meaningful and must be preserved: it means "no reminders".
-- Only a MISSING row falls back to the default.

CREATE TABLE IF NOT EXISTS "UserNotificationSetting" (
  "userId" UUID PRIMARY KEY REFERENCES "User"(id) ON DELETE CASCADE,
  "remindBeforeMinutes" JSONB NOT NULL DEFAULT '[60]'::jsonb,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Custom auth (not Supabase Auth), so auth.uid() is null and the policy must be
-- permissive, consistent with the rest of this schema.
ALTER TABLE "UserNotificationSetting" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all operations" ON "UserNotificationSetting";
CREATE POLICY "Allow all operations" ON "UserNotificationSetting" FOR ALL USING (true);

-- The old global key is intentionally left in AppSetting rather than migrated
-- into every user's row: copying it would opt all 20 users into 4 reminders per
-- activity, which is the outcome this change exists to avoid. It is now unused
-- by the reminder path and can be deleted once nothing else reads it.
