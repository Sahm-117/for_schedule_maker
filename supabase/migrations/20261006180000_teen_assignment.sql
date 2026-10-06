-- Teens, step 2a: who looks after them, and how a support adds one.
--
--   1. Columns: FollowUpContact."guardianPhone", "teenOnboardedHow",
--      "teenGenderFallback"; Participant."guardianPhone".
--   2. fof_name_key(): a name as a sorted set of words, so "Abimbola Oluwaseye"
--      and "Oluwaseye Abimbola" are the same person.
--   3. assign_teen_contacts(p_only_contact): hands unowned TEENAGER contacts to
--      Teen Supports (SupportTag systemKey TEEN_SUPPORT). Same gender first,
--      fewest teens first, never above programme_rules.maxTeensPerTeenSupport
--      (default 4) counting ALL of a support's teens (onboarded too: they are one
--      group). HARD RULE: a teen only ever goes to a same-gender Teen Support. If
--      none has room the teen waits (reported as stuck, admins are told); there is
--      no opposite-gender fallback. Nothing here ever moves a teen who already has
--      a support. ("teenGenderFallback" below is never set; the column is unused.)
--   4. teen_add_prospect(): a support adds a teen from Mobilisation. Staff only,
--      refused while teen_flow_enabled is off. It sets the manual-registration
--      columns in the same statement so the form gate (FLOW_MAP rule 1) passes,
--      links an existing same-name participant instead of duplicating, and assigns
--      at once.
--   5. assign_followups_now (admin "Assign now") also runs teen assignment and
--      merges the two sets of batches so owners are told once.
--   6. A seeded "Teen welcome" message template (category TEEN).
--
-- Needs 20261006160000 / 161000 / 170000 applied first.
--
-- Rollback: DROP FUNCTION teen_add_prospect, assign_teen_contacts,
-- merge_followup_batches, fof_name_key; restore assign_followups_now from
-- 20260928160000_followup_auto_assignment.sql; DELETE the "Teen welcome" row from
-- "MessageTemplate"; ALTER TABLE "FollowUpContact" DROP COLUMN "guardianPhone",
-- DROP COLUMN "teenOnboardedHow", DROP COLUMN "teenGenderFallback";
-- ALTER TABLE "Participant" DROP COLUMN "guardianPhone".

ALTER TABLE public."FollowUpContact"
  ADD COLUMN IF NOT EXISTS "guardianPhone" TEXT,
  ADD COLUMN IF NOT EXISTS "teenOnboardedHow" TEXT,
  ADD COLUMN IF NOT EXISTS "teenGenderFallback" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public."FollowUpContact" DROP CONSTRAINT IF EXISTS "FollowUpContact_teenOnboardedHow_check";
ALTER TABLE public."FollowUpContact" ADD CONSTRAINT "FollowUpContact_teenOnboardedHow_check"
  CHECK ("teenOnboardedHow" IS NULL OR "teenOnboardedHow" IN ('WHATSAPP_GROUP', 'PARENT_REACHED', 'PHONE_CALL'));
ALTER TABLE public."Participant" ADD COLUMN IF NOT EXISTS "guardianPhone" TEXT;

-- ── 2. Name as a set of words ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fof_name_key(n text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(array_to_string(ARRAY(
    SELECT DISTINCT w FROM unnest(regexp_split_to_array(lower(btrim(COALESCE(n, ''))), '\s+')) AS w WHERE w <> '' ORDER BY w
  ), ' '), '');
$function$;

-- ── 3. Teen assignment ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.assign_teen_contacts(p_only_contact uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_enabled JSONB;
  v_tag UUID;
  v_max INT;
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
  SELECT COALESCE((value->>'maxTeensPerTeenSupport')::int, 4) INTO v_max
  FROM "AppSetting" WHERE "settingKey" = 'programme_rules';
  IF v_max IS NULL THEN v_max := 4; END IF;

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
        AND NOT public.followup_owner_is_quiet(u.id)
        AND COALESCE((v_load->>(COALESCE(rec."cohortId"::text, '') || '|' || u.id::text))::int, 0) < v_max;
    END IF;

    -- Same gender, fewest teens first, ties by name.
    IF v_target IS NULL THEN
      SELECT u.id INTO v_target
      FROM "User" u
      JOIN "SupportTagMember" m ON m."userId" = u.id AND m."tagId" = v_tag
      WHERE u.role IN ('SUPPORT', 'ADMIN') AND u."isActive" IS NOT FALSE AND u."isTest" IS NOT TRUE
        AND u.gender = rec.gender
        AND NOT public.followup_owner_is_quiet(u.id)
        AND COALESCE((v_load->>(COALESCE(rec."cohortId"::text, '') || '|' || u.id::text))::int, 0) < v_max
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
REVOKE ALL ON FUNCTION public.assign_teen_contacts(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_teen_contacts(uuid) TO service_role;

-- ── 5. Admin "Assign now" runs both, owners told once ────────────────────────
CREATE OR REPLACE FUNCTION public.merge_followup_batches(a jsonb, b jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $function$
DECLARE
  out jsonb := COALESCE(a, '{}'::jsonb);
  k text;
  cur jsonb;
  add jsonb;
  names jsonb;
BEGIN
  FOR k IN SELECT jsonb_object_keys(COALESCE(b, '{}'::jsonb)) LOOP
    add := b->k;
    cur := out->k;
    IF cur IS NULL THEN
      out := jsonb_set(out, ARRAY[k], add);
    ELSE
      names := COALESCE(cur->'names', '[]'::jsonb);
      IF jsonb_array_length(names) < 3 THEN
        names := names || COALESCE(add->'names', '[]'::jsonb);
      END IF;
      out := jsonb_set(out, ARRAY[k], jsonb_build_object(
        'count', COALESCE((cur->>'count')::int, 0) + COALESCE((add->>'count')::int, 0),
        'names', (SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) FROM (SELECT x FROM jsonb_array_elements(names) x LIMIT 3) s)));
    END IF;
  END LOOP;
  RETURN out;
END;
$function$;

CREATE OR REPLACE FUNCTION public.assign_followups_now(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  actor "User" := public.app_staff(p_token);
  r jsonb;
  t jsonb;
BEGIN
  IF actor.id IS NULL OR actor.role <> 'ADMIN'::"Role" THEN
    RAISE EXCEPTION 'NOT_AUTHORISED';
  END IF;
  r := public.run_followup_assignment(TRUE);
  t := public.assign_teen_contacts(NULL);
  RETURN r || jsonb_build_object(
    'batches', public.merge_followup_batches(r->'batches', t->'batches'),
    'assigned', COALESCE((r->>'assigned')::int, 0) + COALESCE((t->>'assigned')::int, 0),
    'teen', t);
END;
$function$;

-- ── 4. A support adds a teen ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.teen_add_prospect(
  p_token text,
  p_full_name text,
  p_phone text,
  p_guardian_phone text,
  p_gender text,
  p_email text,
  p_cohort_id uuid DEFAULT NULL
)
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
      "ageRange" = '18 and below',
      gender = COALESCE(NULLIF(gender, ''), v_gender),
      "guardianPhone" = COALESCE(v_guard, "guardianPhone"),
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
      "fullName", phone, "guardianPhone", email, gender, "ageRange", "cohortId", source,
      "registeredById", "registeredByActedAs", "registrationStatus", "replyStatus", "nextAction", "isTest",
      "manualRegistrationAt", "manualRegistrationBy", "manualRegistrationReason"
    ) VALUES (
      v_name, v_phone, v_guard, v_email, v_gender, '18 and below', v_cohort, 'Added for follow up by ' || actor.name || ' (teen)',
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
    VALUES (v_name, v_phone, v_guard, v_cohort, 'FOLLOW_UP', 'ACTIVE', v_email, v_gender, '18 and below', v_contact.id, now(), v_is_test)
    RETURNING id INTO v_part_id;
  ELSE
    UPDATE "Participant" SET
      "ageRange" = '18 and below',
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
REVOKE ALL ON FUNCTION public.teen_add_prospect(text, text, text, text, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.teen_add_prospect(text, text, text, text, text, text, uuid) TO anon, authenticated;

-- ── 6. The welcome message ───────────────────────────────────────────────────
INSERT INTO "MessageTemplate" ("useCase", body, "whenToUse", category)
SELECT 'Teen welcome',
       E'Hello {{first_name}}! Congratulations on registering for FOF at The Covenant Nation (TCN) Ikorodu.\n\nMy name is {{user.name}} and I will be your support throughout the programme.\n\nPlease join our WhatsApp group here:\n{{group_link}}\n\nLooking forward to meeting you!',
       'Your first message to a teen (or their parent), with your WhatsApp group link.',
       'TEEN'
WHERE NOT EXISTS (SELECT 1 FROM "MessageTemplate" WHERE "useCase" = 'Teen welcome');
