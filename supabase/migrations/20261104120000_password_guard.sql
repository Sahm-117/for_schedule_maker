-- The password guard (FLOW_MAP rule 133).
--
-- One phone number can open a staff account and participant logins (a staff member's teens registered on their number):
-- sign-in tries the staff account first, then the participants, and tells them apart by the password (sign_in_check). If both
-- had the same password, the staff account would always open and the participant login could never be reached. So:
-- * a participant choosing or changing a password (set_participant_password, change_participant_password) is refused with
--   STAFF_PASSWORD_CLASH when it is the password of an active staff account on any of the household's numbers;
-- * a staff member changing their own password (change_own_password_check), or an admin resetting it (set_user_password), is
--   refused with FAMILY_PASSWORD_CLASH when an active participant login on that staff member's number already uses it.
-- So the check cannot be used to guess a staff password without limit, every participant-side check counts as one wrong try
-- against that staff account's sign-in limit (sign_in_guard / sign_in_record, key 'staff:<id>', 10 in 15 minutes). A refused
-- clash rolls back with its error, so only checks that did not match are counted.
-- Nothing changes for anyone whose number has no staff account (almost everyone), and no existing password is touched.
--
-- Rollback: drop password_staff_clash and password_family_clash, and re-create the four functions without their guard lines.

-- Staff accounts on the household's numbers whose password is this one. Counts each check against their sign-in limit.
CREATE OR REPLACE FUNCTION public.password_staff_clash(p_participant uuid, p_password text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  u record;
  v_hit boolean := FALSE;
  v_match boolean;
BEGIN
  IF p_participant IS NULL OR p_password IS NULL THEN RETURN FALSE; END IF;
  FOR u IN
    SELECT DISTINCT s.id, s.password_hash FROM public."User" s
    WHERE s."isActive" IS NOT FALSE AND s.password_hash IS NOT NULL
      AND public.fof_phone_key(s.phone) IN (
        SELECT public.fof_phone_key(p.phone) FROM public."Participant" p WHERE p.id = p_participant
        UNION
        SELECT public.fof_phone_key(l.phone) FROM public."ParticipantLoginPhone" l
        WHERE l."participantId" = p_participant
           OR l."participantId" IN (SELECT f.id FROM public.shared_number_people(p_participant) f))
  LOOP
    PERFORM public.sign_in_guard('staff:' || u.id::text);
    v_match := CASE WHEN u.password_hash LIKE 'hashed_%' THEN substring(u.password_hash FROM 8) = p_password
                    ELSE u.password_hash = crypt(p_password, u.password_hash) END;
    IF v_match THEN v_hit := TRUE; ELSE PERFORM public.sign_in_record('staff:' || u.id::text, FALSE); END IF;
  END LOOP;
  RETURN v_hit;
END;
$$;
REVOKE ALL ON FUNCTION public.password_staff_clash(uuid, text) FROM PUBLIC, anon, authenticated;

-- Does an active participant login on this staff member's number already use this password?
CREATE OR REPLACE FUNCTION public.password_family_clash(p_user uuid, p_password text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
  SELECT EXISTS (
    SELECT 1 FROM public."User" u
    JOIN public."Participant" p ON p.status = 'ACTIVE'
    JOIN public."ParticipantAccount" a ON a."participantId" = p.id AND a."isActive" AND a.password_hash IS NOT NULL
    WHERE u.id = p_user AND public.fof_phone_key(u.phone) IS NOT NULL
      AND (public.fof_phone_key(p.phone) = public.fof_phone_key(u.phone)
           OR EXISTS (SELECT 1 FROM public."ParticipantLoginPhone" l WHERE l."participantId" = p.id AND public.fof_phone_key(l.phone) = public.fof_phone_key(u.phone)))
      AND a.password_hash = crypt(p_password, a.password_hash))
$$;
REVOKE ALL ON FUNCTION public.password_family_clash(uuid, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.set_participant_password(p_token text, p_new_password text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  person_id UUID := public.app_participant_id(p_token);
  v_hash TEXT;
BEGIN
  IF person_id IS NULL THEN
    RAISE EXCEPTION 'SESSION_EXPIRED';
  END IF;
  IF (public.app_session(p_token))."viaTeenNumber" THEN
    RAISE EXCEPTION 'TEEN_PASSWORD_FIXED';
  END IF;
  IF p_new_password IS NULL OR length(p_new_password) < 5 THEN
    RAISE EXCEPTION 'Password must be at least 5 characters';
  END IF;
  -- The guard (rule 133): not the password of a staff account on this number, or sign-in would always open the staff account.
  IF public.password_staff_clash(person_id, p_new_password) THEN
    RAISE EXCEPTION 'STAFF_PASSWORD_CLASH';
  END IF;

  v_hash := crypt(p_new_password, gen_salt('bf', 10));
  UPDATE "ParticipantAccount"
  SET password_hash = v_hash,
      "setupCode" = NULL,
      "mustChangePassword" = FALSE,
      "passwordSetAt" = NOW(),
      "updatedAt" = NOW()
  WHERE "participantId" = person_id
     OR "participantId" IN (SELECT f.id FROM public.shared_number_people(person_id) f WHERE f.has_login);

  RETURN public.participant_user_json(person_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.change_participant_password(p_token text, p_current text, p_new text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  person_id UUID := public.app_participant_id(p_token);
  current_hash TEXT;
  v_hash TEXT;
BEGIN
  IF person_id IS NULL THEN
    RAISE EXCEPTION 'SESSION_EXPIRED';
  END IF;
  IF (public.app_session(p_token))."viaTeenNumber" THEN
    RAISE EXCEPTION 'TEEN_PASSWORD_FIXED';
  END IF;
  IF p_new IS NULL OR length(p_new) < 5 THEN
    RAISE EXCEPTION 'Password must be at least 5 characters';
  END IF;
  SELECT password_hash INTO current_hash FROM "ParticipantAccount" WHERE "participantId" = person_id;
  IF current_hash IS NULL OR current_hash <> crypt(COALESCE(p_current, ''), current_hash) THEN
    RETURN FALSE;
  END IF;
  -- The guard (rule 133).
  IF public.password_staff_clash(person_id, p_new) THEN
    RAISE EXCEPTION 'STAFF_PASSWORD_CLASH';
  END IF;
  v_hash := crypt(p_new, gen_salt('bf', 10));
  UPDATE "ParticipantAccount"
  SET password_hash = v_hash, "setupCode" = NULL, "mustChangePassword" = FALSE, "passwordSetAt" = NOW(), "updatedAt" = NOW()
  WHERE "participantId" = person_id
     OR "participantId" IN (SELECT f.id FROM public.shared_number_people(person_id) f WHERE f.has_login);
  RETURN TRUE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.change_own_password_check(target_user uuid, current_password text, new_password text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  candidate "User";
BEGIN
  IF new_password IS NULL OR length(new_password) < 8 THEN
    RAISE EXCEPTION 'Password must be at least 8 characters';
  END IF;

  SELECT * INTO candidate FROM "User" WHERE id = target_user;
  IF candidate.id IS NULL OR candidate."isActive" IS FALSE THEN
    RETURN FALSE;
  END IF;

  IF candidate.password_hash LIKE 'hashed_%' THEN
    IF substring(candidate.password_hash FROM 8) <> current_password THEN
      RETURN FALSE;
    END IF;
  ELSIF candidate.password_hash IS NULL
     OR candidate.password_hash <> crypt(current_password, candidate.password_hash) THEN
    RETURN FALSE;
  END IF;

  -- The guard (rule 133): not a password a participant login on this number already uses, or sign-in would open the
  -- staff account for both and that login could no longer be reached.
  IF public.password_family_clash(target_user, new_password) THEN
    RAISE EXCEPTION 'FAMILY_PASSWORD_CLASH';
  END IF;

  UPDATE "User"
  SET password_hash = crypt(new_password, gen_salt('bf', 10)),
      "mustChangePassword" = FALSE,
      "updatedAt" = NOW()
  WHERE id = target_user;

  RETURN TRUE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_user_password(p_token text, target_user uuid, new_password text, force_change boolean DEFAULT true)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  actor "User" := public.app_staff(p_token);
  real_actor "User" := public.app_staff_real(p_token);
  target "User";
BEGIN
  IF actor.id IS NULL OR actor.role <> 'ADMIN'::"Role" THEN
    RAISE EXCEPTION 'NOT_AUTHORISED';
  END IF;

  IF new_password IS NULL OR length(new_password) < 8 THEN
    RAISE EXCEPTION 'Password must be at least 8 characters';
  END IF;

  
  SELECT * INTO target FROM "User" WHERE id = target_user;
  IF target.id IS NOT NULL
     AND EXISTS (SELECT 1 FROM unnest(public.app_user_roles(target)) r WHERE r <> 'SUPPORT'::"Role")
     AND real_actor.role <> 'ADMIN'::"Role" THEN
    RAISE EXCEPTION 'NOT_AUTHORISED';
  END IF;

  -- The guard (rule 133), for an admin's reset too.
  IF public.password_family_clash(target_user, new_password) THEN
    RAISE EXCEPTION 'FAMILY_PASSWORD_CLASH';
  END IF;

  UPDATE "User"
  SET password_hash = crypt(new_password, gen_salt('bf', 10)),
      "mustChangePassword" = force_change,
      "updatedAt" = NOW()
  WHERE id = target_user;

  RETURN FOUND;
END;
$function$;
