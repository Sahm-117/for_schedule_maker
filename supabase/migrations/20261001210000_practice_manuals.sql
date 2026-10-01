-- Practice classes carry the real class manuals, already released.
--
-- The manual readers are chosen by the class title, so Practice weeks take the
-- real titles (Introductory Class, New Creation Realities, Integrity of God's
-- word, The Holy Spirit). The manual document, summary and prompt are copied
-- from the latest real cohort's same-numbered week, and each Practice week's
-- manual is marked released so no admin has to send it.
--
-- Rollback: DROP FUNCTION public.practice_load_manuals(UUID) and restore
-- practice_build from 20261001170000 + 20261001190000.

CREATE OR REPLACE FUNCTION public.practice_load_manuals(p_cohort UUID)
 RETURNS VOID
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_src UUID;
  v_titles TEXT[] := ARRAY['Introductory Class', 'New Creation Realities', 'Integrity of God''s word', 'The Holy Spirit'];
BEGIN
  SELECT c.id INTO v_src
    FROM public."Cohort" c
   WHERE NOT c."isPractice"
     AND EXISTS (SELECT 1 FROM public."Week" w WHERE w."cohortId" = c.id AND w."manualDocumentUrl" IS NOT NULL)
   ORDER BY (c.status = 'ACTIVE') DESC, c."startDate" DESC NULLS LAST
   LIMIT 1;

  UPDATE public."Week" pw
     SET title = v_titles[pw."weekNumber"],
         "manualDocumentUrl" = COALESCE((SELECT sw."manualDocumentUrl" FROM public."Week" sw WHERE sw."cohortId" = v_src AND sw."weekNumber" = pw."weekNumber"), pw."manualDocumentUrl"),
         "manualDocumentName" = COALESCE((SELECT sw."manualDocumentName" FROM public."Week" sw WHERE sw."cohortId" = v_src AND sw."weekNumber" = pw."weekNumber"), pw."manualDocumentName"),
         "manualSummary" = COALESCE((SELECT sw."manualSummary" FROM public."Week" sw WHERE sw."cohortId" = v_src AND sw."weekNumber" = pw."weekNumber"), pw."manualSummary"),
         "manualDiscussionPrompt" = COALESCE((SELECT sw."manualDiscussionPrompt" FROM public."Week" sw WHERE sw."cohortId" = v_src AND sw."weekNumber" = pw."weekNumber"), pw."manualDiscussionPrompt"),
         "manualReleasedEarlyAt" = COALESCE(pw."manualReleasedEarlyAt", NOW())
   WHERE pw."cohortId" = p_cohort
     AND pw."weekNumber" BETWEEN 1 AND array_length(v_titles, 1);
END;
$function$;

-- Set-up loads them; so does the current Practice cohort, right now.
DO $patch$
DECLARE
  v_def TEXT;
  v_new TEXT;
  v_c UUID;
BEGIN
  SELECT pg_get_functiondef('public.practice_build(text)'::regprocedure) INTO v_def;
  IF position('practice_load_manuals' IN v_def) = 0 THEN
    v_new := replace(v_def, 'PERFORM public.practice_apply_calendar(v_c, v_cal);',
      E'PERFORM public.practice_apply_calendar(v_c, v_cal);\n  PERFORM public.practice_load_manuals(v_c);');
    IF v_new = v_def THEN
      RAISE EXCEPTION 'practice_build: calendar line not found';
    END IF;
    EXECUTE v_new;
  END IF;
  SELECT id INTO v_c FROM public."Cohort" WHERE "isPractice";
  IF v_c IS NOT NULL THEN
    PERFORM public.practice_load_manuals(v_c);
  END IF;
END
$patch$;

REVOKE ALL ON FUNCTION public.practice_load_manuals(UUID) FROM PUBLIC, anon, authenticated;
