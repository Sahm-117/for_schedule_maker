-- Group Discussion: when the group's support posts, tell the whole group.
--
-- Replaces discussion_post_alerts (20260930180000). A participant's post still
-- alerts the group's support; a support's post now alerts every active
-- participant in the group ("<Support> posted in your group discussion").
-- Tagged people still get only the tag alert, and nobody is alerted about
-- their own post.
--
-- Rollback: re-run discussion_post_alerts from 20260930180000.

CREATE OR REPLACE FUNCTION public.discussion_post_alerts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NEW."authorParticipantId" IS NOT NULL THEN
    PERFORM public.discussion_send_alerts(
      NEW."groupId", NEW."authorUserId", NEW."authorParticipantId", NEW.mentions, NEW.body,
      ARRAY(SELECT "supportId" FROM public."Group" WHERE id = NEW."groupId"), '{}',
      '{name} posted in your group discussion');
  ELSE
    PERFORM public.discussion_send_alerts(
      NEW."groupId", NEW."authorUserId", NEW."authorParticipantId", NEW.mentions, NEW.body,
      '{}',
      ARRAY(
        SELECT gp."participantId"
        FROM public."GroupParticipant" gp
        JOIN public."Participant" p ON p.id = gp."participantId" AND p.status = 'ACTIVE'
        WHERE gp."groupId" = NEW."groupId"
      ),
      '{name} posted in your group discussion');
  END IF;
  RETURN NEW;
END;
$function$;
