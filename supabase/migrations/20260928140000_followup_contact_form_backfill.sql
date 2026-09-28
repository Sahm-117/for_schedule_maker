-- Data fix: fill gender/ageRange on existing FollowUpContact rows from the
-- matching SheetRegistration's form answers, where the contact matches by
-- phone and the field is currently blank.
--
-- fill_profile_from_form already does this going forward (and already ran
-- once for every SheetRegistration whose "contactId" was linked), but some
-- contacts pre-date that link or were matched to a sign-up after the fact, so
-- this widens the match to phone number rather than relying on "contactId".
-- Idempotent: only ever fills a currently-blank field, never overwrites.

CREATE OR REPLACE FUNCTION public.normalise_phone_digits(p_raw TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  -- Mirrors normalisePhone in supabase/functions/receive-form-registration/index.ts.
  SELECT CASE
    WHEN p_raw IS NULL THEN NULL
    WHEN regexp_replace(p_raw, '\D', '', 'g') ~ '^0[7-9][01]\d{8}$'
      THEN '234' || substring(regexp_replace(p_raw, '\D', '', 'g') from 2)
    WHEN regexp_replace(p_raw, '\D', '', 'g') ~ '^234[7-9][01]\d{8}$'
      THEN regexp_replace(p_raw, '\D', '', 'g')
    WHEN regexp_replace(p_raw, '\D', '', 'g') ~ '^\d{10,15}$'
      AND regexp_replace(p_raw, '\D', '', 'g') NOT LIKE '0%'
      THEN regexp_replace(p_raw, '\D', '', 'g')
    ELSE NULL
  END;
$$;

WITH matched AS (
  SELECT DISTINCT ON (c.id)
    c.id AS contact_id,
    NULLIF(initcap(trim(s.answers->>'What''s your Gender?')), '') AS v_gender_raw,
    NULLIF(regexp_replace(trim(COALESCE(s.answers->>'Age Range?', '')), '\s*-\s*', ' - '), '') AS v_age_raw
  FROM "FollowUpContact" c
  JOIN "SheetRegistration" s
    ON public.normalise_phone_digits(s.phone) IS NOT NULL
   AND public.normalise_phone_digits(s.phone) = public.normalise_phone_digits(c.phone)
  WHERE (NULLIF(trim(c.gender), '') IS NULL OR NULLIF(trim(c."ageRange"), '') IS NULL)
  ORDER BY c.id, s."signedUpAt" DESC NULLS LAST
)
UPDATE "FollowUpContact" c
SET
  gender = COALESCE(NULLIF(trim(c.gender), ''), CASE WHEN m.v_gender_raw IN ('Male', 'Female') THEN m.v_gender_raw END),
  "ageRange" = COALESCE(NULLIF(trim(c."ageRange"), ''), CASE
    WHEN m.v_age_raw IN ('18 and below', '18 - 24', '25 - 34', '35 - 44', '45 - 59', '60 and above') THEN m.v_age_raw
  END)
FROM matched m
WHERE c.id = m.contact_id;
