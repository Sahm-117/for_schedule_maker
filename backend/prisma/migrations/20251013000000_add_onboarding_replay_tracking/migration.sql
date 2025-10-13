-- AlterTable: Add onboarding replay tracking fields
-- Safe migration: Uses IF NOT EXISTS to prevent errors if columns already exist

DO $$
BEGIN
    -- Add onboardingReplayCount if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'User' AND column_name = 'onboardingReplayCount'
    ) THEN
        ALTER TABLE "User" ADD COLUMN "onboardingReplayCount" INTEGER NOT NULL DEFAULT 0;
    END IF;

    -- Add onboardingLastReplayAt if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'User' AND column_name = 'onboardingLastReplayAt'
    ) THEN
        ALTER TABLE "User" ADD COLUMN "onboardingLastReplayAt" TIMESTAMP(3);
    END IF;
END $$;
