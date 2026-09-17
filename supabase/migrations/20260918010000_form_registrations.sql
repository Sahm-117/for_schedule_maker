-- People who sign up on the Google Form, brought back into the app.
--
-- Until now the sheet only received: a support registered someone here and the
-- row was pushed out. That push is off. The form is what actually registers
-- someone, so submissions now travel the other way, and every support can see
-- who has signed up without asking the back office.
--
-- One row per form submission, kept as its own record rather than folded
-- straight into FollowUpContact, so a support can see the raw sign-up (and
-- what it was matched to) even when the matching goes wrong.
--
-- Born with app_is_staff() rather than USING(true): new tables join the
-- lockdown from the start instead of needing a later batch.

CREATE TABLE IF NOT EXISTS "SheetRegistration" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "fullName" TEXT NOT NULL,
  phone TEXT NOT NULL,
  -- E.164 where the number could be parsed; this is what matching uses.
  "phoneNormalised" TEXT,
  email TEXT,
  "signedUpAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Everything else the form collected, so a renamed question or a new field
  -- is never silently dropped on the floor.
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- What the sign-up was matched or attached to, and what was done about it.
  "contactId" UUID REFERENCES "FollowUpContact"(id) ON DELETE SET NULL,
  outcome TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (outcome IN ('PENDING', 'MATCHED', 'CREATED', 'DUPLICATE', 'FAILED')),
  "outcomeDetail" TEXT,
  -- Google's own response id, so a replayed submission can't double up.
  "sheetRowKey" TEXT UNIQUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sheetregistration_signedup ON "SheetRegistration"("signedUpAt" DESC);
CREATE INDEX IF NOT EXISTS idx_sheetregistration_phone ON "SheetRegistration"("phoneNormalised");

ALTER TABLE "SheetRegistration" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all operations" ON "SheetRegistration";
CREATE POLICY "Allow all operations" ON "SheetRegistration"
  FOR ALL USING (public.app_is_staff()) WITH CHECK (public.app_is_staff());

-- Every support reads these; only the edge function (service_role, which
-- bypasses RLS) writes them.
GRANT SELECT ON "SheetRegistration" TO anon, authenticated;
