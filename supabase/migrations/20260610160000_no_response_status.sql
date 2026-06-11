-- Add 'NO_RESPONSE' to the FollowUpRegistrationStatus enum
-- Run in Supabase SQL editor (idempotent)

DO $$
BEGIN
  ALTER TYPE "FollowUpRegistrationStatus" ADD VALUE IF NOT EXISTS 'NO_RESPONSE';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
