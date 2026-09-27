-- Phone numbers in one form: every Nigerian mobile number is stored as 080…
-- (11 digits), however it was typed (+234 805 074 2701, 2348050742701,
-- 8050742701, 0805 074 2701). Other values are kept as typed (trimmed).
--
-- 1. fof_local_phone(): the conversion.
-- 2. A trigger on "User", "Participant" and "FollowUpContact" applies it on
--    every insert and phone change, from any screen, import or function.
-- 3. A one-off tidy of the rows already saved, skipping any row whose tidied
--    number would collide with another row's (left for a person to sort out).
-- 4. Staff sign-in (login_user) also matches a number written another way.

CREATE OR REPLACE FUNCTION public.fof_local_phone(raw TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN raw IS NULL THEN NULL
    WHEN d ~ '^0[7-9][01][0-9]{8}$' THEN d
    WHEN d ~ '^2340?[7-9][01][0-9]{8}$' THEN '0' || right(d, 10)
    WHEN d ~ '^[7-9][01][0-9]{8}$' THEN '0' || d
    ELSE NULLIF(trim(raw), '')
  END
  FROM (SELECT regexp_replace(COALESCE(raw, ''), '\D', '', 'g') AS d) digits;
$$;

CREATE OR REPLACE FUNCTION public.fof_localize_phone_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.phone := public.fof_local_phone(NEW.phone);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_local_phone ON public."User";
CREATE TRIGGER trg_user_local_phone BEFORE INSERT OR UPDATE OF phone ON public."User"
  FOR EACH ROW EXECUTE FUNCTION public.fof_localize_phone_trigger();

DROP TRIGGER IF EXISTS trg_participant_local_phone ON public."Participant";
CREATE TRIGGER trg_participant_local_phone BEFORE INSERT OR UPDATE OF phone ON public."Participant"
  FOR EACH ROW EXECUTE FUNCTION public.fof_localize_phone_trigger();

DROP TRIGGER IF EXISTS trg_followup_contact_local_phone ON public."FollowUpContact";
CREATE TRIGGER trg_followup_contact_local_phone BEFORE INSERT OR UPDATE OF phone ON public."FollowUpContact"
  FOR EACH ROW EXECUTE FUNCTION public.fof_localize_phone_trigger();

-- One-off tidy of what's already saved (the triggers do the converting).
UPDATE public."User" u SET phone = u.phone
WHERE u.phone IS DISTINCT FROM public.fof_local_phone(u.phone)
  AND NOT EXISTS (SELECT 1 FROM public."User" o WHERE o.id <> u.id AND o.phone = public.fof_local_phone(u.phone));

UPDATE public."Participant" p SET phone = p.phone
WHERE p.phone IS DISTINCT FROM public.fof_local_phone(p.phone)
  AND NOT EXISTS (SELECT 1 FROM public."Participant" o WHERE o.id <> p.id AND public.fof_local_phone(o.phone) = public.fof_local_phone(p.phone));

UPDATE public."FollowUpContact" f SET phone = f.phone
WHERE f.phone IS DISTINCT FROM public.fof_local_phone(f.phone);

CREATE OR REPLACE FUNCTION public.login_user(identifier text, password text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  normalized TEXT := lower(trim(identifier));
  candidate "User";
BEGIN
  IF normalized IS NULL OR normalized = '' OR password IS NULL OR password = '' THEN
    RETURN NULL;
  END IF;

  -- A login value is either an email or a phone number. Prefer an active account,
  -- then the oldest, which matches how duplicate legacy accounts were resolved.
  SELECT * INTO candidate
  FROM "User" u
  WHERE (position('@' IN normalized) > 0 AND lower(u.email) = normalized)
     OR (position('@' IN normalized) = 0 AND (
          u.phone = trim(identifier)
          -- Same number written another way (+234 803…, 2348…, 0803 123 4567).
          OR public.fof_phone_key(u.phone) = public.fof_phone_key(identifier)
        ))
  ORDER BY (u."isActive" IS NOT FALSE) DESC, u."createdAt" ASC
  LIMIT 1;

  IF candidate.id IS NULL OR candidate."isActive" IS FALSE THEN
    RETURN NULL;
  END IF;

  -- Legacy rows written by an older client are accepted once, then upgraded.
  IF candidate.password_hash LIKE 'hashed_%' THEN
    IF substring(candidate.password_hash FROM 8) = password THEN
      UPDATE "User"
      SET password_hash = crypt(password, gen_salt('bf', 10)), "updatedAt" = NOW()
      WHERE id = candidate.id;
      RETURN public.safe_user_json(candidate);
    END IF;
    RETURN NULL;
  END IF;

  IF candidate.password_hash IS NULL
     OR candidate.password_hash <> crypt(password, candidate.password_hash) THEN
    RETURN NULL;
  END IF;

  RETURN public.safe_user_json(candidate);
END;
$function$;
