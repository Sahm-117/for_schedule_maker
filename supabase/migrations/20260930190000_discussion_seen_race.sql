-- Group Discussion: make "mark seen" safe when two loads happen at once.
--
-- discussion_mark_seen (20260930180000) did UPDATE-then-INSERT, so two
-- simultaneous calls for the same person could both INSERT and one failed on
-- the unique index (a 409 in the browser). An upsert on the matching partial
-- unique index removes the race.
--
-- Rollback: re-run the discussion_mark_seen definition from 20260930180000.

CREATE OR REPLACE FUNCTION public.discussion_mark_seen(p_group_id UUID, p_user_id UUID, p_participant_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF p_user_id IS NOT NULL THEN
    INSERT INTO public."GroupDiscussionSeen" ("groupId", "userId", "seenAt")
    VALUES (p_group_id, p_user_id, clock_timestamp())
    ON CONFLICT ("groupId", "userId") WHERE "userId" IS NOT NULL
    DO UPDATE SET "seenAt" = EXCLUDED."seenAt";
  ELSIF p_participant_id IS NOT NULL THEN
    INSERT INTO public."GroupDiscussionSeen" ("groupId", "participantId", "seenAt")
    VALUES (p_group_id, p_participant_id, clock_timestamp())
    ON CONFLICT ("groupId", "participantId") WHERE "participantId" IS NOT NULL
    DO UPDATE SET "seenAt" = EXCLUDED."seenAt";
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.discussion_mark_seen(UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;
