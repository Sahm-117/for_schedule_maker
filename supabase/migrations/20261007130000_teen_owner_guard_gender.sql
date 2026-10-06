-- Review fix for teen_owner_guard (20261007110000): also check when an admin changes the
-- gender of a teen who is already held, so a teen can't be left with an opposite-gender
-- Teen Support. Setting a missing gender (NULL to a value) is not an edit and is ignored,
-- so form intake is unaffected.
--
-- Rollback: re-apply 20261007110000_teen_owner_guard.sql.

CREATE OR REPLACE FUNCTION public.teen_owner_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_ok BOOLEAN;
  v_owner_changed BOOLEAN := NEW."ownerId" IS DISTINCT FROM OLD."ownerId";
  v_gender_edited BOOLEAN := OLD.gender IS NOT NULL AND NEW.gender IS DISTINCT FROM OLD.gender;
BEGIN
  IF NEW."ownerId" IS NULL
     OR NEW."registrationStatus"::text NOT IN ('TEENAGER', 'TEEN_ONBOARDED')
     OR NOT (v_owner_changed OR v_gender_edited) THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM "User" u
    JOIN "SupportTagMember" m ON m."userId" = u.id
    JOIN "SupportTag" t ON t.id = m."tagId" AND t."systemKey" = 'TEEN_SUPPORT'
    WHERE u.id = NEW."ownerId" AND u.gender IS NOT NULL AND u.gender = NEW.gender
  ) INTO v_ok;

  IF NOT v_ok THEN
    RAISE EXCEPTION 'A teen can only go to a Teen Support of the same gender';
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.teen_owner_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS teen_owner_guard ON public."FollowUpContact";
CREATE TRIGGER teen_owner_guard
  BEFORE UPDATE OF "ownerId", "registrationStatus", gender ON public."FollowUpContact"
  FOR EACH ROW EXECUTE FUNCTION public.teen_owner_guard();
