-- The Google Form asks "Who Registered You for FOF?" -- when that names a
-- support, it means the same thing "registeredById" already records for
-- someone a support saves from Mobilisation: who brought this person in. Follow-up
-- auto-assignment (see 20260928160000_followup_auto_assignment.sql) uses that
-- to offer the prospect back to the support who introduced them.
--
-- Blank answers, or a lone ", " (both name parts empty), are ignored. A name
-- that doesn't exactly match exactly one active support/admin is left
-- unset rather than guessed -- the fuzzy-matching this would need doesn't
-- exist anywhere else in the app, so an unmatched name just means no
-- "added by" support, and the fewest-open-follow-ups rule decides instead.
CREATE OR REPLACE FUNCTION public.fill_profile_from_form(p_registration_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  reg "SheetRegistration";
  person_id UUID;
  a JSONB;
  v_email TEXT;
  v_gender TEXT;
  v_age TEXT;
  v_occupation TEXT;
  v_dob_text TEXT;
  v_dob DATE;
  v_smart TEXT;
  v_registered_by_raw TEXT;
  v_registered_by_id UUID;
BEGIN
  SELECT * INTO reg FROM "SheetRegistration" WHERE id = p_registration_id;
  IF reg.id IS NULL OR reg."contactId" IS NULL THEN RETURN; END IF;

  a := COALESCE(reg.answers, '{}'::jsonb);
  v_email := NULLIF(trim(COALESCE(reg.email, a->>'Email Address', '')), '');
  v_gender := NULLIF(initcap(trim(COALESCE(a->>'What''s your Gender?', ''))), '');
  IF v_gender NOT IN ('Male', 'Female') THEN v_gender := NULL; END IF;
  -- The form has sent both "18-24" and "18 - 24"; the profile uses "18 - 24".
  v_age := NULLIF(regexp_replace(trim(COALESCE(a->>'Age Range?', '')), '\s*-\s*', ' - '), '');
  IF v_age NOT IN ('18 and below', '18 - 24', '25 - 34', '35 - 44', '45 - 59', '60 and above') THEN v_age := NULL; END IF;
  v_occupation := NULLIF(trim(COALESCE(NULLIF(trim(a->>'What''s your occupation?'), ''), a->>'Occupation', '')), '');
  v_dob_text := trim(COALESCE(a->>'Date of birth', ''));
  BEGIN
    IF v_dob_text ~ '^\d{4}-\d{2}-\d{2}$' THEN
      v_dob := v_dob_text::date;
    ELSIF v_dob_text ~ '^\d{1,2}/\d{1,2}/\d{4}$' THEN
      -- Google Forms sends dates the same way as its Timestamp column: M/D/YYYY.
      v_dob := to_date(v_dob_text, 'MM/DD/YYYY');
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_dob := NULL;
  END;
  IF v_dob IS NOT NULL AND (v_dob > CURRENT_DATE OR v_dob < DATE '1900-01-01') THEN v_dob := NULL; END IF;
  v_smart := NULLIF(trim(COALESCE(a->>'SMART REQUEST (One major prayer request or goal you want answered or achieved within the next three months)', '')), '');

  -- "Who Registered You for FOF?" -- ignore blank / just a stray comma, then
  -- collapse any comma-joined name pieces to a single space before matching.
  v_registered_by_raw := trim(COALESCE(a->>'Who Registered You for FOF?', ''));
  IF v_registered_by_raw IN ('', ',') THEN
    v_registered_by_raw := NULL;
  ELSE
    v_registered_by_raw := NULLIF(trim(regexp_replace(v_registered_by_raw, '\s*,\s*', ' ', 'g')), '');
  END IF;
  v_registered_by_id := NULL;
  IF v_registered_by_raw IS NOT NULL THEN
    -- Ambiguous (more than one active support/admin with this exact name)
    -- resolves to nobody rather than guessing: the HAVING only lets a
    -- single-match group through, and array_agg's first element is that match.
    SELECT (array_agg(u.id))[1] INTO v_registered_by_id
    FROM "User" u
    WHERE u.role IN ('SUPPORT', 'ADMIN')
      AND u."isActive" IS NOT FALSE
      AND lower(trim(u.name)) = lower(v_registered_by_raw)
    HAVING COUNT(*) = 1;
  END IF;

  -- Their follow-up card shows gender and age too.
  UPDATE "FollowUpContact" SET
    email = COALESCE(NULLIF(trim(email), ''), v_email),
    gender = COALESCE(NULLIF(trim(gender), ''), v_gender),
    "ageRange" = COALESCE(NULLIF(trim("ageRange"), ''), v_age),
    occupation = COALESCE(NULLIF(trim(occupation), ''), v_occupation),
    "registeredById" = COALESCE("registeredById", v_registered_by_id)
  WHERE id = reg."contactId";

  SELECT id INTO person_id FROM "Participant" WHERE "followUpContactId" = reg."contactId";
  IF person_id IS NULL THEN RETURN; END IF;

  UPDATE "Participant" SET
    email = COALESCE(NULLIF(trim(email), ''), v_email),
    gender = COALESCE(NULLIF(trim(gender), ''), v_gender),
    "ageRange" = COALESCE(NULLIF(trim("ageRange"), ''), v_age),
    occupation = COALESCE(NULLIF(trim(occupation), ''), v_occupation),
    "dateOfBirth" = COALESCE("dateOfBirth", v_dob),
    "smartRequest" = COALESCE(NULLIF(trim("smartRequest"), ''), v_smart),
    "updatedAt" = NOW()
  WHERE id = person_id;

  -- People the form created (not ones a support added first) came from the form.
  UPDATE "Participant" p SET source = 'FORM'
  FROM "FollowUpContact" c
  WHERE p.id = person_id AND c.id = reg."contactId" AND c.source = 'Google Form' AND p.source = 'FOLLOW_UP';

  IF v_smart IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "FaithProject" WHERE "participantId" = person_id) THEN
    INSERT INTO "FaithProject" ("participantId", body, status)
    VALUES (person_id, v_smart, 'NOT_DRAFTED');
  END IF;
END;
$$;

-- One-off: apply the new "Who Registered You for FOF?" matching to every
-- sign-up already linked to a contact. Everything else this function fills
-- only touches blanks, so re-running it is safe.
SELECT public.fill_profile_from_form(id) FROM "SheetRegistration" WHERE "contactId" IS NOT NULL;
