-- Track whether a lead reached the Google Sheet.
--
-- The app is the source of truth: a lead is saved first, then sent on. These two
-- columns make a failure visible and let the daily job retry it instead of the
-- lead quietly never arriving.

ALTER TABLE "FollowUpContact"
  ADD COLUMN IF NOT EXISTS "sheetSyncedAt" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "sheetSyncError" TEXT;

-- Finds the ones still waiting to go across.
CREATE INDEX IF NOT EXISTS idx_followupcontact_sheet_pending
  ON "FollowUpContact" ("createdAt")
  WHERE "sheetSyncedAt" IS NULL AND "registeredById" IS NOT NULL;
