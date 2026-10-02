-- A Practice participant's manual question now says so, so the app alerts only the person testing
-- (the group's support) instead of every real admin. Rollback: restore ask_manual_question from 20260927140000.
CREATE OR REPLACE FUNCTION public.ask_manual_question(
  p_token TEXT,
  p_week_id INTEGER,
  p_body TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  person_id UUID := public.app_participant_id(p_token);
  v_cohort_id UUID;
  v_group_id UUID;
  v_support_id UUID;
  v_body TEXT := NULLIF(btrim(COALESCE(p_body, '')), '');
  v_row "ManualQuestion";
BEGIN
  IF person_id IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  IF v_body IS NULL THEN RAISE EXCEPTION 'BODY_REQUIRED'; END IF;

  SELECT "cohortId" INTO v_cohort_id FROM "Participant" WHERE id = person_id;
  IF NOT EXISTS (SELECT 1 FROM "Week" WHERE id = p_week_id AND "cohortId" = v_cohort_id) THEN
    RAISE EXCEPTION 'Week was not found';
  END IF;

  SELECT g.id, g."supportId" INTO v_group_id, v_support_id
  FROM "GroupParticipant" gp
  JOIN "Group" g ON g.id = gp."groupId" AND g."cohortId" = v_cohort_id
  WHERE gp."participantId" = person_id
  LIMIT 1;

  INSERT INTO "ManualQuestion" ("participantId", "weekId", "cohortId", "groupId", body)
  VALUES (person_id, p_week_id, v_cohort_id, v_group_id, v_body)
  RETURNING * INTO v_row;

  RETURN json_build_object(
    'id', v_row.id, 'weekId', v_row."weekId", 'body', v_row.body, 'status', v_row.status,
    'reply', v_row.reply, 'createdAt', v_row."createdAt", 'supportId', v_support_id,
    'isPractice', COALESCE((SELECT "isPractice" FROM "Cohort" WHERE id = v_cohort_id), FALSE)
  );
END;
$function$;
