-- Code review follow-up to 20261022100000_teen_questions.sql: a support may only change a question they
-- typed while they are still that teen's Teen Support (a teen can move to another Teen Support).
--
-- Rollback: re-run support_update_manual_question from 20261022100000_teen_questions.sql.

-- Fix a question you typed for a teen, until it is marked for class or replied to.
CREATE OR REPLACE FUNCTION public.support_update_manual_question(p_id uuid, p_body text, p_hide_name boolean, p_week_id integer DEFAULT NULL)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor_id UUID;
  v_row public."ManualQuestion";
  v_body TEXT := NULLIF(btrim(COALESCE(p_body, '')), '');
BEGIN
  IF NOT public.app_is_staff() THEN
    RAISE EXCEPTION 'You must be signed in as a support or admin';
  END IF;
  IF v_body IS NULL THEN RAISE EXCEPTION 'BODY_REQUIRED'; END IF;
  v_actor_id := public.app_current_user_id();

  SELECT * INTO v_row FROM public."ManualQuestion" WHERE id = p_id;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'Question was not found'; END IF;
  IF NOT public.app_is_admin() AND v_row."askedById" IS DISTINCT FROM v_actor_id THEN
    RAISE EXCEPTION 'Only the person who added this question can change it';
  END IF;
  -- ...and only while they are still this teen's Teen Support (a teen can move to another one).
  IF NOT public.app_is_admin() AND NOT EXISTS (
    SELECT 1 FROM public."GroupParticipant" gp
    JOIN public."Group" g ON g.id = gp."groupId" AND g."cohortId" = v_row."cohortId"
    WHERE gp."participantId" = v_row."participantId" AND g."supportId" = v_actor_id
  ) THEN
    RAISE EXCEPTION 'Only this teen''s Teen Support or an admin can change this question';
  END IF;
  IF v_row.status <> 'NEW' THEN
    RAISE EXCEPTION 'This question is already set for class and can no longer be changed';
  END IF;
  IF p_week_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public."Week" WHERE id = p_week_id AND "cohortId" = v_row."cohortId") THEN
    RAISE EXCEPTION 'Week was not found';
  END IF;

  UPDATE public."ManualQuestion"
  SET body = v_body, "hideName" = COALESCE(p_hide_name, "hideName"), "weekId" = COALESCE(p_week_id, "weekId")
  WHERE id = p_id
  RETURNING * INTO v_row;

  RETURN json_build_object('id', v_row.id, 'weekId', v_row."weekId", 'status', v_row.status);
END;
$function$;
