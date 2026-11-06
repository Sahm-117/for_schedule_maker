-- Group gender guard (FLOW_MAP rule 135).
--
-- A participant joins only a group of their own gender. A group's gender is its members' gender; an empty group takes
-- its support's gender. A group that already holds both genders ("Mixed") takes anyone. Nobody is checked when their
-- gender is not on file.
--
-- An admin may add someone to a group of the other gender on purpose ("Show all groups", or a group builder run that
-- allows mixed groups) by sending "genderOverrideAt" with the row; the guard then records which admin did it.
--
-- While teen handling is on, a teen (follow-up contact TEENAGER / TEEN_ONBOARDED) never joins an adult group from the
-- app: their group follows their Teen Support (rule 22), so the screens send them to a Teen Support instead.
--
-- Only writes made from the app (roles anon / authenticated) are checked. Database functions that put someone back in
-- their earlier group (absence undo, Practice mode, teen group sync) run as the owner and are left alone, so no
-- scheduled job can fail on this rule. Existing rows are never touched.

ALTER TABLE public."GroupParticipant"
  ADD COLUMN IF NOT EXISTS "genderOverrideAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "genderOverrideById" uuid REFERENCES public."User"(id) ON DELETE SET NULL;

COMMENT ON COLUMN public."GroupParticipant"."genderOverrideAt" IS
  'Set when an admin placed this person in a group of the other gender on purpose (rule 135).';

-- 'Male', 'Female', or NULL for anything else.
CREATE OR REPLACE FUNCTION public.fof_gender(p_gender text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE lower(trim(COALESCE(p_gender, '')))
    WHEN 'male' THEN 'Male' WHEN 'm' THEN 'Male'
    WHEN 'female' THEN 'Female' WHEN 'f' THEN 'Female'
  END;
$$;

-- A group's gender, leaving one person out (the one being placed): 'Male', 'Female', 'Mixed', or NULL when nothing
-- is known (no members with a gender and no support with one). A group with anyone an admin placed on purpose
-- ("genderOverrideAt") is Mixed, so saving its member list again, in any order, still works.
-- VOLATILE so that, inside a many-row insert, it sees the rows the same statement has already added.
CREATE OR REPLACE FUNCTION public.group_gender_of(p_group_id uuid, p_except_participant uuid DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_genders text[];
BEGIN
  IF EXISTS (SELECT 1 FROM public."GroupParticipant" gp
             WHERE gp."groupId" = p_group_id AND gp."genderOverrideAt" IS NOT NULL
               AND gp."participantId" IS DISTINCT FROM p_except_participant) THEN
    RETURN 'Mixed';
  END IF;

  SELECT array_agg(DISTINCT public.fof_gender(p.gender)) FILTER (WHERE public.fof_gender(p.gender) IS NOT NULL)
    INTO v_genders
  FROM public."GroupParticipant" gp
  JOIN public."Participant" p ON p.id = gp."participantId"
  WHERE gp."groupId" = p_group_id
    AND gp."participantId" IS DISTINCT FROM p_except_participant;

  IF COALESCE(array_length(v_genders, 1), 0) > 1 THEN RETURN 'Mixed'; END IF;
  IF COALESCE(array_length(v_genders, 1), 0) = 1 THEN RETURN v_genders[1]; END IF;

  RETURN (SELECT public.fof_gender(u.gender)
          FROM public."Group" g JOIN public."User" u ON u.id = g."supportId"
          WHERE g.id = p_group_id);
END;
$$;

-- Only the check below uses it (as the owner); the app works the same out in the browser.
REVOKE ALL ON FUNCTION public.group_gender_of(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.group_gender_of(uuid, uuid) FROM anon, authenticated;

-- The checks, run with the owner's rights (the app's role cannot read every table involved).
CREATE OR REPLACE FUNCTION public.group_member_gender_check(r public."GroupParticipant")
RETURNS public."GroupParticipant"
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_group public."Group";
  v_person public."Participant";
  v_person_gender text;
  v_group_gender text;
  v_teen_on boolean;
BEGIN
  -- Without a staff session there is nothing to check here: the table's own access rule refuses the write, and an
  -- error from this function must not tell an outsider anything about a person.
  IF NOT public.app_is_staff() THEN RETURN r; END IF;

  SELECT * INTO v_group FROM public."Group" WHERE id = r."groupId";
  SELECT * INTO v_person FROM public."Participant" WHERE id = r."participantId";
  IF v_group.id IS NULL OR v_person.id IS NULL THEN RETURN r; END IF;

  -- Teen groups follow the Teen Support (rules 20, 22, 23); nothing more to check here.
  IF v_group."isTeenGroup" IS TRUE THEN RETURN r; END IF;

  v_teen_on := COALESCE((SELECT value = to_jsonb(true) FROM public."AppSetting" WHERE "settingKey" = 'teen_flow_enabled'), false);
  IF v_teen_on AND EXISTS (
    SELECT 1 FROM public."FollowUpContact" c
    WHERE c.id = v_person."followUpContactId"
      AND c."registrationStatus"::text IN ('TEENAGER', 'TEEN_ONBOARDED')
      AND c."archivedAt" IS NULL
  ) THEN
    RAISE EXCEPTION 'TEEN_GROUP_ONLY: % is a teen; give them a Teen Support instead', v_person."fullName";
  END IF;

  IF r."genderOverrideAt" IS NOT NULL THEN
    IF NOT public.app_is_admin() THEN
      RAISE EXCEPTION 'GENDER_OVERRIDE_ADMIN_ONLY: only an admin can put someone in a group of the other gender';
    END IF;
    r."genderOverrideAt" := now();
    r."genderOverrideById" := public.app_current_user_id();
    RETURN r;
  END IF;
  r."genderOverrideById" := NULL;

  v_person_gender := public.fof_gender(v_person.gender);
  IF v_person_gender IS NULL THEN RETURN r; END IF;

  v_group_gender := public.group_gender_of(r."groupId", r."participantId");
  IF v_group_gender IN ('Male', 'Female') AND v_group_gender <> v_person_gender THEN
    RAISE EXCEPTION 'GENDER_MISMATCH: % is a % group and % is %',
      v_group.name, lower(CASE v_group_gender WHEN 'Male' THEN 'men''s' ELSE 'women''s' END),
      v_person."fullName", lower(v_person_gender);
  END IF;
  RETURN r;
END;
$$;

REVOKE ALL ON FUNCTION public.group_member_gender_check(public."GroupParticipant") FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.group_member_gender_check(public."GroupParticipant") TO anon, authenticated;

-- The trigger itself runs with the caller's role, so it can tell an app write (anon / authenticated) from a database
-- function running as the owner.
CREATE OR REPLACE FUNCTION public.group_member_gender_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;
  -- An update that moves nobody and changes no override passes.
  IF TG_OP = 'UPDATE' AND NEW."groupId" = OLD."groupId" AND NEW."participantId" = OLD."participantId"
     AND NEW."genderOverrideAt" IS NOT DISTINCT FROM OLD."genderOverrideAt" THEN
    RETURN NEW;
  END IF;
  RETURN public.group_member_gender_check(NEW);
END;
$$;

DROP TRIGGER IF EXISTS group_member_gender_guard ON public."GroupParticipant";
CREATE TRIGGER group_member_gender_guard
  BEFORE INSERT OR UPDATE OF "groupId", "participantId", "genderOverrideAt" ON public."GroupParticipant"
  FOR EACH ROW EXECUTE FUNCTION public.group_member_gender_guard();

NOTIFY pgrst, 'reload schema';
