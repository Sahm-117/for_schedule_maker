-- Restore what 20261005120000_form_age_below_18.sql dropped when it rewrote
-- fill_profile_from_form: a form sign-up's gender, age range, occupation and
-- email were no longer copied onto the follow-up contact (the card supports
-- see), "Who Registered You for FOF?" was no longer matched to a support, and
-- the participant was no longer marked as coming from the form. Participants
-- kept getting their profile; only the contact side stopped.
-- Everything is filled only where blank, so re-running is safe. The rest of the
-- function is the live definition unchanged (age wording, teen handover).
CREATE OR REPLACE FUNCTION public.fill_profile_from_form(p_registration_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
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
  v_final_age TEXT;
  v_prev_owner UUID;
  v_prev_name TEXT;
  v_registered_by_raw TEXT;
  v_registered_by_id UUID;
BEGIN
  SELECT * INTO reg FROM "SheetRegistration" WHERE id = p_registration_id;
  IF reg.id IS NULL OR reg."contactId" IS NULL THEN RETURN; END IF;

  SELECT id INTO person_id FROM "Participant" WHERE "followUpContactId" = reg."contactId";
  IF person_id IS NULL THEN RETURN; END IF;

  a := COALESCE(reg.answers, '{}'::jsonb);
  v_email := NULLIF(trim(COALESCE(reg.email, a->>'Email Address', '')), '');
  v_gender := NULLIF(initcap(trim(COALESCE(a->>'What''s your Gender?', ''))), '');
  IF v_gender NOT IN ('Male', 'Female') THEN v_gender := NULL; END IF;
  v_age := NULLIF(regexp_replace(trim(COALESCE(a->>'Age Range?', '')), '\s*-\s*', ' - '), '');
  IF lower(v_age) IN ('below 18', 'under 18', 'under-18', 'under18', '<18', 'below18', '18 and below', '18 & below', '18 and under', '18 & under') THEN v_age := '18 and below'; END IF;
  -- The form's older "18 - 24" answer is the "19 - 24" bucket now (18 is "18 and below").
  IF v_age = '18 - 24' THEN v_age := '19 - 24'; END IF;
  IF v_age NOT IN ('18 and below', '19 - 24', '25 - 34', '35 - 44', '45 - 59', '60 and above') THEN v_age := NULL; END IF;
  v_occupation := NULLIF(trim(COALESCE(NULLIF(trim(a->>'What''s your occupation?'), ''), a->>'Occupation', '')), '');
  v_dob_text := trim(COALESCE(a->>'Date of birth', ''));
  BEGIN
    IF v_dob_text ~ '^\d{4}-\d{2}-\d{2}$' THEN
      v_dob := v_dob_text::date;
    ELSIF v_dob_text ~ '^\d{1,2}/\d{1,2}/\d{4}$' THEN
      v_dob := to_date(v_dob_text, 'MM/DD/YYYY');
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_dob := NULL;
  END;
  IF v_dob IS NOT NULL AND (v_dob > CURRENT_DATE OR v_dob < DATE '1900-01-01') THEN v_dob := NULL; END IF;
  v_smart := NULLIF(trim(COALESCE(a->>'SMART REQUEST (One major prayer request or goal you want answered or achieved within the next three months)', '')), '');

  -- "Who Registered You for FOF?" -- ignore blank / just a stray comma, then
  -- collapse any comma-joined name pieces to a single space before matching.
  -- Ambiguous (more than one active support/admin with this exact name)
  -- resolves to nobody rather than guessing.
  v_registered_by_raw := trim(COALESCE(a->>'Who Registered You for FOF?', ''));
  IF v_registered_by_raw IN ('', ',') THEN
    v_registered_by_raw := NULL;
  ELSE
    v_registered_by_raw := NULLIF(trim(regexp_replace(v_registered_by_raw, '\s*,\s*', ' ', 'g')), '');
  END IF;
  v_registered_by_id := NULL;
  IF v_registered_by_raw IS NOT NULL THEN
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

  UPDATE "Participant" SET
    email = COALESCE(NULLIF(trim(email), ''), v_email),
    gender = COALESCE(NULLIF(trim(gender), ''), v_gender),
    "ageRange" = COALESCE(NULLIF(trim("ageRange"), ''), v_age),
    occupation = COALESCE(NULLIF(trim(occupation), ''), v_occupation),
    "dateOfBirth" = COALESCE("dateOfBirth", v_dob),
    "smartRequest" = COALESCE(NULLIF(trim("smartRequest"), ''), v_smart),
    "updatedAt" = NOW()
  WHERE id = person_id;

  -- Teens (18 and below) become TEENAGER, but only while the switch is on and
  -- only from plain REGISTERED, so a closed or later status is never overridden.
  -- Uses the age now on the profile, so a date of birth wins over the form's range.
  SELECT "ageRange" INTO v_final_age FROM "Participant" WHERE id = person_id;
  IF replace(lower(COALESCE(v_final_age, '')), ' ', '') = '18andbelow'
     AND COALESCE((SELECT value = to_jsonb(true) FROM "AppSetting" WHERE "settingKey" = 'teen_flow_enabled'), false) THEN
    -- A support who already holds them (they were saved as a prospect first) loses
    -- them to a Teen Support: clear the owner so assign_teen_contacts can place them,
    -- and tell that support instead of letting the teen vanish from their list.
    SELECT c."ownerId", u.name INTO v_prev_owner, v_prev_name
    FROM "FollowUpContact" c LEFT JOIN "User" u ON u.id = c."ownerId"
    WHERE c.id = reg."contactId" AND c."registrationStatus" = 'REGISTERED' AND c."ownerId" IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM "SupportTagMember" m JOIN "SupportTag" t ON t.id = m."tagId" AND t."systemKey" = 'TEEN_SUPPORT'
        WHERE m."userId" = c."ownerId");
    UPDATE "FollowUpContact"
    SET "registrationStatus" = 'TEENAGER'::"FollowUpRegistrationStatus",
        "ageRange" = '18 and below',
        "ownerId" = CASE WHEN v_prev_owner IS NOT NULL THEN NULL ELSE "ownerId" END,
        "updatedAt" = NOW()
    WHERE id = reg."contactId" AND "registrationStatus" = 'REGISTERED';
    IF v_prev_owner IS NOT NULL THEN
      INSERT INTO "Notification" ("userId", title, body, path, type)
      VALUES (v_prev_owner, 'A teen moved to a Teen Support',
              reg."fullName" || ' signed up as a teen, so they now go to a Teen Support and are off your list.',
              '/support/mobilisation?tab=follow', 'FOLLOWUP_ASSIGNMENT');
    END IF;
  END IF;

  -- People the form created (not ones a support added first) came from the form.
  UPDATE "Participant" p SET source = 'FORM'
  FROM "FollowUpContact" c
  WHERE p.id = person_id AND c.id = reg."contactId" AND c.source = 'Google Form' AND p.source = 'FOLLOW_UP';

  IF v_smart IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "FaithProject" WHERE "participantId" = person_id) THEN
    INSERT INTO "FaithProject" ("participantId", body, status)
    VALUES (person_id, v_smart, 'NOT_DRAFTED');
  END IF;
END;
$function$;


-- Re-run for the sign-ups made since the block went missing.
SELECT public.fill_profile_from_form(id) FROM "SheetRegistration"
WHERE "contactId" IS NOT NULL AND "createdAt" >= TIMESTAMPTZ '2026-10-05 00:00:00+00';
