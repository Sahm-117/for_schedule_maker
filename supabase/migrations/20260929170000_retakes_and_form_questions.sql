-- Retaking chip and sign-up form questions.
--
-- 1. Retakes. participant_retake_matches lists, for a cohort's participants,
--    any record in another cohort with the same phone number, and whether the
--    first name matches too. The app shows a "Retaking" chip (first name
--    matches) or "Shared number" chip (it doesn't), and tapping it says why.
--    A support or admin can answer "Same person, retaking" or "Different
--    person", or mark someone as retaking by hand with a reason (for example a
--    cohort from before the app). That answer is kept on the participant.
--
-- 2. Form questions. What someone wrote under "Any Other Questions or
--    Concerns?" on the sign-up form goes onto their follow-up contact, so the
--    support sees it on their card and can mark it answered. Answers like
--    "None", "Nil" or "No" are ignored. A new question from a later form is
--    added and makes it unanswered again.

-- 1 ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public."Participant"
  ADD COLUMN IF NOT EXISTS "retakeStatus" TEXT
    CHECK ("retakeStatus" IN ('CONFIRMED', 'NOT_SAME')),
  ADD COLUMN IF NOT EXISTS "retakeNote" TEXT,
  ADD COLUMN IF NOT EXISTS "retakeCheckedById" UUID REFERENCES public."User"(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "retakeCheckedAt" TIMESTAMPTZ;

-- Runs as the caller, so the Participant table's own access rule applies.
CREATE OR REPLACE FUNCTION public.participant_retake_matches(p_cohort_id UUID)
RETURNS TABLE (
  "participantId" UUID,
  "otherName" TEXT,
  "otherCohort" TEXT,
  "otherCohortStart" DATE,
  "sameFirstName" BOOLEAN
)
LANGUAGE sql
STABLE
AS $$
  SELECT p.id,
         o."fullName",
         c.name,
         c."startDate"::date,
         lower(split_part(btrim(p."fullName"), ' ', 1)) = lower(split_part(btrim(o."fullName"), ' ', 1))
  FROM "Participant" p
  JOIN "Participant" o
    ON public.fof_phone_key(o.phone) = public.fof_phone_key(p.phone)
   AND o.id <> p.id
   AND o."cohortId" IS DISTINCT FROM p."cohortId"
  JOIN "Cohort" c ON c.id = o."cohortId"
  WHERE p."cohortId" = p_cohort_id
    AND public.fof_phone_key(p.phone) IS NOT NULL
  ORDER BY p.id, c."startDate";
$$;

GRANT EXECUTE ON FUNCTION public.participant_retake_matches(UUID) TO anon, authenticated;

-- 2 ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public."FollowUpContact"
  ADD COLUMN IF NOT EXISTS "formQuestion" TEXT,
  ADD COLUMN IF NOT EXISTS "formQuestionAnsweredAt" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "formQuestionAnsweredById" UUID REFERENCES public."User"(id) ON DELETE SET NULL;

-- The question from a sign-up's answers, or NULL when it says nothing.
CREATE OR REPLACE FUNCTION public.form_question_text(p_answers JSONB)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN q IS NULL OR q = '' THEN NULL
    WHEN lower(regexp_replace(q, '[^[:alpha:] /]', '', 'g')) IN (
      'no', 'non', 'none', 'nil', 'nill', 'nothing', 'nope', 'na', 'n/a', 'nan',
      'no question', 'no questions', 'no concern', 'no concerns', 'not really',
      'none for now', 'nothing for now', 'no for now', 'not yet', 'nil for now'
    ) THEN NULL
    ELSE q
  END
  FROM (SELECT btrim(COALESCE(p_answers->>'Any Other Questions or Concerns? ', p_answers->>'Any Other Questions or Concerns?', '')) AS q) x;
$$;

-- Adds a sign-up's question to its contact once the sign-up is linked to one.
CREATE OR REPLACE FUNCTION public.sheet_registration_question()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  question TEXT := public.form_question_text(NEW.answers);
BEGIN
  IF NEW."contactId" IS NULL OR question IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD."contactId" IS NOT DISTINCT FROM NEW."contactId" THEN
    RETURN NEW;
  END IF;

  UPDATE "FollowUpContact"
     SET "formQuestion" = CASE
           WHEN "formQuestion" IS NULL OR btrim("formQuestion") = '' THEN question
           ELSE "formQuestion" || E'\n\n' || question
         END,
         "formQuestionAnsweredAt" = NULL,
         "formQuestionAnsweredById" = NULL
   WHERE id = NEW."contactId"
     AND position(question IN COALESCE("formQuestion", '')) = 0;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sheet_registration_question ON public."SheetRegistration";
CREATE TRIGGER sheet_registration_question
  AFTER INSERT OR UPDATE OF "contactId" ON public."SheetRegistration"
  FOR EACH ROW EXECUTE FUNCTION public.sheet_registration_question();

-- Bring in the questions from sign-ups already received, oldest first.
UPDATE "FollowUpContact" f
   SET "formQuestion" = q.questions
  FROM (
    SELECT r."contactId", string_agg(public.form_question_text(r.answers), E'\n\n' ORDER BY r."signedUpAt") AS questions
    FROM "SheetRegistration" r
    WHERE r."contactId" IS NOT NULL AND public.form_question_text(r.answers) IS NOT NULL
    GROUP BY r."contactId"
  ) q
 WHERE f.id = q."contactId"
   AND f."formQuestion" IS NULL;
