-- A lead can reach the sheet but miss a column, e.g. when a form question is
-- renamed and the sync settings weren't updated. That isn't a failure (the
-- lead is in the sheet), so it's recorded separately from sheetSyncError and
-- surfaced to operations.

ALTER TABLE "FollowUpContact"
  ADD COLUMN IF NOT EXISTS "sheetSyncWarning" TEXT;
