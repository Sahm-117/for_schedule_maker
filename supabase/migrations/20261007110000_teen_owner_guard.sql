-- Teens step 4: the same-gender Teen Support rule also holds for hand-picked owners.
-- Automatic assignment already follows it (assign_teen_contacts); this stops an admin
-- (or any other write) from giving a teen to anyone else. Clearing the owner is fine.
--
-- Rollback: DROP TRIGGER teen_owner_guard ON "FollowUpContact"; DROP FUNCTION teen_owner_guard();

CREATE OR REPLACE FUNCTION public.teen_owner_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_ok BOOLEAN;
BEGIN
  IF NEW."ownerId" IS NULL
     OR NEW."ownerId" IS NOT DISTINCT FROM OLD."ownerId"
     OR NEW."registrationStatus"::text NOT IN ('TEENAGER', 'TEEN_ONBOARDED') THEN
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
  BEFORE UPDATE OF "ownerId", "registrationStatus" ON public."FollowUpContact"
  FOR EACH ROW EXECUTE FUNCTION public.teen_owner_guard();
