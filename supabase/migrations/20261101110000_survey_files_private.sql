-- Survey file uploads go to the private bucket (FLOW_MAP rule 129; the open item from 30 Oct).
--   * New uploads are stored in "private-files" under survey-files/<survey id>/<respondent id>/<file>, where the respondent
--     id is the signed-in participant's id or the staff member's user id. The answer's url is "fof-private:<path>", like a
--     private Resource file. Old answers keep their public https links, which still work.
--   * A signed-in session (storage_signed_in's rule) may add a file only under its own folder of an existing survey:
--     storage_survey_upload_ok(name) checks the shape, that the survey exists and that the third part is the caller's own
--     id. Reading stays admin-only (the existing "private-files: admin read" policy); the results page gets signed links
--     for admins through the file-links function (kind 'survey').
--   * survey_respondent_id(token) tells the app which id to put in the path.
--   * survey_submit (copied from 20261002200000_surveys.sql) reads a FILE answer as the {url, name} object the app sends
--     (a plain string from an older client still works) and accepts a private link only inside
--     survey-files/<this survey>/<this respondent>/; other private paths are refused.
--
-- Rollback: DROP POLICY "private-files: survey upload" ON storage.objects;
-- DROP FUNCTION public.storage_survey_upload_ok(TEXT); DROP FUNCTION public.survey_respondent_id(TEXT);
-- then re-run survey_submit from 20261002200000_surveys.sql (answers already stored with a fof-private: url keep working
-- for admins either way).

-- The caller's own id as a path part: a participant's id, or a staff member's user id. Storage policies can't call
-- app_participant_id directly (closed to the app's roles), so this is the wrapper, like storage_signed_in.
CREATE OR REPLACE FUNCTION public.storage_survey_upload_ok(p_name TEXT)
 RETURNS BOOLEAN
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT p_name IS NOT NULL
    AND position('..' IN p_name) = 0
    AND split_part(p_name, '/', 1) = 'survey-files'
    AND split_part(p_name, '/', 4) <> ''
    AND EXISTS (SELECT 1 FROM public."Survey" s WHERE s.id::TEXT = split_part(p_name, '/', 2))
    AND split_part(p_name, '/', 3) = COALESCE(
      public.app_participant_id(public.app_current_token())::TEXT,
      public.app_current_user_id()::TEXT);
$function$;
REVOKE ALL ON FUNCTION public.storage_survey_upload_ok(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.storage_survey_upload_ok(TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.survey_respondent_id(p_token TEXT)
 RETURNS UUID
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path = public, extensions
AS $function$
  SELECT COALESCE(public.app_participant_id(p_token), (public.app_staff(p_token)).id);
$function$;
REVOKE ALL ON FUNCTION public.survey_respondent_id(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.survey_respondent_id(TEXT) TO anon, authenticated;

DROP POLICY IF EXISTS "private-files: survey upload" ON storage.objects;
CREATE POLICY "private-files: survey upload" ON storage.objects FOR INSERT TO public
  WITH CHECK (bucket_id = 'private-files' AND (SELECT public.storage_survey_upload_ok(name)));

CREATE OR REPLACE FUNCTION public.survey_submit(p_token TEXT, p_id UUID, p_answers JSONB)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  pid UUID := public.app_participant_id(p_token);
  staff "User" := public.app_staff(p_token);
  rid UUID;
  person "Participant";
  c "Cohort";
  s "Survey";
  q RECORD;
  rkey TEXT;
  ok BOOLEAN := FALSE;
  cohort_id UUID;
  val TEXT;
  num NUMERIC;
  clean JSONB := '{}'::JSONB;
  dept TEXT;
  referral BOOLEAN := FALSE;
  note TEXT;
  wrap JSON;
BEGIN
  IF pid IS NULL AND staff.id IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  rid := COALESCE(pid, staff.id);
  SELECT * INTO s FROM "Survey" WHERE id = p_id;
  IF s.id IS NULL THEN RAISE EXCEPTION 'SURVEY_NOT_AVAILABLE'; END IF;
  IF pid IS NOT NULL THEN
    rkey := 'p:' || pid::TEXT;
    SELECT * INTO person FROM "Participant" WHERE id = pid;
    SELECT * INTO c FROM "Cohort" WHERE id = person."cohortId";
    ok := public.survey_open_for_participant(s, person, c);
    cohort_id := person."cohortId";
  ELSE
    rkey := 'u:' || staff.id::TEXT;
    ok := public.survey_open_for_staff(s, staff.id);
  END IF;
  IF NOT ok THEN RAISE EXCEPTION 'SURVEY_NOT_AVAILABLE'; END IF;
  IF p_answers IS NULL OR jsonb_typeof(p_answers) <> 'object' THEN RAISE EXCEPTION 'ANSWERS_INVALID'; END IF;

  FOR q IN SELECT * FROM "SurveyQuestion" WHERE "surveyId" = s.id ORDER BY position LOOP
    -- A FILE answer is the {url, name} object the app sends; an older client may send the link as a plain string.
    IF q.kind = 'FILE' AND jsonb_typeof(p_answers -> q.id::TEXT) = 'object' THEN
      val := NULLIF(trim(COALESCE(p_answers -> q.id::TEXT ->> 'url', '')), '');
    ELSE
      val := NULLIF(trim(COALESCE(p_answers ->> q.id::TEXT, '')), '');
    END IF;
    IF val IS NULL THEN
      IF q.required THEN RAISE EXCEPTION 'ANSWER_REQUIRED: %', q.prompt; END IF;
      CONTINUE;
    END IF;
    IF q.kind = 'RATING' THEN
      BEGIN num := val::NUMERIC; EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'ANSWER_INVALID: %', q.prompt; END;
      IF num < 1 OR num > COALESCE((q.config ->> 'scale')::NUMERIC, 5) OR num <> trunc(num) THEN RAISE EXCEPTION 'ANSWER_INVALID: %', q.prompt; END IF;
      clean := clean || jsonb_build_object(q.id::TEXT, num::INTEGER);
    ELSIF q.kind = 'NUMBER' THEN
      BEGIN num := val::NUMERIC; EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'ANSWER_INVALID: %', q.prompt; END;
      IF (q.config ? 'min' AND num < (q.config ->> 'min')::NUMERIC) OR (q.config ? 'max' AND num > (q.config ->> 'max')::NUMERIC) THEN
        RAISE EXCEPTION 'ANSWER_INVALID: %', q.prompt;
      END IF;
      clean := clean || jsonb_build_object(q.id::TEXT, num);
    ELSIF q.kind = 'YESNO' THEN
      IF val NOT IN ('Yes', 'No') THEN RAISE EXCEPTION 'ANSWER_INVALID: %', q.prompt; END IF;
      clean := clean || jsonb_build_object(q.id::TEXT, val);
    ELSIF q.kind = 'FILE' THEN
      -- A new upload is this respondent's own private file ("fof-private:survey-files/<survey id>/<respondent id>/…"); an old answer is a public https link.
      IF length(val) > 1000 OR position('..' IN val) > 0 OR NOT (val ~ '^https://' OR val LIKE 'fof-private:survey-files/' || s.id::TEXT || '/' || rid::TEXT || '/%') THEN
        RAISE EXCEPTION 'ANSWER_INVALID: %', q.prompt;
      END IF;
      clean := clean || jsonb_build_object(q.id::TEXT, jsonb_build_object('url', val, 'name', left(COALESCE(p_answers -> q.id::TEXT ->> 'name', ''), 200)));
    ELSE
      clean := clean || jsonb_build_object(q.id::TEXT, left(val, CASE WHEN q.kind = 'TEXT' THEN 500 ELSE 5000 END));
    END IF;
  END LOOP;

  BEGIN
    INSERT INTO "SurveySubmission" ("surveyId", "respondentKey") VALUES (s.id, rkey);
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'SURVEY_ALREADY_SENT';
  END;

  IF s.anonymous THEN
    INSERT INTO "SurveyAnswerSet" ("surveyId", "respondentKey", "cohortId", answers, "submittedAt", "submittedOn")
    VALUES (s.id, NULL, cohort_id, clean, date_trunc('day', NOW()), CURRENT_DATE);
  ELSE
    INSERT INTO "SurveyAnswerSet" ("surveyId", "respondentKey", "cohortId", answers) VALUES (s.id, rkey, cohort_id, clean);
  END IF;

  -- The wrap-up answers still feed the department list and referrals.
  IF s."builtinKey" = 'WRAPUP' AND pid IS NOT NULL THEN
    SELECT clean ->> q2.id::TEXT INTO dept FROM "SurveyQuestion" q2 WHERE q2."surveyId" = s.id AND q2.config ->> 'feeds' = 'department' LIMIT 1;
    SELECT (clean ->> q2.id::TEXT) = 'Yes' INTO referral FROM "SurveyQuestion" q2 WHERE q2."surveyId" = s.id AND q2.config ->> 'feeds' = 'referral' LIMIT 1;
    SELECT clean ->> q2.id::TEXT INTO note FROM "SurveyQuestion" q2 WHERE q2."surveyId" = s.id AND q2.config ->> 'feeds' = 'note' LIMIT 1;
    IF dept IS NOT NULL THEN
      wrap := public.submit_wrap_up(p_token, dept, COALESCE(referral, FALSE), COALESCE(note, ''));
      RETURN json_build_object('ok', TRUE, 'supportId', wrap ->> 'supportId', 'wantsReferral', COALESCE(referral, FALSE), 'department', dept);
    END IF;
  END IF;
  RETURN json_build_object('ok', TRUE);
END;
$$;

GRANT EXECUTE ON FUNCTION public.survey_submit(TEXT, UUID, JSONB) TO anon, authenticated;
