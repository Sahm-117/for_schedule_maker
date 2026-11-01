-- Survey file uploads go to the private bucket (FLOW_MAP rule 129; the open item from 30 Oct).
--   * New uploads are stored in "private-files" under survey-files/<survey id>/…, and the answer's url is
--     "fof-private:<path>", like a private Resource file. Old answers keep their public https links, which still work.
--   * Any signed-in session (a participant or staff, storage_signed_in) may add a file under survey-files/ only. Reading
--     stays admin-only (the existing "private-files: admin read" policy); the results page signs the links for admins.
--   * survey_submit (copied from 20261002200000_surveys.sql, one change) also accepts a private link, but only one
--     inside this survey's own folder; other private paths are refused.
--
-- Rollback: DROP POLICY "private-files: survey upload" ON storage.objects; then re-run survey_submit from
-- 20261002200000_surveys.sql (answers already stored with a fof-private: url keep working for admins either way).

DROP POLICY IF EXISTS "private-files: survey upload" ON storage.objects;
CREATE POLICY "private-files: survey upload" ON storage.objects FOR INSERT TO public
  WITH CHECK (bucket_id = 'private-files' AND name LIKE 'survey-files/%' AND (SELECT public.storage_signed_in()));

CREATE OR REPLACE FUNCTION public.survey_submit(p_token TEXT, p_id UUID, p_answers JSONB)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  pid UUID := public.app_participant_id(p_token);
  staff "User" := public.app_staff(p_token);
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
    val := NULLIF(trim(COALESCE(p_answers ->> q.id::TEXT, '')), '');
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
      -- A new upload is a private file of this survey ("fof-private:survey-files/<survey id>/…"); an old answer is a public https link.
      IF length(val) > 1000 OR position('..' IN val) > 0 OR NOT (val ~ '^https://' OR val LIKE 'fof-private:survey-files/' || s.id::TEXT || '/%') THEN
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
