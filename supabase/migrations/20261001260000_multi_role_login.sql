-- One login, several roles. A person can hold more than one of ADMIN,
-- SOP_PREPARER and SUPPORT and switch between them without logging out.
--
--   "User".roles          the full set when a person holds more than one ('{}' = just "role")
--   "User".role           still the single home role: the highest one they hold, so every
--                         existing "notify the admins" / candidate query keeps working
--   "AppSession"."activeRole"  the role this login is acting as right now
--
-- The server decides permissions from the ACTIVE role of the session, not from
-- the person's full set: app_staff() hands every token-based function a user row
-- whose role is the active one, and app_is_admin() reads it too. So "viewing as
-- Support" really is Support, even for someone who is also an Admin.
--
-- A new login starts in the LOWEST role the person holds.
--
-- Rollback: restore app_staff, app_is_admin, attendance_session_actor_is_admin,
-- safe_user_json, start_app_session, sign_in from the earlier migrations; DROP the
-- new functions; drop the two columns.

ALTER TABLE public."User" ADD COLUMN IF NOT EXISTS roles public."Role"[] NOT NULL DEFAULT '{}';
ALTER TABLE public."AppSession" ADD COLUMN IF NOT EXISTS "activeRole" public."Role";

CREATE OR REPLACE FUNCTION public.app_role_rank(r public."Role")
 RETURNS integer LANGUAGE sql IMMUTABLE
AS $$ SELECT CASE r WHEN 'SUPPORT' THEN 1 WHEN 'SOP_PREPARER' THEN 2 WHEN 'ADMIN' THEN 3 ELSE 0 END $$;

-- Everything this person may act as.
CREATE OR REPLACE FUNCTION public.app_user_roles(u public."User")
 RETURNS public."Role"[] LANGUAGE sql IMMUTABLE
AS $$ SELECT CASE WHEN cardinality(u.roles) = 0 THEN ARRAY[u.role] ELSE u.roles END $$;

-- The role a session acts as: the chosen one if still allowed, else the home role.
CREATE OR REPLACE FUNCTION public.app_effective_role(u public."User", p_active public."Role")
 RETURNS public."Role" LANGUAGE sql IMMUTABLE
AS $$ SELECT CASE WHEN p_active IS NOT NULL AND p_active = ANY (public.app_user_roles(u)) THEN p_active ELSE u.role END $$;

CREATE OR REPLACE FUNCTION public.app_lowest_role(u public."User")
 RETURNS public."Role" LANGUAGE sql IMMUTABLE
AS $$ SELECT r FROM unnest(public.app_user_roles(u)) r ORDER BY public.app_role_rank(r) ASC LIMIT 1 $$;

CREATE OR REPLACE FUNCTION public.app_staff(p_token text)
 RETURNS "User"
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
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
  -- Everything downstream sees the role this login is acting as.
  u.role := public.app_effective_role(u, s."activeRole");
  RETURN u;
END;
$function$;

CREATE OR REPLACE FUNCTION public.app_is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM "AppSession" s
    JOIN "User" u ON u.id = s."userId"
    WHERE s."tokenHash" = encode(digest(public.app_current_token(), 'sha256'), 'hex')
      AND s."expiresAt" > NOW()
      AND s."userId" IS NOT NULL
      AND u."isActive" IS NOT FALSE
      AND public.app_effective_role(u, s."activeRole") = 'ADMIN'
  );
$function$;

CREATE OR REPLACE FUNCTION public.attendance_session_actor_is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public."AppSession" s
    JOIN public."User" u ON u.id = s."userId"
    WHERE s."tokenHash" = encode(extensions.digest(public.app_current_token(), 'sha256'), 'hex')
      AND s."expiresAt" > NOW()
      AND u."isActive" IS NOT FALSE
      AND public.app_effective_role(u, s."activeRole") = 'ADMIN'
  );
$function$;

-- The user as the app sees them: now with the full set of roles they may switch to.
CREATE OR REPLACE FUNCTION public.safe_user_json(u "User")
 RETURNS json
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT json_build_object(
    'id', u.id,
    'name', u.name,
    'email', u.email,
    'phone', u.phone,
    'role', u.role,
    'roles', public.app_user_roles(u),
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
    'gender', u.gender,
    'ageRange', u."ageRange",
    'createdAt', u."createdAt",
    'updatedAt', u."updatedAt"
  );
$function$;

-- A new staff login starts in the lowest role the person holds.
CREATE OR REPLACE FUNCTION public.start_app_session(p_user_id uuid, p_participant_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  token TEXT := encode(gen_random_bytes(32), 'hex');
  u "User";
BEGIN
  IF p_user_id IS NOT NULL THEN
    SELECT * INTO u FROM "User" WHERE id = p_user_id;
  END IF;
  INSERT INTO "AppSession" ("tokenHash", "userId", "participantId", "activeRole")
  VALUES (encode(digest(token, 'sha256'), 'hex'), p_user_id, p_participant_id,
          CASE WHEN u.id IS NOT NULL THEN public.app_lowest_role(u) END);
  RETURN token;
END;
$function$;

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

-- Switch what this login is acting as. Returns the user as the app should now see them.
CREATE OR REPLACE FUNCTION public.switch_my_role(p_token text, p_role text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  s "AppSession" := public.app_session(p_token);
  u "User";
BEGIN
  IF s.id IS NULL OR s."userId" IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHORISED';
  END IF;
  SELECT * INTO u FROM "User" WHERE id = s."userId" AND "isActive" IS NOT FALSE;
  IF u.id IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHORISED';
  END IF;
  IF p_role IS NULL OR p_role NOT IN ('ADMIN', 'SOP_PREPARER', 'SUPPORT') OR NOT (p_role::"Role" = ANY (public.app_user_roles(u))) THEN
    RAISE EXCEPTION 'You do not have that role';
  END IF;
  UPDATE "AppSession" SET "activeRole" = p_role::"Role" WHERE id = s.id;
  u.role := p_role::"Role";
  RETURN public.safe_user_json(u);
END;
$function$;

-- Admin: give a person one or more roles. "role" becomes the highest of them.
CREATE OR REPLACE FUNCTION public.set_user_roles(p_token text, target_user uuid, p_roles text[])
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  actor "User" := public.app_staff(p_token);
  v_roles "Role"[];
  v_home "Role";
  updated "User";
BEGIN
  IF actor.id IS NULL OR actor.role <> 'ADMIN'::"Role" THEN
    RAISE EXCEPTION 'NOT_AUTHORISED';
  END IF;
  SELECT array_agg(DISTINCT r::"Role") INTO v_roles
  FROM unnest(p_roles) r WHERE r IN ('ADMIN', 'SOP_PREPARER', 'SUPPORT');
  IF v_roles IS NULL OR cardinality(v_roles) = 0 OR cardinality(v_roles) <> (SELECT count(DISTINCT x) FROM unnest(p_roles) x) THEN
    RAISE EXCEPTION 'Unknown role';
  END IF;
  SELECT r INTO v_home FROM unnest(v_roles) r ORDER BY public.app_role_rank(r) DESC LIMIT 1;
  -- An admin removing their own admin rights could lock the last one out.
  IF actor.id = target_user AND NOT ('ADMIN'::"Role" = ANY (v_roles)) THEN
    RAISE EXCEPTION 'CANNOT_DEMOTE_SELF';
  END IF;

  UPDATE "User"
  SET role = v_home,
      roles = CASE WHEN cardinality(v_roles) > 1 THEN v_roles ELSE '{}'::"Role"[] END,
      "updatedAt" = NOW()
  WHERE id = target_user
  RETURNING * INTO updated;
  IF updated.id IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;
  RETURN public.safe_user_json(updated);
END;
$function$;

-- Keep the older single-role setter consistent with the new column.
CREATE OR REPLACE FUNCTION public.set_user_role(p_token text, target_user uuid, p_role text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  actor "User" := public.app_staff(p_token);
  updated "User";
BEGIN
  IF actor.id IS NULL OR actor.role <> 'ADMIN'::"Role" THEN
    RAISE EXCEPTION 'NOT_AUTHORISED';
  END IF;

  IF p_role NOT IN ('ADMIN', 'SOP_PREPARER', 'SUPPORT') THEN
    RAISE EXCEPTION 'Unknown role';
  END IF;

  IF actor.id = target_user AND p_role <> 'ADMIN' THEN
    RAISE EXCEPTION 'CANNOT_DEMOTE_SELF';
  END IF;

  UPDATE "User"
  SET role = p_role::"Role",
      roles = '{}'::"Role"[],
      "updatedAt" = NOW()
  WHERE id = target_user
  RETURNING * INTO updated;

  IF updated.id IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  RETURN public.safe_user_json(updated);
END;
$function$;

REVOKE ALL ON FUNCTION public.switch_my_role(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_user_roles(text, uuid, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.switch_my_role(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_user_roles(text, uuid, text[]) TO anon, authenticated;

-- Readable like "role" (the list of people shows it); written only through set_user_roles.
GRANT SELECT (roles) ON public."User" TO anon, authenticated;
