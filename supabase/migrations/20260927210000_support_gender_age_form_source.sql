-- Supports record their gender and age range (used when assigning follow-ups),
-- form sign-ups show "Reg form" as their source, and form answers also fill the
-- follow-up contact's gender / age / occupation.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS gender TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "ageRange" TEXT;
GRANT SELECT (gender, "ageRange") ON "User" TO anon, authenticated;
GRANT UPDATE (gender, "ageRange") ON "User" TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.safe_user_json(u "User")
 RETURNS json
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT json_build_object(
    'id', u.id,
    'name', u.name,
    'email', u.email,
    'phone', u.phone,
    'role', u.role,
    'isActive', u."isActive",
    'isCoordinator', u."isCoordinator",
    'avatarUrl', u."avatarUrl",
    'themeColor', u."themeColor",
    'whatsappGroupUrl', u."whatsappGroupUrl",
    'hubLastSeenAt', u."hubLastSeenAt",
    'onboardingCompleted', u."onboardingCompleted",
    'onboardingReplayCount', u."onboardingReplayCount",
    'onboardingLastReplayAt', u."onboardingLastReplayAt",
    'mustChangePassword', u."mustChangePassword",
    'gender', u.gender,
    'ageRange', u."ageRange",
    'createdAt', u."createdAt",
    'updatedAt', u."updatedAt"
  );
$function$;

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

  -- Their follow-up card shows gender and age too.
  UPDATE "FollowUpContact" SET
    email = COALESCE(NULLIF(trim(email), ''), v_email),
    gender = COALESCE(NULLIF(trim(gender), ''), v_gender),
    "ageRange" = COALESCE(NULLIF(trim("ageRange"), ''), v_age),
    occupation = COALESCE(NULLIF(trim(occupation), ''), v_occupation)
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

-- One-off: re-run for everyone already signed up (only fills empty fields).
SELECT public.fill_profile_from_form(id) FROM "SheetRegistration" WHERE "contactId" IS NOT NULL;
