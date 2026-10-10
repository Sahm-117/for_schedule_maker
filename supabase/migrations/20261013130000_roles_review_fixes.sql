-- Fixes from the code review of the roles work.
-- 1. A Team member (who acts as an admin) could reset another Team member's password and sign in as them. Only a real
--    admin may now reset the password of anyone who is not a plain Support.
-- 2. The role list counts every holder (deactivated people too), the same number perm_delete_role checks.
-- 3. perm_save_role rejects a grid entry with no module instead of failing later on a raw not-null error.
-- 4. Records made while acting as a Team member are tagged like an admin's ("Name (Team member)").

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
    IF (m->>'module') IS NULL OR NOT (m->>'module') = ANY (public.perm_module_keys()) THEN
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
      ELSE (SELECT count(*) FROM "UserPermissionRole" up WHERE up."roleId" = r.id) END,
    'modules', COALESCE((
      SELECT json_agg(json_build_object('module', m.module, 'view', m."canView", 'add', m."canAdd", 'edit', m."canEdit", 'delete', m."canDelete") ORDER BY m.module)
      FROM "PermissionRoleModule" m WHERE m."roleId" = r.id
    ), '[]'::json)
  )
  FROM "PermissionRole" r WHERE r.id = p_id;
$function$;

-- Resetting the password of an admin or a Team member would hand over their access, so only a real admin may.
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

  
  SELECT * INTO target FROM "User" WHERE id = target_user;
  IF target.id IS NOT NULL
     AND EXISTS (SELECT 1 FROM unnest(public.app_user_roles(target)) r WHERE r <> 'SUPPORT'::"Role")
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

CREATE OR REPLACE FUNCTION public.app_acted_as()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT CASE WHEN cardinality(public.app_user_roles(u)) > 1
               AND public.app_effective_role(u, s."activeRole") IN ('ADMIN'::"Role", 'STAFF'::"Role")
              THEN public.app_effective_role(u, s."activeRole")::text END
  FROM "AppSession" s
  JOIN "User" u ON u.id = s."userId"
  WHERE s."tokenHash" = encode(digest(public.app_current_token(), 'sha256'), 'hex')
    AND s."expiresAt" > NOW()
    AND s."userId" IS NOT NULL
    AND u."isActive" IS NOT FALSE
  LIMIT 1;
$function$;
