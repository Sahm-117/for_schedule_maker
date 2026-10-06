-- Teens go-live: when an admin first switches teen handling ON, every current-cohort
-- participant aged 18 and below becomes a teen contact waiting for a Teen Support.
-- Nothing changes before then. The normal teen assignment (the scheduled sweep, or the admin
-- "Assign now") then gives each one a same-gender Teen Support and puts them in that
-- support's teen group (teen_group_sync).
--
-- For each such participant:
--   * uses the follow-up contact linked to them (or one matching their name and number);
--     creates one if they have none (e.g. a participant who was never a prospect)
--   * makes the contact TEENAGER, open, with no adult owner (an adult who held them is told)
--   * keeps an owner only if they are already a same-gender Teen Support
-- Runs once (marker AppSetting 'teen_move_done'); switching the setting off and on again
-- does not repeat it, so a person later marked "not a teen" is not turned back.
--
-- Rollback: DROP TRIGGER teen_enable_move ON "AppSetting"; DROP FUNCTION teen_move_existing(), teen_enable_move_trigger();

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
      AND replace(lower(COALESCE(p."ageRange", '')), ' ', '') = '18andbelow'
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
        rec."fullName", rec.phone, rec."guardianPhone", rec.email, rec.gender, '18 and below', v_cohort, 'Moved to teen handling',
        'TEENAGER', 'REPLIED', 'SEND_MESSAGE', FALSE, now(), 'Already a participant aged 18 and below when teen handling started'
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
        "ageRange" = '18 and below',
        gender = COALESCE(NULLIF(gender, ''), rec.gender),
        "guardianPhone" = COALESCE("guardianPhone", rec."guardianPhone"),
        "cohortId" = COALESCE("cohortId", v_cohort),
        "replyStatus" = CASE WHEN "registrationStatus" IN ('TEENAGER', 'TEEN_ONBOARDED') THEN "replyStatus" ELSE 'REPLIED'::"FollowUpReplyStatus" END,
        "nextAction" = CASE WHEN "registrationStatus" IN ('TEENAGER', 'TEEN_ONBOARDED') THEN "nextAction" ELSE 'SEND_MESSAGE'::"FollowUpNextAction" END,
        "ownerId" = CASE WHEN v_keep THEN "ownerId" ELSE NULL END,
        "archivedAt" = CASE WHEN "registrationStatus" IN ('TEENAGER', 'TEEN_ONBOARDED') THEN "archivedAt" ELSE NULL END,
        "manualRegistrationAt" = COALESCE("manualRegistrationAt", now()),
        "manualRegistrationReason" = COALESCE("manualRegistrationReason", 'Already a participant aged 18 and below when teen handling started'),
        "updatedAt" = now()
      WHERE id = v_contact.id
      RETURNING * INTO v_contact;

      IF v_prev IS NOT NULL THEN
        INSERT INTO "Notification" ("userId", title, body, path, type)
        VALUES (v_prev, 'A teen moved to a Teen Support',
                rec."fullName" || ' is 18 or below, so they now go to a Teen Support and are off your list.',
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
REVOKE ALL ON FUNCTION public.teen_move_existing() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.teen_move_existing() TO service_role;

CREATE OR REPLACE FUNCTION public.teen_enable_move_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NEW."settingKey" <> 'teen_flow_enabled' OR NEW.value IS DISTINCT FROM to_jsonb(true) THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.value IS NOT DISTINCT FROM to_jsonb(true) THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM "AppSetting" WHERE "settingKey" = 'teen_move_done') THEN RETURN NEW; END IF;
  PERFORM public.teen_move_existing();
  INSERT INTO "AppSetting" ("settingKey", value, "updatedAt") VALUES ('teen_move_done', to_jsonb(true), now())
  ON CONFLICT ("settingKey") DO NOTHING;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.teen_enable_move_trigger() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS teen_enable_move ON public."AppSetting";
CREATE TRIGGER teen_enable_move
  AFTER INSERT OR UPDATE ON public."AppSetting"
  FOR EACH ROW EXECUTE FUNCTION public.teen_enable_move_trigger();
