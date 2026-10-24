-- Optional context a support adds when they tap "Mark done" on a schedule activity.
ALTER TABLE "SupportActivityCompletion" ADD COLUMN IF NOT EXISTS note TEXT;
