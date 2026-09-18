-- Add 'LOGIN_SHARED' to the FollowUpRegistrationStatus enum
-- Registering is no longer the end of a follow-up: the prospect still needs
-- their app login handed to them. 'REGISTERED' now means "signed up, login
-- still to share"; 'LOGIN_SHARED' is what closes the loop.
-- Run in Supabase SQL editor (idempotent)

DO $$
BEGIN
  ALTER TYPE "FollowUpRegistrationStatus" ADD VALUE IF NOT EXISTS 'LOGIN_SHARED';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
