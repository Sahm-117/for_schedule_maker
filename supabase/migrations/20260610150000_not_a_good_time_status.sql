-- Add 'NOT_A_GOOD_TIME' to the FollowUpRegistrationStatus enum
-- Run in Supabase SQL editor (idempotent)

DO $$
BEGIN
  ALTER TYPE "FollowUpRegistrationStatus" ADD VALUE IF NOT EXISTS 'NOT_A_GOOD_TIME';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
