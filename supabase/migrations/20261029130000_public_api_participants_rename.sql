-- FOF public API 1.0.1: the lookup's list is called `participants` (was `participations`), matching the app's word.
-- Only the key in api_people_lookup's answer changes. No app had a key yet, so nothing depended on the old name.
-- Rollback: re-run api_people_lookup from 20261029120000_public_api_foundation.sql.

-- Is this person in FOF? Matches by phone (last 10 digits) or email, across real cohorts.
CREATE OR REPLACE FUNCTION public.api_people_lookup(p_phone TEXT DEFAULT NULL, p_email TEXT DEFAULT NULL)
 RETURNS JSONB
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  phone_key TEXT := public.fof_phone_key(p_phone);
  email_key TEXT := NULLIF(lower(trim(COALESCE(p_email, ''))), '');
  today DATE := (timezone('Africa/Lagos', now()))::date;
  people JSONB;
  team JSONB;
BEGIN
  IF phone_key IS NULL AND email_key IS NULL THEN
    IF NULLIF(trim(COALESCE(p_phone, '')), '') IS NOT NULL THEN
      RAISE EXCEPTION 'That phone number is not one FOF can read';
    END IF;
    RAISE EXCEPTION 'Give a phone number or an email';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', p.id,
      'name', p."fullName",
      'status', p.status,
      'cohort', jsonb_build_object('id', c.id, 'name', c.name, 'startDate', c."startDate", 'endDate', c."endDate"),
      'cohortFinished', c."endDate" IS NOT NULL AND c."endDate" < today,
      'inGroup', EXISTS (
        SELECT 1 FROM public."GroupParticipant" gp JOIN public."Group" g ON g.id = gp."groupId"
        WHERE gp."participantId" = p.id AND g."archivedAt" IS NULL),
      'registeredOn', p."registrationDate"
    ) ORDER BY c."startDate" DESC NULLS LAST), '[]'::jsonb)
  INTO people
  FROM public."Participant" p
  JOIN public."Cohort" c ON c.id = p."cohortId"
  WHERE COALESCE(p."isTest", FALSE) = FALSE
    AND public.api_real_cohort(c.id)
    AND ((phone_key IS NOT NULL AND public.fof_phone_key(p.phone) = phone_key)
      OR (email_key IS NOT NULL AND lower(trim(p.email)) = email_key));

  -- Whether the person also serves on the FOF team (support or admin), by role only.
  SELECT COALESCE(jsonb_agg(DISTINCT r), '[]'::jsonb)
  INTO team
  FROM public."User" u
  CROSS JOIN LATERAL unnest(public.app_user_roles(u)::TEXT[]) AS r
  WHERE COALESCE(u."isTest", FALSE) = FALSE
    AND COALESCE(u."isActive", TRUE)
    AND r <> 'PARTICIPANT'
    AND ((phone_key IS NOT NULL AND public.fof_phone_key(u.phone) = phone_key)
      OR (email_key IS NOT NULL AND lower(trim(u.email)) = email_key));

  RETURN jsonb_build_object(
    'found', jsonb_array_length(people) > 0 OR jsonb_array_length(team) > 0,
    'participants', people,
    'teamRoles', team
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.api_people_lookup(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.api_people_lookup(TEXT, TEXT) TO service_role;
