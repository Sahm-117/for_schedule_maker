-- A support who is handed someone else's follow-up should see that it was handed
-- over, and from whom, instead of "assigned <the day they signed up>". The
-- reassignment log is locked (service role only, FLOW_MAP rule 11), so this is a
-- read-only RPC: the caller's own contacts that were passed on to them, with the
-- name of whoever had them and when it happened (latest hand-over only).
--
-- Rollback: DROP FUNCTION public.my_followup_handovers(text);

CREATE OR REPLACE FUNCTION public.my_followup_handovers(p_token text)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  actor "User" := public.app_staff(p_token);
BEGIN
  IF actor.id IS NULL THEN
    RAISE EXCEPTION 'SESSION_EXPIRED';
  END IF;
  RETURN COALESCE((
    SELECT json_agg(h) FROM (
      SELECT DISTINCT ON (l."contactId")
             l."contactId" AS "contactId", l."createdAt" AS "at", fu.name AS "fromName", l.reason
      FROM "FollowUpReassignmentLog" l
      JOIN "FollowUpContact" c ON c.id = l."contactId" AND c."ownerId" = actor.id
      LEFT JOIN "User" fu ON fu.id = l."fromUserId"
      WHERE l."toUserId" = actor.id
      ORDER BY l."contactId", l."createdAt" DESC
    ) h
  ), '[]'::json);
END;
$function$;
REVOKE ALL ON FUNCTION public.my_followup_handovers(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_followup_handovers(text) TO anon, authenticated;
