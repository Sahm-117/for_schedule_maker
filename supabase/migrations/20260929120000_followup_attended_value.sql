-- ATTENDED: a contact from a prior cohort who turns out to have already
-- attended one. An admin picks that cohort on Follow-ups; the contact is filed
-- under it and closed (see 20260929121000_followup_attended.sql).
-- On its own because a new enum value can't be used in the same transaction
-- that adds it. Idempotent, same shape as
-- 20260928170000_followup_access_confirmed_values.sql.
--
-- Rollback: Postgres can't drop an enum value. Leaving it unused is harmless.

DO $$
BEGIN
  ALTER TYPE "FollowUpRegistrationStatus" ADD VALUE IF NOT EXISTS 'ATTENDED';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
