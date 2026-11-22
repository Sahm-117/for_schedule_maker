-- Two teen fixes (owner, 2026-11-22):
-- 1. Someone added as a teen ("10 - 17") from the admin Add Participant form now goes on the teen path, the same as an
--    edit that changes an age range to a teen's (participant_age_teen_boundary only fires on UPDATE). The form calls
--    admin_teen_setup after saving; it runs teen_convert_participant (teen contact, out of any adult group), so the
--    person gets "Choose a Teen Support" and the usual Teen Support assignment. Also used on Edit for a teen with no
--    teen record yet.
-- 2. When a teen's guardian is linked (Participant."guardianUserId" / "guardianParticipantId" set or changed), the
--    guardian is told, with how the teen signs in: a support or admin through their bell and push (fof_notify), a
--    participant through their app (notify-users, participantIds). Test participants are left out.
--
-- Rollback: DROP TRIGGER participant_guardian_notice ON "Participant"; DROP FUNCTION participant_guardian_notice(),
-- admin_teen_setup(uuid).

CREATE OR REPLACE FUNCTION public.admin_teen_setup(p_participant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  rec public."Participant";
BEGIN
  IF NOT public.app_is_admin() THEN RAISE EXCEPTION 'Only admins can set up a teen'; END IF;
  SELECT * INTO rec FROM public."Participant" WHERE id = p_participant_id;
  IF rec.id IS NULL THEN RAISE EXCEPTION 'Participant was not found'; END IF;
  IF NOT public.fof_is_teen_age(rec."ageRange") THEN RETURN jsonb_build_object('skipped', 'not a teen age range'); END IF;
  -- Already on the teen path.
  IF EXISTS (SELECT 1 FROM public."FollowUpContact" c WHERE c.id = rec."followUpContactId"
             AND c."registrationStatus"::text IN ('TEENAGER', 'TEEN_ONBOARDED')) THEN
    RETURN jsonb_build_object('skipped', 'already a teen');
  END IF;
  RETURN public.teen_convert_participant(p_participant_id);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_teen_setup(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_teen_setup(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.participant_guardian_notice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_first TEXT := split_part(btrim(NEW."fullName"), ' ', 1);
  v_title TEXT;
  v_body TEXT;
  v_url TEXT;
  v_key TEXT;
BEGIN
  IF NEW."isTest" IS TRUE THEN RETURN NEW; END IF;
  IF NEW."guardianUserId" IS NULL AND NEW."guardianParticipantId" IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW."guardianUserId" IS NOT DISTINCT FROM OLD."guardianUserId"
     AND NEW."guardianParticipantId" IS NOT DISTINCT FROM OLD."guardianParticipantId" THEN
    RETURN NEW;
  END IF;

  v_title := format('You are %s''s guardian on FOF', v_first);
  v_body := format('%s is linked to you as their parent or guardian. %s The app asks who is signing in when more than one person uses a number. Their own number can be added later.',
    NEW."fullName",
    CASE WHEN NULLIF(btrim(COALESCE(NEW.phone, '')), '') IS NOT NULL
      THEN format('They sign in to the FOF app with %s and the login code the FOF team sends.', NEW.phone)
      ELSE 'They sign in to the FOF app with your number and the login code the FOF team sends.' END);

  IF NEW."guardianUserId" IS NOT NULL THEN
    PERFORM public.fof_notify(ARRAY[NEW."guardianUserId"], v_title, v_body, '/', 'GUARDIAN_LINK');
  ELSE
    SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'project_url';
    SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'push_reminders_service_key';
    IF v_url IS NOT NULL AND v_key IS NOT NULL THEN
      PERFORM net.http_post(
        url := v_url || '/functions/v1/notify-users',
        headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', v_key, 'Authorization', 'Bearer ' || v_key),
        body := jsonb_build_object('participantIds', jsonb_build_array(NEW."guardianParticipantId"), 'title', v_title, 'body', v_body, 'path', '/me', 'type', 'GUARDIAN_LINK'),
        timeout_milliseconds := 25000);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.participant_guardian_notice() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS participant_guardian_notice ON public."Participant";
CREATE TRIGGER participant_guardian_notice
AFTER INSERT OR UPDATE OF "guardianUserId", "guardianParticipantId" ON public."Participant"
FOR EACH ROW EXECUTE FUNCTION public.participant_guardian_notice();
