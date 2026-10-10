-- Who should receive the admin notifications of a module: every admin, plus anyone with Team member access whose roles let
-- them See that module (their custom roles, and the built-in Support role's ticks if they also hold Support).
-- Called by the notification edge functions (service role) and by SQL triggers; not reachable from the app.
CREATE OR REPLACE FUNCTION public.module_viewers(p_module text)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT u.id
  FROM "User" u
  WHERE u."isActive" IS NOT FALSE
    AND (
      'ADMIN'::"Role" = ANY (public.app_user_roles(u))
      OR (
        'STAFF'::"Role" = ANY (public.app_user_roles(u))
        AND EXISTS (
          SELECT 1
          FROM "PermissionRoleModule" m
          JOIN "PermissionRole" r ON r.id = m."roleId"
          WHERE m.module = p_module
            AND m."canView"
            AND (
              r.id IN (SELECT up."roleId" FROM "UserPermissionRole" up WHERE up."userId" = u.id)
              OR ('SUPPORT'::"Role" = ANY (public.app_user_roles(u)) AND r."isSystem" AND lower(r.name) = 'support')
            )
        )
      )
    );
$function$;

REVOKE ALL ON FUNCTION public.module_viewers(text) FROM PUBLIC, anon, authenticated;

-- A reported group post alerts the group's support, and everyone who can See Groups (it used to be admins only).
CREATE OR REPLACE FUNCTION public.discussion_report_alerts()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_group public."Group";
  v_reason TEXT := CASE NEW.reason
    WHEN 'SPAM' THEN 'Spam or selling' WHEN 'UNKIND' THEN 'Unkind or offensive'
    WHEN 'OFF_TOPIC' THEN 'Not about FOF' ELSE 'Something else' END;
BEGIN
  SELECT g.* INTO v_group FROM public."Group" g JOIN public."GroupPost" gp ON gp."groupId" = g.id WHERE gp.id = NEW."postId";
  -- The group's support opens their Discussion tab; admins open the group page.
  PERFORM public.invoke_discussion_notify(
    ARRAY[v_group."supportId"], '{}',
    'A post was reported in ' || v_group.name, 'Reason: ' || v_reason || '. Tap to review.',
    '/support/participants?tab=discussion', NULL);
  PERFORM public.invoke_discussion_notify(
    ARRAY(SELECT v FROM public.module_viewers('groups') v WHERE v IS DISTINCT FROM v_group."supportId"), '{}',
    'A post was reported in ' || v_group.name, 'Reason: ' || v_reason || '. Tap to review.',
    '/group-view/' || v_group."supportId" || '?cohort=' || v_group."cohortId", NULL);
  RETURN NEW;
END;
$function$;
