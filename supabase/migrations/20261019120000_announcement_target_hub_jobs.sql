-- Remember which hub roles an announcement was sent to (Hub Leads, Recap Leads, ...), so the
-- feed can say "For Hub Leads" and nobody mistakes it for a general announcement.
-- Additive and nullable: older announcements stay blank.
ALTER TABLE public."Announcement"
  ADD COLUMN IF NOT EXISTS "targetHubJobs" TEXT[];

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Announcement_targetHubJobs_check') THEN
    ALTER TABLE public."Announcement" ADD CONSTRAINT "Announcement_targetHubJobs_check"
      CHECK ("targetHubJobs" IS NULL OR "targetHubJobs" <@ ARRAY['HUB_LEAD', 'ASSISTANT_HUB_LEAD', 'RECAP_LEAD', 'PRAYER_LEAD', 'IT_SUPPORT']::TEXT[]);
  END IF;
END $$;
