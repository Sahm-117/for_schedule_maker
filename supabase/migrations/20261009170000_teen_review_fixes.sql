-- Review fixes for the teen age-bracket work.
--
-- 1. participant_age_teen_boundary also fires when only dateOfBirth is updated (the database then recalculates the age range
--    in a BEFORE trigger, which "UPDATE OF ageRange" does not see), and stands aside while fill_profile_from_form fills a
--    form sign-up's profile (it does its own teen handling straight after, so the form no longer gets a "manual registration"
--    stamp or a forced reply status).
-- 2. fill_profile_from_form: the form answer "Under-18" (and "Below-18") survives the dash spacing and counts as a teen.
-- 3. admin_move_teen takes the same advisory lock as assign_teen_contacts before it counts a support's teens, and will not
--    move a teen to a test account.
-- 4. assign_teen_contacts: unused variable removed (the limit comes from teen_cap_for).
--
-- Rollback: re-apply the previous definitions from 20261009140000 / 20261009150000 / 20261009160000.
-- Idempotent.

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
  IF lower(v_age) IN ('below 18', 'under 18', 'under-18', 'under - 18', 'below - 18', 'under18', '<18', 'below18', '18 and below', '18 & below', '18 and under', '18 & under', '17 and below', '17 & below', '17 and under', '17 & under', '10 - 17', '10-17', '10 to 17') THEN v_age := '10 - 17'; END IF;
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

  -- The profile fill below sets the age range; the teen handling just after it does the teen work, so the
  -- age-change trigger (participant_age_teen_boundary) stands aside for this one statement.
  PERFORM set_config('fof.skip_teen_boundary', 'on', true);
  UPDATE "Participant" SET
    email = COALESCE(NULLIF(trim(email), ''), v_email),
    gender = COALESCE(NULLIF(trim(gender), ''), v_gender),
    "ageRange" = COALESCE(NULLIF(trim("ageRange"), ''), v_age),
    occupation = COALESCE(NULLIF(trim(occupation), ''), v_occupation),
    "dateOfBirth" = COALESCE("dateOfBirth", v_dob),
    "smartRequest" = COALESCE(NULLIF(trim("smartRequest"), ''), v_smart),
    "updatedAt" = NOW()
  WHERE id = person_id;
  PERFORM set_config('fof.skip_teen_boundary', '', true);

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

CREATE OR REPLACE FUNCTION public.assign_teen_contacts(p_only_contact uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_enabled JSONB;
  v_tag UUID;
  v_load JSONB := '{}'::jsonb;      -- "<cohortId|''>|<ownerId>" -> teens held
  v_batches JSONB := '{}'::jsonb;   -- ownerId -> {"count": n, "names": [...]}
  v_stuck JSONB := '[]'::jsonb;
  v_assigned INT := 0;
  rec RECORD;
  v_target UUID;
  v_key TEXT;
  v_batch JSONB;
  v_names JSONB;
BEGIN
  SELECT value INTO v_enabled FROM "AppSetting" WHERE "settingKey" = 'teen_flow_enabled';
  IF v_enabled IS DISTINCT FROM to_jsonb(true) THEN
    RETURN jsonb_build_object('enabled', false, 'assigned', 0, 'batches', '{}'::jsonb, 'stuck', '[]'::jsonb);
  END IF;

  -- One run at a time: the cron, "Assign now" and teen_add_prospect must not each
  -- read the same loads and then all give a support their 4th teen.
  PERFORM pg_advisory_xact_lock(hashtext('assign_teen_contacts'));

  SELECT id INTO v_tag FROM "SupportTag" WHERE "systemKey" = 'TEEN_SUPPORT';

  -- Every teen a support already holds counts, onboarded or not.
  FOR rec IN
    SELECT COALESCE(c."cohortId"::text, '') || '|' || c."ownerId"::text AS k, COUNT(*) AS cnt
    FROM "FollowUpContact" c
    WHERE c."ownerId" IS NOT NULL AND c."isTest" IS NOT TRUE AND c."archivedAt" IS NULL
      AND c."registrationStatus" IN ('TEENAGER', 'TEEN_ONBOARDED')
    GROUP BY 1
  LOOP
    v_load := jsonb_set(v_load, ARRAY[rec.k], to_jsonb(rec.cnt));
  END LOOP;

  FOR rec IN
    SELECT * FROM "FollowUpContact" c
    WHERE c."ownerId" IS NULL AND c."archivedAt" IS NULL AND c."isTest" IS NOT TRUE
      AND c."registrationStatus" = 'TEENAGER'
      AND (p_only_contact IS NULL OR c.id = p_only_contact)
      -- The sweep only looks at the current cohort (or contacts with none yet), so an
      -- old cohort's leftover teen never takes a slot.
      AND (p_only_contact IS NOT NULL OR c."cohortId" IS NULL OR c."cohortId" = public.current_programme_cohort_id())
    ORDER BY c."createdAt" ASC
  LOOP
    IF NOT (public.followup_phone_is_valid(rec.phone) OR public.followup_phone_is_valid(rec."guardianPhone")) THEN
      v_stuck := v_stuck || jsonb_build_array(jsonb_build_object('contactId', rec.id, 'name', rec."fullName", 'reason', 'NO_NUMBER', 'createdAt', rec."createdAt"));
      CONTINUE;
    END IF;
    IF rec.gender IS NULL OR rec.gender NOT IN ('Male', 'Female') THEN
      v_stuck := v_stuck || jsonb_build_array(jsonb_build_object('contactId', rec.id, 'name', rec."fullName", 'reason', 'NO_GENDER', 'createdAt', rec."createdAt"));
      CONTINUE;
    END IF;

    v_target := NULL;

    -- Whoever added them, if they are a same-gender Teen Support with room.
    IF rec."registeredById" IS NOT NULL THEN
      SELECT u.id INTO v_target
      FROM "User" u
      JOIN "SupportTagMember" m ON m."userId" = u.id AND m."tagId" = v_tag
      WHERE u.id = rec."registeredById"
        AND u.role IN ('SUPPORT', 'ADMIN') AND u."isActive" IS NOT FALSE AND u."isTest" IS NOT TRUE
        AND u.gender = rec.gender
        AND (public.teen_quiet_bypass() OR NOT public.followup_owner_is_quiet(u.id))
        AND COALESCE((v_load->>(COALESCE(rec."cohortId"::text, '') || '|' || u.id::text))::int, 0) < public.teen_cap_for(rec."cohortId", rec.gender);
    END IF;

    -- Same gender, fewest teens first, ties by name.
    IF v_target IS NULL THEN
      SELECT u.id INTO v_target
      FROM "User" u
      JOIN "SupportTagMember" m ON m."userId" = u.id AND m."tagId" = v_tag
      WHERE u.role IN ('SUPPORT', 'ADMIN') AND u."isActive" IS NOT FALSE AND u."isTest" IS NOT TRUE
        AND u.gender = rec.gender
        AND (public.teen_quiet_bypass() OR NOT public.followup_owner_is_quiet(u.id))
        AND COALESCE((v_load->>(COALESCE(rec."cohortId"::text, '') || '|' || u.id::text))::int, 0) < public.teen_cap_for(rec."cohortId", rec.gender)
      ORDER BY COALESCE((v_load->>(COALESCE(rec."cohortId"::text, '') || '|' || u.id::text))::int, 0) ASC, u.name ASC
      LIMIT 1;
    END IF;

    IF v_target IS NULL THEN
      v_stuck := v_stuck || jsonb_build_array(jsonb_build_object('contactId', rec.id, 'name', rec."fullName", 'reason', 'NO_SAME_GENDER_ROOM', 'createdAt', rec."createdAt"));
      CONTINUE;
    END IF;

    UPDATE "FollowUpContact"
    SET "ownerId" = v_target, "updatedAt" = now()
    WHERE id = rec.id;

    v_key := COALESCE(rec."cohortId"::text, '') || '|' || v_target::text;
    v_load := jsonb_set(v_load, ARRAY[v_key], to_jsonb(COALESCE((v_load->>v_key)::int, 0) + 1));

    v_batch := COALESCE(v_batches->v_target::text, jsonb_build_object('count', 0, 'names', '[]'::jsonb));
    v_names := COALESCE(v_batch->'names', '[]'::jsonb);
    IF jsonb_array_length(v_names) < 3 THEN v_names := v_names || to_jsonb(rec."fullName"); END IF;
    v_batch := jsonb_set(v_batch, ARRAY['count'], to_jsonb(COALESCE((v_batch->>'count')::int, 0) + 1));
    v_batch := jsonb_set(v_batch, ARRAY['names'], v_names);
    v_batches := jsonb_set(v_batches, ARRAY[v_target::text], v_batch);

    v_assigned := v_assigned + 1;
  END LOOP;

  RETURN jsonb_build_object('enabled', true, 'assigned', v_assigned, 'batches', v_batches, 'stuck', v_stuck);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_move_teen(p_participant_id uuid, p_to_support uuid, p_force boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_me UUID := public.app_current_user_id();
  rec "Participant";
  c "FollowUpContact";
  v_gender TEXT;
  v_cap INT;
  v_count INT;
  v_from UUID;
  v_me_name TEXT;
  v_to_name TEXT;
BEGIN
  IF NOT public.app_is_admin() THEN RAISE EXCEPTION 'Only admins can move a teen'; END IF;
  -- Same lock as assign_teen_contacts, so the count below is not read while a sweep gives that support another teen.
  PERFORM pg_advisory_xact_lock(hashtext('assign_teen_contacts'));
  SELECT * INTO rec FROM "Participant" WHERE id = p_participant_id;
  IF rec.id IS NULL OR rec."followUpContactId" IS NULL THEN RAISE EXCEPTION 'That person has no teen record to move'; END IF;
  SELECT * INTO c FROM "FollowUpContact" WHERE id = rec."followUpContactId";
  IF c.id IS NULL OR c."registrationStatus"::text NOT IN ('TEENAGER', 'TEEN_ONBOARDED') THEN RAISE EXCEPTION 'Only teens can be moved here'; END IF;
  v_gender := COALESCE(NULLIF(c.gender, ''), rec.gender);
  IF v_gender NOT IN ('Male', 'Female') THEN RAISE EXCEPTION 'This teen has no gender on file'; END IF;
  IF c."ownerId" IS NOT DISTINCT FROM p_to_support THEN RAISE EXCEPTION 'They are already with that Teen Support'; END IF;

  SELECT u.name INTO v_to_name
  FROM "User" u
  JOIN "SupportTagMember" m ON m."userId" = u.id
  JOIN "SupportTag" t ON t.id = m."tagId" AND t."systemKey" = 'TEEN_SUPPORT'
  WHERE u.id = p_to_support AND u."isActive" IS NOT FALSE AND u."isTest" IS NOT TRUE AND u.gender = v_gender;
  IF v_to_name IS NULL THEN RAISE EXCEPTION 'A teen can only go to a Teen Support of the same gender'; END IF;

  v_cap := public.teen_cap_for(c."cohortId", v_gender);
  SELECT count(*) INTO v_count FROM "FollowUpContact" x
   WHERE x."ownerId" = p_to_support AND x."isTest" IS NOT TRUE AND x."archivedAt" IS NULL
     AND x."registrationStatus" IN ('TEENAGER', 'TEEN_ONBOARDED') AND x."cohortId" IS NOT DISTINCT FROM c."cohortId";
  IF v_count >= v_cap AND NOT COALESCE(p_force, FALSE) THEN
    RAISE EXCEPTION 'FULL: % already has % teens (limit %)', v_to_name, v_count, v_cap;
  END IF;

  v_from := c."ownerId";
  SELECT name INTO v_me_name FROM "User" WHERE id = v_me;

  UPDATE "FollowUpContact" SET "ownerId" = p_to_support, "ownerAssignedAt" = now(), "updatedAt" = now() WHERE id = c.id;

  INSERT INTO "FollowUpReassignmentLog" ("contactId", "fromUserId", "toUserId", reason)
  VALUES (c.id, v_from, p_to_support, 'Moved by admin ' || COALESCE(v_me_name, 'unknown') || CASE WHEN v_count >= v_cap THEN ' (over the limit)' ELSE '' END);

  IF v_from IS NOT NULL THEN
    INSERT INTO "Notification" ("userId", title, body, path, type)
    VALUES (v_from, 'A teen moved to another Teen Support', rec."fullName" || ' now goes to ' || v_to_name || ' and is off your list.', '/support/mobilisation?tab=follow', 'FOLLOWUP_ASSIGNMENT');
  END IF;
  INSERT INTO "Notification" ("userId", title, body, path, type)
  VALUES (p_to_support, 'A teen was added to your list', rec."fullName" || ' now goes to you as their Teen Support.', '/support/mobilisation?tab=follow', 'FOLLOWUP_ASSIGNMENT');

  RETURN jsonb_build_object('moved', TRUE, 'toName', v_to_name, 'count', v_count + 1, 'cap', v_cap);
END;
$function$;

CREATE OR REPLACE FUNCTION public.participant_age_teen_boundary()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_old BOOLEAN;
  v_new BOOLEAN;
BEGIN
  IF NEW."ageRange" IS NOT DISTINCT FROM OLD."ageRange" THEN RETURN NEW; END IF;
  IF COALESCE(current_setting('fof.skip_teen_boundary', true), '') = 'on' THEN RETURN NEW; END IF;
  IF NEW.status <> 'ACTIVE' OR NEW."isTest" IS TRUE OR NEW."cohortId" IS DISTINCT FROM public.current_programme_cohort_id() THEN RETURN NEW; END IF;
  v_old := replace(lower(COALESCE(OLD."ageRange", '')), ' ', '') IN ('10-17', '18andbelow', 'below18', 'under18', 'below15', '15-17', '17andbelow');
  v_new := replace(lower(COALESCE(NEW."ageRange", '')), ' ', '') IN ('10-17', '18andbelow', 'below18', 'under18', 'below15', '15-17', '17andbelow');
  IF NOT v_old AND v_new THEN
    PERFORM public.teen_convert_participant(NEW.id);
  ELSIF v_old AND NOT v_new AND NULLIF(trim(COALESCE(NEW."ageRange", '')), '') IS NOT NULL THEN
    PERFORM public.teen_revert_participant(NEW.id);
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS participant_age_teen_boundary ON public."Participant";
CREATE TRIGGER participant_age_teen_boundary
  AFTER UPDATE OF "ageRange", "dateOfBirth" ON public."Participant"
  FOR EACH ROW EXECUTE FUNCTION public.participant_age_teen_boundary();
