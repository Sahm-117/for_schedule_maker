-- Faith projects: fixes from code review.
--   * save_faith_project: a first project now carries an earlier "I'm fine with this" (sharedForPrayer follows prayerConsent = 'IN'),
--     and marks the save as the participant's own (fof.faith_by_participant) so the history never credits a staff identity.
--   * faith_project_keep_version honours that mark: a participant's own save has no saver name.
-- Rollback: re-apply 20261010100000_faith_project_free_edit.sql.

CREATE OR REPLACE FUNCTION public.save_faith_project(p_token text, p_body text, p_submit boolean)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  person_id UUID := public.app_participant_id(p_token);
  project "FaithProject";
  support_id UUID;
  cleaned TEXT := NULLIF(trim(COALESCE(p_body, '')), '');
  v_created BOOLEAN := FALSE;
  v_changed BOOLEAN := FALSE;
BEGIN
  IF person_id IS NULL THEN
    RAISE EXCEPTION 'SESSION_EXPIRED';
  END IF;
  IF cleaned IS NULL THEN
    RAISE EXCEPTION 'PROJECT_REQUIRED';
  END IF;
  PERFORM set_config('fof.faith_by_participant', '1', TRUE);

  SELECT * INTO project FROM "FaithProject" WHERE "participantId" = person_id ORDER BY "updatedAt" DESC LIMIT 1;

  IF project.id IS NULL THEN
    INSERT INTO "FaithProject" ("participantId", body, status, "sharedForPrayer")
    VALUES (person_id, cleaned, 'SAVED', COALESCE((SELECT p."prayerConsent" = 'IN' FROM "Participant" p WHERE p.id = person_id), FALSE))
    RETURNING * INTO project;
    v_created := TRUE;
    v_changed := TRUE;
  ELSIF project.status IS DISTINCT FROM 'SAVED' OR project.body IS DISTINCT FROM cleaned THEN
    v_created := project.status IS DISTINCT FROM 'SAVED';
    v_changed := TRUE;
    UPDATE "FaithProject"
    SET body = cleaned, status = 'SAVED', "updatedById" = NULL, "updatedAt" = NOW()
    WHERE id = project.id
    RETURNING * INTO project;
  END IF;

  SELECT g."supportId" INTO support_id
  FROM "GroupParticipant" gp
  JOIN "Group" g ON g.id = gp."groupId"
  JOIN "Participant" p ON p.id = gp."participantId" AND g."cohortId" = p."cohortId"
  WHERE gp."participantId" = person_id
  LIMIT 1;

  RETURN json_build_object(
    'project', json_build_object('id', project.id, 'body', project.body, 'status', project.status, 'updatedAt', project."updatedAt", 'sharedForPrayer', project."sharedForPrayer"),
    'supportId', support_id,
    'created', v_created,
    'changed', v_changed
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.faith_project_keep_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_actor UUID;
BEGIN
  -- A participant's own save (through save_faith_project) never carries a staff identity, even if a staff session is also present.
  IF COALESCE(current_setting('fof.faith_by_participant', TRUE), '') <> '1' THEN
    v_actor := public.app_current_user_id();
  END IF;
  INSERT INTO "FaithProjectVersion" ("projectId", "participantId", body, "savedById", "savedByName")
  VALUES (NEW.id, NEW."participantId", NEW.body, v_actor, (SELECT u.name FROM "User" u WHERE u.id = v_actor));
  RETURN NEW;
END;
$function$;
