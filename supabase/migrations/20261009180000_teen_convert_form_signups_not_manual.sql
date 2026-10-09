-- teen_convert_participant no longer marks a person who signed up on the form as "registered by hand".
--
-- The conversion stamped manualRegistrationAt / manualRegistrationReason on every contact it converted. That mark exists for
-- contacts with no form behind them (the form gate, FLOW_MAP rule 1, lets a contact with no form into Registered only when it is
-- set), so it is still set when the contact was created here or has no form registration, and left alone when the person signed
-- up on the form. One contact converted earlier today by an admin edit had a form and carried the stamp; it is cleared here.
--
-- Rollback: re-apply teen_convert_participant from 20261009150000_teen_age_change_follows.sql.
-- Idempotent.

CREATE OR REPLACE FUNCTION public.teen_convert_participant(p_participant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_cohort UUID := public.current_programme_cohort_id();
  rec "Participant";
  v_contact "FollowUpContact";
  v_keep BOOLEAN;
  v_prev UUID;
  v_created BOOLEAN := FALSE;
  v_support UUID;
  v_told INT := 0;
  v_has_form BOOLEAN;
BEGIN
  SELECT * INTO rec FROM "Participant" WHERE id = p_participant_id;
  IF rec.id IS NULL OR rec.status <> 'ACTIVE' OR rec."isTest" IS TRUE OR rec."cohortId" IS DISTINCT FROM v_cohort THEN
    RETURN jsonb_build_object('skipped', 'not an active participant of the current cohort');
  END IF;
  IF NOT COALESCE((SELECT value = to_jsonb(true) FROM "AppSetting" WHERE "settingKey" = 'teen_flow_enabled'), false) THEN
    RETURN jsonb_build_object('skipped', 'teen handling is off');
  END IF;

  -- Out of any adult group, and that group's support is told. Done first: moving the contact also runs the teen group sync,
  -- which would take them out of the adult group before we could see who to tell.
  FOR v_support IN
    SELECT DISTINCT g."supportId" FROM "GroupParticipant" gp JOIN "Group" g ON g.id = gp."groupId"
    WHERE gp."participantId" = rec.id AND NOT g."isTeenGroup" AND g."supportId" IS NOT NULL
  LOOP
    INSERT INTO "Notification" ("userId", title, body, path, type)
    VALUES (v_support, 'A teen left your group',
            rec."fullName" || ' is under 18, so a Teen Support looks after them now and they are no longer in your group.',
            '/support', 'FOLLOWUP_ASSIGNMENT');
    v_told := v_told + 1;
  END LOOP;
  DELETE FROM "GroupParticipant" gp USING "Group" g
   WHERE gp."participantId" = rec.id AND g.id = gp."groupId" AND NOT g."isTeenGroup";

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
      'TEENAGER', 'REPLIED', 'SEND_MESSAGE', FALSE, now(), 'Age range changed to a teen age'
    ) RETURNING * INTO v_contact;
    v_created := TRUE;
  ELSE
    -- Someone who signed up on the form already has their registration on record. Only a contact with no form behind it
    -- is marked as registered by hand (the form gate lets a contact with no form back to Registered only with that mark).
    v_has_form := EXISTS (SELECT 1 FROM "SheetRegistration" r WHERE r."contactId" = v_contact.id);
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
      "manualRegistrationAt" = CASE WHEN v_has_form THEN "manualRegistrationAt" ELSE COALESCE("manualRegistrationAt", now()) END,
      "manualRegistrationReason" = CASE WHEN v_has_form THEN "manualRegistrationReason" ELSE COALESCE("manualRegistrationReason", 'Age range changed to a teen age') END,
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

  RETURN jsonb_build_object('converted', TRUE, 'contactId', v_contact.id, 'created', v_created, 'told', v_told);
END;
$function$;

UPDATE "FollowUpContact" c
SET "manualRegistrationAt" = NULL, "manualRegistrationReason" = NULL
WHERE c."manualRegistrationReason" = 'Age range changed to a teen age'
  AND EXISTS (SELECT 1 FROM "SheetRegistration" r WHERE r."contactId" = c.id);
