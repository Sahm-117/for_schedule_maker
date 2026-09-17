-- Participant app, step 0: real sign-in sessions, participant accounts and the
-- private reflection table.
--
-- Until now the browser kept "mock_token_<userId>" and every request used the
-- public anon key, so the database never knew who was asking. Participant
-- reflections are private to the participant, so they cannot sit in a table the
-- anon key can read. This migration adds:
--   1. AppSession: one random token per sign-in, stored only as a SHA-256 hash.
--   2. ParticipantAccount: a participant's password, kept apart from "User" so
--      participants never appear in staff lists and the anon key cannot touch it.
--   3. Reflection: the weekly private reflection.
-- All three tables have RLS on, no policies and no grants to anon/authenticated,
-- so they are reachable only through the functions below, which check a session.
-- Additive: login_user and the existing staff flow are unchanged.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── Tables ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "AppSession" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tokenHash" TEXT NOT NULL UNIQUE,
  "userId" UUID REFERENCES "User"(id) ON DELETE CASCADE,
  "participantId" UUID REFERENCES "Participant"(id) ON DELETE CASCADE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "lastSeenAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "expiresAt" TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '90 days',
  CONSTRAINT "AppSession_one_actor" CHECK (("userId" IS NULL) <> ("participantId" IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_appsession_user ON "AppSession"("userId");
CREATE INDEX IF NOT EXISTS idx_appsession_participant ON "AppSession"("participantId");

CREATE TABLE IF NOT EXISTS "ParticipantAccount" (
  "participantId" UUID PRIMARY KEY REFERENCES "Participant"(id) ON DELETE CASCADE,
  password_hash TEXT NOT NULL,
  -- The first-time code, kept only until the participant chooses a password, so
  -- their support can open the login details card again and resend it.
  "setupCode" TEXT,
  "mustChangePassword" BOOLEAN NOT NULL DEFAULT TRUE,
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "issuedById" UUID REFERENCES "User"(id) ON DELETE SET NULL,
  "issuedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "passwordSetAt" TIMESTAMPTZ,
  "lastSignInAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Only the participant ever reads the text. Supports and admins will see when it
-- was written (createdAt/updatedAt), exposed later through a session-checked function.
CREATE TABLE IF NOT EXISTS "Reflection" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "participantId" UUID NOT NULL REFERENCES "Participant"(id) ON DELETE CASCADE,
  "weekId" INTEGER NOT NULL REFERENCES "Week"(id) ON DELETE CASCADE,
  "stoodOut" TEXT,
  goal TEXT,
  "goalCheck" TEXT,
  "goalDoneAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("participantId", "weekId")
);

ALTER TABLE "AppSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ParticipantAccount" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Reflection" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "AppSession", "ParticipantAccount", "Reflection" FROM anon, authenticated;

-- ── Internal helpers (not callable from the browser) ─────────────────────────

-- Same normalisation as uniq_participant_phone_normalized.
CREATE OR REPLACE FUNCTION public.fof_phone_key(raw TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN d ~ '^0[7-9][01][0-9]{8}$' THEN '234' || substr(d, 2)
    WHEN d ~ '^234[7-9][01][0-9]{8}$' THEN d
    WHEN d ~ '^[0-9]{10,15}$' AND left(d, 1) <> '0' THEN d
    ELSE NULL
  END
  FROM (SELECT regexp_replace(COALESCE(raw, ''), '\D', '', 'g') AS d) digits;
$$;

CREATE OR REPLACE FUNCTION public.start_app_session(p_user_id UUID, p_participant_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  token TEXT := encode(gen_random_bytes(32), 'hex');
BEGIN
  INSERT INTO "AppSession" ("tokenHash", "userId", "participantId")
  VALUES (encode(digest(token, 'sha256'), 'hex'), p_user_id, p_participant_id);
  RETURN token;
END;
$$;

-- The live session for a token, or NULL. Sliding expiry, touched at most hourly.
CREATE OR REPLACE FUNCTION public.app_session(p_token TEXT)
RETURNS "AppSession"
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  s "AppSession";
BEGIN
  IF p_token IS NULL OR p_token = '' THEN
    RETURN NULL;
  END IF;

  SELECT * INTO s
  FROM "AppSession"
  WHERE "tokenHash" = encode(digest(p_token, 'sha256'), 'hex')
    AND "expiresAt" > NOW();

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF s."lastSeenAt" < NOW() - INTERVAL '1 hour' THEN
    UPDATE "AppSession"
    SET "lastSeenAt" = NOW(), "expiresAt" = NOW() + INTERVAL '90 days'
    WHERE id = s.id;
  END IF;

  RETURN s;
END;
$$;

-- The active staff member behind a token, or NULL.
CREATE OR REPLACE FUNCTION public.app_staff(p_token TEXT)
RETURNS "User"
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  s "AppSession" := public.app_session(p_token);
  u "User";
BEGIN
  IF s.id IS NULL OR s."userId" IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT * INTO u FROM "User" WHERE id = s."userId" AND "isActive" IS NOT FALSE;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  RETURN u;
END;
$$;

-- The participant behind a token when their account and record are active, or NULL.
CREATE OR REPLACE FUNCTION public.app_participant_id(p_token TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  s "AppSession" := public.app_session(p_token);
BEGIN
  IF s.id IS NULL OR s."participantId" IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN (
    SELECT p.id
    FROM "Participant" p
    JOIN "ParticipantAccount" a ON a."participantId" = p.id
    WHERE p.id = s."participantId" AND a."isActive" AND p.status = 'ACTIVE'
  );
END;
$$;

-- Fields safe to hand a signed-in participant. Shaped like the staff user object.
CREATE OR REPLACE FUNCTION public.participant_user_json(p_participant_id UUID)
RETURNS JSON
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT json_build_object(
    'id', p.id,
    'participantId', p.id,
    'name', p."fullName",
    'email', p.email,
    'phone', p.phone,
    'role', 'PARTICIPANT',
    'isActive', a."isActive" AND p.status = 'ACTIVE',
    'mustChangePassword', a."mustChangePassword",
    'cohortId', p."cohortId",
    'cohortName', c.name,
    'createdAt', p."createdAt",
    'updatedAt', p."updatedAt"
  )
  FROM "Participant" p
  JOIN "ParticipantAccount" a ON a."participantId" = p.id
  LEFT JOIN "Cohort" c ON c.id = p."cohortId"
  WHERE p.id = p_participant_id;
$$;

-- ── Sign in / out ────────────────────────────────────────────────────────────

-- Staff first (email or phone, via login_user), then participants (phone only).
-- Returns { token, user } or NULL.
CREATE OR REPLACE FUNCTION public.sign_in(identifier TEXT, password TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
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
  WHERE public.fof_phone_key(p.phone) = phone_key
    AND a."isActive"
    AND p.status = 'ACTIVE'
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
$$;

-- The signed-in user (staff or participant) for a token, or NULL.
CREATE OR REPLACE FUNCTION public.get_session_user(p_token TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  staff "User" := public.app_staff(p_token);
  person_id UUID;
BEGIN
  IF staff.id IS NOT NULL THEN
    RETURN public.safe_user_json(staff);
  END IF;
  person_id := public.app_participant_id(p_token);
  IF person_id IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN public.participant_user_json(person_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.sign_out(p_token TEXT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  DELETE FROM "AppSession" WHERE "tokenHash" = encode(digest(COALESCE(p_token, ''), 'sha256'), 'hex');
$$;

-- ── Participant login details (staff) ────────────────────────────────────────

-- Status of a participant's app login, and (when p_issue) creates it on first view.
-- Returns status NO_PARTICIPANT when the lead has no participant record.
-- p_new_code replaces the code, clears any chosen password and signs them out.
-- Allowed: admins; the participant's group support; a support covering that group
-- right now; the support who owns or registered the lead they came from.
CREATE OR REPLACE FUNCTION public.participant_login_details(
  p_token TEXT,
  p_participant_id UUID DEFAULT NULL,
  p_follow_up_contact_id UUID DEFAULT NULL,
  p_issue BOOLEAN DEFAULT FALSE,
  p_new_code BOOLEAN DEFAULT FALSE
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  staff "User" := public.app_staff(p_token);
  person "Participant";
  account "ParticipantAccount";
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
    ));
  IF NOT allowed THEN
    RAISE EXCEPTION 'NOT_ALLOWED';
  END IF;

  SELECT * INTO account FROM "ParticipantAccount" WHERE "participantId" = person.id;

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
      DELETE FROM "AppSession" WHERE "participantId" = person.id;
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
    'lastSignInAt', account."lastSignInAt"
  );
END;
$$;

-- ── Participant self-service ─────────────────────────────────────────────────

-- First sign-in: the participant replaces their code with their own password.
CREATE OR REPLACE FUNCTION public.set_participant_password(p_token TEXT, p_new_password TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  person_id UUID := public.app_participant_id(p_token);
BEGIN
  IF person_id IS NULL THEN
    RAISE EXCEPTION 'SESSION_EXPIRED';
  END IF;
  IF p_new_password IS NULL OR length(p_new_password) < 8 THEN
    RAISE EXCEPTION 'Password must be at least 8 characters';
  END IF;

  UPDATE "ParticipantAccount"
  SET password_hash = crypt(p_new_password, gen_salt('bf', 10)),
      "setupCode" = NULL,
      "mustChangePassword" = FALSE,
      "passwordSetAt" = NOW(),
      "updatedAt" = NOW()
  WHERE "participantId" = person_id;

  RETURN public.participant_user_json(person_id);
END;
$$;

-- ── Grants ───────────────────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION public.start_app_session(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.app_session(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.app_staff(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.app_participant_id(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.participant_user_json(UUID) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.sign_in(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_session_user(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sign_out(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.participant_login_details(TEXT, UUID, UUID, BOOLEAN, BOOLEAN) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_participant_password(TEXT, TEXT) TO anon, authenticated;
