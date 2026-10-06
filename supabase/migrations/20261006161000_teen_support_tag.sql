-- Teen Support: a built-in tag, the Teenager statuses' first plumbing, and the
-- rules that keep teens out of the adult follow-up flows.
--
--   1. SupportTag."systemKey": the existing "Teen" tag becomes the built-in
--      "Teen Support" tag in place (Cohort 10's grouping rules reference it by
--      id, so it must not be replaced). Built-in tags can't be renamed or deleted.
--   2. AppSetting teen_flow_enabled (false): while off, sign-ups are never tagged.
--      Turned on once teen assignment and groups exist (later steps).
--   3. fill_profile_from_form: a REGISTERED contact whose profile age is
--      "18 and below" becomes TEENAGER (only when the switch is on).
--   4. run_followup_assignment, run_followup_reassignment and
--      followup_stale_contacts skip TEENAGER / TEEN_ONBOARDED: teens are never
--      handed to, counted for, or taken from an adult support automatically.
--   5. followup_contact_registration_guard: the teen statuses count as
--      registered, so nobody can be set to TEENAGER without a form sign-up or an
--      admin-approved manual registration (same gate as REGISTERED).
--   6. cohort_health: teens count in the "registered" headline (a separate Teen
--      card comes later).
--
-- Needs 20261006160000_teen_status_values.sql applied first.
--
-- Rollback: restore the previous definitions of the functions above from
-- 20261006120000 / 20261006130000 / 20261005120000 / 20260930330000, then
-- UPDATE "SupportTag" SET "systemKey" = NULL, name = 'Teen' WHERE "systemKey" = 'TEEN_SUPPORT';
-- ALTER TABLE "SupportTag" DROP COLUMN "systemKey"; DELETE FROM "AppSetting" WHERE "settingKey" = 'teen_flow_enabled';

ALTER TABLE public."SupportTag" ADD COLUMN IF NOT EXISTS "systemKey" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "SupportTag_systemKey_idx" ON public."SupportTag" ("systemKey") WHERE "systemKey" IS NOT NULL;

DO $$
DECLARE v_id UUID;
BEGIN
  SELECT id INTO v_id FROM "SupportTag" WHERE "systemKey" = 'TEEN_SUPPORT';
  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM "SupportTag" WHERE lower(btrim(name)) IN ('teen', 'teen support') ORDER BY "createdAt" LIMIT 1;
  END IF;
  IF v_id IS NULL THEN
    INSERT INTO "SupportTag" (name, "systemKey") VALUES ('Teen Support', 'TEEN_SUPPORT');
  ELSE
    UPDATE "SupportTag" SET name = 'Teen Support', "systemKey" = 'TEEN_SUPPORT' WHERE id = v_id;
  END IF;
END $$;

INSERT INTO "AppSetting" ("settingKey", value)
VALUES ('teen_flow_enabled', 'false'::jsonb)
ON CONFLICT ("settingKey") DO NOTHING;

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
  IF lower(v_age) IN ('below 18', 'under 18', 'under-18', 'under18', '<18', 'below18') THEN v_age := '18 and below'; END IF;
  IF v_age NOT IN ('18 and below', '18 - 24', '25 - 34', '35 - 44', '45 - 59', '60 and above') THEN v_age := NULL; END IF;
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
    UPDATE "FollowUpContact"
    SET "registrationStatus" = 'TEENAGER'::"FollowUpRegistrationStatus",
        "ageRange" = '18 and below',
        "updatedAt" = NOW()
    WHERE id = reg."contactId" AND "registrationStatus" = 'REGISTERED';
  END IF;

  IF v_smart IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "FaithProject" WHERE "participantId" = person_id) THEN
    INSERT INTO "FaithProject" ("participantId", body, status)
    VALUES (person_id, v_smart, 'NOT_DRAFTED');
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.support_tag_save(p_token text, p_id uuid, p_name text)
 RETURNS "SupportTag"
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  actor "User" := public.app_staff(p_token);
  v_name TEXT := btrim(COALESCE(p_name, ''));
  saved "SupportTag";
BEGIN
  IF actor.id IS NULL OR actor.role <> 'ADMIN'::"Role" THEN
    RAISE EXCEPTION 'NOT_AUTHORISED';
  END IF;
  IF v_name = '' THEN
    RAISE EXCEPTION 'Give the tag a name';
  END IF;
  IF char_length(v_name) > 40 THEN
    RAISE EXCEPTION 'Keep the tag name under 40 characters';
  END IF;
  IF EXISTS (SELECT 1 FROM "SupportTag" WHERE lower(btrim(name)) = lower(v_name) AND id IS DISTINCT FROM p_id) THEN
    RAISE EXCEPTION 'A tag with that name already exists';
  END IF;

  IF p_id IS NOT NULL AND EXISTS (SELECT 1 FROM "SupportTag" WHERE id = p_id AND "systemKey" IS NOT NULL) THEN
    RAISE EXCEPTION 'This tag is built in and can''t be renamed';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO "SupportTag" (name, "createdById") VALUES (v_name, actor.id) RETURNING * INTO saved;
  ELSE
    UPDATE "SupportTag" SET name = v_name WHERE id = p_id RETURNING * INTO saved;
    IF saved.id IS NULL THEN
      RAISE EXCEPTION 'That tag was not found';
    END IF;
  END IF;
  RETURN saved;
END;
$function$;

CREATE OR REPLACE FUNCTION public.support_tag_delete(p_token text, p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  actor "User" := public.app_staff(p_token);
BEGIN
  IF actor.id IS NULL OR actor.role <> 'ADMIN'::"Role" THEN
    RAISE EXCEPTION 'NOT_AUTHORISED';
  END IF;
  IF EXISTS (SELECT 1 FROM "SupportTag" WHERE id = p_id AND "systemKey" IS NOT NULL) THEN
    RAISE EXCEPTION 'This tag is built in and can''t be deleted';
  END IF;
  DELETE FROM "SupportTag" WHERE id = p_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.run_followup_assignment(p_manual boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_enabled JSONB;
  v_max INT;
  v_load JSONB := '{}'::jsonb;    -- "<cohortId|''>|<ownerId>" -> open count
  v_batches JSONB := '{}'::jsonb; -- "<ownerId>" -> {"count": n, "names": [...]}
  v_assigned INT := 0;
  v_stuck_no_gender INT := 0;
  v_stuck_unknown_gender INT := 0;
  v_stuck_invalid_phone INT := 0;
  rec RECORD;
  v_target UUID;
  v_candidate UUID;
  v_load_key TEXT;
  v_current_load INT;
  v_batch JSONB;
  v_names JSONB;
  v_relaxed_adder INT := 0;
  v_relaxed_any INT := 0;
  v_relaxed_over INT := 0;
BEGIN
  IF NOT p_manual THEN
    SELECT value INTO v_enabled FROM "AppSetting" WHERE "settingKey" = 'followup_auto_assign_enabled';
    -- Missing row means on, same convention as scriptures_enabled.
    IF v_enabled IS NOT NULL AND v_enabled = to_jsonb(false) THEN
      RETURN jsonb_build_object('enabled', false, 'assigned', 0, 'stuckNoGender', 0, 'stuckUnknownGender', 0, 'stuckInvalidPhone', 0, 'batches', '{}'::jsonb);
    END IF;
  END IF;

  SELECT COALESCE((value->>'maxFollowUpsPerSupport')::int, 15) INTO v_max
  FROM "AppSetting" WHERE "settingKey" = 'programme_rules';
  IF v_max IS NULL THEN v_max := 15; END IF;

  -- Seed each support's current open load per cohort. "Open" mirrors
  -- openLoadByOwner / isClosedContact in frontend/src/utils/followUps.ts:
  -- not archived and not closed (Access confirmed, not interested, no response, wrong number).
  FOR rec IN
    SELECT COALESCE(c."cohortId"::text, '') || '|' || c."ownerId"::text AS k, COUNT(*) AS cnt
    FROM "FollowUpContact" c
    WHERE c."ownerId" IS NOT NULL
      AND c."archivedAt" IS NULL
      AND c."isTest" IS NOT TRUE
      -- Same as isClosedContact: only Access confirmed closes a successful one, so
      -- Registered, Login shared and Issue with login (not in the app yet) count
      -- towards the limit.
      AND c."registrationStatus" NOT IN ('ACCESS_CONFIRMED', 'NOT_INTERESTED', 'NOT_A_GOOD_TIME', 'NOT_A_TCN_MEMBER', 'NO_RESPONSE', 'ATTENDED', 'TEENAGER', 'TEEN_ONBOARDED')
      AND NOT (c."registrationStatus" NOT IN ('REGISTERED', 'LOGIN_SHARED', 'LOGIN_ISSUE', 'NEXT_COHORT')
               AND (c."replyStatus" = 'INCORRECT_NUMBER' OR c."callStatus" = 'INCORRECT_NUMBER'))
    GROUP BY 1
  LOOP
    v_load := jsonb_set(v_load, ARRAY[rec.k], to_jsonb(rec.cnt));
  END LOOP;

  FOR rec IN
    SELECT * FROM "FollowUpContact" c
    WHERE c."ownerId" IS NULL
      AND c."archivedAt" IS NULL
      -- Closed outcomes are never handed out again (see fof follow-up cohort rule).
      AND c."registrationStatus" NOT IN ('ACCESS_CONFIRMED', 'NEXT_COHORT', 'NOT_INTERESTED', 'NOT_A_GOOD_TIME', 'NOT_A_TCN_MEMBER', 'NO_RESPONSE', 'ATTENDED', 'TEENAGER', 'TEEN_ONBOARDED')
      AND c."replyStatus" <> 'INCORRECT_NUMBER'
      AND c."callStatus" <> 'INCORRECT_NUMBER'
      -- Test contacts are never handed out; an admin assigns them by hand.
      AND c."isTest" IS NOT TRUE
      AND (p_manual OR c."cohortId" IS NULL OR c."cohortId" = public.current_programme_cohort_id())
      AND (p_manual OR c."createdAt" <= now() - interval '2 hours')
    ORDER BY c."createdAt" ASC
  LOOP
    -- Held back until an admin fixes the number: a support can't reach them.
    IF NOT public.followup_phone_is_valid(rec.phone) THEN
      v_stuck_invalid_phone := v_stuck_invalid_phone + 1;
      CONTINUE;
    END IF;

    IF rec.gender IS NULL OR rec.gender NOT IN ('Male', 'Female') THEN
      v_stuck_unknown_gender := v_stuck_unknown_gender + 1;
      CONTINUE;
    END IF;

    v_target := NULL;

    -- Rule 2: whoever added them, if same gender and under the limit.
    IF rec."registeredById" IS NOT NULL THEN
      v_candidate := NULL;
      SELECT u.id INTO v_candidate
      FROM "User" u
      WHERE u.id = rec."registeredById"
        AND u.role IN ('SUPPORT', 'ADMIN')
        AND u."isTest" IS NOT TRUE
        AND u."isActive" IS NOT FALSE
        AND u.gender = rec.gender
        AND NOT public.followup_owner_is_quiet(u.id);
      IF v_candidate IS NOT NULL THEN
        v_load_key := COALESCE(rec."cohortId"::text, '') || '|' || v_candidate::text;
        v_current_load := COALESCE((v_load->>v_load_key)::int, 0);
        IF v_current_load < v_max THEN
          v_target := v_candidate;
        END IF;
      END IF;
    END IF;

    -- Rule 3: same-gender support under the limit, fewest open first, ties by name.
    IF v_target IS NULL THEN
      SELECT u.id INTO v_target
      FROM "User" u
      WHERE u.role IN ('SUPPORT', 'ADMIN')
        AND u."isActive" IS NOT FALSE
        AND u."isTest" IS NOT TRUE
        AND u.gender = rec.gender
        AND NOT public.followup_owner_is_quiet(u.id)
        AND COALESCE((v_load->>(COALESCE(rec."cohortId"::text, '') || '|' || u.id::text))::int, 0) < v_max
      ORDER BY COALESCE((v_load->>(COALESCE(rec."cohortId"::text, '') || '|' || u.id::text))::int, 0) ASC, u.name ASC
      LIMIT 1;
    END IF;

    -- Relaxed steps, only when the strict rules found nobody (see Settings, Follow-up auto-assignment).
    IF v_target IS NULL AND rec."registeredById" IS NOT NULL AND public.followup_relax_on('followup_relax_adder', TRUE) THEN
      SELECT u.id INTO v_target FROM "User" u
      WHERE u.id = rec."registeredById" AND u.role IN ('SUPPORT', 'ADMIN') AND u."isActive" IS NOT FALSE AND u."isTest" IS NOT TRUE
        AND NOT public.followup_owner_is_quiet(u.id)
        AND COALESCE((v_load->>(COALESCE(rec."cohortId"::text, '') || '|' || u.id::text))::int, 0) < v_max;
      IF v_target IS NOT NULL THEN v_relaxed_adder := v_relaxed_adder + 1; END IF;
    END IF;
    IF v_target IS NULL AND public.followup_relax_on('followup_relax_any_gender', TRUE) THEN
      SELECT u.id INTO v_target FROM "User" u
      WHERE u.role IN ('SUPPORT', 'ADMIN') AND u."isActive" IS NOT FALSE AND u."isTest" IS NOT TRUE
        AND NOT public.followup_owner_is_quiet(u.id)
        AND COALESCE((v_load->>(COALESCE(rec."cohortId"::text, '') || '|' || u.id::text))::int, 0) < v_max
      ORDER BY COALESCE((v_load->>(COALESCE(rec."cohortId"::text, '') || '|' || u.id::text))::int, 0) ASC, u.name ASC
      LIMIT 1;
      IF v_target IS NOT NULL THEN v_relaxed_any := v_relaxed_any + 1; END IF;
    END IF;
    IF v_target IS NULL AND public.followup_relax_on('followup_relax_over_limit', FALSE) THEN
      SELECT u.id INTO v_target FROM "User" u
      WHERE u.role IN ('SUPPORT', 'ADMIN') AND u."isActive" IS NOT FALSE AND u."isTest" IS NOT TRUE
        AND NOT public.followup_owner_is_quiet(u.id)
      ORDER BY (u.gender = rec.gender) DESC, COALESCE((v_load->>(COALESCE(rec."cohortId"::text, '') || '|' || u.id::text))::int, 0) ASC, u.name ASC
      LIMIT 1;
      IF v_target IS NOT NULL THEN v_relaxed_over := v_relaxed_over + 1; END IF;
    END IF;

    IF v_target IS NULL THEN
      v_stuck_no_gender := v_stuck_no_gender + 1;
      CONTINUE;
    END IF;

    UPDATE "FollowUpContact" SET "ownerId" = v_target, "updatedAt" = now() WHERE id = rec.id;

    v_load_key := COALESCE(rec."cohortId"::text, '') || '|' || v_target::text;
    v_load := jsonb_set(v_load, ARRAY[v_load_key], to_jsonb(COALESCE((v_load->>v_load_key)::int, 0) + 1));

    v_batch := COALESCE(v_batches->v_target::text, jsonb_build_object('count', 0, 'names', '[]'::jsonb));
    v_names := COALESCE(v_batch->'names', '[]'::jsonb);
    IF jsonb_array_length(v_names) < 3 THEN
      v_names := v_names || to_jsonb(rec."fullName");
    END IF;
    v_batch := jsonb_set(v_batch, ARRAY['count'], to_jsonb(COALESCE((v_batch->>'count')::int, 0) + 1));
    v_batch := jsonb_set(v_batch, ARRAY['names'], v_names);
    v_batches := jsonb_set(v_batches, ARRAY[v_target::text], v_batch);

    v_assigned := v_assigned + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'enabled', true,
    'assigned', v_assigned,
    'stuckNoGender', v_stuck_no_gender,
    'stuckUnknownGender', v_stuck_unknown_gender,
    'stuckInvalidPhone', v_stuck_invalid_phone,
    'relaxedAdder', v_relaxed_adder,
    'relaxedAnyGender', v_relaxed_any,
    'relaxedOverLimit', v_relaxed_over,
    'batches', v_batches
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.run_followup_reassignment()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_max INT;
  v_load JSONB := '{}'::jsonb;
  v_active UUID[];
  v_prompted JSONB := '[]'::jsonb;
  v_to JSONB := '{}'::jsonb;
  v_from JSONB := '{}'::jsonb;
  v_stuck INT := 0;
  v_moved INT := 0;
  rec RECORD;
  k RECORD;
  c RECORD;
  v_target UUID;
  v_key TEXT;
  v_entry JSONB;
  v_names JSONB;
BEGIN
  IF NOT public.followup_reassign_enabled() THEN
    RETURN jsonb_build_object('enabled', false);
  END IF;

  SELECT COALESCE((value->>'maxFollowUpsPerSupport')::int, 15) INTO v_max
  FROM "AppSetting" WHERE "settingKey" = 'programme_rules';
  IF v_max IS NULL THEN v_max := 15; END IF;

  -- 1. A check whose person has been moved (or who has nobody left stale) is done.
  UPDATE "FollowUpOwnerCheck" ck SET "closedAt" = now(), "closedReason" = 'MOVED'
  WHERE ck."closedAt" IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.followup_stale_contacts() s WHERE s."ownerId" = ck."ownerId");

  -- 2. New checks for supports holding people who have not moved in 24h.
  FOR rec IN
    SELECT s."ownerId" AS owner_id, COUNT(*) AS cnt,
           (array_agg(split_part(s."fullName", ' ', 1) ORDER BY s."ownerAssignedAt"))[1:3] AS names
    FROM public.followup_stale_contacts() s
    WHERE NOT EXISTS (SELECT 1 FROM "FollowUpOwnerCheck" ck WHERE ck."ownerId" = s."ownerId" AND ck."closedAt" IS NULL)
    GROUP BY s."ownerId"
  LOOP
    INSERT INTO "FollowUpOwnerCheck" ("ownerId", "deadlineAt") VALUES (rec.owner_id, now() + interval '24 hours');
    v_prompted := v_prompted || jsonb_build_array(jsonb_build_object('ownerId', rec.owner_id, 'count', rec.cnt, 'names', to_jsonb(rec.names)));
  END LOOP;

  -- 3. Checks that are due: hand the still-unmoved people to supports who are moving people.
  IF EXISTS (SELECT 1 FROM "FollowUpOwnerCheck" WHERE "closedAt" IS NULL AND "deadlineAt" <= now()) THEN
    SELECT COALESCE(array_agg(a), ARRAY[]::UUID[]) INTO v_active FROM public.followup_active_supports() a;

    -- Each support's current open load per cohort, same definition as run_followup_assignment.
    FOR rec IN
      SELECT COALESCE(x."cohortId"::text, '') || '|' || x."ownerId"::text AS key, COUNT(*) AS cnt
      FROM "FollowUpContact" x
      WHERE x."ownerId" IS NOT NULL AND x."archivedAt" IS NULL AND x."isTest" IS NOT TRUE
        AND x."registrationStatus" NOT IN ('ACCESS_CONFIRMED', 'NOT_INTERESTED', 'NOT_A_GOOD_TIME', 'NOT_A_TCN_MEMBER', 'NO_RESPONSE', 'ATTENDED', 'TEENAGER', 'TEEN_ONBOARDED')
        AND NOT (x."registrationStatus" NOT IN ('REGISTERED', 'LOGIN_SHARED', 'LOGIN_ISSUE', 'NEXT_COHORT')
                 AND (x."replyStatus" = 'INCORRECT_NUMBER' OR x."callStatus" = 'INCORRECT_NUMBER'))
      GROUP BY 1
    LOOP
      v_load := jsonb_set(v_load, ARRAY[rec.key], to_jsonb(rec.cnt));
    END LOOP;

    FOR k IN SELECT * FROM "FollowUpOwnerCheck" WHERE "closedAt" IS NULL AND "deadlineAt" <= now() ORDER BY "deadlineAt" LOOP
      FOR c IN SELECT * FROM public.followup_stale_contacts() s WHERE s."ownerId" = k."ownerId" ORDER BY s."ownerAssignedAt" LOOP
        v_target := NULL;
        IF c.gender IN ('Male', 'Female') THEN
          SELECT u.id INTO v_target
          FROM "User" u
          WHERE (u.role = 'SUPPORT' OR 'SUPPORT'::"Role" = ANY(u.roles)) AND u."isActive" IS NOT FALSE AND u."isTest" IS NOT TRUE
            AND u.gender = c.gender
            AND u.id <> k."ownerId"
            AND u.id = ANY(v_active)
            AND NOT public.followup_owner_handed_on_recently(u.id)
            AND NOT public.followup_support_inactive(u.id)
            AND COALESCE((v_load->>(COALESCE(c."cohortId"::text, '') || '|' || u.id::text))::int, 0) < v_max
          ORDER BY COALESCE((v_load->>(COALESCE(c."cohortId"::text, '') || '|' || u.id::text))::int, 0) ASC, u.name ASC
          LIMIT 1;
        END IF;

        -- Relaxed steps, only when no same-gender receiver was found.
        IF v_target IS NULL AND public.followup_relax_on('followup_relax_adder', TRUE) THEN
          SELECT u.id INTO v_target FROM "User" u
          WHERE u.id = (SELECT x."registeredById" FROM "FollowUpContact" x WHERE x.id = c.id)
            AND (u.role = 'SUPPORT' OR 'SUPPORT'::"Role" = ANY(u.roles)) AND u."isActive" IS NOT FALSE AND u."isTest" IS NOT TRUE
            AND u.id <> k."ownerId" AND u.id = ANY(v_active)
            AND NOT public.followup_owner_handed_on_recently(u.id) AND NOT public.followup_support_inactive(u.id)
            AND COALESCE((v_load->>(COALESCE(c."cohortId"::text, '') || '|' || u.id::text))::int, 0) < v_max;
        END IF;
        IF v_target IS NULL AND public.followup_relax_on('followup_relax_any_gender', TRUE) THEN
          SELECT u.id INTO v_target FROM "User" u
          WHERE (u.role = 'SUPPORT' OR 'SUPPORT'::"Role" = ANY(u.roles)) AND u."isActive" IS NOT FALSE AND u."isTest" IS NOT TRUE
            AND u.id <> k."ownerId" AND u.id = ANY(v_active)
            AND NOT public.followup_owner_handed_on_recently(u.id) AND NOT public.followup_support_inactive(u.id)
            AND COALESCE((v_load->>(COALESCE(c."cohortId"::text, '') || '|' || u.id::text))::int, 0) < v_max
          ORDER BY COALESCE((v_load->>(COALESCE(c."cohortId"::text, '') || '|' || u.id::text))::int, 0) ASC, u.name ASC
          LIMIT 1;
        END IF;
        IF v_target IS NULL AND public.followup_relax_on('followup_relax_over_limit', FALSE) THEN
          SELECT u.id INTO v_target FROM "User" u
          WHERE (u.role = 'SUPPORT' OR 'SUPPORT'::"Role" = ANY(u.roles)) AND u."isActive" IS NOT FALSE AND u."isTest" IS NOT TRUE
            AND u.id <> k."ownerId" AND u.id = ANY(v_active)
            AND NOT public.followup_owner_handed_on_recently(u.id) AND NOT public.followup_support_inactive(u.id)
          ORDER BY (u.gender = c.gender) DESC, COALESCE((v_load->>(COALESCE(c."cohortId"::text, '') || '|' || u.id::text))::int, 0) ASC, u.name ASC
          LIMIT 1;
        END IF;

        IF v_target IS NULL THEN
          v_stuck := v_stuck + 1;
          CONTINUE;
        END IF;

        UPDATE "FollowUpContact" SET "ownerId" = v_target, "updatedAt" = now() WHERE id = c.id;
        INSERT INTO "FollowUpReassignmentLog" ("contactId", "fromUserId", "toUserId", reason)
        VALUES (c.id, k."ownerId", v_target, CASE WHEN k.answer = 'NOT_NOW' THEN 'NOT_NOW' WHEN k.extended THEN 'NO_MOVEMENT_AFTER_YES' ELSE 'NO_RESPONSE' END);

        v_key := COALESCE(c."cohortId"::text, '') || '|' || v_target::text;
        v_load := jsonb_set(v_load, ARRAY[v_key], to_jsonb(COALESCE((v_load->>v_key)::int, 0) + 1));

        v_entry := COALESCE(v_to->v_target::text, jsonb_build_object('count', 0, 'names', '[]'::jsonb));
        v_names := v_entry->'names';
        IF jsonb_array_length(v_names) < 3 THEN v_names := v_names || to_jsonb(c."fullName"); END IF;
        v_to := jsonb_set(v_to, ARRAY[v_target::text], jsonb_build_object('count', (v_entry->>'count')::int + 1, 'names', v_names));

        v_entry := COALESCE(v_from->k."ownerId"::text, jsonb_build_object('count', 0, 'names', '[]'::jsonb));
        v_names := v_entry->'names';
        IF jsonb_array_length(v_names) < 3 THEN v_names := v_names || to_jsonb(split_part(c."fullName", ' ', 1)); END IF;
        v_from := jsonb_set(v_from, ARRAY[k."ownerId"::text], jsonb_build_object('count', (v_entry->>'count')::int + 1, 'names', v_names));

        v_moved := v_moved + 1;
      END LOOP;

      -- Done only when nobody stale is left; otherwise keep it open and retry quietly next time.
      IF NOT EXISTS (SELECT 1 FROM public.followup_stale_contacts() s WHERE s."ownerId" = k."ownerId") THEN
        UPDATE "FollowUpOwnerCheck" SET "closedAt" = now(), "closedReason" = 'REASSIGNED' WHERE id = k.id;
      END IF;
    END LOOP;
  END IF;

  RETURN jsonb_build_object('enabled', true, 'prompted', v_prompted, 'movedTo', v_to, 'movedFrom', v_from, 'moved', v_moved, 'stuckNoReceiver', v_stuck);
END;
$function$;

CREATE OR REPLACE FUNCTION public.followup_stale_contacts()
 RETURNS SETOF "FollowUpContact"
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT c.*
  FROM "FollowUpContact" c
  JOIN "User" u ON u.id = c."ownerId"
  WHERE c."archivedAt" IS NULL
    AND c."isTest" IS NOT TRUE
    AND (c."cohortId" IS NULL
         OR c."cohortId" = public.current_programme_cohort_id())
    AND (u.role = 'SUPPORT' OR 'SUPPORT'::"Role" = ANY(u.roles)) AND u."isTest" IS NOT TRUE AND u."isActive" IS NOT FALSE
    AND c."nextAction" IS DISTINCT FROM 'CLOSE'
    AND c."registrationStatus" NOT IN ('ACCESS_CONFIRMED', 'LOGIN_SHARED', 'NOT_INTERESTED', 'NOT_A_GOOD_TIME', 'NOT_A_TCN_MEMBER', 'NO_RESPONSE', 'ATTENDED', 'NEXT_COHORT', 'TEENAGER', 'TEEN_ONBOARDED')
    AND c."replyStatus" <> 'INCORRECT_NUMBER' AND c."callStatus" <> 'INCORRECT_NUMBER'
    AND (c."statusChangedAt" IS NULL OR c."statusChangedAt" <= c."ownerAssignedAt")
    AND NOT EXISTS (
      SELECT 1 FROM "FollowUpIssueContact" ic JOIN "FollowUpIssue" i ON i.id = ic."issueId"
      WHERE ic."contactId" = c.id AND (i.status = 'OPEN' OR i."createdAt" >= c."ownerAssignedAt")
    )
    AND NOT EXISTS (
      SELECT 1 FROM "FollowUpIssue" i WHERE i."contactId" = c.id AND i.status = 'OPEN'
    )
    AND GREATEST(c."ownerAssignedAt", public.followup_reassign_since()) <= now() - interval '24 hours';
$function$;

CREATE OR REPLACE FUNCTION public.followup_contact_registration_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NEW."registrationStatus" IN ('REGISTERED', 'LOGIN_SHARED', 'ACCESS_CONFIRMED', 'TEENAGER', 'TEEN_ONBOARDED')
     AND (OLD."registrationStatus" IS NULL
          OR OLD."registrationStatus" NOT IN ('REGISTERED', 'LOGIN_SHARED', 'ACCESS_CONFIRMED', 'TEENAGER', 'TEEN_ONBOARDED'))
     AND NEW."manualRegistrationAt" IS NULL
     AND NOT EXISTS (SELECT 1 FROM public."SheetRegistration" WHERE "contactId" = NEW.id)
     AND NOT EXISTS (
       SELECT 1 FROM public."SheetRegistration"
       WHERE "contactId" IS NULL
         AND "phoneNormalised" = public.fof_phone_key(NEW.phone)
         AND "createdAt" > now() - interval '15 minutes'
     ) THEN
    RAISE EXCEPTION 'NO_FORM_REGISTRATION';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cohort_health(p_cohort_id uuid)
 RETURNS json
 LANGUAGE sql
 STABLE
AS $function$
  WITH
  cohort AS (
    SELECT id, name, "startDate", "endDate", status, "schedulePublished"
    FROM "Cohort" WHERE id = p_cohort_id
  ),
  weeks AS (
    SELECT id, "weekNumber", "classDate", ("recapDocumentUrl" IS NOT NULL) AS "recapUploaded"
    FROM "Week" WHERE "cohortId" = p_cohort_id
  ),
  people AS (
    SELECT id, status FROM "Participant" WHERE "cohortId" = p_cohort_id AND NOT "isTest"
  ),
  membership AS (
    SELECT gp."groupId", gp."participantId"
    FROM "GroupParticipant" gp
    JOIN "Group" g ON g.id = gp."groupId" AND g."cohortId" = p_cohort_id
    JOIN people p ON p.id = gp."participantId" AND p.status = 'ACTIVE'
  ),
  groups AS (
    SELECT g.id, g.name, g."supportId", u.name AS "supportName",
           (SELECT count(*) FROM membership m WHERE m."groupId" = g.id) AS members
    FROM "Group" g
    LEFT JOIN "User" u ON u.id = g."supportId"
    WHERE g."cohortId" = p_cohort_id
  ),
  attendance AS (
    SELECT a."weekId", m."groupId",
           count(*) AS marked,
           count(*) FILTER (WHERE a.status = 'PRESENT') AS present,
           count(*) FILTER (WHERE a.status = 'LATE') AS late,
           count(*) FILTER (WHERE a.status = 'LEFT_EARLY') AS "leftEarly",
           count(*) FILTER (WHERE a.status = 'ABSENT') AS absent,
           count(*) FILTER (
             WHERE a.status = 'PRESENT' OR (a.status IN ('LATE', 'LEFT_EARLY') AND a."lateExcused")
           ) AS attended
    FROM "AttendanceRecord" a
    JOIN membership m ON m."participantId" = a."participantId"
    JOIN weeks w ON w.id = a."weekId"
    GROUP BY a."weekId", m."groupId"
  ),
  meetings AS (
    SELECT s."weekId", s."groupId"
    FROM "GroupPrayerStatus" s
    JOIN weeks w ON w.id = s."weekId"
    WHERE s.done
  ),
  contacts AS (
    SELECT * FROM "FollowUpContact" WHERE "cohortId" = p_cohort_id
  )
  SELECT json_build_object(
    'cohort', (SELECT row_to_json(c) FROM cohort c),
    'weeks', COALESCE((SELECT json_agg(w ORDER BY w."weekNumber") FROM weeks w), '[]'::json),
    'participants', json_build_object(
      'active', (SELECT count(*) FROM people WHERE status = 'ACTIVE'),
      'archived', (SELECT count(*) FROM people WHERE status <> 'ACTIVE'),
      'inGroups', (SELECT count(DISTINCT "participantId") FROM membership)
    ),
    'groups', COALESCE((SELECT json_agg(g ORDER BY g.name) FROM groups g), '[]'::json),
    'attendance', COALESCE((SELECT json_agg(a) FROM attendance a), '[]'::json),
    'meetings', COALESCE((SELECT json_agg(m) FROM meetings m), '[]'::json),
    'faithProjects', COALESCE((
      SELECT json_object_agg(status, n) FROM (
        SELECT f.status, count(*) AS n
        FROM "FaithProject" f JOIN people p ON p.id = f."participantId" AND p.status = 'ACTIVE'
        GROUP BY f.status
      ) x
    ), '{}'::json),
    'followUps', json_build_object(
      'total', (SELECT count(*) FROM contacts),
      'contacted', (SELECT count(*) FROM contacts
                    WHERE "messageStatus" = 'SENT'
                       OR "callStatus" IN ('CALLED', 'CALL_BACK_LATER', 'MISSED_CALL')
                       OR ("replyStatus" <> 'NO_REPLY' AND source IS DISTINCT FROM 'Google Form')),
      'replied', (SELECT count(*) FROM contacts
                  WHERE "replyStatus" = 'REPLIED'
                    AND (source IS DISTINCT FROM 'Google Form'
                         OR "messageStatus" = 'SENT'
                         OR "callStatus" IN ('CALLED', 'CALL_BACK_LATER', 'MISSED_CALL'))),
      'registered', (SELECT count(*) FROM contacts WHERE "registrationStatus" IN ('REGISTERED', 'TEENAGER', 'TEEN_ONBOARDED')),
      'open', (SELECT count(*) FROM contacts WHERE "archivedAt" IS NULL)
    ),
    'nextCohortPeople', (SELECT count(*) FROM "FollowUpContact"
                         WHERE "registrationStatus" = 'NEXT_COHORT' AND "archivedAt" IS NULL
                           AND "cohortId" IS DISTINCT FROM p_cohort_id),
    'openFlags', (SELECT count(*) FROM "ParticipantFlag" f JOIN people p ON p.id = f."participantId" WHERE f."clearedAt" IS NULL),
    'pendingCover', (SELECT count(*) FROM "CoverRequest" WHERE status = 'PENDING' AND "endsAt" >= now()),
    'sheetSyncProblems', (SELECT count(*) FROM "FollowUpContact"
                          WHERE "createdAt" >= now() - interval '7 days'
                            AND (("sheetSyncError" IS NOT NULL AND "sheetSyncedAt" IS NULL) OR "sheetSyncWarning" IS NOT NULL))
  );
$function$;
