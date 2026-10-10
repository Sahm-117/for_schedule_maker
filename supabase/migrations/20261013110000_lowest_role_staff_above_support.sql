-- A person holding several roles signs in as their lowest one. A Team member acts as an admin behind the scenes, so it must
-- rank above Support here: someone who is both Support and Team member signs in as Support and switches views on purpose.
-- (The home role "highest wins" ordering, app_role_rank, is unchanged, so such a person's home role stays Support.)
CREATE OR REPLACE FUNCTION public.app_lowest_role(u public."User")
 RETURNS public."Role"
 LANGUAGE sql
 IMMUTABLE
AS $$ SELECT r FROM unnest(public.app_user_roles(u)) r
      ORDER BY CASE r WHEN 'SUPPORT' THEN 1 WHEN 'STAFF' THEN 2 WHEN 'SOP_PREPARER' THEN 3 WHEN 'ADMIN' THEN 4 ELSE 0 END ASC
      LIMIT 1 $$;
