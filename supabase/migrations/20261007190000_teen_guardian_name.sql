-- Teen messages: a parent or guardian's name on a teen's follow-up card.
--
--   1. FollowUpContact."guardianName": used by the {{parent_name}} placeholder in
--      "for the parent" message templates (falls back to "Sir/Ma" when empty).
--   2. teen_add_prospect() takes an optional p_guardian_name (Mobilisation's teen form).
--
-- Rollback: DROP the new teen_add_prospect (8 args), recreate the 7-arg one from
-- 20261006180000_teen_assignment.sql; ALTER TABLE "FollowUpContact" DROP COLUMN "guardianName".

ALTER TABLE public."FollowUpContact" ADD COLUMN IF NOT EXISTS "guardianName" TEXT;

DROP FUNCTION IF EXISTS public.teen_add_prospect(text, text, text, text, text, text, uuid);

CREATE OR REPLACE FUNCTION public.teen_add_prospect(
  p_token text,
  p_full_name text,
  p_phone text,
  p_guardian_phone text,
  p_gender text,
  p_email text,
  p_cohort_id uuid DEFAULT NULL,
  p_guardian_name text DEFAULT NULL
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
      "ageRange" = '18 and below',
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
      v_name, v_phone, v_guard, v_guard_name, v_email, v_gender, '18 and below', v_cohort, 'Added for follow up by ' || actor.name || ' (teen)',
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
REVOKE ALL ON FUNCTION public.teen_add_prospect(text, text, text, text, text, text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.teen_add_prospect(text, text, text, text, text, text, uuid, text) TO anon, authenticated;
