-- Plumbing for locking the open tables down. Adds nothing but helpers; no
-- policy or grant changes, so behaviour is identical after this migration.
--
-- 56 public tables still carry FOR ALL USING(true) with full anon CRUD, so the
-- anon key in the browser bundle reads and writes Participant, ParticipantNote
-- and ~54 others. Policies cannot tell a logged-in support from a stranger
-- because this app does not use Supabase auth -- every browser request arrives
-- as the anon role with no claims.
--
-- The session token the app already issues is the missing signal. PostgREST
-- exposes request headers to SQL, so the client can send its token as
-- x-session-token and a policy can read it back out.
--
-- app_is_staff() deliberately does NOT call app_staff(). app_staff() ->
-- app_session() refreshes lastSeenAt/expiresAt, which makes it VOLATILE: as a
-- policy predicate that would attempt a write during SELECT and would be
-- re-evaluated per row. These helpers are STABLE and side-effect free, so the
-- planner hoists them to a single evaluation per statement. The session rules
-- (sha256 lookup, expiry, isActive) are kept identical to app_session/app_staff.

-- The caller's session token, or NULL outside a PostgREST request (direct SQL,
-- edge functions on the service role, cron).
CREATE OR REPLACE FUNCTION public.app_current_token()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
  SELECT NULLIF(
    current_setting('request.headers', true)::json ->> 'x-session-token',
    ''
  );
$function$;

-- TRUE when the current request carries a live session belonging to an active
-- staff user. Participants hold sessions too (AppSession.participantId), and
-- those must not pass this check.
CREATE OR REPLACE FUNCTION public.app_is_staff()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM "AppSession" s
    JOIN "User" u ON u.id = s."userId"
    WHERE s."tokenHash" = encode(digest(public.app_current_token(), 'sha256'), 'hex')
      AND s."expiresAt" > NOW()
      AND s."userId" IS NOT NULL
      AND u."isActive" IS NOT FALSE
  );
$function$;

REVOKE ALL ON FUNCTION public.app_current_token() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_is_staff() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_current_token() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_is_staff() TO anon, authenticated;
