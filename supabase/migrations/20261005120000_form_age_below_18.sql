-- The Google Form's youngest answer is "Below 18"; the app bucket is
-- "18 and below". Both age mappers dropped the form wording, so every
-- under-18 kept a blank age and the "18 and below" filter found nobody.
-- Map the form wording going forward and backfill the rows it missed.
-- Applied live 2026-10-05: 12 contacts and 12 participants set to
-- "18 and below"; the mapper now accepts the form wording going forward.

-- 1. Going forward: fill_profile_from_form accepts the form's wording.
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
BEGIN
  SELECT * INTO reg FROM "SheetRegistration" WHERE id = p_registration_id;
  IF reg.id IS NULL OR reg."contactId" IS NULL THEN RETURN; END IF;

  SELECT id INTO person_id FROM "Participant" WHERE "followUpContactId" = reg."contactId";
  IF person_id IS NULL THEN RETURN; END IF;

  a := COALESCE(reg.answers, '{}'::jsonb);
  v_email := NULLIF(trim(COALESCE(reg.email, a->>'Email Address', '')), '');
  v_gender := NULLIF(initcap(trim(COALESCE(a->>'What''s your Gender?', ''))), '');
  IF v_gender NOT IN ('Male', 'Female') THEN v_gender := NULL; END IF;
  -- The form has sent both "18-24" and "18 - 24"; the profile uses "18 - 24".
  -- Its youngest answer is "Below 18"; the profile uses "18 and below".
  v_age := NULLIF(regexp_replace(trim(COALESCE(a->>'Age Range?', '')), '\s*-\s*', ' - '), '');
  IF lower(v_age) IN ('below 18', 'under 18', 'under-18', 'under18', '<18', 'below18') THEN v_age := '18 and below'; END IF;
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

  UPDATE "Participant" SET
    email = COALESCE(NULLIF(trim(email), ''), v_email),
    gender = COALESCE(NULLIF(trim(gender), ''), v_gender),
    "ageRange" = COALESCE(NULLIF(trim("ageRange"), ''), v_age),
    occupation = COALESCE(NULLIF(trim(occupation), ''), v_occupation),
    "dateOfBirth" = COALESCE("dateOfBirth", v_dob),
    "smartRequest" = COALESCE(NULLIF(trim("smartRequest"), ''), v_smart),
    "updatedAt" = NOW()
  WHERE id = person_id;

  IF v_smart IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "FaithProject" WHERE "participantId" = person_id) THEN
    INSERT INTO "FaithProject" ("participantId", body, status)
    VALUES (person_id, v_smart, 'NOT_DRAFTED');
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.fill_profile_from_form(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fill_profile_from_form(UUID) TO service_role;

-- 2. Backfill contacts linked to a "Below 18" form (only blanks are touched).
UPDATE "FollowUpContact" c
SET "ageRange" = '18 and below', "updatedAt" = NOW()
WHERE NULLIF(trim(c."ageRange"), '') IS NULL
  AND EXISTS (
    SELECT 1 FROM "SheetRegistration" s
    WHERE s."contactId" = c.id
      AND lower(trim(s.answers->>'Age Range?')) IN ('below 18', 'under 18', 'under-18', 'under18', '<18', 'below18')
  );

-- 3. Backfill contacts with no linked form but a phone-matched "Below 18" form.
UPDATE "FollowUpContact" c
SET "ageRange" = '18 and below', "updatedAt" = NOW()
WHERE NULLIF(trim(c."ageRange"), '') IS NULL
  AND NOT EXISTS (SELECT 1 FROM "SheetRegistration" s WHERE s."contactId" = c.id)
  AND EXISTS (
    SELECT 1 FROM "SheetRegistration" s
    WHERE public.normalise_phone_digits(s.phone) IS NOT NULL
      AND public.normalise_phone_digits(s.phone) = public.normalise_phone_digits(c.phone)
      AND lower(trim(s.answers->>'Age Range?')) IN ('below 18', 'under 18', 'under-18', 'under18', '<18', 'below18')
  );

-- 4. Re-run the (now fixed) fill for every linked registration. COALESCE
-- keeps anything already entered; only blanks are filled.
SELECT public.fill_profile_from_form(id) FROM "SheetRegistration" WHERE "contactId" IS NOT NULL;
