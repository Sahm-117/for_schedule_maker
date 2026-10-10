-- Birthdays list also returns each person's photo link, so the birthday graphic can use it.
-- Same function, one extra field per person; nothing else changes.

CREATE OR REPLACE FUNCTION public.birthdays_list(p_token text, p_cohort_id uuid DEFAULT NULL::uuid)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  staff "User" := public.app_staff(p_token);
  today DATE := (now() AT TIME ZONE 'Africa/Lagos')::DATE;
BEGIN
  IF staff.id IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  IF staff.role <> 'ADMIN' THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;

  RETURN json_build_object(
    'today', today,
    'supports', COALESCE((
      SELECT json_agg(r ORDER BY (r ->> 'daysUntil')::INT, r ->> 'name')
      FROM (
        SELECT json_build_object(
          'id', u.id, 'name', u.name, 'avatarUrl', u."avatarUrl",
          'month', substr(u.birthday, 1, 2)::INT, 'day', substr(u.birthday, 4, 2)::INT,
          'daysUntil', public.birthday_next(substr(u.birthday, 1, 2)::INT, substr(u.birthday, 4, 2)::INT, today) - today,
          'cohorts', COALESCE((SELECT json_agg(c.name ORDER BY c."startDate" DESC) FROM "UserCohort" uc JOIN "Cohort" c ON c.id = uc."cohortId" WHERE uc."userId" = u.id AND COALESCE(c."isPractice", FALSE) = FALSE AND c.name !~* '^zz\y'), '[]'::JSON)
        ) AS r
        FROM "User" u
        WHERE u."isActive" IS NOT FALSE AND COALESCE(u."isTest", FALSE) = FALSE
          AND ('SUPPORT'::"Role" = ANY(u.roles) OR u.role = 'SUPPORT'::"Role")
          AND u.birthday ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'
          AND (p_cohort_id IS NULL OR EXISTS (SELECT 1 FROM "UserCohort" uc WHERE uc."userId" = u.id AND uc."cohortId" = p_cohort_id))
      ) s
    ), '[]'::JSON),
    'participants', COALESCE((
      SELECT json_agg(r ORDER BY (r ->> 'daysUntil')::INT, r ->> 'name')
      FROM (
        SELECT json_build_object(
          'id', p.id, 'name', p."fullName", 'avatarUrl', p."avatarUrl",
          'month', EXTRACT(MONTH FROM p."dateOfBirth")::INT, 'day', EXTRACT(DAY FROM p."dateOfBirth")::INT,
          'daysUntil', public.birthday_next(EXTRACT(MONTH FROM p."dateOfBirth")::INT, EXTRACT(DAY FROM p."dateOfBirth")::INT, today) - today,
          'cohorts', json_build_array(c.name)
        ) AS r
        FROM "Participant" p
        JOIN "Cohort" c ON c.id = p."cohortId"
        WHERE p.status = 'ACTIVE' AND COALESCE(p."isTest", FALSE) = FALSE AND COALESCE(c."isPractice", FALSE) = FALSE AND c.name !~* '^zz\y'
          AND p."dateOfBirth" IS NOT NULL
          AND (p_cohort_id IS NULL OR p."cohortId" = p_cohort_id)
      ) s
    ), '[]'::JSON),
    'missing', json_build_object(
      'supports', (
        SELECT count(*) FROM "User" u
        WHERE u."isActive" IS NOT FALSE AND COALESCE(u."isTest", FALSE) = FALSE
          AND ('SUPPORT'::"Role" = ANY(u.roles) OR u.role = 'SUPPORT'::"Role")
          AND (u.birthday IS NULL OR u.birthday !~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$')
          AND (p_cohort_id IS NULL OR EXISTS (SELECT 1 FROM "UserCohort" uc WHERE uc."userId" = u.id AND uc."cohortId" = p_cohort_id))
      ),
      'participants', (
        SELECT count(*) FROM "Participant" p JOIN "Cohort" c ON c.id = p."cohortId"
        WHERE p.status = 'ACTIVE' AND COALESCE(p."isTest", FALSE) = FALSE AND COALESCE(c."isPractice", FALSE) = FALSE AND c.name !~* '^zz\y'
          AND p."dateOfBirth" IS NULL AND (p_cohort_id IS NULL OR p."cohortId" = p_cohort_id)
      )
    )
  );
END;
$function$;
