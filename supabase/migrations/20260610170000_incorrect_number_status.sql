-- Add 'INCORRECT_NUMBER' to the FollowUpReplyStatus and FollowUpCallStatus enums
-- Run in Supabase SQL editor (idempotent)

DO $$
BEGIN
  ALTER TYPE "FollowUpReplyStatus" ADD VALUE IF NOT EXISTS 'INCORRECT_NUMBER';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TYPE "FollowUpCallStatus" ADD VALUE IF NOT EXISTS 'INCORRECT_NUMBER';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
