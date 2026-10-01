-- Read-only record for admins: who joined Practice, who is in now, what they
-- ticked, and the walkthrough history. Adds one function, changes nothing else.
-- Rollback: DROP FUNCTION public.practice_overview();
CREATE OR REPLACE FUNCTION public.practice_overview()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT public.app_is_admin() THEN
    RAISE EXCEPTION 'Only admins can see this';
  END IF;
  RETURN jsonb_build_object(
    'on', COALESCE((SELECT "practiceOn" FROM public."Cohort" WHERE "isPractice" LIMIT 1), FALSE),
    'members', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'userId', m."userId",
        'name', u.name,
        'avatarUrl', u."avatarUrl",
        'role', m.role,
        'joinedAt', m."createdAt",
        'lastSeenAt', m."lastSeenAt",
        'online', COALESCE(m."lastSeenAt" > NOW() - INTERVAL '30 seconds', FALSE),
        'inParticipantView', m."inParticipantView",
        'progress', COALESCE((
          SELECT jsonb_agg(jsonb_build_object('key', p."scenarioKey", 'doneAt', p."doneAt", 'stuckAt', p."stuckAt") ORDER BY p."updatedAt")
          FROM public."PracticeProgress" p WHERE p."userId" = m."userId"
        ), '[]'::jsonb)
      ) ORDER BY (m."lastSeenAt" > NOW() - INTERVAL '30 seconds') DESC NULLS LAST, m."lastSeenAt" DESC NULLS LAST)
      FROM public."PracticeMember" m JOIN public."User" u ON u.id = m."userId"
    ), '[]'::jsonb),
    'walkthroughs', COALESCE((
      SELECT jsonb_agg(w) FROM (
        SELECT jsonb_build_object(
          'id', pp.id, 'fromName', fu.name, 'toName', tu.name,
          'fromRole', pp."fromRole", 'toRole', pp."toRole", 'status', pp.status,
          'createdAt', pp."createdAt", 'endedAt', pp."endedAt") AS w
        FROM public."PracticePeer" pp
        JOIN public."User" fu ON fu.id = pp."fromUserId"
        JOIN public."User" tu ON tu.id = pp."toUserId"
        ORDER BY pp."createdAt" DESC LIMIT 100
      ) x
    ), '[]'::jsonb)
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.practice_overview() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.practice_overview() TO anon, authenticated;
