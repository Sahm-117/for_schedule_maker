-- Remove the Telegram daily-digest feature.
--
-- The digest bot is no longer used. Removed alongside this migration:
--   * pg_cron job `telegram_daily_digest_0520_lagos` (unscheduled)
--   * edge functions `telegram-daily-digest` and `notify-telegram` (deleted)
--   * the admin Daily Digest controls and frontend digest APIs
--   * scripts/assign-telegram-rota.js
--
-- Note: the word "Telegram" still legitimately appears in ~134 Activity
-- descriptions ("Post Focus Person (Telegram)", "Prayer Watch Lead: Telegram
-- 1/2/3") and is still rendered with an icon by ActivityText.tsx. That is
-- programme content describing where a task happens, unrelated to the bot, and
-- is intentionally left untouched.
--
-- Runs after 20260517000005_security_hardening.sql and 20260517000006_rls_reset.sql,
-- both of which reference "TelegramDigestLog" in their historical statements.

DROP TABLE IF EXISTS "TelegramDigestLog";

DELETE FROM "AppSetting"
WHERE "settingKey" IN ('daily_digest_enabled', 'daily_digest_cursor');
