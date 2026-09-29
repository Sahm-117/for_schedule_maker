-- Retakers: someone who didn't graduate can take FOF again in a later cohort.
-- Each cohort keeps its own Participant record, so their old record (and its
-- attendance, group and notes) stays with the old cohort and every count stays
-- with its own cohort.
--
-- 1. A phone number can now have one Participant per cohort, instead of one
--    overall. Until now the second cohort's record could not be created at all:
--    receive-form-registration's insert failed silently on this index, so a
--    retaker's sign-up had no Participant and could never be given a login.
-- 2. Sign-in picks the newest cohort's record when a number has more than one
--    record with a login.
-- 3. A new record whose number already has a record in another cohort gets a
--    profile note, however it is created (form, Follow-ups, import or by hand).
--    Same first name: "Retaking FOF. Was in Cohort 9." A different name means
--    the number is shared (family, say), so the note says that instead, for
--    someone to check: "Same phone number as Chris Ayomide in Cohort 9. Check
--    whether they're the same person."

-- 1 ─────────────────────────────────────────────────────────────────────────
DROP INDEX IF EXISTS public.uniq_participant_phone_normalized;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_participant_phone_per_cohort
  ON public."Participant" (
    public.fof_phone_key(phone),
    COALESCE("cohortId", '00000000-0000-0000-0000-000000000000'::uuid)
  )
  WHERE public.fof_phone_key(phone) IS NOT NULL;

-- 2 ─────────────────────────────────────────────────────────────────────────
-- The live body (read back before this change), with only the participant
-- lookup changed: join Cohort and order newest cohort first.
CREATE OR REPLACE FUNCTION public.sign_in(identifier text, password text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  staff JSON;
  phone_key TEXT;
  person_id UUID;
  person_hash TEXT;
BEGIN
  staff := public.login_user(identifier, password);
  IF staff IS NOT NULL THEN
    RETURN json_build_object(
      'token', public.start_app_session((staff->>'id')::UUID, NULL),
      'user', staff
    );
  END IF;

  IF identifier IS NULL OR position('@' IN identifier) > 0 OR password IS NULL OR password = '' THEN
    RETURN NULL;
  END IF;

  phone_key := public.fof_phone_key(identifier);
  IF phone_key IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT p.id, a.password_hash INTO person_id, person_hash
  FROM "Participant" p
  JOIN "ParticipantAccount" a ON a."participantId" = p.id
  LEFT JOIN "Cohort" c ON c.id = p."cohortId"
  WHERE public.fof_phone_key(p.phone) = phone_key
    AND a."isActive"
    AND p.status = 'ACTIVE'
  ORDER BY c."startDate" DESC NULLS LAST, p."createdAt" DESC
  LIMIT 1;

  IF person_id IS NULL OR person_hash <> crypt(password, person_hash) THEN
    RETURN NULL;
  END IF;

  UPDATE "ParticipantAccount" SET "lastSignInAt" = NOW() WHERE "participantId" = person_id;

  RETURN json_build_object(
    'token', public.start_app_session(NULL, person_id),
    'user', public.participant_user_json(person_id)
  );
END;
$function$;

-- 3 ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.participant_retake_note()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  first_name TEXT := lower(split_part(btrim(COALESCE(NEW."fullName", '')), ' ', 1));
  retaken TEXT;
  shared TEXT;
  note TEXT;
BEGIN
  IF public.fof_phone_key(NEW.phone) IS NULL OR NEW."cohortId" IS NULL THEN
    RETURN NEW;
  END IF;

  WITH others AS (
    SELECT p."fullName", c.name AS cohort, c."startDate"
    FROM "Participant" p
    JOIN "Cohort" c ON c.id = p."cohortId"
    WHERE public.fof_phone_key(p.phone) = public.fof_phone_key(NEW.phone)
      AND p."cohortId" <> NEW."cohortId"
      AND p.id <> NEW.id
  )
  SELECT
    string_agg(cohort, ', ' ORDER BY "startDate")
      FILTER (WHERE first_name <> '' AND lower(split_part(btrim("fullName"), ' ', 1)) = first_name),
    string_agg("fullName" || ' in ' || cohort, ', ' ORDER BY "startDate")
      FILTER (WHERE first_name = '' OR lower(split_part(btrim("fullName"), ' ', 1)) <> first_name)
  INTO retaken, shared
  FROM others;

  IF retaken IS NOT NULL THEN
    note := 'Retaking FOF. Was in ' || retaken || '.';
  ELSIF shared IS NOT NULL THEN
    note := 'Same phone number as ' || shared || '. Check whether they''re the same person.';
  ELSE
    RETURN NEW;
  END IF;

  NEW.notes := CASE
    WHEN NEW.notes IS NULL OR btrim(NEW.notes) = '' THEN note
    ELSE note || E'\n' || NEW.notes
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS participant_retake_note ON public."Participant";
CREATE TRIGGER participant_retake_note
  BEFORE INSERT ON public."Participant"
  FOR EACH ROW EXECUTE FUNCTION public.participant_retake_note();
