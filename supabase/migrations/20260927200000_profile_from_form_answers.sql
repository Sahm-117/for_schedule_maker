-- Form sign-ups fill the participant's profile from their registration form
-- answers, so they don't type it all again. Only empty fields are filled;
-- anything the participant or a support already entered is kept.
--
-- The SMART request becomes a draft faith project (only if they have none yet),
-- and participant_faith reports `fromForm` while that draft is still exactly
-- what they wrote on the form, so the Faith Project page can say so.

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

CREATE OR REPLACE FUNCTION public.participant_faith(p_token TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  person_id UUID := public.app_participant_id(p_token);
  result JSON;
BEGIN
  IF person_id IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;

  result := json_build_object(
    'project', (
      SELECT json_build_object('id', f.id, 'body', f.body, 'status', f.status, 'updatedAt', f."updatedAt", 'sharedForPrayer', f."sharedForPrayer",
        'fromForm', f.status = 'NOT_DRAFTED' AND f.body IS NOT NULL AND EXISTS (
          SELECT 1 FROM "SheetRegistration" s
          JOIN "Participant" p ON p."followUpContactId" = s."contactId"
          WHERE p.id = person_id
            AND trim(s.answers->>'SMART REQUEST (One major prayer request or goal you want answered or achieved within the next three months)') = f.body
        ))
      FROM "FaithProject" f WHERE f."participantId" = person_id
      ORDER BY f."updatedAt" DESC LIMIT 1
    ),
    'deadlineAt', (
      SELECT s."deadlineAt" FROM "FaithProjectSetting" s
      JOIN "Participant" p ON p."cohortId" = s."cohortId"
      WHERE p.id = person_id
    ),
    'trail', COALESCE((
      SELECT json_agg(json_build_object(
        'id', n.id, 'body', n.body, 'createdAt', n."createdAt", 'byParticipant', n."byParticipant", 'authorName', u.name
      ) ORDER BY n."createdAt")
      FROM "ParticipantNote" n LEFT JOIN "User" u ON u.id = n."authorId"
      WHERE n."participantId" = person_id AND n."noteType" = 'FAITH_COACH'
    ), '[]'::json),
    'openHelpRequest', (
      SELECT json_build_object(
        'id', h.id, 'reason', h.reason, 'note', h.note, 'wantsContact', h."wantsContact", 'createdAt', h."createdAt"
      )
      FROM "FaithHelpRequest" h
      WHERE h."participantId" = person_id AND h."resolvedAt" IS NULL
      ORDER BY h."createdAt" DESC LIMIT 1
    )
  );

  RETURN result;
END;
$$;

-- One-off: fill the profiles of everyone who has already signed up on the form.
SELECT public.fill_profile_from_form(id) FROM "SheetRegistration" WHERE "contactId" IS NOT NULL;
