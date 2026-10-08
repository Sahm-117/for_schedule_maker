-- A form sign-up with a mistyped number (say 10 digits) has no phone key, so
-- the guard could never match it to the contact the form is creating and the
-- sign-up failed with NO_FORM_REGISTRATION: no contact, no admin alert, where
-- receive-form-registration is meant to create them and say "Sign-up needs a
-- valid number". The recent-form-registration check now also accepts the same
-- raw number text, which is exactly what the function stores on both rows.
CREATE OR REPLACE FUNCTION public.followup_contact_registration_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NEW."registrationStatus" IN ('REGISTERED', 'LOGIN_SHARED', 'ACCESS_CONFIRMED', 'TEENAGER', 'TEEN_ONBOARDED')
     AND (OLD."registrationStatus" IS NULL
          OR OLD."registrationStatus" NOT IN ('REGISTERED', 'LOGIN_SHARED', 'ACCESS_CONFIRMED', 'TEENAGER', 'TEEN_ONBOARDED'))
     AND NEW."manualRegistrationAt" IS NULL
     AND NOT EXISTS (SELECT 1 FROM public."SheetRegistration" WHERE "contactId" = NEW.id)
     AND NOT EXISTS (
       SELECT 1 FROM public."SheetRegistration"
       WHERE "contactId" IS NULL
         AND ("phoneNormalised" = public.fof_phone_key(NEW.phone) OR phone = NEW.phone)
         AND "createdAt" > now() - interval '15 minutes'
     ) THEN
    RAISE EXCEPTION 'NO_FORM_REGISTRATION';
  END IF;
  RETURN NEW;
END;
$function$;
