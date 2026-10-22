-- Add someone on this number (FLOW_MAP rule 95).
--
-- * A signed-in participant (adult or teen; not through a teen's own number) adds a husband, wife,
--   child, brother or sister who uses the same phone number: participant_add_on_number. They answer the
--   registration form's questions in the app. The new person gets a form record ("Added in the app by
--   …", so rule 1 holds), a follow-up contact, a participant on the same number and the number's login
--   (same password, rule 91). Adults are ACCESS_CONFIRMED at once; teens are TEENAGER with parent consent
--   recorded when ticked, and go to a same-gender Teen Support (assign_teen_contacts).
-- * A Teen Support adds a brother or sister from a teen's card: support_add_sibling (that teen's Teen
--   Support or an admin). Same guardian number and name, same login, consent when ticked.
-- * Admins control it: AppSetting "add_on_number" = {"enabled": bool, "untilWeek": n}. Open while
--   enabled and until the end of week n's class day (before the cohort starts it is open). Missing
--   setting = enabled, until week 2. Admins are told about every person added.
--
-- Rollback: DROP FUNCTION participant_add_on_number, support_add_sibling, household_add_person,
-- add_on_number_state; DELETE FROM "AppSetting" WHERE "settingKey" = 'add_on_number'. People already
-- added stay (they are ordinary contacts and participants).

-- Whether adding is open for a cohort now, and until when.
CREATE OR REPLACE FUNCTION public.add_on_number_state(p_cohort_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_setting JSONB := COALESCE((SELECT value::jsonb FROM "AppSetting" WHERE "settingKey" = 'add_on_number'), '{"enabled": true, "untilWeek": 2}'::jsonb);
  v_enabled BOOLEAN := COALESCE((v_setting ->> 'enabled')::boolean, TRUE);
  v_until INT := COALESCE((v_setting ->> 'untilWeek')::int, 2);
  v_cohort "Cohort";
  v_last DATE;
BEGIN
  SELECT * INTO v_cohort FROM "Cohort" WHERE id = p_cohort_id;
  IF v_cohort.id IS NULL THEN RETURN jsonb_build_object('open', FALSE); END IF;
  SELECT public.week_class_date(v_cohort."startDate", w."weekNumber", w."classDate") INTO v_last
  FROM "Week" w WHERE w."cohortId" = v_cohort.id AND w."weekNumber" = v_until;
  RETURN jsonb_build_object(
    'open', v_enabled AND (v_last IS NULL OR (now() AT TIME ZONE 'Africa/Lagos')::date <= v_last),
    'enabled', v_enabled,
    'untilWeek', v_until,
    'untilDate', v_last
  );
END;
$function$;

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
  SELECT * INTO v_adder_account FROM "ParticipantAccount" WHERE "participantId" = v_adder.id AND "isActive";
  IF p_actor_id IS NOT NULL THEN SELECT * INTO v_actor FROM "User" WHERE id = p_actor_id; END IF;

  IF char_length(v_name) < 2 THEN RAISE EXCEPTION 'Enter their full name'; END IF;
  IF v_gender IS NULL THEN RAISE EXCEPTION 'Choose Male or Female'; END IF;
  v_age := CASE WHEN p_is_teen THEN '10 - 17' ELSE NULLIF(btrim(COALESCE(p_age_range, '')), '') END;
  IF NOT p_is_teen AND (v_age IS NULL OR public.fof_is_teen_age(v_age)) THEN RAISE EXCEPTION 'Choose their age range'; END IF;
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

REVOKE ALL ON FUNCTION public.household_add_person(uuid, uuid, text, text, boolean, text, date, text, text[], text, boolean) FROM PUBLIC, anon, authenticated;

-- A participant adds someone on their own number.
CREATE OR REPLACE FUNCTION public.participant_add_on_number(
  p_token text, p_full_name text, p_gender text, p_is_teen boolean, p_age_range text DEFAULT NULL,
  p_date_of_birth date DEFAULT NULL, p_email text DEFAULT NULL, p_departments text[] DEFAULT NULL,
  p_request text DEFAULT NULL, p_consent boolean DEFAULT FALSE
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_me UUID := public.app_participant_id(p_token);
  v_cohort UUID;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  IF (public.app_session(p_token))."viaTeenNumber" THEN
    RAISE EXCEPTION 'Sign in with your parent''s number to add someone';
  END IF;
  SELECT "cohortId" INTO v_cohort FROM "Participant" WHERE id = v_me;
  IF NOT COALESCE((public.add_on_number_state(v_cohort) ->> 'open')::boolean, FALSE) THEN
    RAISE EXCEPTION 'Adding people is closed for this cohort. Ask your support.';
  END IF;
  RETURN public.household_add_person(v_me, NULL, p_full_name, p_gender, p_is_teen, p_age_range, p_date_of_birth,
                                     p_email, p_departments, p_request, p_consent);
END;
$function$;

-- A Teen Support (or an admin) adds a brother or sister on a teen's guardian number.
CREATE OR REPLACE FUNCTION public.support_add_sibling(
  p_token text, p_sibling_id uuid, p_full_name text, p_gender text, p_date_of_birth date DEFAULT NULL, p_consent boolean DEFAULT FALSE
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  actor "User" := public.app_staff(p_token);
  v_sibling "Participant";
  v_owner UUID;
BEGIN
  IF actor.id IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  SELECT * INTO v_sibling FROM "Participant" WHERE id = p_sibling_id;
  IF v_sibling.id IS NULL OR NOT public.fof_is_teen_age(v_sibling."ageRange") THEN
    RAISE EXCEPTION 'Brothers and sisters can only be added from a teen''s card';
  END IF;
  SELECT "ownerId" INTO v_owner FROM "FollowUpContact" WHERE id = v_sibling."followUpContactId";
  IF actor.role::text <> 'ADMIN'
     AND v_owner IS DISTINCT FROM actor.id
     AND NOT EXISTS (
       SELECT 1 FROM "GroupParticipant" gp JOIN "Group" g ON g.id = gp."groupId"
       WHERE gp."participantId" = v_sibling.id AND g."supportId" = actor.id
     ) THEN
    RAISE EXCEPTION 'Only this teen''s Teen Support or an admin can add a brother or sister';
  END IF;
  RETURN public.household_add_person(v_sibling.id, actor.id, p_full_name, p_gender, TRUE, '10 - 17', p_date_of_birth,
                                     NULL, NULL, NULL, p_consent);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.add_on_number_state(uuid) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.participant_add_on_number(text, text, text, boolean, text, date, text, text[], text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.participant_add_on_number(text, text, text, boolean, text, date, text, text[], text, boolean) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.support_add_sibling(text, uuid, text, text, date, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.support_add_sibling(text, uuid, text, text, date, boolean) TO anon, authenticated;
