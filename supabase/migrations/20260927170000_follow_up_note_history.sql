-- Follow-up note history: who wrote each note on a contact, and when.
--
-- A contact still has one "notes" field (every screen keeps reading and writing
-- it as before). A trigger copies each new or changed note into
-- FollowUpNoteHistory with the signed-in person and the time, so every save
-- path — the note popup, the contact form, the Not interested popup — is
-- recorded without changing those screens.
--
-- Existing notes are copied in as "imported" rows. Their exact date was never
-- stored, so the contact's last contact date (or the day it was added) is used.
-- The 8 First Timers Hangout contacts from June 2026 were reopened for
-- Cohort 10 on 27 Sep: their June note is credited to the support who followed
-- them up then, and the 27 Sep reopening line becomes its own entry.

CREATE TABLE IF NOT EXISTS "FollowUpNoteHistory" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "contactId" UUID NOT NULL REFERENCES "FollowUpContact"(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  "authorId" UUID REFERENCES "User"(id) ON DELETE SET NULL,
  "authorLabel" TEXT,
  imported BOOLEAN NOT NULL DEFAULT FALSE,
  "notedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_followupnotehistory_contact ON "FollowUpNoteHistory"("contactId", "notedAt" DESC);

ALTER TABLE "FollowUpNoteHistory" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "FollowUpNoteHistory" FROM anon, authenticated;
GRANT SELECT ON "FollowUpNoteHistory" TO anon, authenticated;
DROP POLICY IF EXISTS "Staff read note history" ON "FollowUpNoteHistory";
CREATE POLICY "Staff read note history" ON "FollowUpNoteHistory"
  FOR SELECT USING (public.app_is_staff());

-- ── Record every note save ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.record_follow_up_note()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NULLIF(btrim(COALESCE(NEW.notes, '')), '') IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.notes IS NOT DISTINCT FROM OLD.notes THEN
    RETURN NEW;
  END IF;
  INSERT INTO "FollowUpNoteHistory" ("contactId", body, "authorId")
  VALUES (NEW.id, NEW.notes, public.app_current_user_id());
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_record_follow_up_note ON "FollowUpContact";
CREATE TRIGGER trg_record_follow_up_note
  AFTER INSERT OR UPDATE OF notes ON "FollowUpContact"
  FOR EACH ROW EXECUTE FUNCTION public.record_follow_up_note();

-- ── Backfill ────────────────────────────────────────────────────────────────
DO $backfill$
DECLARE
  -- June 2026 First Timers Hangout contacts → the support who followed them up.
  june CONSTANT JSONB := '{
    "92bf1096-98d5-4b03-88ca-dc676fc20608": "9de40ce8-e924-4bea-9121-1bef71dfec83",
    "cede05dc-4272-4213-bfbb-cdaa459c2b8e": "9de40ce8-e924-4bea-9121-1bef71dfec83",
    "8da3ff74-82be-4359-a6ad-3571ba3dd748": "9de40ce8-e924-4bea-9121-1bef71dfec83",
    "9b4ccd3c-04d2-4733-ac36-483ed76c4938": "9de40ce8-e924-4bea-9121-1bef71dfec83",
    "90e30f5f-0159-4e6b-bc8e-22c9605b518a": "9de40ce8-e924-4bea-9121-1bef71dfec83",
    "5a2c26e4-d4c5-4755-9a6d-d36e78f75da9": "0324523f-ee1f-4edf-94de-074d1759e6e8",
    "82b1542e-ba50-4879-b89f-86aafb97faec": "0324523f-ee1f-4edf-94de-074d1759e6e8",
    "4dcc8abc-9ce8-46ff-93e8-4536add107ef": "0324523f-ee1f-4edf-94de-074d1759e6e8"
  }';
  c RECORD;
  split_at INT;
  earlier TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM "FollowUpNoteHistory" WHERE imported) THEN
    RETURN; -- already backfilled
  END IF;

  FOR c IN
    SELECT id, notes, "ownerId", "registeredById", "lastContactDate", "createdAt"
    FROM "FollowUpContact"
    WHERE NULLIF(btrim(COALESCE(notes, '')), '') IS NOT NULL
  LOOP
    IF june ? c.id::text THEN
      split_at := position(E'\n\nEarlier note: ' IN c.notes);
      earlier := CASE WHEN split_at > 0 THEN substring(c.notes FROM split_at + 16) ELSE c.notes END;
      INSERT INTO "FollowUpNoteHistory" ("contactId", body, "authorId", imported, "notedAt")
      VALUES (c.id, earlier, (june ->> c.id::text)::uuid, TRUE, COALESCE(c."lastContactDate"::timestamptz, c."createdAt"));
      IF split_at > 0 THEN
        INSERT INTO "FollowUpNoteHistory" ("contactId", body, "authorLabel", imported, "notedAt")
        VALUES (c.id, left(c.notes, split_at - 1), 'FOF Ops', TRUE, '2026-09-27 09:00:00+01');
      END IF;
    ELSE
      INSERT INTO "FollowUpNoteHistory" ("contactId", body, "authorId", imported, "notedAt")
      VALUES (c.id, c.notes, COALESCE(c."registeredById", c."ownerId"), TRUE, COALESCE(c."lastContactDate"::timestamptz, c."createdAt"));
    END IF;
  END LOOP;
END;
$backfill$;
