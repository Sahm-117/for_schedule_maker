-- Follow-up "no activity" nudges for supports.
--
-- A support who was given a contact 24 hours ago and has not moved its status
-- gets a nudge at 9am, 12pm, 4pm and 9pm (Lagos) -- see push-reminders. To know
-- that, the contact needs to remember when it was assigned and when its status
-- last moved:
--   ownerAssignedAt -- set whenever ownerId changes to someone (or is inserted
--                      with someone). Also backfilled once below, so the 24-hour
--                      clock for existing contacts starts when this goes live.
--   statusChangedAt -- set whenever messageStatus, replyStatus, callStatus,
--                      registrationStatus or nextAction changes. A trigger, so
--                      every route counts: the app, admins, and automatic
--                      changes like "Joined the app".
--
-- The nudges also stop once an issue is logged on the contact. An issue can now
-- be about several contacts, so FollowUpIssueContact links an issue to every
-- contact picked. FollowUpIssue."contactId" stays as the first one, so nothing
-- that reads it breaks. Backfilled from each existing issue's contactId.
--
-- Rollback: DROP TRIGGER followupcontact_track_activity ON "FollowUpContact";
-- DROP FUNCTION followupcontact_track_activity; DROP TABLE "FollowUpIssueContact";
-- ALTER TABLE "FollowUpContact" DROP COLUMN "ownerAssignedAt", DROP COLUMN "statusChangedAt";

ALTER TABLE public."FollowUpContact"
  ADD COLUMN IF NOT EXISTS "ownerAssignedAt" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "statusChangedAt" TIMESTAMPTZ;

-- Existing assigned contacts: the clock starts now, so day one has no burst.
UPDATE public."FollowUpContact"
SET "ownerAssignedAt" = NOW()
WHERE "ownerId" IS NOT NULL AND "ownerAssignedAt" IS NULL;

CREATE OR REPLACE FUNCTION public.followupcontact_track_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."ownerId" IS NOT NULL THEN
      NEW."ownerAssignedAt" := NOW();
    END IF;
    RETURN NEW;
  END IF;

  IF NEW."ownerId" IS NOT NULL AND NEW."ownerId" IS DISTINCT FROM OLD."ownerId" THEN
    NEW."ownerAssignedAt" := NOW();
  END IF;

  IF NEW."messageStatus" IS DISTINCT FROM OLD."messageStatus"
     OR NEW."replyStatus" IS DISTINCT FROM OLD."replyStatus"
     OR NEW."callStatus" IS DISTINCT FROM OLD."callStatus"
     OR NEW."registrationStatus" IS DISTINCT FROM OLD."registrationStatus"
     OR NEW."nextAction" IS DISTINCT FROM OLD."nextAction" THEN
    NEW."statusChangedAt" := NOW();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS followupcontact_track_activity ON public."FollowUpContact";
CREATE TRIGGER followupcontact_track_activity
  BEFORE INSERT OR UPDATE ON public."FollowUpContact"
  FOR EACH ROW EXECUTE FUNCTION public.followupcontact_track_activity();

-- One issue, several contacts. Same staff-only access as FollowUpIssue.
CREATE TABLE IF NOT EXISTS public."FollowUpIssueContact" (
  "issueId" UUID NOT NULL REFERENCES public."FollowUpIssue"(id) ON DELETE CASCADE,
  "contactId" UUID NOT NULL REFERENCES public."FollowUpContact"(id) ON DELETE CASCADE,
  PRIMARY KEY ("issueId", "contactId")
);
CREATE INDEX IF NOT EXISTS idx_followupissuecontact_contact ON public."FollowUpIssueContact"("contactId");

ALTER TABLE public."FollowUpIssueContact" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all operations" ON public."FollowUpIssueContact";
CREATE POLICY "Allow all operations" ON public."FollowUpIssueContact" FOR ALL
  USING (public.app_is_staff()) WITH CHECK (public.app_is_staff());

INSERT INTO public."FollowUpIssueContact" ("issueId", "contactId")
SELECT id, "contactId" FROM public."FollowUpIssue" WHERE "contactId" IS NOT NULL
ON CONFLICT DO NOTHING;
