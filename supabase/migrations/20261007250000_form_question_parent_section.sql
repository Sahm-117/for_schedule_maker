-- The sign-up form now has a second concerns question in its "Parent or
-- Guardian" section (teens go straight to submit from there):
-- "Any Other Questions or Concerns (Parent or Guardian)". The card's form
-- question shows whichever concerns answer is filled in, the original first.
-- Blank answers are skipped, so a teen who never saw the original question
-- still gets the parent-section one. Used by sheet_registration_question.
-- Applied live 2026-10-07.

CREATE OR REPLACE FUNCTION public.form_question_text(p_answers jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT CASE
    WHEN q IS NULL OR q = '' THEN NULL
    WHEN lower(regexp_replace(q, '[^[:alpha:] /]', '', 'g')) IN (
      'no', 'non', 'none', 'nil', 'nill', 'nothing', 'nope', 'na', 'n/a', 'nan',
      'no question', 'no questions', 'no concern', 'no concerns', 'not really',
      'none for now', 'nothing for now', 'no for now', 'not yet', 'nil for now'
    ) THEN NULL
    ELSE q
  END
  FROM (SELECT COALESCE(
    NULLIF(btrim(p_answers->>'Any Other Questions or Concerns? '), ''),
    NULLIF(btrim(p_answers->>'Any Other Questions or Concerns?'), ''),
    (SELECT NULLIF(btrim(e.value), '') FROM jsonb_each_text(p_answers) e
      WHERE lower(btrim(e.key)) = 'any other questions or concerns (parent or guardian)'
        AND NULLIF(btrim(e.value), '') IS NOT NULL
      LIMIT 1)
  ) AS q) x;
$function$;
