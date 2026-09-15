-- Support V2 follow-up: home screen announcements, weekly recap documents, cover assignment.
-- Additive and idempotent.

-- Announcements that also stay on the support Home screen until a date, with an optional link.
ALTER TABLE "Announcement"
  ADD COLUMN IF NOT EXISTS "showOnHome" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "homeUntil" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "linkUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "linkLabel" TEXT;

CREATE INDEX IF NOT EXISTS idx_announcement_home ON "Announcement"("showOnHome", "homeUntil");

-- Weekly recap document (usually a PDF) uploaded by the back office.
ALTER TABLE "Week"
  ADD COLUMN IF NOT EXISTS "recapDocumentUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "recapDocumentName" TEXT;

-- Cover requests: the back office assigns a covering support instead of approving/declining.
ALTER TABLE "CoverRequest"
  ADD COLUMN IF NOT EXISTS "coverSupportId" UUID REFERENCES "User"(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "assignedById" UUID REFERENCES "User"(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "assignedAt" TIMESTAMPTZ;

DO $$
DECLARE c TEXT;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = '"CoverRequest"'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE "CoverRequest" DROP CONSTRAINT %I', c);
  END LOOP;
END $$;

ALTER TABLE "CoverRequest"
  ADD CONSTRAINT "CoverRequest_status_check" CHECK (status IN ('PENDING', 'ASSIGNED'));

CREATE INDEX IF NOT EXISTS idx_coverrequest_cover_support ON "CoverRequest"("coverSupportId", "startsAt", "endsAt");
