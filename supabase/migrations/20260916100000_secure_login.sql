-- Real password verification.
--
-- Before this, logins were never checked: the client looked the user up by email
-- or phone and signed them in, and "password_hash" held the plain password with a
-- "hashed_" prefix, which the browser could read. This migration:
--   1. turns every legacy value into a real bcrypt hash (same password, so nobody
--      has to change anything),
--   2. moves verification into the database, where the hash never leaves,
--   3. adds admin-issued resets and self-service password changes.
--
-- The hash column is revoked from the anon role in a follow-up migration, once the
-- frontend that stops selecting it is deployed.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "mustChangePassword" BOOLEAN NOT NULL DEFAULT FALSE;

-- Legacy 'hashed_<password>' values become bcrypt hashes of the same password.
UPDATE "User"
SET password_hash = crypt(substring(password_hash FROM 8), gen_salt('bf', 10))
WHERE password_hash LIKE 'hashed_%';

-- Fields safe to hand back to the browser. Never includes password_hash.
CREATE OR REPLACE FUNCTION public.safe_user_json(u "User")
RETURNS JSON
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT json_build_object(
    'id', u.id,
    'name', u.name,
    'email', u.email,
    'phone', u.phone,
    'role', u.role,
    'isActive', u."isActive",
    'isCoordinator', u."isCoordinator",
    'avatarUrl', u."avatarUrl",
    'themeColor', u."themeColor",
    'whatsappGroupUrl', u."whatsappGroupUrl",
    'hubLastSeenAt', u."hubLastSeenAt",
    'onboardingCompleted', u."onboardingCompleted",
    'onboardingReplayCount', u."onboardingReplayCount",
    'onboardingLastReplayAt', u."onboardingLastReplayAt",
    'mustChangePassword', u."mustChangePassword",
    'createdAt', u."createdAt",
    'updatedAt', u."updatedAt"
  );
$$;

-- Verify a login. Returns the safe user object, or NULL when the identifier is
-- unknown, the account is deactivated, or the password is wrong.
CREATE OR REPLACE FUNCTION public.login_user(identifier TEXT, password TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  normalized TEXT := lower(trim(identifier));
  candidate "User";
BEGIN
  IF normalized IS NULL OR normalized = '' OR password IS NULL OR password = '' THEN
    RETURN NULL;
  END IF;

  -- A login value is either an email or a phone number. Prefer an active account,
  -- then the oldest, which matches how duplicate legacy accounts were resolved.
  SELECT * INTO candidate
  FROM "User" u
  WHERE (position('@' IN normalized) > 0 AND lower(u.email) = normalized)
     OR (position('@' IN normalized) = 0 AND u.phone = trim(identifier))
  ORDER BY (u."isActive" IS NOT FALSE) DESC, u."createdAt" ASC
  LIMIT 1;

  IF candidate.id IS NULL OR candidate."isActive" IS FALSE THEN
    RETURN NULL;
  END IF;

  -- Legacy rows written by an older client are accepted once, then upgraded.
  IF candidate.password_hash LIKE 'hashed_%' THEN
    IF substring(candidate.password_hash FROM 8) = password THEN
      UPDATE "User"
      SET password_hash = crypt(password, gen_salt('bf', 10)), "updatedAt" = NOW()
      WHERE id = candidate.id;
      RETURN public.safe_user_json(candidate);
    END IF;
    RETURN NULL;
  END IF;

  IF candidate.password_hash IS NULL
     OR candidate.password_hash <> crypt(password, candidate.password_hash) THEN
    RETURN NULL;
  END IF;

  RETURN public.safe_user_json(candidate);
END;
$$;

-- Admin-issued reset: set a password and require a change at next login.
CREATE OR REPLACE FUNCTION public.set_user_password(
  target_user UUID,
  new_password TEXT,
  force_change BOOLEAN DEFAULT TRUE
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF new_password IS NULL OR length(new_password) < 8 THEN
    RAISE EXCEPTION 'Password must be at least 8 characters';
  END IF;

  UPDATE "User"
  SET password_hash = crypt(new_password, gen_salt('bf', 10)),
      "mustChangePassword" = force_change,
      "updatedAt" = NOW()
  WHERE id = target_user;

  RETURN FOUND;
END;
$$;

-- Self-service change: the current password must be correct.
CREATE OR REPLACE FUNCTION public.change_own_password(
  target_user UUID,
  current_password TEXT,
  new_password TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  candidate "User";
BEGIN
  IF new_password IS NULL OR length(new_password) < 8 THEN
    RAISE EXCEPTION 'Password must be at least 8 characters';
  END IF;

  SELECT * INTO candidate FROM "User" WHERE id = target_user;
  IF candidate.id IS NULL OR candidate."isActive" IS FALSE THEN
    RETURN FALSE;
  END IF;

  IF candidate.password_hash LIKE 'hashed_%' THEN
    IF substring(candidate.password_hash FROM 8) <> current_password THEN
      RETURN FALSE;
    END IF;
  ELSIF candidate.password_hash IS NULL
     OR candidate.password_hash <> crypt(current_password, candidate.password_hash) THEN
    RETURN FALSE;
  END IF;

  UPDATE "User"
  SET password_hash = crypt(new_password, gen_salt('bf', 10)),
      "mustChangePassword" = FALSE,
      "updatedAt" = NOW()
  WHERE id = target_user;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.safe_user_json("User") FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.login_user(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_user_password(UUID, TEXT, BOOLEAN) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.change_own_password(UUID, TEXT, TEXT) TO anon, authenticated;
