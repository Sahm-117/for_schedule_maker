-- Two new follow-up steps after the login is sent (see
-- 20260928180000_followup_access_confirmed.sql for what uses them):
--   ACCESS_CONFIRMED -- they signed in to the app. This, not LOGIN_SHARED, now
--                       closes a successful follow-up.
--   LOGIN_ISSUE      -- they can't get in; stays open, alerts admins + IT Support.
-- On its own because a new enum value can't be used in the same transaction
-- that adds it. Idempotent, same shape as 20260918120000_login_shared_status.sql.
--
-- Rollback: Postgres can't drop an enum value. Leaving them unused is harmless.

DO $$
BEGIN
  ALTER TYPE "FollowUpRegistrationStatus" ADD VALUE IF NOT EXISTS 'ACCESS_CONFIRMED';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TYPE "FollowUpRegistrationStatus" ADD VALUE IF NOT EXISTS 'LOGIN_ISSUE';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
