-- Teens step 3: one teen group per Teen Support, kept in step with who holds the teen.
--
-- A teen's group follows the follow-up contact: while the contact is a teen
-- (TEENAGER / TEEN_ONBOARDED), owned, and not archived, the linked Participant is
-- in the owner's teen group. Any change of owner, status or archive moves them.
-- That covers the automatic assignment, "Assign now", a support adding a teen,
-- manual reassignment and "Not a teen" with no change to those functions.
--
-- Teen groups are ordinary Group rows flagged "isTeenGroup" so existing group
-- screens keep working; meeting, recap, prayer and group-builder screens skip them.
--
-- Rollback: DROP TRIGGER teen_group_sync_contact ON "FollowUpContact";
--           DROP TRIGGER teen_group_sync_participant ON "Participant";
--           DROP FUNCTION teen_group_sync(uuid), teen_group_sync_trigger();
--           ALTER TABLE "Group" DROP COLUMN "isTeenGroup";   (after archiving teen groups)

ALTER TABLE public."Group" ADD COLUMN IF NOT EXISTS "isTeenGroup" BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_group_teen ON public."Group"("cohortId", "supportId") WHERE "isTeenGroup" AND "archivedAt" IS NULL;

CREATE OR REPLACE FUNCTION public.teen_group_sync(p_contact_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_contact "FollowUpContact";
  v_part_id UUID;
  v_cohort UUID;
  v_group UUID;
  v_name TEXT;
  v_base TEXT;
BEGIN
  SELECT * INTO v_contact FROM "FollowUpContact" WHERE id = p_contact_id;
  IF v_contact.id IS NULL THEN RETURN; END IF;
  SELECT id INTO v_part_id FROM "Participant" WHERE "followUpContactId" = p_contact_id LIMIT 1;
  IF v_part_id IS NULL THEN RETURN; END IF;

  -- Not (or no longer) a held teen: out of every teen group.
  IF v_contact."registrationStatus"::text NOT IN ('TEENAGER', 'TEEN_ONBOARDED')
     OR v_contact."ownerId" IS NULL OR v_contact."archivedAt" IS NOT NULL THEN
    DELETE FROM "GroupParticipant" gp
    USING "Group" g
    WHERE gp."participantId" = v_part_id AND g.id = gp."groupId" AND g."isTeenGroup";
    RETURN;
  END IF;

  v_cohort := COALESCE(v_contact."cohortId", public.current_programme_cohort_id());
  IF v_cohort IS NULL THEN RETURN; END IF;

  SELECT id INTO v_group FROM "Group"
  WHERE "cohortId" = v_cohort AND "supportId" = v_contact."ownerId" AND "isTeenGroup" AND "archivedAt" IS NULL
  LIMIT 1;

  IF v_group IS NULL THEN
    SELECT 'Teens - ' || name INTO v_base FROM "User" WHERE id = v_contact."ownerId";
    v_name := COALESCE(v_base, 'Teens');
    IF EXISTS (SELECT 1 FROM "Group" WHERE "cohortId" = v_cohort AND name = v_name) THEN
      v_name := v_name || ' (' || left(v_contact."ownerId"::text, 4) || ')';
    END IF;
    INSERT INTO "Group" ("cohortId", name, "supportId", "isTeenGroup")
    VALUES (v_cohort, v_name, v_contact."ownerId", TRUE)
    RETURNING id INTO v_group;
  END IF;

  -- One teen group per teen: leave any other, join this one.
  DELETE FROM "GroupParticipant" gp
  USING "Group" g
  WHERE gp."participantId" = v_part_id AND g.id = gp."groupId" AND g."isTeenGroup" AND g.id <> v_group;

  INSERT INTO "GroupParticipant" ("groupId", "participantId")
  VALUES (v_group, v_part_id)
  ON CONFLICT DO NOTHING;
END;
$function$;
REVOKE ALL ON FUNCTION public.teen_group_sync(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.teen_group_sync_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF TG_TABLE_NAME = 'FollowUpContact' THEN
    PERFORM public.teen_group_sync(NEW.id);
  ELSIF NEW."followUpContactId" IS NOT NULL THEN
    PERFORM public.teen_group_sync(NEW."followUpContactId");
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.teen_group_sync_trigger() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS teen_group_sync_contact ON public."FollowUpContact";
CREATE TRIGGER teen_group_sync_contact
  AFTER INSERT OR UPDATE OF "ownerId", "registrationStatus", "archivedAt", "cohortId" ON public."FollowUpContact"
  FOR EACH ROW EXECUTE FUNCTION public.teen_group_sync_trigger();

DROP TRIGGER IF EXISTS teen_group_sync_participant ON public."Participant";
CREATE TRIGGER teen_group_sync_participant
  AFTER INSERT OR UPDATE OF "followUpContactId" ON public."Participant"
  FOR EACH ROW EXECUTE FUNCTION public.teen_group_sync_trigger();

-- Backfill: teens already held by a Teen Support (none while the switch is off).
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM "FollowUpContact" WHERE "registrationStatus"::text IN ('TEENAGER', 'TEEN_ONBOARDED') AND "ownerId" IS NOT NULL AND "archivedAt" IS NULL
  LOOP PERFORM public.teen_group_sync(r.id); END LOOP;
END $$;
