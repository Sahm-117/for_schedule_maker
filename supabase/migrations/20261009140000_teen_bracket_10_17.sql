-- Teen age bracket: 10 - 17. Adults start at 18.
--
-- Until now an 18-year-old was a teen ("18 and below") and the adult bracket after it was "19 - 24". Now a teen is 10 to 17
-- ("10 - 17") and 18 is an adult ("18 - 24"). Age from a date of birth follows this (age_range_for_age and the nightly
-- refresh_age_brackets).
--
--   * The form's own answers are read both ways. "18 and below" and "Below 18" still mean teen (the Google Form's wording is
--     not ours to change, so an 18-year-old who ticks it still arrives as a teen until the form is edited); "17 and below",
--     "10 - 17" and the like also mean teen. "18 - 24" and "19 - 24" mean the 18 - 24 bracket.
--   * Everyone saved with the old teen labels (18 and below, Below 18, Below 15, 15-17) becomes "10 - 17", and "19 - 24" /
--     "18-24" becomes "18 - 24", on participants, follow-up contacts and supports. Nobody stops being a teen: the people who
--     are teens today stay teens, and an 18-year-old among them is moved to adults by an admin on purpose (age range on their
--     profile), not automatically.
--   * Saved group-builder rules (AppSetting grouping_rules_*) are relabelled the same way.
--   * Live definitions of age_range_for_age, fill_profile_from_form, teen_add_prospect, teen_move_existing and
--     refresh_age_brackets, each with only the labels changed. Teen checks accept both the old and the new label.
-- Frontend: constants/departments.ts, utils/people.ts, utils/groupingRules.ts and the teen screens read the new labels.
-- Idempotent.


CREATE OR REPLACE FUNCTION public.age_range_for_age(p_age INT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_age IS NULL OR p_age < 5 OR p_age > 100 THEN NULL
    WHEN p_age < 18 THEN '10 - 17'
    WHEN p_age <= 24 THEN '18 - 24'
    WHEN p_age <= 34 THEN '25 - 34'
    WHEN p_age <= 44 THEN '35 - 44'
    WHEN p_age <= 59 THEN '45 - 59'
    ELSE '60 and above'
  END
$$;

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
  IF lower(v_age) IN ('below 18', 'under 18', 'under-18', 'under18', '<18', 'below18', '18 and below', '18 & below', '18 and under', '18 & under', '17 and below', '17 & below', '17 and under', '17 & under', '10 - 17', '10-17', '10 to 17') THEN v_age := '10 - 17'; END IF;
  -- The form's "19 - 24" and older "18 - 24" answers are the 18 - 24 bracket (18 is an adult now).
  IF v_age IN ('18 - 24', '19 - 24') THEN v_age := '18 - 24'; END IF;
  IF v_age NOT IN ('10 - 17', '18 - 24', '25 - 34', '35 - 44', '45 - 59', '60 and above') THEN v_age := NULL; END IF;
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

  -- Teens (10 - 17, or the form's "18 and below") become TEENAGER, but only while the switch is on and
  -- only from plain REGISTERED, so a closed or later status is never overridden.
  -- Uses the age now on the profile, so a date of birth wins over the form's range.
  SELECT "ageRange" INTO v_final_age FROM "Participant" WHERE id = person_id;
  IF replace(lower(COALESCE(v_final_age, '')), ' ', '') IN ('10-17', '18andbelow')
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
        "ageRange" = '10 - 17',
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

CREATE OR REPLACE FUNCTION public.teen_add_prospect(p_token text, p_full_name text, p_phone text, p_guardian_phone text, p_gender text, p_email text, p_cohort_id uuid DEFAULT NULL::uuid, p_guardian_name text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  actor "User" := public.app_staff(p_token);
  v_enabled JSONB;
  v_name TEXT := regexp_replace(btrim(COALESCE(p_full_name, '')), '\s+', ' ', 'g');
  v_own TEXT := NULLIF(btrim(COALESCE(p_phone, '')), '');
  v_guard TEXT := NULLIF(btrim(COALESCE(p_guardian_phone, '')), '');
  v_guard_name TEXT := NULLIF(regexp_replace(btrim(COALESCE(p_guardian_name, '')), '\s+', ' ', 'g'), '');
  v_gender TEXT := CASE lower(btrim(COALESCE(p_gender, ''))) WHEN 'male' THEN 'Male' WHEN 'female' THEN 'Female' ELSE NULL END;
  v_email TEXT := NULLIF(btrim(COALESCE(p_email, '')), '');
  v_cohort UUID := COALESCE(p_cohort_id, public.current_programme_cohort_id());
  v_phone TEXT;
  v_contact "FollowUpContact";
  v_part_id UUID;
  v_owner_name TEXT;
  v_is_test BOOLEAN;
  v_reason TEXT;
  v_on_tag BOOLEAN;
  v_prev_owner UUID;
  v_prev_owner_name TEXT;
BEGIN
  IF actor.id IS NULL OR actor.role::text NOT IN ('SUPPORT', 'ADMIN') THEN
    RAISE EXCEPTION 'NOT_AUTHORISED';
  END IF;
  SELECT value INTO v_enabled FROM "AppSetting" WHERE "settingKey" = 'teen_flow_enabled';
  IF v_enabled IS DISTINCT FROM to_jsonb(true) THEN
    RAISE EXCEPTION 'Teen handling is not switched on yet';
  END IF;
  IF char_length(v_name) < 2 THEN RAISE EXCEPTION 'Enter the teen''s name'; END IF;
  IF v_gender IS NULL THEN RAISE EXCEPTION 'Choose Male or Female'; END IF;
  IF v_cohort IS NULL THEN RAISE EXCEPTION 'There is no current cohort'; END IF;

  v_own := CASE WHEN public.followup_phone_is_valid(v_own) THEN public.fof_local_phone(v_own) END;
  v_guard := CASE WHEN public.followup_phone_is_valid(v_guard) THEN public.fof_local_phone(v_guard) END;
  IF v_own IS NULL AND v_guard IS NULL THEN
    RAISE EXCEPTION 'Add their number or a parent''s number';
  END IF;
  v_phone := COALESCE(v_own, v_guard);
  -- The church FOF email. The same address is in frontend/src/components/followups/TeenAddFields.tsx.
  v_email := COALESCE(v_email, 'tcn.fof.ikd@gmail.com');
  v_is_test := actor."isTest" IS TRUE;
  v_reason := 'Added as a teen by ' || actor.name;

  SELECT * INTO v_contact
  FROM "FollowUpContact" c
  WHERE (c."cohortId" = v_cohort OR c."cohortId" IS NULL)
    AND public.fof_phone_key(c.phone) = public.fof_phone_key(v_phone)
    AND public.fof_name_key(c."fullName") = public.fof_name_key(v_name)
  ORDER BY (c."cohortId" = v_cohort) DESC NULLS LAST, c."createdAt" DESC
  LIMIT 1;

  IF v_contact.id IS NOT NULL THEN
    -- Already known (say a support saved them as a prospect): make them a teen
    -- and, unless a Teen Support already holds them, hand them on.
    SELECT EXISTS (
      SELECT 1 FROM "SupportTagMember" m JOIN "SupportTag" t ON t.id = m."tagId" AND t."systemKey" = 'TEEN_SUPPORT'
      WHERE m."userId" = v_contact."ownerId"
    ) INTO v_on_tag;
    -- An adult who holds them now loses them: remember who, so they are told.
    IF v_contact."ownerId" IS NOT NULL AND NOT v_on_tag AND v_contact."registrationStatus" NOT IN ('TEENAGER', 'TEEN_ONBOARDED') THEN
      v_prev_owner := v_contact."ownerId";
      SELECT name INTO v_prev_owner_name FROM "User" WHERE id = v_prev_owner;
    END IF;
    UPDATE "FollowUpContact" SET
      "registrationStatus" = CASE WHEN "registrationStatus" IN ('TEENAGER', 'TEEN_ONBOARDED') THEN "registrationStatus" ELSE 'TEENAGER'::"FollowUpRegistrationStatus" END,
      "ageRange" = '10 - 17',
      gender = COALESCE(NULLIF(gender, ''), v_gender),
      "guardianPhone" = COALESCE(v_guard, "guardianPhone"),
      "guardianName" = COALESCE(v_guard_name, "guardianName"),
      email = COALESCE(NULLIF(btrim(email), ''), v_email),
      "cohortId" = COALESCE("cohortId", v_cohort),
      "replyStatus" = CASE WHEN "registrationStatus" IN ('TEENAGER', 'TEEN_ONBOARDED') THEN "replyStatus" ELSE 'REPLIED'::"FollowUpReplyStatus" END,
      "ownerId" = CASE WHEN "ownerId" IS NOT NULL AND NOT v_on_tag THEN NULL ELSE "ownerId" END,
      "archivedAt" = NULL,
      "registeredById" = COALESCE("registeredById", actor.id),
      "manualRegistrationAt" = COALESCE("manualRegistrationAt", now()),
      "manualRegistrationBy" = COALESCE("manualRegistrationBy", actor.id),
      "manualRegistrationReason" = COALESCE("manualRegistrationReason", v_reason),
      "updatedAt" = now()
    WHERE id = v_contact.id
    RETURNING * INTO v_contact;
  ELSE
    INSERT INTO "FollowUpContact" (
      "fullName", phone, "guardianPhone", "guardianName", email, gender, "ageRange", "cohortId", source,
      "registeredById", "registeredByActedAs", "registrationStatus", "replyStatus", "nextAction", "isTest",
      "manualRegistrationAt", "manualRegistrationBy", "manualRegistrationReason"
    ) VALUES (
      v_name, v_phone, v_guard, v_guard_name, v_email, v_gender, '10 - 17', v_cohort, 'Added for follow up by ' || actor.name || ' (teen)',
      actor.id, actor.role::text, 'TEENAGER', 'REPLIED', 'SEND_MESSAGE', v_is_test,
      now(), actor.id, v_reason
    ) RETURNING * INTO v_contact;
  END IF;

  SELECT id INTO v_part_id FROM "Participant" WHERE "followUpContactId" = v_contact.id;
  IF v_part_id IS NULL THEN
    SELECT id INTO v_part_id FROM "Participant" p
    WHERE p."cohortId" = v_cohort
      AND public.fof_phone_key(p.phone) = public.fof_phone_key(v_phone)
      AND public.fof_name_key(p."fullName") = public.fof_name_key(v_name)
    LIMIT 1;
  END IF;
  IF v_part_id IS NULL THEN
    INSERT INTO "Participant" ("fullName", phone, "guardianPhone", "cohortId", source, status, email, gender, "ageRange", "followUpContactId", "registrationDate", "isTest")
    VALUES (v_name, v_phone, v_guard, v_cohort, 'FOLLOW_UP', 'ACTIVE', v_email, v_gender, '10 - 17', v_contact.id, now(), v_is_test)
    RETURNING id INTO v_part_id;
  ELSE
    UPDATE "Participant" SET
      "ageRange" = '10 - 17',
      "guardianPhone" = COALESCE(v_guard, "guardianPhone"),
      gender = COALESCE(NULLIF(gender, ''), v_gender),
      "followUpContactId" = COALESCE("followUpContactId", v_contact.id),
      "updatedAt" = now()
    WHERE id = v_part_id;
  END IF;

  IF v_prev_owner IS NOT NULL THEN
    INSERT INTO "Notification" ("userId", title, body, path, type)
    VALUES (v_prev_owner, 'A teen moved to a Teen Support',
            v_name || ' was added as a teen, so they now go to a Teen Support and are off your list.',
            '/support/mobilisation?tab=follow', 'FOLLOWUP_ASSIGNMENT');
  END IF;

  PERFORM public.assign_teen_contacts(v_contact.id);
  SELECT * INTO v_contact FROM "FollowUpContact" WHERE id = v_contact.id;
  SELECT name INTO v_owner_name FROM "User" WHERE id = v_contact."ownerId";

  RETURN jsonb_build_object(
    'contactId', v_contact.id,
    'participantId', v_part_id,
    'ownerId', v_contact."ownerId",
    'ownerName', v_owner_name,
    'previousOwnerName', v_prev_owner_name,
    'waiting', v_contact."ownerId" IS NULL
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.teen_move_existing()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_cohort UUID := public.current_programme_cohort_id();
  rec RECORD;
  v_contact "FollowUpContact";
  v_keep BOOLEAN;
  v_prev UUID;
  v_moved INT := 0;
  v_created INT := 0;
  v_told INT := 0;
BEGIN
  IF v_cohort IS NULL THEN
    RETURN jsonb_build_object('moved', 0, 'created', 0, 'told', 0);
  END IF;

  FOR rec IN
    SELECT * FROM "Participant" p
    WHERE p."cohortId" = v_cohort AND p.status = 'ACTIVE' AND p."isTest" IS NOT TRUE
      AND replace(lower(COALESCE(p."ageRange", '')), ' ', '') IN ('10-17', '18andbelow')
    ORDER BY p."fullName"
  LOOP
    v_contact := NULL;
    IF rec."followUpContactId" IS NOT NULL THEN
      SELECT * INTO v_contact FROM "FollowUpContact" WHERE id = rec."followUpContactId";
    END IF;
    IF v_contact.id IS NULL THEN
      SELECT * INTO v_contact FROM "FollowUpContact" c
      WHERE (c."cohortId" = v_cohort OR c."cohortId" IS NULL)
        AND public.fof_phone_key(c.phone) = public.fof_phone_key(rec.phone)
        AND public.fof_name_key(c."fullName") = public.fof_name_key(rec."fullName")
      ORDER BY (c."cohortId" = v_cohort) DESC NULLS LAST, c."createdAt" DESC
      LIMIT 1;
    END IF;

    IF v_contact.id IS NULL THEN
      INSERT INTO "FollowUpContact" (
        "fullName", phone, "guardianPhone", email, gender, "ageRange", "cohortId", source,
        "registrationStatus", "replyStatus", "nextAction", "isTest", "manualRegistrationAt", "manualRegistrationReason"
      ) VALUES (
        rec."fullName", rec.phone, rec."guardianPhone", rec.email, rec.gender, '10 - 17', v_cohort, 'Moved to teen handling',
        'TEENAGER', 'REPLIED', 'SEND_MESSAGE', FALSE, now(), 'Already a participant aged 17 or under when teen handling started'
      ) RETURNING * INTO v_contact;
      v_created := v_created + 1;
    ELSE
      v_prev := NULL;
      v_keep := v_contact."ownerId" IS NOT NULL AND EXISTS (
        SELECT 1 FROM "User" u
        JOIN "SupportTagMember" m ON m."userId" = u.id
        JOIN "SupportTag" t ON t.id = m."tagId" AND t."systemKey" = 'TEEN_SUPPORT'
        WHERE u.id = v_contact."ownerId" AND u.gender IS NOT NULL AND u.gender = COALESCE(NULLIF(v_contact.gender, ''), rec.gender)
      );
      IF v_contact."ownerId" IS NOT NULL AND NOT v_keep THEN v_prev := v_contact."ownerId"; END IF;

      UPDATE "FollowUpContact" SET
        "registrationStatus" = CASE WHEN "registrationStatus" IN ('TEENAGER', 'TEEN_ONBOARDED') THEN "registrationStatus" ELSE 'TEENAGER'::"FollowUpRegistrationStatus" END,
        "ageRange" = '10 - 17',
        gender = COALESCE(NULLIF(gender, ''), rec.gender),
        "guardianPhone" = COALESCE("guardianPhone", rec."guardianPhone"),
        "cohortId" = COALESCE("cohortId", v_cohort),
        "replyStatus" = CASE WHEN "registrationStatus" IN ('TEENAGER', 'TEEN_ONBOARDED') THEN "replyStatus" ELSE 'REPLIED'::"FollowUpReplyStatus" END,
        "nextAction" = CASE WHEN "registrationStatus" IN ('TEENAGER', 'TEEN_ONBOARDED') THEN "nextAction" ELSE 'SEND_MESSAGE'::"FollowUpNextAction" END,
        "ownerId" = CASE WHEN v_keep THEN "ownerId" ELSE NULL END,
        "archivedAt" = CASE WHEN "registrationStatus" IN ('TEENAGER', 'TEEN_ONBOARDED') THEN "archivedAt" ELSE NULL END,
        "manualRegistrationAt" = COALESCE("manualRegistrationAt", now()),
        "manualRegistrationReason" = COALESCE("manualRegistrationReason", 'Already a participant aged 17 or under when teen handling started'),
        "updatedAt" = now()
      WHERE id = v_contact.id
      RETURNING * INTO v_contact;

      IF v_prev IS NOT NULL THEN
        INSERT INTO "Notification" ("userId", title, body, path, type)
        VALUES (v_prev, 'A teen moved to a Teen Support',
                rec."fullName" || ' is under 18, so they now go to a Teen Support and are off your list.',
                '/support/mobilisation?tab=follow', 'FOLLOWUP_ASSIGNMENT');
        v_told := v_told + 1;
      END IF;
    END IF;

    UPDATE "Participant" SET "followUpContactId" = COALESCE("followUpContactId", v_contact.id), "updatedAt" = now() WHERE id = rec.id;
    v_moved := v_moved + 1;
  END LOOP;

  RETURN jsonb_build_object('moved', v_moved, 'created', v_created, 'told', v_told);
END;
$function$;

CREATE OR REPLACE FUNCTION public.refresh_age_brackets()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_today DATE := (NOW() AT TIME ZONE 'Africa/Lagos')::date;
  v_people INT;
  v_supports INT;
BEGIN
  WITH due AS (
    SELECT p.id,
           public.age_range_for_age(date_part('year', age(v_today, p."dateOfBirth"))::int) AS wanted
    FROM "Participant" p
    LEFT JOIN "Cohort" c ON c.id = p."cohortId"
    WHERE p."dateOfBirth" IS NOT NULL
      -- A teen stays a teen until their cohort has ended.
      AND NOT (
        replace(lower(COALESCE(p."ageRange", '')), ' ', '') IN ('10-17', '18andbelow')
        AND c.id IS NOT NULL AND c.status::text <> 'COMPLETED' AND (c."endDate" IS NULL OR c."endDate" >= v_today)
      )
  ), changed AS (
    UPDATE "Participant" p
    SET "ageRange" = due.wanted, "updatedAt" = now()
    FROM due
    WHERE p.id = due.id AND due.wanted IS NOT NULL
      AND replace(lower(COALESCE(p."ageRange", '')), ' ', '') <> replace(lower(due.wanted), ' ', '')
    RETURNING p.id
  )
  SELECT count(*) INTO v_people FROM changed;

  WITH changed AS (
    UPDATE "User" u
    SET "ageRange" = public.support_age_range(u."birthYear", u.birthday)
    WHERE u."birthYear" IS NOT NULL
      AND public.support_age_range(u."birthYear", u.birthday) IS NOT NULL
      AND replace(lower(COALESCE(u."ageRange", '')), ' ', '') <> replace(lower(public.support_age_range(u."birthYear", u.birthday)), ' ', '')
    RETURNING u.id
  )
  SELECT count(*) INTO v_supports FROM changed;

  RETURN jsonb_build_object('participants', v_people, 'supports', v_supports);
END;
$function$;


-- Teens may share a parent's phone number (siblings), so the one-phone-per-cohort rule leaves them out. It recognised a teen
-- by the label "18 and below"; it now leaves out "10 - 17" as well, before anyone is relabelled.
DROP INDEX IF EXISTS public.uniq_participant_phone_per_cohort;
CREATE UNIQUE INDEX uniq_participant_phone_per_cohort ON public."Participant" USING btree (fof_phone_key(phone), COALESCE("cohortId", '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE (fof_phone_key(phone) IS NOT NULL
    AND id <> ALL (ARRAY['0476b50f-de92-4b0a-baa9-0c8c05052b0f'::uuid, '80c19324-5ca4-4f91-bc63-ccf4ba5f0a7e'::uuid])
    AND replace(lower(COALESCE("ageRange", ''::text)), ' '::text, ''::text) NOT IN ('18andbelow', '10-17'));

-- Relabel what is saved. Teens stay teens; nothing here moves anyone.
UPDATE "Participant" SET "ageRange" = '10 - 17'
 WHERE replace(lower(COALESCE("ageRange", '')), ' ', '') IN ('18andbelow', 'below18', 'under18', 'below15', '15-17', '17andbelow');
UPDATE "FollowUpContact" SET "ageRange" = '10 - 17'
 WHERE replace(lower(COALESCE("ageRange", '')), ' ', '') IN ('18andbelow', 'below18', 'under18', 'below15', '15-17', '17andbelow');
UPDATE "User" SET "ageRange" = '10 - 17'
 WHERE replace(lower(COALESCE("ageRange", '')), ' ', '') IN ('18andbelow', 'below18', 'under18', 'below15', '15-17', '17andbelow');

UPDATE "Participant" SET "ageRange" = '18 - 24' WHERE replace(COALESCE("ageRange", ''), ' ', '') IN ('19-24', '18-24');
UPDATE "FollowUpContact" SET "ageRange" = '18 - 24' WHERE replace(COALESCE("ageRange", ''), ' ', '') IN ('19-24', '18-24');
UPDATE "User" SET "ageRange" = '18 - 24' WHERE replace(COALESCE("ageRange", ''), ' ', '') IN ('19-24', '18-24');

-- Saved group-builder rules.
UPDATE "AppSetting"
SET value = replace(replace(replace(replace(value::text, '"18 and below"', '"10 - 17"'), '"19 - 24"', '"18 - 24"'), '"Below 15"', '"10 - 17"'), '"15-17"', '"10 - 17"')::jsonb
WHERE "settingKey" LIKE 'grouping_rules_%'
  AND (value::text LIKE '%"18 and below"%' OR value::text LIKE '%"19 - 24"%' OR value::text LIKE '%"Below 15"%' OR value::text LIKE '%"15-17"%');
