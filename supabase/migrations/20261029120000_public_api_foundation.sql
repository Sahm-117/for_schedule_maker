-- FOF public API, v1 foundation: keys for connecting apps, a request log, and the read-only questions they can ask.
--
-- Other church apps never read FOF tables. They call the `public-api` edge function with their own key; the function
-- hashes the key, asks api_authenticate who it belongs to and what it may do, answers through the api_* functions
-- below, and records every request (api_authenticate books it, api_finish_request fills in how it ended).
--
-- 1. ApiClient: one row per connecting app. Only the SHA-256 hash of its key is stored, never the key. `scopes`
--    says which questions it may ask (people:lookup, people:read, cohorts:read). Switched off with isActive = false.
-- 2. ApiRequestLog: every request made with a valid key: what was asked, when, the answer's status and how long it
--    took. No query strings, no answers. Requests with no key or an unknown key are refused and not recorded.
--    The 60-a-minute limit counts this log, one key at a time (an advisory lock), refused requests excluded.
-- 3. Read-only answers. People are matched across every real cohort, finished and archived ones included: not
--    Practice, not "ZZ" test cohorts, not test participants. Phone numbers match through fof_phone_key, the same
--    rule as the rest of FOF. Nothing private is returned (no reflections, notes, messages, guardian details,
--    passwords or access codes).
--
-- Both tables are locked (RLS on, no grants) and every function here is SECURITY DEFINER and runs for
-- service_role only, so the app's own users cannot reach any of it.
--
-- Rollback: DROP FUNCTION api_authenticate, api_finish_request, api_people_lookup, api_person, api_person_programme,
-- api_cohorts_current, api_create_client, api_real_cohort; DROP TABLE "ApiRequestLog", "ApiClient".

CREATE TABLE IF NOT EXISTS public."ApiClient" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  "keyPrefix" TEXT NOT NULL,
  "keyHash" TEXT NOT NULL UNIQUE,
  scopes TEXT[] NOT NULL DEFAULT '{}',
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "lastUsedAt" TIMESTAMPTZ,
  "revokedAt" TIMESTAMPTZ
);
ALTER TABLE public."ApiClient" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."ApiClient" FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public."ApiRequestLog" (
  id BIGSERIAL PRIMARY KEY,
  "clientId" UUID REFERENCES public."ApiClient"(id) ON DELETE SET NULL,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  status INTEGER NOT NULL,
  "durationMs" INTEGER,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "ApiRequestLog_client_time" ON public."ApiRequestLog" ("clientId", "createdAt" DESC);
ALTER TABLE public."ApiRequestLog" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."ApiRequestLog" FROM anon, authenticated;

-- Helpers ----------------------------------------------------------------------

-- A cohort the API may talk about: a real programme cohort, not Practice or a "ZZ" test cohort. Archived cohorts
-- count: they are history, and "has this person taken FOF?" must still find them.
CREATE OR REPLACE FUNCTION public.api_real_cohort(p_cohort_id UUID)
 RETURNS BOOLEAN
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public."Cohort" c
    WHERE c.id = p_cohort_id
      AND COALESCE(c."isPractice", FALSE) = FALSE
      AND c.name NOT ILIKE 'ZZ%'
  );
$function$;

-- Keys --------------------------------------------------------------------------

-- Checks a key and books the request against its limit, in one step. NULL for an unknown or switched-off key
-- (nothing is recorded). Otherwise records the request (status 0 until api_finish_request fills it in) and returns
-- the app's name, scopes and the request id; `limited` is true, and the request is recorded as 429, when the key has
-- already made p_limit requests in the last minute. Refused (429) requests do not count towards the limit, and the
-- advisory lock makes parallel requests from one key take turns, so the count is exact.
CREATE OR REPLACE FUNCTION public.api_authenticate(p_key_hash TEXT, p_method TEXT, p_path TEXT, p_limit INTEGER DEFAULT 60)
 RETURNS JSONB
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  client public."ApiClient";
  used INTEGER;
  limited BOOLEAN;
  request_id BIGINT;
BEGIN
  SELECT * INTO client FROM public."ApiClient"
  WHERE "keyHash" = p_key_hash AND "isActive" AND "revokedAt" IS NULL;
  IF client.id IS NULL THEN
    RETURN NULL;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('api-client:' || client.id::TEXT));
  SELECT count(*) INTO used FROM public."ApiRequestLog" l
  WHERE l."clientId" = client.id AND l."createdAt" > NOW() - INTERVAL '1 minute' AND l.status <> 429;
  limited := used >= p_limit;
  INSERT INTO public."ApiRequestLog" ("clientId", method, path, status)
  VALUES (client.id, left(p_method, 10), left(p_path, 300), CASE WHEN limited THEN 429 ELSE 0 END)
  RETURNING id INTO request_id;
  UPDATE public."ApiClient" SET "lastUsedAt" = NOW() WHERE id = client.id;
  RETURN jsonb_build_object('id', client.id, 'name', client.name, 'scopes', to_jsonb(client.scopes),
    'requestId', request_id, 'limited', limited);
END;
$function$;

-- Fills in how a booked request ended.
CREATE OR REPLACE FUNCTION public.api_finish_request(p_request_id BIGINT, p_status INTEGER, p_duration_ms INTEGER)
 RETURNS VOID
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  UPDATE public."ApiRequestLog" SET status = p_status, "durationMs" = p_duration_ms WHERE id = p_request_id;
$function$;

-- Issue a key for a new connecting app. The key is returned once and only its hash is kept.
CREATE OR REPLACE FUNCTION public.api_create_client(p_name TEXT, p_scopes TEXT[], p_notes TEXT DEFAULT NULL)
 RETURNS JSONB
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  allowed CONSTANT TEXT[] := ARRAY['people:lookup', 'people:read', 'cohorts:read'];
  raw_key TEXT;
  new_id UUID;
BEGIN
  IF COALESCE(trim(p_name), '') = '' THEN
    RAISE EXCEPTION 'A name is required';
  END IF;
  IF p_scopes IS NULL OR cardinality(p_scopes) = 0 OR NOT (p_scopes <@ allowed) THEN
    RAISE EXCEPTION 'Scopes must be some of %', allowed;
  END IF;
  raw_key := 'fof_live_' || encode(gen_random_bytes(24), 'hex');
  INSERT INTO public."ApiClient" (name, "keyPrefix", "keyHash", scopes, notes)
  VALUES (trim(p_name), left(raw_key, 15), encode(sha256(convert_to(raw_key, 'UTF8')), 'hex'), p_scopes, p_notes)
  RETURNING id INTO new_id;
  RETURN jsonb_build_object('id', new_id, 'name', trim(p_name), 'scopes', to_jsonb(p_scopes), 'key', raw_key);
END;
$function$;

-- Answers -----------------------------------------------------------------------

-- Is this person in FOF? Matches by phone (last 10 digits) or email, across real cohorts.
CREATE OR REPLACE FUNCTION public.api_people_lookup(p_phone TEXT DEFAULT NULL, p_email TEXT DEFAULT NULL)
 RETURNS JSONB
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  phone_key TEXT := public.fof_phone_key(p_phone);
  email_key TEXT := NULLIF(lower(trim(COALESCE(p_email, ''))), '');
  today DATE := (timezone('Africa/Lagos', now()))::date;
  people JSONB;
  team JSONB;
BEGIN
  IF phone_key IS NULL AND email_key IS NULL THEN
    IF NULLIF(trim(COALESCE(p_phone, '')), '') IS NOT NULL THEN
      RAISE EXCEPTION 'That phone number is not one FOF can read';
    END IF;
    RAISE EXCEPTION 'Give a phone number or an email';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', p.id,
      'name', p."fullName",
      'status', p.status,
      'cohort', jsonb_build_object('id', c.id, 'name', c.name, 'startDate', c."startDate", 'endDate', c."endDate"),
      'cohortFinished', c."endDate" IS NOT NULL AND c."endDate" < today,
      'inGroup', EXISTS (
        SELECT 1 FROM public."GroupParticipant" gp JOIN public."Group" g ON g.id = gp."groupId"
        WHERE gp."participantId" = p.id AND g."archivedAt" IS NULL),
      'registeredOn', p."registrationDate"
    ) ORDER BY c."startDate" DESC NULLS LAST), '[]'::jsonb)
  INTO people
  FROM public."Participant" p
  JOIN public."Cohort" c ON c.id = p."cohortId"
  WHERE COALESCE(p."isTest", FALSE) = FALSE
    AND public.api_real_cohort(c.id)
    AND ((phone_key IS NOT NULL AND public.fof_phone_key(p.phone) = phone_key)
      OR (email_key IS NOT NULL AND lower(trim(p.email)) = email_key));

  -- Whether the person also serves on the FOF team (support or admin), by role only.
  SELECT COALESCE(jsonb_agg(DISTINCT r), '[]'::jsonb)
  INTO team
  FROM public."User" u
  CROSS JOIN LATERAL unnest(public.app_user_roles(u)::TEXT[]) AS r
  WHERE COALESCE(u."isTest", FALSE) = FALSE
    AND COALESCE(u."isActive", TRUE)
    AND r <> 'PARTICIPANT'
    AND ((phone_key IS NOT NULL AND public.fof_phone_key(u.phone) = phone_key)
      OR (email_key IS NOT NULL AND lower(trim(u.email)) = email_key));

  RETURN jsonb_build_object(
    'found', jsonb_array_length(people) > 0 OR jsonb_array_length(team) > 0,
    'participations', people,
    'teamRoles', team
  );
END;
$function$;

-- A short profile for one participation. NULL when it is not one the API may talk about.
CREATE OR REPLACE FUNCTION public.api_person(p_participant_id UUID)
 RETURNS JSONB
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT jsonb_build_object(
    'id', p.id,
    'name', p."fullName",
    'gender', p.gender,
    'ageRange', p."ageRange",
    'occupation', p.occupation,
    'departments', to_jsonb(COALESCE(p.departments, ARRAY[]::TEXT[])),
    'status', p.status,
    'registeredOn', p."registrationDate",
    'cohort', jsonb_build_object('id', c.id, 'name', c.name, 'startDate', c."startDate", 'endDate', c."endDate"),
    'group', (
      SELECT jsonb_build_object('name', g.name, 'meetingDay', g."meetingDay", 'meetingTime', g."meetingTime")
      FROM public."GroupParticipant" gp JOIN public."Group" g ON g.id = gp."groupId"
      WHERE gp."participantId" = p.id AND g."archivedAt" IS NULL
      LIMIT 1)
  )
  FROM public."Participant" p
  JOIN public."Cohort" c ON c.id = p."cohortId"
  WHERE p.id = p_participant_id
    AND COALESCE(p."isTest", FALSE) = FALSE
    AND public.api_real_cohort(c.id);
$function$;

-- How far one participation has got: weeks held so far, Sunday class and group meeting attendance.
CREATE OR REPLACE FUNCTION public.api_person_programme(p_participant_id UUID)
 RETURNS JSONB
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  person public."Participant";
  cohort public."Cohort";
  today DATE := (timezone('Africa/Lagos', now()))::date;
BEGIN
  SELECT * INTO person FROM public."Participant"
  WHERE id = p_participant_id AND COALESCE("isTest", FALSE) = FALSE;
  IF person.id IS NULL OR NOT public.api_real_cohort(person."cohortId") THEN
    RETURN NULL;
  END IF;
  SELECT * INTO cohort FROM public."Cohort" WHERE id = person."cohortId";

  RETURN jsonb_build_object(
    'id', person.id,
    'cohort', jsonb_build_object('id', cohort.id, 'name', cohort.name, 'startDate', cohort."startDate", 'endDate', cohort."endDate"),
    'cohortFinished', cohort."endDate" IS NOT NULL AND cohort."endDate" < today,
    'weeksInProgramme', (SELECT count(*) FROM public."Week" w WHERE w."cohortId" = cohort.id),
    -- A finished cohort held every week. Otherwise a week without a class date (older cohorts, and week 1) is taken
    -- as falling weekly from the cohort's start date.
    'weeksHeld', (SELECT count(*) FROM public."Week" w WHERE w."cohortId" = cohort.id
                  AND (cohort."endDate" < today
                    OR COALESCE(w."classDate", cohort."startDate" + (w."weekNumber" - 1) * 7) <= today)),
    -- Same counting as FOF's own attendance figures: late or leaving early counts as present only when excused.
    'sundayClass', jsonb_build_object(
      'present', (SELECT count(*) FROM public."AttendanceRecord" a JOIN public."Week" w ON w.id = a."weekId"
                  WHERE a."participantId" = person.id AND w."cohortId" = cohort.id
                    AND (a.status = 'PRESENT' OR (a.status IN ('LATE', 'LEFT_EARLY') AND COALESCE(a."lateExcused", FALSE)))),
      'lateOrLeftEarly', (SELECT count(*) FROM public."AttendanceRecord" a JOIN public."Week" w ON w.id = a."weekId"
                  WHERE a."participantId" = person.id AND w."cohortId" = cohort.id
                    AND a.status IN ('LATE', 'LEFT_EARLY') AND NOT COALESCE(a."lateExcused", FALSE)),
      'excused', (SELECT count(*) FROM public."AttendanceRecord" a JOIN public."Week" w ON w.id = a."weekId"
                  WHERE a."participantId" = person.id AND w."cohortId" = cohort.id AND a.status = 'EXCUSED'),
      'absent', (SELECT count(*) FROM public."AttendanceRecord" a JOIN public."Week" w ON w.id = a."weekId"
                 WHERE a."participantId" = person.id AND w."cohortId" = cohort.id AND a.status = 'ABSENT')),
    'groupMeetings', jsonb_build_object(
      'joined', (SELECT count(*) FROM public."MeetingAttendance" m JOIN public."Week" w ON w.id = m."weekId"
                 WHERE m."participantId" = person.id AND w."cohortId" = cohort.id AND m.status = 'JOINED'),
      'excused', (SELECT count(*) FROM public."MeetingAttendance" m JOIN public."Week" w ON w.id = m."weekId"
                  WHERE m."participantId" = person.id AND w."cohortId" = cohort.id AND m.status = 'EXCUSED'),
      'missed', (SELECT count(*) FROM public."MeetingAttendance" m JOIN public."Week" w ON w.id = m."weekId"
                 WHERE m."participantId" = person.id AND w."cohortId" = cohort.id AND m.status = 'MISSED'))
  );
END;
$function$;

-- The cohort running now (or the next one if none is), and the next one after it.
CREATE OR REPLACE FUNCTION public.api_cohorts_current()
 RETURNS JSONB
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  current_id UUID := public.current_programme_cohort_id();
  today DATE := (timezone('Africa/Lagos', now()))::date;
  cur public."Cohort";
  nxt public."Cohort";
BEGIN
  SELECT * INTO cur FROM public."Cohort" WHERE id = current_id AND public.api_real_cohort(id);
  SELECT * INTO nxt FROM public."Cohort" c
  WHERE public.api_real_cohort(c.id) AND c."startDate" > COALESCE(cur."startDate", today) AND c.id IS DISTINCT FROM cur.id
  ORDER BY c."startDate" ASC LIMIT 1;
  RETURN jsonb_build_object(
    'current', CASE WHEN cur.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', cur.id, 'name', cur.name, 'startDate', cur."startDate", 'endDate', cur."endDate",
      'running', cur."startDate" <= today AND (cur."endDate" IS NULL OR cur."endDate" >= today)) END,
    'next', CASE WHEN nxt.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', nxt.id, 'name', nxt.name, 'startDate', nxt."startDate", 'endDate', nxt."endDate") END
  );
END;
$function$;

-- Only the edge function (service_role) may call any of this.
REVOKE ALL ON FUNCTION public.api_real_cohort(UUID), public.api_authenticate(TEXT, TEXT, TEXT, INTEGER),
  public.api_finish_request(BIGINT, INTEGER, INTEGER), public.api_create_client(TEXT, TEXT[], TEXT),
  public.api_people_lookup(TEXT, TEXT), public.api_person(UUID), public.api_person_programme(UUID),
  public.api_cohorts_current() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.api_authenticate(TEXT, TEXT, TEXT, INTEGER), public.api_finish_request(BIGINT, INTEGER, INTEGER),
  public.api_people_lookup(TEXT, TEXT), public.api_person(UUID), public.api_person_programme(UUID),
  public.api_cohorts_current() TO service_role;
