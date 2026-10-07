-- Read-only list of participants whose login is confirmed (they chose their own
-- password), for one cohort. The group builder uses it for the switch "Only
-- people who have signed in". Same test as the support "Get them on the app"
-- card (passwordSetAt). Staff only, like participants_without_app().
-- Applied live 2026-10-07. Rollback: DROP FUNCTION public.participants_signed_in(uuid);

CREATE OR REPLACE FUNCTION public.participants_signed_in(p_cohort_id uuid)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NOT public.app_is_staff() THEN
    RAISE EXCEPTION 'You must be signed in as a support or admin';
  END IF;

  RETURN COALESCE((
    SELECT json_agg(a."participantId")
    FROM "ParticipantAccount" a
    JOIN "Participant" p ON p.id = a."participantId"
    WHERE p."cohortId" = p_cohort_id
      AND a."isActive"
      AND a."passwordSetAt" IS NOT NULL
  ), '[]'::json);
END;
$function$;

REVOKE ALL ON FUNCTION public.participants_signed_in(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.participants_signed_in(uuid) TO anon, authenticated;
