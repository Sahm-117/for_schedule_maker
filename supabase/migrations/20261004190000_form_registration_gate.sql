-- No-form-no-progress gate (applied live 2026-10-04; this file records it).
--
-- A follow-up contact cannot move into REGISTERED, LOGIN_SHARED or
-- ACCESS_CONFIRMED unless a registration form exists for them, or an admin
-- has approved them by hand with a reason. The guard only fires on the change
-- itself, so contacts progressed before this gate stay as they are.
--
-- A form counts when a SheetRegistration row links to the contact, or when an
-- unlinked SheetRegistration arrived in the last 15 minutes for the same
-- phone (the sheet sync links it a moment later).

ALTER TABLE public."FollowUpContact"
  ADD COLUMN IF NOT EXISTS "manualRegistrationAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "manualRegistrationBy" uuid,
  ADD COLUMN IF NOT EXISTS "manualRegistrationReason" text;

CREATE OR REPLACE FUNCTION public.followup_contact_registration_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NEW."registrationStatus" IN ('REGISTERED', 'LOGIN_SHARED', 'ACCESS_CONFIRMED')
     AND (OLD."registrationStatus" IS NULL
          OR OLD."registrationStatus" NOT IN ('REGISTERED', 'LOGIN_SHARED', 'ACCESS_CONFIRMED'))
     AND NEW."manualRegistrationAt" IS NULL
     AND NOT EXISTS (SELECT 1 FROM public."SheetRegistration" WHERE "contactId" = NEW.id)
     AND NOT EXISTS (
       SELECT 1 FROM public."SheetRegistration"
       WHERE "contactId" IS NULL
         AND "phoneNormalised" = public.fof_phone_key(NEW.phone)
         AND "createdAt" > now() - interval '15 minutes'
     ) THEN
    RAISE EXCEPTION 'NO_FORM_REGISTRATION';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS followup_contact_registration_guard ON public."FollowUpContact";
CREATE TRIGGER followup_contact_registration_guard
  BEFORE INSERT OR UPDATE ON public."FollowUpContact"
  FOR EACH ROW EXECUTE FUNCTION public.followup_contact_registration_guard();

-- Admin override: approve a contact by hand with a written reason, so the
-- status change they picked can go through.
CREATE OR REPLACE FUNCTION public.approve_manual_registration(p_token text, p_contact_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  staff "User" := public.app_staff(p_token);
BEGIN
  IF staff.id IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  IF staff.role <> 'ADMIN' THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;
  UPDATE public."FollowUpContact"
  SET "manualRegistrationAt" = now(),
      "manualRegistrationBy" = staff.id,
      "manualRegistrationReason" = trim(p_reason),
      "updatedAt" = now()
  WHERE id = p_contact_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'CONTACT_NOT_FOUND'; END IF;
END;
$function$;
