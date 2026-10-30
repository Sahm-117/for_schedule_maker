-- Sign-in limits per account, cleared by a reset (FLOW_MAP rule 128), and one place for the private-file prefix.
--
-- 1. The count is kept per account, not per typed identifier: a staff account is 'staff:<id>' whether they type
--    their email or their phone, and a password change counts against the same budget. A login that matches no
--    staff account counts by its email (lower case) or, with no '@', by the phone number's key (participants
--    sharing a number share it, rule 91).
-- 2. Setting a new password (a reset by an admin or support, or the person's own change) lifts the pause for that
--    account, so "ask an admin to reset your password" works straight away.
-- 3. The clean-up of old rows uses an index.
-- 4. private_file_paths strips the 'fof-private:' prefix by its length rather than a fixed offset.

CREATE INDEX IF NOT EXISTS "SignInThrottle_firstFailAt_idx" ON public."SignInThrottle" ("firstFailAt");

-- The throttle key for what someone typed at sign-in.
CREATE OR REPLACE FUNCTION public.sign_in_key(p_identifier TEXT)
 RETURNS TEXT
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_norm TEXT := lower(trim(COALESCE(p_identifier, '')));
  v_uid UUID;
BEGIN
  -- The same staff account login_user would check.
  SELECT u.id INTO v_uid FROM "User" u
  WHERE (position('@' IN v_norm) > 0 AND lower(u.email) = v_norm)
     OR (position('@' IN v_norm) = 0 AND (u.phone = trim(p_identifier) OR public.fof_phone_key(u.phone) = public.fof_phone_key(p_identifier)))
  ORDER BY (u."isActive" IS NOT FALSE) DESC, u."createdAt" ASC
  LIMIT 1;
  IF v_uid IS NOT NULL THEN RETURN 'staff:' || v_uid; END IF;
  IF position('@' IN v_norm) > 0 THEN RETURN 'login:' || v_norm; END IF;
  RETURN 'login:' || COALESCE(public.fof_phone_key(p_identifier), v_norm);
END;
$function$;

CREATE OR REPLACE FUNCTION public.sign_in(identifier TEXT, password TEXT)
 RETURNS JSON
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_key TEXT;
  v_result JSON;
BEGIN
  IF identifier IS NULL OR trim(identifier) = '' THEN
    RETURN NULL;
  END IF;
  v_key := public.sign_in_key(identifier);
  PERFORM public.sign_in_guard(v_key);
  v_result := public.sign_in_check(identifier, password);
  PERFORM public.sign_in_record(v_key, v_result IS NOT NULL);
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.change_own_password(target_user UUID, current_password TEXT, new_password TEXT)
 RETURNS BOOLEAN
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  -- The same budget as signing in to this account.
  v_key TEXT := 'staff:' || COALESCE(target_user::TEXT, '');
  v_ok BOOLEAN;
BEGIN
  PERFORM public.sign_in_guard(v_key);
  v_ok := public.change_own_password_check(target_user, current_password, new_password);
  PERFORM public.sign_in_record(v_key, COALESCE(v_ok, FALSE));
  RETURN v_ok;
END;
$function$;

-- A new password lifts the pause on that account.
CREATE OR REPLACE FUNCTION public.sign_in_throttle_clear_staff()
 RETURNS TRIGGER
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  DELETE FROM public."SignInThrottle" WHERE key = 'staff:' || NEW.id
     OR (NEW.email IS NOT NULL AND key = 'login:' || lower(NEW.email))
     OR (public.fof_phone_key(NEW.phone) IS NOT NULL AND key = 'login:' || public.fof_phone_key(NEW.phone));
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sign_in_throttle_clear_participant()
 RETURNS TRIGGER
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  DELETE FROM public."SignInThrottle" t WHERE t.key IN (
    SELECT 'login:' || public.fof_phone_key(p.phone) FROM public."Participant" p WHERE p.id = NEW."participantId" AND public.fof_phone_key(p.phone) IS NOT NULL
    UNION
    SELECT 'login:' || public.fof_phone_key(l.phone) FROM public."ParticipantLoginPhone" l WHERE l."participantId" = NEW."participantId" AND public.fof_phone_key(l.phone) IS NOT NULL
  );
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS sign_in_throttle_clear ON public."User";
CREATE TRIGGER sign_in_throttle_clear AFTER UPDATE OF password_hash ON public."User"
  FOR EACH ROW WHEN (NEW.password_hash IS DISTINCT FROM OLD.password_hash)
  EXECUTE FUNCTION public.sign_in_throttle_clear_staff();
DROP TRIGGER IF EXISTS sign_in_throttle_clear ON public."ParticipantAccount";
CREATE TRIGGER sign_in_throttle_clear AFTER UPDATE OF password_hash ON public."ParticipantAccount"
  FOR EACH ROW WHEN (NEW.password_hash IS DISTINCT FROM OLD.password_hash)
  EXECUTE FUNCTION public.sign_in_throttle_clear_participant();

REVOKE ALL ON FUNCTION public.sign_in_key(text), public.sign_in_throttle_clear_staff(),
  public.sign_in_throttle_clear_participant() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sign_in(text, text), public.change_own_password(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sign_in(text, text), public.change_own_password(uuid, text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.private_file_paths(p_kind TEXT, p_ids UUID[])
 RETURNS TABLE (id UUID, path TEXT)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  WITH me AS (
    SELECT public.app_is_staff() AS staff, public.app_participant_id(public.app_current_token()) AS pid
  ),
  wanted AS (
    SELECT r.* FROM public."Resource" r
    WHERE (p_kind = 'resource' AND r.id = ANY(p_ids))
       OR (p_kind = 'version' AND r.id IN (SELECT v."resourceId" FROM public."ResourceVersion" v WHERE v.id = ANY(p_ids)))
  ),
  allowed AS (
    SELECT w.id FROM wanted w, me
    WHERE (me.staff AND public.resource_visible_to_staff(w."cohortId", w."visibleToSupports", w."hubIds"))
       OR (me.pid IS NOT NULL AND COALESCE(w."visibleToParticipants", FALSE)
           AND (w."cohortId" IS NULL OR w."cohortId" = (SELECT p."cohortId" FROM public."Participant" p WHERE p.id = me.pid)))
  )
  SELECT r.id, substring(r.url FROM length('fof-private:') + 1) FROM public."Resource" r
  WHERE p_kind = 'resource' AND r.id IN (SELECT a.id FROM allowed a) AND r.url LIKE 'fof-private:%'
  UNION ALL
  SELECT v.id, substring(v.url FROM length('fof-private:') + 1) FROM public."ResourceVersion" v
  WHERE p_kind = 'version' AND v.id = ANY(p_ids) AND v."resourceId" IN (SELECT a.id FROM allowed a) AND v.url LIKE 'fof-private:%';
$function$;
