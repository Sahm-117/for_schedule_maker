-- A Support who acts in their Support view keeps exactly the Support screens (no grid modules). Extra modules reach a
-- Support person only through Team member access: they hold both Support and Team member and switch views. In the Team
-- member view their access is their custom roles plus the built-in Support role's ticks.
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
  IF u.role = 'SUPPORT'::"Role" THEN
    RETURN json_build_object('isAdmin', FALSE, 'modules', '{}'::json);
  END IF;
  RETURN json_build_object('isAdmin', FALSE, 'modules', COALESCE((
    SELECT json_object_agg(t.module, json_build_object('view', t.v, 'add', t.a, 'edit', t.e, 'delete', t.d))
    FROM (
      SELECT m.module, bool_or(m."canView") AS v, bool_or(m."canAdd") AS a, bool_or(m."canEdit") AS e, bool_or(m."canDelete") AS d
      FROM "PermissionRoleModule" m
      JOIN "PermissionRole" r ON r.id = m."roleId"
      WHERE r.id IN (SELECT up."roleId" FROM "UserPermissionRole" up WHERE up."userId" = u.id)
         OR ('SUPPORT'::"Role" = ANY (public.app_user_roles(u)) AND r."isSystem" AND lower(r.name) = 'support')
      GROUP BY m.module
    ) t
  ), '{}'::json));
END;
$function$;
