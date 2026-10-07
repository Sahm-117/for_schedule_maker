-- An 18-year-old by date of birth is a teen ("18 and below"), matching the
-- form's "18 and below" answer. 19 to 24 stays "18 - 24". Used by the
-- date-of-birth triggers, support_age_range and the nightly refresh_age_brackets.
-- frontend/src/utils/people.ts ageRangeFromDate mirrors this.
-- Applied live 2026-10-07. Nobody was 18 by date of birth at the time, so no
-- existing record changed.

CREATE OR REPLACE FUNCTION public.age_range_for_age(p_age INT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_age IS NULL OR p_age < 5 OR p_age > 100 THEN NULL
    WHEN p_age <= 18 THEN '18 and below'
    WHEN p_age <= 24 THEN '18 - 24'
    WHEN p_age <= 34 THEN '25 - 34'
    WHEN p_age <= 44 THEN '35 - 44'
    WHEN p_age <= 59 THEN '45 - 59'
    ELSE '60 and above'
  END
$$;
