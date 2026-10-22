-- Code review follow-up to 20261022150000_add_on_this_number.sql:
-- * household_add_person gives the new person any active login on the number (not only the adder's),
--   and checks a date of birth against teen (10 to 17) or adult (18 or older).
-- * participant_add_on_number_state: the same as add_on_number_state for the signed-in person's cohort,
--   closed for a session that came in through a teen's own number (which cannot add anyone).
--
-- Rollback: re-run household_add_person from 20261022150000; DROP FUNCTION participant_add_on_number_state.

-- Private: add one person on another person's number. p_actor_id is the staff member (NULL when the
-- participant adds them in the app).
CREATE OR REPLACE FUNCTION public.household_add_person(
  p_adder_id uuid, p_actor_id uuid, p_full_name text, p_gender text, p_is_teen boolean, p_age_range text,
  p_date_of_birth date, p_email text, p_departments text[], p_request text, p_consent boolean
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_adder "Participant";
  v_adder_contact "FollowUpContact";
  v_adder_account "ParticipantAccount";
  v_actor "User";
  v_name TEXT := regexp_replace(btrim(COALESCE(p_full_name, '')), '\s+', ' ', 'g');
  v_gender TEXT := CASE lower(btrim(COALESCE(p_gender, ''))) WHEN 'male' THEN 'Male' WHEN 'female' THEN 'Female' ELSE NULL END;
  v_email TEXT := NULLIF(btrim(COALESCE(p_email, '')), '');
  v_age TEXT;
  v_guard_phone TEXT;
  v_guard_name TEXT;
  v_by TEXT;
  v_reg_id UUID;
  v_contact "FollowUpContact";
  v_part_id UUID;
  v_owner_name TEXT;
BEGIN
  SELECT * INTO v_adder FROM "Participant" WHERE id = p_adder_id;
  IF v_adder.id IS NULL OR public.fof_phone_key(v_adder.phone) IS NULL OR v_adder."cohortId" IS NULL THEN
    RAISE EXCEPTION 'This number cannot have people added';
  END IF;
  SELECT * INTO v_adder_contact FROM "FollowUpContact" WHERE id = v_adder."followUpContactId";
  -- The number's login: the adder's, or any other active login on the number (rule 91).
  SELECT a.* INTO v_adder_account
  FROM public.shared_number_people(v_adder.id) f
  JOIN "ParticipantAccount" a ON a."participantId" = f.id AND a."isActive"
  ORDER BY (f.id = v_adder.id) DESC, (a."passwordSetAt" IS NOT NULL) DESC, a."passwordSetAt" DESC NULLS LAST
  LIMIT 1;
  IF p_actor_id IS NOT NULL THEN SELECT * INTO v_actor FROM "User" WHERE id = p_actor_id; END IF;

  IF char_length(v_name) < 2 THEN RAISE EXCEPTION 'Enter their full name'; END IF;
  IF v_gender IS NULL THEN RAISE EXCEPTION 'Choose Male or Female'; END IF;
  v_age := CASE WHEN p_is_teen THEN '10 - 17' ELSE NULLIF(btrim(COALESCE(p_age_range, '')), '') END;
  IF NOT p_is_teen AND (v_age IS NULL OR public.fof_is_teen_age(v_age)) THEN RAISE EXCEPTION 'Choose their age range'; END IF;
  -- A date of birth must fit: 10 to 17 for a teen, 18 or older for an adult (the Participant trigger
  -- sets the age range from it).
  IF p_date_of_birth IS NOT NULL THEN
    IF p_is_teen AND (date_part('year', age(p_date_of_birth)) < 10 OR date_part('year', age(p_date_of_birth)) > 17) THEN
      RAISE EXCEPTION 'A teenager must be 10 to 17. Check the date of birth.';
    END IF;
    IF NOT p_is_teen AND date_part('year', age(p_date_of_birth)) < 18 THEN
      RAISE EXCEPTION 'An adult must be 18 or older. Check the date of birth.';
    END IF;
  END IF;
  IF p_is_teen AND NOT COALESCE(p_consent, FALSE) AND p_actor_id IS NULL THEN
    RAISE EXCEPTION 'Only a parent or guardian can add a teenager. Tick the box to say you agree.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "Participant" q
    WHERE q."cohortId" = v_adder."cohortId"
      AND public.fof_phone_key(q.phone) = public.fof_phone_key(v_adder.phone)
      AND public.fof_name_key(q."fullName") = public.fof_name_key(v_name)
  ) THEN
    RAISE EXCEPTION '% is already on this number', v_name;
  END IF;

  -- A teen's parent: the adder's own parent when the adder is a teen, otherwise the adder.
  IF p_is_teen THEN
    IF public.fof_is_teen_age(v_adder."ageRange") THEN
      v_guard_phone := COALESCE(v_adder_contact."guardianPhone", v_adder."guardianPhone", v_adder.phone);
      v_guard_name := v_adder_contact."guardianName";
    ELSE
      v_guard_phone := v_adder.phone;
      v_guard_name := v_adder."fullName";
    END IF;
  END IF;
  v_by := COALESCE(v_actor.name, v_adder."fullName");

  -- The form record first (rule 1 looks for it), then the contact, then link them.
  INSERT INTO "SheetRegistration" ("fullName", phone, "phoneNormalised", email, answers, outcome, "outcomeDetail")
  VALUES (v_name, v_adder.phone, public.fof_phone_key(v_adder.phone), v_email,
          jsonb_build_object('Added in the app by', v_by, 'Gender', v_gender, 'Age Range?', v_age,
                             'Date of birth', p_date_of_birth, 'Departments', to_jsonb(COALESCE(p_departments, '{}'::text[])),
                             'Request', NULLIF(btrim(COALESCE(p_request, '')), ''), 'Parent consent', p_is_teen AND COALESCE(p_consent, FALSE)),
          'CREATED', 'Added in the app by ' || v_by)
  RETURNING id INTO v_reg_id;

  INSERT INTO "FollowUpContact" (
    "fullName", phone, "guardianPhone", "guardianName", email, gender, "ageRange", "cohortId", source,
    "registeredById", "registrationStatus", "replyStatus", "nextAction", "isTest", "guardianConsentAt", "guardianConsentById"
  ) VALUES (
    v_name, v_adder.phone, v_guard_phone, v_guard_name, v_email, v_gender, v_age, v_adder."cohortId",
    'Added in the app by ' || v_by, p_actor_id,
    (CASE WHEN p_is_teen THEN 'TEENAGER' ELSE 'ACCESS_CONFIRMED' END)::"FollowUpRegistrationStatus",
    'REPLIED', (CASE WHEN p_is_teen THEN 'SEND_MESSAGE' ELSE 'CLOSE' END)::"FollowUpNextAction",
    v_adder."isTest", CASE WHEN p_is_teen AND COALESCE(p_consent, FALSE) THEN now() END,
    CASE WHEN p_is_teen AND COALESCE(p_consent, FALSE) THEN p_actor_id END
  ) RETURNING * INTO v_contact;
  UPDATE "SheetRegistration" SET "contactId" = v_contact.id WHERE id = v_reg_id;

  INSERT INTO "Participant" (
    "fullName", phone, "guardianPhone", "cohortId", source, status, email, gender, "ageRange", "dateOfBirth",
    departments, "smartRequest", "followUpContactId", "registrationDate", "isTest"
  ) VALUES (
    v_name, v_adder.phone, v_guard_phone, v_adder."cohortId", 'FOLLOW_UP', 'ACTIVE', v_email, v_gender, v_age, p_date_of_birth,
    COALESCE(p_departments, '{}'::text[]), NULLIF(btrim(COALESCE(p_request, '')), ''), v_contact.id, now(), v_adder."isTest"
  ) RETURNING id INTO v_part_id;

  -- The number's login (rule 91): same password, or the same waiting code.
  IF v_adder_account."participantId" IS NOT NULL THEN
    INSERT INTO "ParticipantAccount" ("participantId", password_hash, "setupCode", "mustChangePassword", "issuedById", "issuedAt", "passwordSetAt")
    VALUES (v_part_id, v_adder_account.password_hash, v_adder_account."setupCode", v_adder_account."mustChangePassword",
            p_actor_id, now(), v_adder_account."passwordSetAt");
  END IF;

  IF p_is_teen THEN PERFORM public.assign_teen_contacts(v_contact.id); END IF;
  SELECT * INTO v_contact FROM "FollowUpContact" WHERE id = v_contact.id;
  SELECT name INTO v_owner_name FROM "User" WHERE id = v_contact."ownerId";

  INSERT INTO "Notification" ("userId", title, body, path, type)
  SELECT u.id, 'New person on a shared number',
         v_name || ' was added on ' || split_part(v_adder."fullName", ' ', 1) || '''s number by ' || v_by
           || CASE WHEN p_is_teen THEN ' (a teen).' ELSE '. They are Access Confirmed.' END,
         '/follow-ups', 'FOLLOWUP_ASSIGNMENT'
  FROM "User" u WHERE u.role = 'ADMIN' AND u."isActive" IS NOT FALSE AND u.id IS DISTINCT FROM p_actor_id;

  RETURN jsonb_build_object(
    'participantId', v_part_id, 'contactId', v_contact.id, 'name', v_name, 'isTeen', p_is_teen,
    'hasLogin', v_adder_account."participantId" IS NOT NULL,
    'teenSupportName', v_owner_name, 'teenWaiting', p_is_teen AND v_contact."ownerId" IS NULL
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.participant_add_on_number_state(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_me UUID := public.app_participant_id(p_token);
  v_cohort UUID;
BEGIN
  IF v_me IS NULL THEN RETURN jsonb_build_object('open', FALSE); END IF;
  IF (public.app_session(p_token))."viaTeenNumber" THEN RETURN jsonb_build_object('open', FALSE, 'viaTeenNumber', TRUE); END IF;
  SELECT "cohortId" INTO v_cohort FROM "Participant" WHERE id = v_me;
  RETURN public.add_on_number_state(v_cohort);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.participant_add_on_number_state(text) TO anon, authenticated;
