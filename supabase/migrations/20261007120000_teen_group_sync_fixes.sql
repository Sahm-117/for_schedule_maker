-- Code-review fixes for teen_group_sync (20261007100000):
--  1. GroupParticipant allows one group per participant, so a teen already in an adult
--     group was silently skipped. The teen now leaves that group and joins the teen group.
--  2. Two syncs for the same Teen Support could each create a teen group. They now
--     take a lock per support and cohort, and a partial unique index backs it up.
--
-- Rollback: DROP INDEX uq_group_teen_per_support; re-apply 20261007100000_teen_groups.sql's function.

CREATE UNIQUE INDEX IF NOT EXISTS uq_group_teen_per_support
  ON public."Group"("cohortId", "supportId") WHERE "isTeenGroup" AND "archivedAt" IS NULL;

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

  PERFORM pg_advisory_xact_lock(hashtext('teen_group:' || v_cohort::text || ':' || v_contact."ownerId"::text));

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

  -- One group per participant: leave any other group (teen or adult), join this one.
  DELETE FROM "GroupParticipant" WHERE "participantId" = v_part_id AND "groupId" <> v_group;

  INSERT INTO "GroupParticipant" ("groupId", "participantId")
  VALUES (v_group, v_part_id)
  ON CONFLICT DO NOTHING;
END;
$function$;
REVOKE ALL ON FUNCTION public.teen_group_sync(uuid) FROM PUBLIC, anon, authenticated;
