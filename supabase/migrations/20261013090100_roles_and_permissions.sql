-- Roles and permissions, phase 1 (hide only). See docs/specs/roles-and-permissions.md.
--
-- 1. STAFF ("Team member") acts as an admin behind the scenes: app_staff() and app_is_admin() treat it as ADMIN, so
--    every existing admin-only function and rule lets a Team member through. What a Team member can SEE is decided in the app
--    by the role grid below. Real blocking in the database is phase 2.
-- 2. app_staff_real() keeps the true role. Everything that creates or changes who has access uses it, so a Team member can
--    never make anyone an admin, change roles, or reset an admin's password.
-- 3. New tables (born locked, reached only through the functions below): PermissionRole, PermissionRoleModule, UserPermissionRole.

-- ---------------------------------------------------------------------------------------------------------------------------
-- The true role (what app_staff used to be), and app_staff / app_is_admin treating STAFF as an admin.
-- ---------------------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.app_staff_real(p_token text)
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
  -- The role this login is acting as, exactly as it is.
  u.role := public.app_effective_role(u, s."activeRole");
  RETURN u;
END;
$function$;

CREATE OR REPLACE FUNCTION public.app_staff(p_token text)
 RETURNS "User"
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  u "User" := public.app_staff_real(p_token);
BEGIN
  IF u.id IS NULL THEN
    RETURN NULL;
  END IF;
  -- A Team member passes every existing admin check. The app limits what they see; the database does not (yet).
  IF u.role = 'STAFF'::"Role" THEN
    u.role := 'ADMIN'::"Role";
  END IF;
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
      AND public.app_effective_role(u, s."activeRole") IN ('ADMIN'::"Role", 'STAFF'::"Role")
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
      AND public.app_effective_role(u, s."activeRole") IN ('ADMIN'::public."Role", 'STAFF'::public."Role")
  );
$function$;

-- The app reads the person's true role from here (a Team member must show as STAFF to the Users screen and the badge).
CREATE OR REPLACE FUNCTION public.get_session_user(p_token text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  staff "User" := public.app_staff_real(p_token);
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
$function$;

-- ---------------------------------------------------------------------------------------------------------------------------
-- Tables (closed outright: only the functions below can touch them)
-- ---------------------------------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public."PermissionRole" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  "isSystem" boolean NOT NULL DEFAULT false,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "PermissionRole_name_lower_key" ON public."PermissionRole" (lower(name));

CREATE TABLE IF NOT EXISTS public."PermissionRoleModule" (
  "roleId" uuid NOT NULL REFERENCES public."PermissionRole"(id) ON DELETE CASCADE,
  module text NOT NULL,
  "canView" boolean NOT NULL DEFAULT false,
  "canAdd" boolean NOT NULL DEFAULT false,
  "canEdit" boolean NOT NULL DEFAULT false,
  "canDelete" boolean NOT NULL DEFAULT false,
  PRIMARY KEY ("roleId", module)
);

CREATE TABLE IF NOT EXISTS public."UserPermissionRole" (
  "userId" uuid NOT NULL REFERENCES public."User"(id) ON DELETE CASCADE,
  "roleId" uuid NOT NULL REFERENCES public."PermissionRole"(id) ON DELETE CASCADE,
  PRIMARY KEY ("userId", "roleId")
);
CREATE INDEX IF NOT EXISTS "UserPermissionRole_roleId_idx" ON public."UserPermissionRole" ("roleId");

REVOKE ALL ON TABLE public."PermissionRole", public."PermissionRoleModule", public."UserPermissionRole" FROM anon, authenticated;
ALTER TABLE public."PermissionRole" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."PermissionRoleModule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."UserPermissionRole" ENABLE ROW LEVEL SECURITY;

-- The built-in Support role. Support screens are fixed; ticks here add admin modules on top. Starts with none.
INSERT INTO public."PermissionRole" (name, description, "isSystem")
SELECT 'Support', 'Built-in. Support screens stay as they are; tick extra modules here.', TRUE
WHERE NOT EXISTS (SELECT 1 FROM public."PermissionRole" WHERE "isSystem" AND lower(name) = 'support');

-- ---------------------------------------------------------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------------------------------------------------------
-- The modules of the grid. Keep in step with frontend/src/utils/permissions.ts.
CREATE OR REPLACE FUNCTION public.perm_module_keys()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
AS $$ SELECT ARRAY['dashboard','schedule','planner','participants','groups','supports','hubs','cohorts','follow_ups',
  'feedback','surveys','corporate_prayers','birthdays','community','users','announcements','notifications','practice',
  'resources','website','settings']::text[] $$;

-- Admin only, and the person's true role (a Team member cannot manage roles).
CREATE OR REPLACE FUNCTION public.perm_require_admin(p_token text)
 RETURNS "User"
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE u "User" := public.app_staff_real(p_token);
BEGIN
  IF u.id IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  IF u.role <> 'ADMIN'::"Role" THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  RETURN u;
END;
$function$;

CREATE OR REPLACE FUNCTION public.perm_role_json(p_id uuid)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT json_build_object(
    'id', r.id,
    'name', r.name,
    'description', r.description,
    'isSystem', r."isSystem",
    'memberCount', CASE WHEN r."isSystem"
      THEN (SELECT count(*) FROM "User" u WHERE u."isActive" IS NOT FALSE AND 'SUPPORT'::"Role" = ANY (public.app_user_roles(u)))
      ELSE (SELECT count(*) FROM "UserPermissionRole" up JOIN "User" u ON u.id = up."userId" WHERE up."roleId" = r.id AND u."isActive" IS NOT FALSE) END,
    'modules', COALESCE((
      SELECT json_agg(json_build_object('module', m.module, 'view', m."canView", 'add', m."canAdd", 'edit', m."canEdit", 'delete', m."canDelete") ORDER BY m.module)
      FROM "PermissionRoleModule" m WHERE m."roleId" = r.id
    ), '[]'::json)
  )
  FROM "PermissionRole" r WHERE r.id = p_id;
$function$;

-- ---------------------------------------------------------------------------------------------------------------------------
-- Role management (real admins only)
-- ---------------------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.perm_list_roles(p_token text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE actor "User" := public.perm_require_admin(p_token);
BEGIN
  RETURN COALESCE((
    SELECT json_agg(public.perm_role_json(r.id) ORDER BY r."isSystem" DESC, lower(r.name))
    FROM "PermissionRole" r
  ), '[]'::json);
END;
$function$;

-- Create (p_role_id NULL) or update a role and replace its grid. p_modules: [{module, view, add, edit, delete}].
-- Add / Edit / Delete always imply See.
CREATE OR REPLACE FUNCTION public.perm_save_role(p_token text, p_role_id uuid, p_name text, p_description text, p_modules jsonb)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  actor "User" := public.perm_require_admin(p_token);
  v_name text := NULLIF(trim(COALESCE(p_name, '')), '');
  v_id uuid := p_role_id;
  v_system boolean;
  m jsonb;
BEGIN
  IF jsonb_typeof(COALESCE(p_modules, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'Modules must be a list';
  END IF;
  FOR m IN SELECT * FROM jsonb_array_elements(COALESCE(p_modules, '[]'::jsonb)) LOOP
    IF NOT (m->>'module') = ANY (public.perm_module_keys()) THEN
      RAISE EXCEPTION 'Unknown module';
    END IF;
  END LOOP;

  IF v_id IS NULL THEN
    IF v_name IS NULL OR length(v_name) > 60 THEN
      RAISE EXCEPTION 'A role name is required (60 characters at most)';
    END IF;
    BEGIN
      INSERT INTO "PermissionRole" (name, description) VALUES (v_name, NULLIF(trim(COALESCE(p_description, '')), ''))
      RETURNING id INTO v_id;
    EXCEPTION WHEN unique_violation THEN
      RAISE EXCEPTION 'ROLE_NAME_TAKEN';
    END;
  ELSE
    SELECT "isSystem" INTO v_system FROM "PermissionRole" WHERE id = v_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'ROLE_NOT_FOUND';
    END IF;
    IF v_system THEN
      UPDATE "PermissionRole" SET "updatedAt" = NOW() WHERE id = v_id;
    ELSE
      IF v_name IS NULL OR length(v_name) > 60 THEN
        RAISE EXCEPTION 'A role name is required (60 characters at most)';
      END IF;
      BEGIN
        UPDATE "PermissionRole"
        SET name = v_name, description = NULLIF(trim(COALESCE(p_description, '')), ''), "updatedAt" = NOW()
        WHERE id = v_id;
      EXCEPTION WHEN unique_violation THEN
        RAISE EXCEPTION 'ROLE_NAME_TAKEN';
      END;
    END IF;
  END IF;

  DELETE FROM "PermissionRoleModule" WHERE "roleId" = v_id;
  INSERT INTO "PermissionRoleModule" ("roleId", module, "canView", "canAdd", "canEdit", "canDelete")
  SELECT v_id, x.module,
         (x.v OR x.a OR x.e OR x.d), x.a, x.e, x.d
  FROM (
    SELECT e->>'module' AS module,
           COALESCE((e->>'view')::boolean, FALSE) AS v,
           COALESCE((e->>'add')::boolean, FALSE) AS a,
           COALESCE((e->>'edit')::boolean, FALSE) AS e,
           COALESCE((e->>'delete')::boolean, FALSE) AS d
    FROM jsonb_array_elements(COALESCE(p_modules, '[]'::jsonb)) e
  ) x
  WHERE (x.v OR x.a OR x.e OR x.d)
  ON CONFLICT ("roleId", module) DO UPDATE
    SET "canView" = EXCLUDED."canView", "canAdd" = EXCLUDED."canAdd", "canEdit" = EXCLUDED."canEdit", "canDelete" = EXCLUDED."canDelete";

  RETURN public.perm_role_json(v_id);
END;
$function$;

-- Blocked while anyone holds the role, so nobody loses access silently.
CREATE OR REPLACE FUNCTION public.perm_delete_role(p_token text, p_role_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  actor "User" := public.perm_require_admin(p_token);
  v_system boolean;
  v_count integer;
BEGIN
  SELECT "isSystem" INTO v_system FROM "PermissionRole" WHERE id = p_role_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ROLE_NOT_FOUND';
  END IF;
  IF v_system THEN
    RAISE EXCEPTION 'ROLE_IS_SYSTEM';
  END IF;
  SELECT count(*) INTO v_count FROM "UserPermissionRole" WHERE "roleId" = p_role_id;
  IF v_count > 0 THEN
    RAISE EXCEPTION 'ROLE_IN_USE:%', v_count;
  END IF;
  DELETE FROM "PermissionRole" WHERE id = p_role_id;
END;
$function$;

-- Replace the custom roles a person holds. The built-in Support role is never assigned here (it follows the Support role).
CREATE OR REPLACE FUNCTION public.perm_set_user_roles(p_token text, p_user_id uuid, p_role_ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  actor "User" := public.perm_require_admin(p_token);
  v_ids uuid[] := COALESCE(p_role_ids, '{}'::uuid[]);
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "User" WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'User not found';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(v_ids) i
    WHERE NOT EXISTS (SELECT 1 FROM "PermissionRole" r WHERE r.id = i AND NOT r."isSystem")
  ) THEN
    RAISE EXCEPTION 'Unknown role';
  END IF;
  DELETE FROM "UserPermissionRole" WHERE "userId" = p_user_id;
  INSERT INTO "UserPermissionRole" ("userId", "roleId") SELECT p_user_id, i FROM unnest(v_ids) i ON CONFLICT DO NOTHING;
END;
$function$;

-- Who holds which custom role (for the Users screen).
CREATE OR REPLACE FUNCTION public.perm_user_assignments(p_token text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE actor "User" := public.perm_require_admin(p_token);
BEGIN
  RETURN COALESCE((
    SELECT json_agg(json_build_object('userId', t."userId", 'roleIds', t.ids))
    FROM (SELECT up."userId", json_agg(up."roleId") AS ids FROM "UserPermissionRole" up GROUP BY up."userId") t
  ), '[]'::json);
END;
$function$;

-- What the signed-in person may do, resolved from their roles. Admins get everything.
-- Shape: { isAdmin, modules: { <key>: { view, add, edit, delete } } } (modules with no tick are left out).
CREATE OR REPLACE FUNCTION public.get_my_permissions(p_token text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  u "User" := public.app_staff_real(p_token);
BEGIN
  IF u.id IS NULL THEN
    RETURN NULL;
  END IF;
  IF u.role = 'ADMIN'::"Role" THEN
    RETURN json_build_object('isAdmin', TRUE, 'modules', (
      SELECT json_object_agg(k, json_build_object('view', TRUE, 'add', TRUE, 'edit', TRUE, 'delete', TRUE))
      FROM unnest(public.perm_module_keys()) k
    ));
  END IF;
  RETURN json_build_object('isAdmin', FALSE, 'modules', COALESCE((
    SELECT json_object_agg(t.module, json_build_object('view', t.v, 'add', t.a, 'edit', t.e, 'delete', t.d))
    FROM (
      SELECT m.module, bool_or(m."canView") AS v, bool_or(m."canAdd") AS a, bool_or(m."canEdit") AS e, bool_or(m."canDelete") AS d
      FROM "PermissionRoleModule" m
      JOIN "PermissionRole" r ON r.id = m."roleId"
      WHERE r.id IN (SELECT up."roleId" FROM "UserPermissionRole" up WHERE up."userId" = u.id)
         OR (u.role = 'SUPPORT'::"Role" AND r."isSystem" AND lower(r.name) = 'support')
      GROUP BY m.module
    ) t
  ), '{}'::json));
END;
$function$;

-- ---------------------------------------------------------------------------------------------------------------------------
-- Existing functions: accept STAFF, and keep access-changing actions for real admins only.
-- ---------------------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_user_roles(p_token text, target_user uuid, p_roles text[])
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  actor "User" := public.app_staff_real(p_token);
  v_roles "Role"[];
  v_home "Role";
  updated "User";
BEGIN
  IF actor.id IS NULL OR actor.role <> 'ADMIN'::"Role" THEN
    RAISE EXCEPTION 'NOT_AUTHORISED';
  END IF;
  SELECT array_agg(DISTINCT r::"Role") INTO v_roles
  FROM unnest(p_roles) r WHERE r IN ('ADMIN', 'SOP_PREPARER', 'SUPPORT', 'STAFF');
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

CREATE OR REPLACE FUNCTION public.set_user_role(p_token text, target_user uuid, p_role text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  actor "User" := public.app_staff_real(p_token);
  updated "User";
BEGIN
  IF actor.id IS NULL OR actor.role <> 'ADMIN'::"Role" THEN
    RAISE EXCEPTION 'NOT_AUTHORISED';
  END IF;

  IF p_role NOT IN ('ADMIN', 'SOP_PREPARER', 'SUPPORT', 'STAFF') THEN
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
  IF p_role IS NULL OR p_role NOT IN ('ADMIN', 'SOP_PREPARER', 'SUPPORT', 'STAFF') OR NOT (p_role::"Role" = ANY (public.app_user_roles(u))) THEN
    RAISE EXCEPTION 'You do not have that role';
  END IF;
  UPDATE "AppSession" SET "activeRole" = p_role::"Role" WHERE id = s.id;
  u.role := p_role::"Role";
  RETURN public.safe_user_json(u);
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_user(p_token text, p_name text, p_password text, p_email text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_role text DEFAULT 'SUPPORT'::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  actor "User" := public.app_staff(p_token);
  real_actor "User" := public.app_staff_real(p_token);
  created "User";
  normalized_email TEXT := NULLIF(lower(trim(COALESCE(p_email, ''))), '');
  normalized_phone TEXT := NULLIF(trim(COALESCE(p_phone, '')), '');
BEGIN
  IF actor.id IS NULL OR actor.role <> 'ADMIN'::"Role" THEN
    RAISE EXCEPTION 'NOT_AUTHORISED';
  END IF;

  IF p_name IS NULL OR trim(p_name) = '' THEN
    RAISE EXCEPTION 'A name is required';
  END IF;
  IF p_password IS NULL OR length(p_password) < 8 THEN
    RAISE EXCEPTION 'Password must be at least 8 characters';
  END IF;
  IF normalized_email IS NULL AND normalized_phone IS NULL THEN
    RAISE EXCEPTION 'An email address or phone number is required';
  END IF;
  IF p_role NOT IN ('ADMIN', 'SOP_PREPARER', 'SUPPORT', 'STAFF') THEN
    RAISE EXCEPTION 'Unknown role';
  END IF;
  -- Only a real admin can hand out anything above Support.
  IF p_role <> 'SUPPORT' AND real_actor.role <> 'ADMIN'::"Role" THEN
    RAISE EXCEPTION 'NOT_AUTHORISED';
  END IF;

  INSERT INTO "User" (email, phone, name, role, password_hash, "mustChangePassword")
  VALUES (
    normalized_email,
    normalized_phone,
    trim(p_name),
    p_role::"Role",
    crypt(p_password, gen_salt('bf', 10)),
    TRUE
  )
  RETURNING * INTO created;

  RETURN public.safe_user_json(created);
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_user_password(p_token text, target_user uuid, new_password text, force_change boolean DEFAULT true)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  actor "User" := public.app_staff(p_token);
  real_actor "User" := public.app_staff_real(p_token);
  target "User";
BEGIN
  IF actor.id IS NULL OR actor.role <> 'ADMIN'::"Role" THEN
    RAISE EXCEPTION 'NOT_AUTHORISED';
  END IF;

  IF new_password IS NULL OR length(new_password) < 8 THEN
    RAISE EXCEPTION 'Password must be at least 8 characters';
  END IF;

  -- Resetting an admin's password would hand over their access, so only a real admin may.
  SELECT * INTO target FROM "User" WHERE id = target_user;
  IF target.id IS NOT NULL
     AND 'ADMIN'::"Role" = ANY (public.app_user_roles(target))
     AND real_actor.role <> 'ADMIN'::"Role" THEN
    RAISE EXCEPTION 'NOT_AUTHORISED';
  END IF;

  UPDATE "User"
  SET password_hash = crypt(new_password, gen_salt('bf', 10)),
      "mustChangePassword" = force_change,
      "updatedAt" = NOW()
  WHERE id = target_user;

  RETURN FOUND;
END;
$function$;

-- ---------------------------------------------------------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.app_staff_real(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.perm_require_admin(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.perm_role_json(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.perm_list_roles(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.perm_save_role(text, uuid, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.perm_delete_role(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.perm_set_user_roles(text, uuid, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.perm_user_assignments(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_permissions(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.perm_list_roles(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.perm_save_role(text, uuid, text, text, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.perm_delete_role(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.perm_set_user_roles(text, uuid, uuid[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.perm_user_assignments(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_permissions(text) TO anon, authenticated;
