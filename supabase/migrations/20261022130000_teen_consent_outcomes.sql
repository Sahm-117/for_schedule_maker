-- Teen card, from the 17 Oct Teen Supports meeting:
-- * Parent consent: a Teen Support ticks that the parent or guardian has agreed to their teen taking
--   part ("guardianConsentAt" / "guardianConsentById" on the teen's follow-up record).
-- * Can't reach: the existing teen No response flag ("noResponseAt", FLOW_MAP rule 28): the teen keeps
--   their Teen Support and TEENAGER status and reminders skip them.
-- * Not interested: the Teen Support reports it ("notInterestedAt", "notInterestedNote"); an admin
--   decides on Follow-ups (marking them Not Interested there is what takes them out). Reporting does
--   not change their status.
-- Only an admin, or the Teen Support who leads the teen's group or holds their follow-up, may change
-- these, through teen_card_mark.
--
-- Rollback: DROP FUNCTION teen_card_mark; ALTER TABLE "FollowUpContact" DROP COLUMN "guardianConsentAt",
-- DROP COLUMN "guardianConsentById", DROP COLUMN "notInterestedAt", DROP COLUMN "notInterestedNote".

ALTER TABLE "FollowUpContact"
  ADD COLUMN IF NOT EXISTS "guardianConsentAt" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "guardianConsentById" UUID REFERENCES "User"(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "notInterestedAt" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "notInterestedNote" TEXT;

-- p_what: CONSENT, CANT_REACH or NOT_INTERESTED; p_on sets or clears it.
CREATE OR REPLACE FUNCTION public.teen_card_mark(p_participant_id uuid, p_what text, p_on boolean, p_note text DEFAULT NULL)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor_id UUID;
  v_person public."Participant";
  v_contact public."FollowUpContact";
BEGIN
  IF NOT public.app_is_staff() THEN
    RAISE EXCEPTION 'You must be signed in as a support or admin';
  END IF;
  v_actor_id := public.app_current_user_id();
  IF p_what NOT IN ('CONSENT', 'CANT_REACH', 'NOT_INTERESTED') THEN RAISE EXCEPTION 'Unknown change'; END IF;

  SELECT * INTO v_person FROM public."Participant" WHERE id = p_participant_id;
  IF v_person.id IS NULL OR NOT public.fof_is_teen_age(v_person."ageRange") THEN
    RAISE EXCEPTION 'This is only for teens';
  END IF;
  SELECT * INTO v_contact FROM public."FollowUpContact" WHERE id = v_person."followUpContactId";
  IF v_contact.id IS NULL THEN RAISE EXCEPTION 'This teen has no follow-up record'; END IF;

  IF NOT public.app_is_admin()
     AND v_contact."ownerId" IS DISTINCT FROM v_actor_id
     AND NOT EXISTS (
       SELECT 1 FROM public."GroupParticipant" gp JOIN public."Group" g ON g.id = gp."groupId"
       WHERE gp."participantId" = v_person.id AND g."supportId" = v_actor_id
     ) THEN
    RAISE EXCEPTION 'Only this teen''s Teen Support or an admin can change this';
  END IF;

  IF p_what = 'CONSENT' THEN
    UPDATE public."FollowUpContact"
    SET "guardianConsentAt" = CASE WHEN p_on THEN NOW() END,
        "guardianConsentById" = CASE WHEN p_on THEN v_actor_id END,
        "updatedAt" = NOW()
    WHERE id = v_contact.id RETURNING * INTO v_contact;
  ELSIF p_what = 'CANT_REACH' THEN
    UPDATE public."FollowUpContact"
    SET "noResponseAt" = CASE WHEN p_on THEN COALESCE("noResponseAt", NOW()) END,
        "notInterestedAt" = CASE WHEN p_on THEN NULL ELSE "notInterestedAt" END,
        "updatedAt" = NOW()
    WHERE id = v_contact.id RETURNING * INTO v_contact;
  ELSE
    UPDATE public."FollowUpContact"
    SET "notInterestedAt" = CASE WHEN p_on THEN COALESCE("notInterestedAt", NOW()) END,
        "notInterestedNote" = CASE WHEN p_on THEN NULLIF(btrim(COALESCE(p_note, '')), '') END,
        "noResponseAt" = CASE WHEN p_on THEN NULL ELSE "noResponseAt" END,
        "updatedAt" = NOW()
    WHERE id = v_contact.id RETURNING * INTO v_contact;
  END IF;

  RETURN json_build_object(
    'guardianConsentAt', v_contact."guardianConsentAt",
    'noResponseAt', v_contact."noResponseAt",
    'notInterestedAt', v_contact."notInterestedAt",
    'notInterestedNote', v_contact."notInterestedNote"
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.teen_card_mark(uuid, text, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.teen_card_mark(uuid, text, boolean, text) TO anon, authenticated;
