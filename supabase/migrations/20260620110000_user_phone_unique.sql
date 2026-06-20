-- Prevent duplicate phone-only user accounts.
--
-- The User table only had a unique constraint on email, but SUPPORT users are
-- created phone-only (email null), so the same phone could be registered twice.
-- That caused real lockouts: authApi.login matched two rows and failed. This
-- partial unique index closes the gap (NULL phones are unaffected, so accounts
-- without a phone are still allowed).
--
-- NOTE: any existing duplicate phones must be removed BEFORE this runs, or index
-- creation fails. The known duplicate (one support user) was merged first.

CREATE UNIQUE INDEX IF NOT EXISTS uniq_user_phone
  ON "User"(phone)
  WHERE phone IS NOT NULL;
