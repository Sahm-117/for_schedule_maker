-- Shared-phone households: two verified different people (Funmilayo Ewayenikan,
-- Cohort 10 since 27 Sept; Jeremiah Williams, moved into Cohort 10 by the
-- 20261004170000 repair) share one number and one email. Two bounded changes:
--
-- 1. The one-phone-per-cohort backstop exempts exactly these two rows. Every
--    other row keeps full duplicate protection.
-- 2. Participant sign-in tries the password against every account row sharing
--    the number (newest cohort first, as before) instead of the first row only,
--    so each person signs in with their own password. Single-number behaviour
--    is unchanged. Email login is deliberately NOT added: duplicate emails
--    exist (one address is on four rows), so email cannot identify a person.

-- 1. Carve-out. Applied in the same transaction as the repair so the rule is
-- never absent: drop and recreate atomically.
DROP INDEX IF EXISTS public.uniq_participant_phone_per_cohort;
CREATE UNIQUE INDEX uniq_participant_phone_per_cohort ON public."Participant" USING btree (fof_phone_key(phone), COALESCE("cohortId", '00000000-0000-0000-0000-000000000000'::uuid)) WHERE (fof_phone_key(phone) IS NOT NULL AND id NOT IN ('0476b50f-de92-4b0a-baa9-0c8c05052b0f', '80c19324-5ca4-4f91-bc63-ccf4ba5f0a7e'));

-- 2. Sign-in: loop candidates, first password match wins.
CREATE OR REPLACE FUNCTION public.sign_in(identifier text, password text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  staff JSON;
  staff_row "User";
  phone_key TEXT;
  person_id UUID;
  person_hash TEXT;
BEGIN
  staff := public.login_user(identifier, password);
  IF staff IS NOT NULL THEN
    SELECT * INTO staff_row FROM "User" WHERE id = (staff->>'id')::UUID;
    RETURN json_build_object(
      'token', public.start_app_session((staff->>'id')::UUID, NULL),
      'user', (staff::jsonb || jsonb_build_object('role', public.app_lowest_role(staff_row)))::json
    );
  END IF;

  IF identifier IS NULL OR position('@' IN identifier) > 0 OR password IS NULL OR password = '' THEN
    RETURN NULL;
  END IF;

  phone_key := public.fof_phone_key(identifier);
  IF phone_key IS NULL THEN
    RETURN NULL;
  END IF;

  FOR person_id, person_hash IN
    SELECT p.id, a.password_hash
    FROM "Participant" p
    JOIN "ParticipantAccount" a ON a."participantId" = p.id
    LEFT JOIN "Cohort" c ON c.id = p."cohortId"
    WHERE public.fof_phone_key(p.phone) = phone_key
      AND a."isActive"
      AND p.status = 'ACTIVE'
    ORDER BY c."startDate" DESC NULLS LAST, p."createdAt" DESC
  LOOP
    IF person_hash = crypt(password, person_hash) THEN
      UPDATE "ParticipantAccount" SET "lastSignInAt" = NOW() WHERE "participantId" = person_id;

      RETURN json_build_object(
        'token', public.start_app_session(NULL, person_id),
        'user', public.participant_user_json(person_id)
      );
    END IF;
  END LOOP;
  RETURN NULL;
END;
$function$;
