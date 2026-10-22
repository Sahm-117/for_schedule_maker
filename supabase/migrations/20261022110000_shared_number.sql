-- One phone number, several people (a couple, a parent and their teens, brothers and sisters).
--
-- * shared_number_people: everyone active in the same cohort on the same Participant.phone, adults and
--   teens alike (was teens only, teen_family_members, which stays for the older callers).
-- * "Who is this?" (participant_family / participant_switch) now offers everyone on the number who has
--   a login, with an adult/teen flag. A session that came in through a teen's own number still sees
--   nobody else.
-- * One password per number: choosing or changing a password on one profile sets it for every login
--   on the number. Existing different passwords keep working until then (sign_in is unchanged: any
--   of them opens the number, and the picker follows).
-- * Login details: issuing a login for someone whose number already has one gives them that
--   password (or the same waiting code); a new code resets every login on the number and signs them
--   all out. The card is told who else is on the number ("household") so it can warn first.
-- * Notifications: saving this phone's subscription saves it for everyone on the number, so each
--   person's alerts reach the shared phone.
--
-- * FLOW_MAP rule 3 changes: adults may share a number too, but never twice under the same name.
--   uniq_participant_phone_per_cohort now keys on the number, the cohort AND the name (fof_name_key:
--   lower case, words in any order), so a second sign-up of the same person on the same
--   number is still refused, while a husband and wife on one phone are two people. Teens and the two
--   named rows stay exempt as before.
--
-- Rollback: recreate uniq_participant_phone_per_cohort from 20261009140000 (without the name; only
-- possible while no two adults share a number in a cohort); restore participant_family, participant_switch (20261017100000), set_participant_password,
-- change_participant_password (20261020120000), participant_login_details and save_participant_push
-- from their bodies before this file; DROP FUNCTION shared_number_people. Accounts that were given the
-- shared password keep it (no data is lost, only which password works).

-- fof_name_key (existing, IMMUTABLE): lower case, words sorted, so "Ade Bola" = "bola ade".
DROP INDEX IF EXISTS public.uniq_participant_phone_per_cohort;
CREATE UNIQUE INDEX uniq_participant_phone_per_cohort ON public."Participant"
  USING btree (fof_phone_key(phone), COALESCE("cohortId", '00000000-0000-0000-0000-000000000000'::uuid), public.fof_name_key("fullName"))
  WHERE (fof_phone_key(phone) IS NOT NULL)
    AND (id <> ALL (ARRAY[
      '0476b50f-de92-4b0a-baa9-0c8c05052b0f'::uuid,
      '80c19324-5ca4-4f91-bc63-ccf4ba5f0a7e'::uuid
    ]))
    AND (replace(lower(COALESCE("ageRange", ''::text)), ' '::text, ''::text) <> ALL (ARRAY['18andbelow'::text, '10-17'::text]));

-- Private helper: the people on this person's number in their cohort (the person included).
CREATE OR REPLACE FUNCTION public.shared_number_people(p_participant_id uuid)
 RETURNS TABLE (id uuid, name text, is_teen boolean, has_login boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT q.id, q."fullName", public.fof_is_teen_age(q."ageRange"), COALESCE(a."isActive", FALSE)
  FROM "Participant" me
  JOIN "Participant" q
    ON public.fof_phone_key(q.phone) = public.fof_phone_key(me.phone)
   AND q."cohortId" IS NOT DISTINCT FROM me."cohortId"
  LEFT JOIN "ParticipantAccount" a ON a."participantId" = q.id
  WHERE me.id = p_participant_id
    AND public.fof_phone_key(me.phone) IS NOT NULL
    AND (q.status = 'ACTIVE' OR q.id = me.id)
  ORDER BY q."fullName";
$function$;

REVOKE ALL ON FUNCTION public.shared_number_people(uuid) FROM PUBLIC, anon, authenticated;

-- Everyone on the number the signed-in person can open. Empty for one person, and for a session that
-- came in through a teen's own number.
CREATE OR REPLACE FUNCTION public.participant_family(p_token text)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  s "AppSession" := public.app_session(p_token);
  v_me UUID := public.app_participant_id(p_token);
  v_count INTEGER;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  IF s."viaTeenNumber" THEN RETURN '[]'::json; END IF;
  SELECT count(*) INTO v_count FROM public.shared_number_people(v_me) f WHERE f.has_login;
  IF v_count < 2 THEN RETURN '[]'::json; END IF;
  RETURN (
    SELECT json_agg(json_build_object('id', f.id, 'name', f.name, 'current', f.id = v_me, 'isTeen', f.is_teen) ORDER BY f.name)
    FROM public.shared_number_people(v_me) f WHERE f.has_login
  );
END;
$function$;

-- Open another person on the same number: a fresh session replaces this one.
CREATE OR REPLACE FUNCTION public.participant_switch(p_token text, p_participant_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  s "AppSession" := public.app_session(p_token);
  v_me UUID := public.app_participant_id(p_token);
  new_token TEXT;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  IF s."viaTeenNumber" THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  IF p_participant_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.shared_number_people(v_me) f WHERE f.id = p_participant_id AND f.has_login
  ) THEN
    RAISE EXCEPTION 'NOT_ALLOWED';
  END IF;
  IF p_participant_id = v_me THEN
    RETURN json_build_object('token', p_token, 'user', public.participant_user_json(v_me));
  END IF;
  new_token := public.start_app_session(NULL, p_participant_id);
  UPDATE "ParticipantAccount" SET "lastSignInAt" = NOW() WHERE "participantId" = p_participant_id;
  DELETE FROM "AppSession" WHERE id = s.id;
  RETURN json_build_object('token', new_token, 'user', public.participant_user_json(p_participant_id));
END;
$function$;

-- First password (after the setup code): set for every login on the number.
CREATE OR REPLACE FUNCTION public.set_participant_password(p_token text, p_new_password text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  person_id UUID := public.app_participant_id(p_token);
  v_hash TEXT;
BEGIN
  IF person_id IS NULL THEN
    RAISE EXCEPTION 'SESSION_EXPIRED';
  END IF;
  IF (public.app_session(p_token))."viaTeenNumber" THEN
    RAISE EXCEPTION 'TEEN_PASSWORD_FIXED';
  END IF;
  IF p_new_password IS NULL OR length(p_new_password) < 5 THEN
    RAISE EXCEPTION 'Password must be at least 5 characters';
  END IF;

  v_hash := crypt(p_new_password, gen_salt('bf', 10));
  UPDATE "ParticipantAccount"
  SET password_hash = v_hash,
      "setupCode" = NULL,
      "mustChangePassword" = FALSE,
      "passwordSetAt" = NOW(),
      "updatedAt" = NOW()
  WHERE "participantId" = person_id
     OR "participantId" IN (SELECT f.id FROM public.shared_number_people(person_id) f WHERE f.has_login);

  RETURN public.participant_user_json(person_id);
END;
$function$;

-- Change password: checked against this profile's password, then set for every login on the number.
CREATE OR REPLACE FUNCTION public.change_participant_password(p_token text, p_current text, p_new text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  person_id UUID := public.app_participant_id(p_token);
  current_hash TEXT;
  v_hash TEXT;
BEGIN
  IF person_id IS NULL THEN
    RAISE EXCEPTION 'SESSION_EXPIRED';
  END IF;
  IF (public.app_session(p_token))."viaTeenNumber" THEN
    RAISE EXCEPTION 'TEEN_PASSWORD_FIXED';
  END IF;
  IF p_new IS NULL OR length(p_new) < 5 THEN
    RAISE EXCEPTION 'Password must be at least 5 characters';
  END IF;
  SELECT password_hash INTO current_hash FROM "ParticipantAccount" WHERE "participantId" = person_id;
  IF current_hash IS NULL OR current_hash <> crypt(COALESCE(p_current, ''), current_hash) THEN
    RETURN FALSE;
  END IF;
  v_hash := crypt(p_new, gen_salt('bf', 10));
  UPDATE "ParticipantAccount"
  SET password_hash = v_hash, "setupCode" = NULL, "mustChangePassword" = FALSE, "passwordSetAt" = NOW(), "updatedAt" = NOW()
  WHERE "participantId" = person_id
     OR "participantId" IN (SELECT f.id FROM public.shared_number_people(person_id) f WHERE f.has_login);
  RETURN TRUE;
END;
$function$;

-- Login details: as before, plus one login per number.
CREATE OR REPLACE FUNCTION public.participant_login_details(p_token text, p_participant_id uuid DEFAULT NULL::uuid, p_follow_up_contact_id uuid DEFAULT NULL::uuid, p_issue boolean DEFAULT false, p_new_code boolean DEFAULT false)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  staff "User" := public.app_staff(p_token);
  person "Participant";
  account "ParticipantAccount";
  shared "ParticipantAccount";
  alphabet CONSTANT TEXT := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  random_bytes BYTEA;
  code TEXT;
  allowed BOOLEAN;
BEGIN
  IF staff.id IS NULL THEN
    RAISE EXCEPTION 'SESSION_EXPIRED';
  END IF;

  IF p_participant_id IS NOT NULL THEN
    SELECT * INTO person FROM "Participant" WHERE id = p_participant_id;
  ELSIF p_follow_up_contact_id IS NOT NULL THEN
    SELECT * INTO person FROM "Participant" WHERE "followUpContactId" = p_follow_up_contact_id;
  END IF;
  -- Older leads marked Registered may never have been added to Participants.
  IF person.id IS NULL THEN
    RETURN json_build_object('status', 'NO_PARTICIPANT');
  END IF;

  allowed := staff.role = 'ADMIN'
    OR (staff.role = 'SUPPORT' AND (
      EXISTS (
        SELECT 1 FROM "GroupParticipant" gp
        JOIN "Group" g ON g.id = gp."groupId"
        WHERE gp."participantId" = person.id AND g."supportId" = staff.id
      )
      OR EXISTS (
        SELECT 1 FROM "GroupParticipant" gp
        JOIN "Group" g ON g.id = gp."groupId"
        JOIN "CoverRequest" cr ON cr."supportId" = g."supportId"
        WHERE gp."participantId" = person.id
          AND cr."coverSupportId" = staff.id
          AND cr.status = 'ASSIGNED'
          AND NOW() BETWEEN cr."startsAt" AND cr."endsAt"
      )
      OR EXISTS (
        SELECT 1 FROM "FollowUpContact" f
        WHERE f.id = person."followUpContactId"
          AND (f."ownerId" = staff.id OR f."registeredById" = staff.id)
      )
      -- New: IT Support for this person's follow-up (their owner support's hub).
      OR (
        person."followUpContactId" IS NOT NULL
        AND staff.id = ANY(public.followup_contact_it_support_ids(person."followUpContactId", person."cohortId"))
      )
    ));
  IF NOT allowed THEN
    RAISE EXCEPTION 'NOT_ALLOWED';
  END IF;

  SELECT * INTO account FROM "ParticipantAccount" WHERE "participantId" = person.id;

  IF (p_issue AND account."participantId" IS NULL) AND staff.role <> 'ADMIN' THEN
    IF p_follow_up_contact_id IS NULL AND (person."followUpContactId" IS NULL) THEN
      RAISE EXCEPTION 'NO_FORM_REGISTRATION';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public."SheetRegistration" WHERE "contactId" = COALESCE(p_follow_up_contact_id, person."followUpContactId")) THEN
      RAISE EXCEPTION 'NO_FORM_REGISTRATION';
    END IF;
  END IF;

  IF p_issue AND account."participantId" IS NULL THEN
    IF public.fof_phone_key(person.phone) IS NULL THEN
      RAISE EXCEPTION 'NO_PHONE';
    END IF;
    -- Someone on this number already has a login: join it (their password, or the same waiting code).
    SELECT a.* INTO shared
    FROM public.shared_number_people(person.id) f
    JOIN "ParticipantAccount" a ON a."participantId" = f.id AND a."isActive"
    WHERE f.id <> person.id
    ORDER BY (a."passwordSetAt" IS NOT NULL) DESC, a."passwordSetAt" DESC NULLS LAST, a."issuedAt" DESC
    LIMIT 1;
    IF shared."participantId" IS NOT NULL THEN
      INSERT INTO "ParticipantAccount" (
        "participantId", password_hash, "setupCode", "mustChangePassword", "issuedById", "issuedAt", "passwordSetAt"
      )
      VALUES (person.id, shared.password_hash, shared."setupCode", shared."mustChangePassword", staff.id, NOW(), shared."passwordSetAt")
      RETURNING * INTO account;
    END IF;
  END IF;

  IF (p_issue AND account."participantId" IS NULL) OR (p_new_code AND account."participantId" IS NOT NULL) THEN
    IF public.fof_phone_key(person.phone) IS NULL THEN
      RAISE EXCEPTION 'NO_PHONE';
    END IF;

    random_bytes := gen_random_bytes(6);
    code := 'FOF-';
    FOR i IN 0..5 LOOP
      code := code || substr(alphabet, (get_byte(random_bytes, i) % length(alphabet)) + 1, 1);
    END LOOP;

    INSERT INTO "ParticipantAccount" (
      "participantId", password_hash, "setupCode", "mustChangePassword", "issuedById", "issuedAt", "passwordSetAt"
    )
    VALUES (person.id, crypt(code, gen_salt('bf', 10)), code, TRUE, staff.id, NOW(), NULL)
    ON CONFLICT ("participantId") DO UPDATE SET
      password_hash = EXCLUDED.password_hash,
      "setupCode" = EXCLUDED."setupCode",
      "mustChangePassword" = TRUE,
      "issuedById" = EXCLUDED."issuedById",
      "issuedAt" = EXCLUDED."issuedAt",
      "passwordSetAt" = NULL,
      "updatedAt" = NOW()
    RETURNING * INTO account;

    IF p_new_code THEN
      -- One login per number: the new code resets everyone on it.
      UPDATE "ParticipantAccount" a SET
        password_hash = account.password_hash,
        "setupCode" = account."setupCode",
        "mustChangePassword" = TRUE,
        "issuedById" = staff.id,
        "issuedAt" = NOW(),
        "passwordSetAt" = NULL,
        "updatedAt" = NOW()
      WHERE a."participantId" IN (SELECT f.id FROM public.shared_number_people(person.id) f WHERE f.has_login AND f.id <> person.id);
      DELETE FROM "AppSession"
      WHERE "participantId" = person.id
         OR "participantId" IN (SELECT f.id FROM public.shared_number_people(person.id) f WHERE f.has_login);
    END IF;
  END IF;

  RETURN json_build_object(
    'participantId', person.id,
    'name', person."fullName",
    'phone', person.phone,
    'status', CASE
      WHEN account."participantId" IS NULL THEN 'NONE'
      WHEN account."mustChangePassword" THEN 'CODE_READY'
      ELSE 'ACTIVE'
    END,
    'setupCode', CASE WHEN account."mustChangePassword" THEN account."setupCode" END,
    'issuedAt', account."issuedAt",
    'passwordSetAt', account."passwordSetAt",
    'lastSignInAt', account."lastSignInAt",
    -- The others on this number, so the card can say the login is shared and warn before a reset.
    'household', COALESCE((
      SELECT json_agg(json_build_object('name', f.name, 'hasLogin', f.has_login, 'isTeen', f.is_teen) ORDER BY f.name)
      FROM public.shared_number_people(person.id) f WHERE f.id <> person.id
    ), '[]'::json)
  );
END;
$function$;

-- This phone's notifications: saved for everyone on the number (not through a teen's own number).
CREATE OR REPLACE FUNCTION public.save_participant_push(p_token text, p_endpoint text, p_p256dh text, p_auth text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  person_id UUID := public.app_participant_id(p_token);
BEGIN
  IF person_id IS NULL THEN
    RAISE EXCEPTION 'SESSION_EXPIRED';
  END IF;
  IF COALESCE(p_endpoint, '') = '' OR COALESCE(p_p256dh, '') = '' OR COALESCE(p_auth, '') = '' THEN
    RAISE EXCEPTION 'Invalid push subscription';
  END IF;
  INSERT INTO "ParticipantPushSubscription" ("participantId", endpoint, p256dh, auth)
  SELECT x.pid, p_endpoint, p_p256dh, p_auth
  FROM (
    SELECT person_id AS pid
    UNION
    SELECT f.id FROM public.shared_number_people(person_id) f
    WHERE f.has_login AND NOT COALESCE((public.app_session(p_token))."viaTeenNumber", FALSE)
  ) x
  ON CONFLICT ("participantId", endpoint) DO UPDATE SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth;
END;
$function$;
