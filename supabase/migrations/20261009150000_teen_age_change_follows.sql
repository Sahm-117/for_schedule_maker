-- Changing a participant's age range across the teen line now carries the person with it.
--
-- Before, only the age label changed. Someone switched to a teen bracket stayed in the adult follow-up and in their adult group
-- (the teen conversion only ran when teen handling was first switched on, or when a form sign-up linked a contact), and someone
-- moved out of the teen bracket stayed with a Teen Support.
--
-- teen_convert_participant(p): the same steps teen_move_existing runs for each teen, for one person. The follow-up contact (the
--   linked one, one matching name and number, or a new one) becomes TEENAGER, open, with no adult owner (an adult who held them
--   is told); it keeps an owner only if that is a same-gender Teen Support. The person leaves any adult group (that group's
--   support is told); the usual teen assignment then gives them a same-gender Teen Support and a teen group.
-- teen_revert_participant(p): the other way. A TEENAGER / TEEN_ONBOARDED contact becomes REGISTERED, off the Teen Support (who is
--   told), so the usual follow-up picks them up as an adult; teen_group_sync takes them out of the teen group.
-- participant_age_teen_boundary: runs both when the age range of an ACTIVE participant of the current programme cohort crosses
--   the teen line (10 - 17, or the old "18 and below" label, versus anything else that is not empty). Does nothing while teen
--   handling is off (revert still frees a teen contact). Changing between two adult brackets, or clearing the age, does nothing.
-- The date of birth still wins: with one on file the database recalculates the age range on any edit (trg_participant_age_from_dob),
-- so a manual change only sticks for people without a date of birth.
--
-- Rollback: DROP TRIGGER participant_age_teen_boundary ON "Participant"; DROP FUNCTION participant_age_teen_boundary(),
-- teen_convert_participant(uuid), teen_revert_participant(uuid).
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
      "manualRegistrationReason" = COALESCE("manualRegistrationReason", 'Age range changed to a teen age'),
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

CREATE OR REPLACE FUNCTION public.teen_revert_participant(p_participant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  rec "Participant";
  v_contact "FollowUpContact";
  v_was_teen_support BOOLEAN;
BEGIN
  SELECT * INTO rec FROM "Participant" WHERE id = p_participant_id;
  IF rec.id IS NULL OR rec."followUpContactId" IS NULL THEN
    RETURN jsonb_build_object('skipped', 'no follow-up contact');
  END IF;
  SELECT * INTO v_contact FROM "FollowUpContact" WHERE id = rec."followUpContactId";
  IF v_contact.id IS NULL OR v_contact."registrationStatus"::text NOT IN ('TEENAGER', 'TEEN_ONBOARDED') THEN
    RETURN jsonb_build_object('skipped', 'not on the teen path');
  END IF;

  v_was_teen_support := v_contact."ownerId" IS NOT NULL AND EXISTS (
    SELECT 1 FROM "SupportTagMember" m JOIN "SupportTag" t ON t.id = m."tagId" AND t."systemKey" = 'TEEN_SUPPORT'
    WHERE m."userId" = v_contact."ownerId"
  );

  UPDATE "FollowUpContact" SET
    "registrationStatus" = 'REGISTERED'::"FollowUpRegistrationStatus",
    "ageRange" = rec."ageRange",
    "ownerId" = CASE WHEN v_was_teen_support THEN NULL ELSE "ownerId" END,
    "archivedAt" = NULL,
    "updatedAt" = now()
  WHERE id = v_contact.id;

  IF v_was_teen_support THEN
    INSERT INTO "Notification" ("userId", title, body, path, type)
    VALUES (v_contact."ownerId", 'A teen is now an adult',
            rec."fullName" || ' is 18 or over now, so they leave your teen list and go to the usual follow-up.',
            '/support/mobilisation?tab=follow', 'FOLLOWUP_ASSIGNMENT');
  END IF;

  RETURN jsonb_build_object('reverted', TRUE, 'contactId', v_contact.id, 'toldTeenSupport', v_was_teen_support);
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

REVOKE ALL ON FUNCTION public.teen_convert_participant(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.teen_revert_participant(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.participant_age_teen_boundary() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.teen_convert_participant(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.teen_revert_participant(uuid) TO service_role;

DROP TRIGGER IF EXISTS participant_age_teen_boundary ON public."Participant";
CREATE TRIGGER participant_age_teen_boundary
  AFTER UPDATE OF "ageRange" ON public."Participant"
  FOR EACH ROW EXECUTE FUNCTION public.participant_age_teen_boundary();
