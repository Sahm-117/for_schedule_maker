-- Teens back in the app: the guardian signs in first, a teen can get a number of their own, and
-- several teens can sit under one guardian number.
--
-- * "ParticipantLoginPhone": a teen's OWN number, an alias for the same login (same account, same
--   password). The guardian's number stays Participant.phone. One own number per teen, and a
--   number can belong to one teen only.
-- * sign_in also matches that own number. A session that came in through the own number is
--   flagged ("viaTeenNumber") so it never offers the teen's brothers and sisters.
-- * participant_family / participant_switch: after a guardian-number sign-in, the teens of the
--   same cohort on the same guardian number can be chosen between (no second password).
-- * teen_login_state / teen_login_phone_set: what a Teen Support (or admin) uses to add the own
--   number. Locked until the guardian has signed in and chosen a password.
--
-- Rollback: DROP FUNCTION the five functions below, restore sign_in from 20261004180000,
-- ALTER TABLE "AppSession" DROP COLUMN "viaTeenNumber"; DROP TABLE "ParticipantLoginPhone".

ALTER TABLE public."AppSession" ADD COLUMN IF NOT EXISTS "viaTeenNumber" BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS public."ParticipantLoginPhone" (
  "participantId" UUID PRIMARY KEY REFERENCES public."Participant"(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  "addedById" UUID REFERENCES public."User"(id) ON DELETE SET NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "ParticipantLoginPhone_valid" CHECK (public.fof_phone_key(phone) IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_participant_login_phone ON public."ParticipantLoginPhone" (public.fof_phone_key(phone));
ALTER TABLE public."ParticipantLoginPhone" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."ParticipantLoginPhone" FROM anon, authenticated;

-- Private helper: may this staff member manage the login of this participant? Same people as the
-- login-details card: an admin, the participant's group support, or the owner / registrar of the lead.
CREATE OR REPLACE FUNCTION public.teen_login_staff_allowed(p_staff_id UUID, p_staff_role TEXT, p_participant_id UUID)
 RETURNS BOOLEAN
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT p_staff_role = 'ADMIN'
    OR (p_staff_role = 'SUPPORT' AND (
      EXISTS (
        SELECT 1 FROM "GroupParticipant" gp JOIN "Group" g ON g.id = gp."groupId"
        WHERE gp."participantId" = p_participant_id AND g."supportId" = p_staff_id
      )
      OR EXISTS (
        SELECT 1 FROM "Participant" p JOIN "FollowUpContact" f ON f.id = p."followUpContactId"
        WHERE p.id = p_participant_id AND (f."ownerId" = p_staff_id OR f."registeredById" = p_staff_id)
      )
    ));
$function$;

-- Private helper: the teens of the same cohort on the same guardian number who have a live login
-- (the person themself included). Empty unless the person is a teen.
CREATE OR REPLACE FUNCTION public.teen_family_members(p_participant_id UUID)
 RETURNS TABLE (id UUID, name TEXT)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT q.id, q."fullName"
  FROM "Participant" me
  JOIN "Participant" q
    ON public.fof_phone_key(q.phone) = public.fof_phone_key(me.phone)
   AND q."cohortId" IS NOT DISTINCT FROM me."cohortId"
  JOIN "ParticipantAccount" a ON a."participantId" = q.id AND a."isActive"
  WHERE me.id = p_participant_id
    AND me."ageRange" = '10 - 17'
    AND public.fof_phone_key(me.phone) IS NOT NULL
    AND q."ageRange" = '10 - 17'
    AND q.status = 'ACTIVE'
  ORDER BY q."fullName";
$function$;

-- Sign-in: as before, plus a teen's own number (same account, same password).
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
  via_own BOOLEAN;
  new_token TEXT;
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

  FOR person_id, person_hash, via_own IN
    SELECT p.id, a.password_hash, public.fof_phone_key(p.phone) IS DISTINCT FROM phone_key
    FROM "Participant" p
    JOIN "ParticipantAccount" a ON a."participantId" = p.id
    LEFT JOIN "ParticipantLoginPhone" l ON l."participantId" = p.id
    LEFT JOIN "Cohort" c ON c.id = p."cohortId"
    WHERE (public.fof_phone_key(p.phone) = phone_key OR public.fof_phone_key(l.phone) = phone_key)
      AND a."isActive"
      AND p.status = 'ACTIVE'
    ORDER BY c."startDate" DESC NULLS LAST, p."createdAt" DESC
  LOOP
    IF person_hash = crypt(password, person_hash) THEN
      UPDATE "ParticipantAccount" SET "lastSignInAt" = NOW() WHERE "participantId" = person_id;
      new_token := public.start_app_session(NULL, person_id);
      IF via_own THEN
        UPDATE "AppSession" SET "viaTeenNumber" = TRUE
        WHERE "tokenHash" = encode(digest(new_token, 'sha256'), 'hex');
      END IF;
      RETURN json_build_object('token', new_token, 'user', public.participant_user_json(person_id));
    END IF;
  END LOOP;
  RETURN NULL;
END;
$function$;

-- The teens the signed-in guardian can choose between. Empty for one teen, for an adult, and for a
-- session that came in through a teen's own number.
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
  SELECT count(*) INTO v_count FROM public.teen_family_members(v_me);
  IF v_count < 2 THEN RETURN '[]'::json; END IF;
  RETURN (SELECT json_agg(json_build_object('id', f.id, 'name', f.name, 'current', f.id = v_me)) FROM public.teen_family_members(v_me) f);
END;
$function$;

-- Pick one of those teens: a fresh session for them (the guardian number was already proved).
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
  IF p_participant_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.teen_family_members(v_me) f WHERE f.id = p_participant_id) THEN
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

-- For a Teen Support's card: where each teen stands. Only the people the caller may manage.
-- status: NOT_TEEN, LOCKED (guardian has not chosen a password yet), NONE (can add), SET.
CREATE OR REPLACE FUNCTION public.teen_login_state(p_token text, p_participant_ids uuid[])
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  staff "User" := public.app_staff(p_token);
BEGIN
  IF staff.id IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  RETURN COALESCE((
    SELECT json_agg(json_build_object(
      'participantId', p.id,
      'ownPhone', l.phone,
      'status', CASE
        WHEN p."ageRange" IS DISTINCT FROM '10 - 17' THEN 'NOT_TEEN'
        WHEN l."participantId" IS NOT NULL THEN 'SET'
        WHEN EXISTS (
          SELECT 1 FROM "Participant" q JOIN "ParticipantAccount" a ON a."participantId" = q.id
          WHERE public.fof_phone_key(q.phone) = public.fof_phone_key(p.phone) AND q."ageRange" = '10 - 17'
            AND q."cohortId" IS NOT DISTINCT FROM p."cohortId" AND a."passwordSetAt" IS NOT NULL
        ) THEN 'NONE'
        ELSE 'LOCKED'
      END
    ))
    FROM "Participant" p
    LEFT JOIN "ParticipantLoginPhone" l ON l."participantId" = p.id
    WHERE p.id = ANY (p_participant_ids)
      AND public.teen_login_staff_allowed(staff.id, staff.role::text, p.id)
  ), '[]'::json);
END;
$function$;

-- Add, change or remove a teen's own number.
CREATE OR REPLACE FUNCTION public.teen_login_phone_set(p_token text, p_participant_id uuid, p_phone text DEFAULT NULL, p_remove boolean DEFAULT FALSE)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  staff "User" := public.app_staff(p_token);
  person "Participant";
  v_key TEXT;
  v_store TEXT;
  v_state JSON;
BEGIN
  IF staff.id IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  SELECT * INTO person FROM "Participant" WHERE id = p_participant_id;
  IF person.id IS NULL OR NOT public.teen_login_staff_allowed(staff.id, staff.role::text, person.id) THEN
    RAISE EXCEPTION 'NOT_ALLOWED';
  END IF;
  IF person."ageRange" IS DISTINCT FROM '10 - 17' THEN RAISE EXCEPTION 'NOT_A_TEEN'; END IF;

  IF p_remove THEN
    DELETE FROM "ParticipantLoginPhone" WHERE "participantId" = person.id;
    -- Anyone signed in through that number is signed out.
    DELETE FROM "AppSession" WHERE "participantId" = person.id AND "viaTeenNumber";
  ELSE
    v_key := public.fof_phone_key(p_phone);
    IF v_key IS NULL THEN RAISE EXCEPTION 'BAD_NUMBER'; END IF;
    -- The guardian comes first: somebody on the guardian number must have chosen a password.
    IF NOT EXISTS (
      SELECT 1 FROM "Participant" q JOIN "ParticipantAccount" a ON a."participantId" = q.id
      WHERE public.fof_phone_key(q.phone) = public.fof_phone_key(person.phone) AND q."ageRange" = '10 - 17'
        AND q."cohortId" IS NOT DISTINCT FROM person."cohortId" AND a."passwordSetAt" IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'GUARDIAN_FIRST';
    END IF;
    IF v_key = public.fof_phone_key(person.phone) THEN RAISE EXCEPTION 'SAME_AS_GUARDIAN'; END IF;
    IF EXISTS (SELECT 1 FROM "Participant" q WHERE public.fof_phone_key(q.phone) = v_key)
       OR EXISTS (SELECT 1 FROM "ParticipantLoginPhone" l WHERE public.fof_phone_key(l.phone) = v_key AND l."participantId" <> person.id) THEN
      RAISE EXCEPTION 'NUMBER_IN_USE';
    END IF;
    v_store := CASE WHEN v_key ~ '^234[0-9]{10}$' THEN '0' || substr(v_key, 4) ELSE v_key END;
    INSERT INTO "ParticipantLoginPhone" ("participantId", phone, "addedById")
    VALUES (person.id, v_store, staff.id)
    ON CONFLICT ("participantId") DO UPDATE SET phone = EXCLUDED.phone, "addedById" = EXCLUDED."addedById", "updatedAt" = NOW();
    -- A changed number ends sessions that came in through the old one.
    DELETE FROM "AppSession" WHERE "participantId" = person.id AND "viaTeenNumber";
  END IF;

  SELECT (public.teen_login_state(p_token, ARRAY[person.id]) -> 0) INTO v_state;
  RETURN v_state;
END;
$function$;

REVOKE ALL ON FUNCTION public.teen_login_staff_allowed(UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.teen_family_members(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sign_in(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.participant_family(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.participant_switch(TEXT, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.teen_login_state(TEXT, UUID[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.teen_login_phone_set(TEXT, UUID, TEXT, BOOLEAN) TO anon, authenticated;
