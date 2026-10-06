-- Teen statuses. TEENAGER: a registered teen (18 and below) waiting for their
-- Teen Support to make contact. TEEN_ONBOARDED: contact made and they are in
-- the WhatsApp group (see 20261006161000_teen_support_tag.sql).
-- On their own because a new enum value can't be used in the same transaction
-- that adds it. Idempotent, same shape as 20260929120000_followup_attended_value.sql.
--
-- Rollback: Postgres can't drop an enum value. Leaving them unused is harmless.

DO $$
BEGIN
  ALTER TYPE "FollowUpRegistrationStatus" ADD VALUE IF NOT EXISTS 'TEENAGER';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TYPE "FollowUpRegistrationStatus" ADD VALUE IF NOT EXISTS 'TEEN_ONBOARDED';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
