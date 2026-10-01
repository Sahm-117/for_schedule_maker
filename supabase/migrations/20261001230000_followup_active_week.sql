-- Follow-ups are only handed to supports who have used the app in the last week.
--
-- A support whose last activity (their latest app session, or their last look at
-- My Hub) is more than seven days ago, or who has never been seen, is skipped
-- by both automatic assignment (the person who added the contact, or the
-- fewest-open-follow-ups pick) and reassignment of people who did not move.
-- People they already hold stay with them until the usual no-movement check
-- hands them on.
--
-- Rollback: restore followup_owner_is_quiet and run_followup_reassignment from
-- 20260930330000_followup_auto_reassign.sql and drop followup_support_inactive.

CREATE OR REPLACE FUNCTION public.followup_support_inactive(p_user uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT COALESCE(
    GREATEST(
      (SELECT MAX(s."lastSeenAt") FROM "AppSession" s WHERE s."userId" = p_user),
      (SELECT u."hubLastSeenAt" FROM "User" u WHERE u.id = p_user)
    ) < now() - interval '7 days',
    TRUE
  );
$function$;

-- "Quiet" already keeps a support out of automatic assignment; not being around for a week counts too.
CREATE OR REPLACE FUNCTION public.followup_owner_is_quiet(p_owner uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT EXISTS (SELECT 1 FROM "FollowUpOwnerCheck" k WHERE k."ownerId" = p_owner AND k."closedAt" IS NULL)
      OR public.followup_owner_handed_on_recently(p_owner)
      OR public.followup_support_inactive(p_owner);
$function$;

-- Reassignment picks a receiver among active supports; they must also have been around this week.
DO $patch$
DECLARE
  v_def TEXT;
  v_new TEXT;
BEGIN
  SELECT pg_get_functiondef('public.run_followup_reassignment()'::regprocedure) INTO v_def;
  IF position('followup_support_inactive' IN v_def) > 0 THEN
    RETURN;
  END IF;
  v_new := replace(v_def,
    'AND NOT public.followup_owner_handed_on_recently(u.id)',
    E'AND NOT public.followup_owner_handed_on_recently(u.id)\n            AND NOT public.followup_support_inactive(u.id)');
  IF v_new = v_def THEN
    RAISE EXCEPTION 'run_followup_reassignment: anchor not found';
  END IF;
  EXECUTE v_new;
END
$patch$;

REVOKE ALL ON FUNCTION public.followup_support_inactive(uuid) FROM PUBLIC, anon, authenticated;
