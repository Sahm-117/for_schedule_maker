-- FOF public API 1.1: what participants, supports and admins see, for approved church apps.
--
-- Adds read-only answers for full profiles, a cohort's participants, the FOF team, groups, hubs, class weeks, the
-- weekly programme schedule, planner inputs, opened scriptures, announcements, resources, faith projects and
-- birthdays. Each has its own scope (api_create_client lists them).
--
-- Teenagers: a participant is a teen when their age range is a teen one (fof_is_teen_age) or they are in a teen
-- group. Without the `teens:read` scope a teen comes back as name, cohort and `restricted: true` only: no contact
-- details, photo, date of birth, guardian or attendance. With it, guardian name and number are included too. The
-- edge function records how many teen records each answer carried (ApiRequestLog."teenRecords"), so admins can see
-- who looked at teens and when.
--
-- Never returned, by any scope: passwords and access codes, reflections and their summaries, personal notes,
-- private and group chat messages, who gave anonymous feedback, meeting call links (admin-only in the app).
--
-- Rollback: DROP the api_* functions added here; ALTER TABLE "ApiRequestLog" DROP COLUMN "teenRecords";
-- re-run api_create_client, api_finish_request and api_person from 20261029120000_public_api_foundation.sql.

ALTER TABLE public."ApiRequestLog" ADD COLUMN IF NOT EXISTS "teenRecords" INTEGER NOT NULL DEFAULT 0;

-- Keys --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.api_create_client(p_name TEXT, p_scopes TEXT[], p_notes TEXT DEFAULT NULL)
 RETURNS JSONB
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  allowed CONSTANT TEXT[] := ARRAY['people:lookup', 'people:read', 'teens:read', 'faith:read', 'team:read',
    'groups:read', 'schedule:read', 'planner:read', 'content:read', 'birthdays:read', 'cohorts:read'];
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

DROP FUNCTION IF EXISTS public.api_finish_request(BIGINT, INTEGER, INTEGER);
CREATE OR REPLACE FUNCTION public.api_finish_request(p_request_id BIGINT, p_status INTEGER, p_duration_ms INTEGER, p_teen_records INTEGER DEFAULT 0)
 RETURNS VOID
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  UPDATE public."ApiRequestLog"
  SET status = p_status, "durationMs" = p_duration_ms, "teenRecords" = GREATEST(COALESCE(p_teen_records, 0), 0)
  WHERE id = p_request_id;
$function$;

-- Helpers -----------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.api_is_teen(p_participant_id UUID)
 RETURNS BOOLEAN
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  SELECT public.fof_is_teen_age(p."ageRange") OR EXISTS (
    SELECT 1 FROM public."GroupParticipant" gp JOIN public."Group" g ON g.id = gp."groupId"
    WHERE gp."participantId" = p.id AND COALESCE(g."isTeenGroup", FALSE) AND g."archivedAt" IS NULL)
  FROM public."Participant" p WHERE p.id = p_participant_id;
$function$;

-- A cohort's id from the API's "current" shorthand or a real id, only when it is a real cohort.
CREATE OR REPLACE FUNCTION public.api_cohort_id(p_cohort TEXT)
 RETURNS UUID
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
DECLARE
  cid UUID;
BEGIN
  IF lower(COALESCE(p_cohort, '')) = 'current' THEN
    cid := public.current_programme_cohort_id();
  ELSIF p_cohort ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    cid := p_cohort::UUID;
  END IF;
  IF cid IS NULL OR NOT public.api_real_cohort(cid) THEN
    RETURN NULL;
  END IF;
  RETURN cid;
END;
$function$;

-- One participant as the API shows them. A teen without `teens:read` gets name, cohort and restricted only.
CREATE OR REPLACE FUNCTION public.api_participant_json(p_participant_id UUID, p_teens BOOLEAN)
 RETURNS JSONB
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
DECLARE
  p public."Participant";
  c public."Cohort";
  teen BOOLEAN;
  grp JSONB;
  contact public."FollowUpContact";
BEGIN
  SELECT * INTO p FROM public."Participant" WHERE id = p_participant_id AND COALESCE("isTest", FALSE) = FALSE;
  IF p.id IS NULL OR NOT public.api_real_cohort(p."cohortId") THEN
    RETURN NULL;
  END IF;
  SELECT * INTO c FROM public."Cohort" WHERE id = p."cohortId";
  teen := public.api_is_teen(p.id);
  IF teen AND NOT p_teens THEN
    RETURN jsonb_build_object('id', p.id, 'name', p."fullName", 'isTeen', TRUE, 'restricted', TRUE,
      'cohort', jsonb_build_object('id', c.id, 'name', c.name, 'startDate', c."startDate", 'endDate', c."endDate"));
  END IF;

  SELECT jsonb_build_object(
      'id', g.id, 'name', g.name, 'isTeenGroup', COALESCE(g."isTeenGroup", FALSE),
      'meetingDay', g."meetingDay", 'meetingTime', g."meetingTime",
      'support', CASE WHEN s.id IS NULL THEN NULL ELSE jsonb_build_object('id', s.id, 'name', s.name, 'phone', s.phone) END)
  INTO grp
  FROM public."GroupParticipant" gp
  JOIN public."Group" g ON g.id = gp."groupId"
  LEFT JOIN public."User" s ON s.id = g."supportId"
  WHERE gp."participantId" = p.id AND g."archivedAt" IS NULL
  LIMIT 1;

  SELECT * INTO contact FROM public."FollowUpContact" WHERE id = p."followUpContactId";

  RETURN jsonb_build_object(
    'id', p.id,
    'name', p."fullName",
    'phone', p.phone,
    'email', p.email,
    'gender', p.gender,
    'ageRange', p."ageRange",
    'dateOfBirth', p."dateOfBirth",
    'occupation', p.occupation,
    'departments', to_jsonb(COALESCE(p.departments, ARRAY[]::TEXT[])),
    'photoUrl', NULLIF(trim(COALESCE(p."avatarUrl", '')), ''),
    'status', p.status,
    'registeredOn', p."registrationDate",
    'isTeen', teen,
    'cohort', jsonb_build_object('id', c.id, 'name', c.name, 'startDate', c."startDate", 'endDate', c."endDate"),
    'cohortFinished', c."endDate" IS NOT NULL AND c."endDate" < (timezone('Africa/Lagos', now()))::date,
    'group', grp
  ) || CASE WHEN teen THEN jsonb_build_object('guardian', jsonb_build_object(
          'name', NULLIF(trim(COALESCE(contact."guardianName", '')), ''),
          'phone', COALESCE(NULLIF(trim(COALESCE(p."guardianPhone", '')), ''), NULLIF(trim(COALESCE(contact."guardianPhone", '')), ''))))
       ELSE '{}'::JSONB END;
END;
$function$;

-- People ------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.api_person(UUID);
CREATE OR REPLACE FUNCTION public.api_person(p_participant_id UUID, p_teens BOOLEAN DEFAULT FALSE)
 RETURNS JSONB
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT public.api_participant_json(p_participant_id, p_teens);
$function$;

-- A cohort's participants, a page at a time, ordered by name. Optional group filter.
CREATE OR REPLACE FUNCTION public.api_cohort_participants(p_cohort TEXT, p_teens BOOLEAN, p_group_id UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 100, p_offset INTEGER DEFAULT 0)
 RETURNS JSONB
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  cid UUID := public.api_cohort_id(p_cohort);
  lim INTEGER := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 200);
  off INTEGER := GREATEST(COALESCE(p_offset, 0), 0);
BEGIN
  IF cid IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN jsonb_build_object(
    'cohortId', cid,
    'total', (SELECT count(*) FROM public."Participant" p WHERE p."cohortId" = cid AND COALESCE(p."isTest", FALSE) = FALSE
              AND (p_group_id IS NULL OR EXISTS (SELECT 1 FROM public."GroupParticipant" gp WHERE gp."participantId" = p.id AND gp."groupId" = p_group_id))),
    'limit', lim,
    'offset', off,
    'participants', COALESCE((
      SELECT jsonb_agg(public.api_participant_json(x.id, p_teens) ORDER BY x."fullName", x.id)
      FROM (
        SELECT p.id, p."fullName" FROM public."Participant" p
        WHERE p."cohortId" = cid AND COALESCE(p."isTest", FALSE) = FALSE
          AND (p_group_id IS NULL OR EXISTS (SELECT 1 FROM public."GroupParticipant" gp WHERE gp."participantId" = p.id AND gp."groupId" = p_group_id))
        ORDER BY p."fullName", p.id LIMIT lim OFFSET off
      ) x), '[]'::JSONB)
  );
END;
$function$;

-- Week by week: Sunday class and group meeting marks. Teens need teens:read.
CREATE OR REPLACE FUNCTION public.api_person_attendance(p_participant_id UUID, p_teens BOOLEAN DEFAULT FALSE)
 RETURNS JSONB
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  p public."Participant";
  c public."Cohort";
BEGIN
  SELECT * INTO p FROM public."Participant" WHERE id = p_participant_id AND COALESCE("isTest", FALSE) = FALSE;
  IF p.id IS NULL OR NOT public.api_real_cohort(p."cohortId") THEN
    RETURN NULL;
  END IF;
  IF public.api_is_teen(p.id) AND NOT p_teens THEN
    RETURN jsonb_build_object('id', p.id, 'isTeen', TRUE, 'restricted', TRUE);
  END IF;
  SELECT * INTO c FROM public."Cohort" WHERE id = p."cohortId";
  RETURN jsonb_build_object('id', p.id, 'isTeen', public.api_is_teen(p.id), 'weeks', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
        'weekNumber', w."weekNumber",
        'classDate', COALESCE(w."classDate", c."startDate" + (w."weekNumber" - 1) * 7),
        'sundayClass', a.status,
        'lateExcused', CASE WHEN a.status IN ('LATE', 'LEFT_EARLY') THEN COALESCE(a."lateExcused", FALSE) END,
        'groupMeeting', m.status
      ) ORDER BY w."weekNumber")
    FROM public."Week" w
    LEFT JOIN public."AttendanceRecord" a ON a."weekId" = w.id AND a."participantId" = p.id
    LEFT JOIN public."MeetingAttendance" m ON m."weekId" = w.id AND m."participantId" = p.id
    WHERE w."cohortId" = c.id), '[]'::JSONB));
END;
$function$;

-- The participant's faith project, as their support and the programme team see it.
CREATE OR REPLACE FUNCTION public.api_person_faith_project(p_participant_id UUID, p_teens BOOLEAN DEFAULT FALSE)
 RETURNS JSONB
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  p public."Participant";
BEGIN
  SELECT * INTO p FROM public."Participant" WHERE id = p_participant_id AND COALESCE("isTest", FALSE) = FALSE;
  IF p.id IS NULL OR NOT public.api_real_cohort(p."cohortId") THEN
    RETURN NULL;
  END IF;
  IF public.api_is_teen(p.id) AND NOT p_teens THEN
    RETURN jsonb_build_object('id', p.id, 'isTeen', TRUE, 'restricted', TRUE);
  END IF;
  RETURN jsonb_build_object('id', p.id, 'isTeen', public.api_is_teen(p.id), 'faithProject', (
    SELECT jsonb_build_object('title', f.title, 'text', f.body, 'status', f.status, 'category', fc.name,
      'sharedForPrayer', COALESCE(f."sharedForPrayer", FALSE), 'createdAt', f."createdAt", 'updatedAt', f."updatedAt")
    FROM public."FaithProject" f LEFT JOIN public."FaithProjectCategory" fc ON fc.id = f."categoryId"
    WHERE f."participantId" = p.id
    ORDER BY f."updatedAt" DESC NULLS LAST LIMIT 1));
END;
$function$;

-- Programme progress: a teen needs teens:read, like every other detail about them.
CREATE OR REPLACE FUNCTION public.api_person_programme_for(p_participant_id UUID, p_teens BOOLEAN)
 RETURNS JSONB
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF public.api_is_teen(p_participant_id) AND NOT p_teens THEN
    IF public.api_person(p_participant_id, FALSE) IS NULL THEN
      RETURN NULL;
    END IF;
    RETURN jsonb_build_object('id', p_participant_id, 'isTeen', TRUE, 'restricted', TRUE);
  END IF;
  RETURN public.api_person_programme(p_participant_id) || jsonb_build_object('isTeen', public.api_is_teen(p_participant_id));
END;
$function$;

-- Team, groups, hubs ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.api_cohort_team(p_cohort TEXT)
 RETURNS JSONB
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  cid UUID := public.api_cohort_id(p_cohort);
BEGIN
  IF cid IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN jsonb_build_object('cohortId', cid, 'team', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
        'id', u.id, 'name', u.name, 'phone', u.phone, 'email', u.email,
        'photoUrl', NULLIF(trim(COALESCE(u."avatarUrl", '')), ''),
        'roles', to_jsonb(public.app_user_roles(u)::TEXT[]),
        'supportKind', uc."supportKind",
        'hubs', COALESCE((SELECT jsonb_agg(h.name ORDER BY h.name) FROM public."HubMembership" hm JOIN public."SupportHub" h ON h.id = hm."hubId"
                          WHERE hm."userId" = u.id AND hm."cohortId" = cid), '[]'::JSONB),
        'groups', COALESCE((SELECT jsonb_agg(g.name ORDER BY g.name) FROM public."Group" g
                            WHERE g."supportId" = u.id AND g."cohortId" = cid AND g."archivedAt" IS NULL), '[]'::JSONB)
      ) ORDER BY u.name)
    FROM public."UserCohort" uc JOIN public."User" u ON u.id = uc."userId"
    WHERE uc."cohortId" = cid AND COALESCE(u."isTest", FALSE) = FALSE AND u."isActive" IS NOT FALSE), '[]'::JSONB));
END;
$function$;

CREATE OR REPLACE FUNCTION public.api_cohort_groups(p_cohort TEXT)
 RETURNS JSONB
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  cid UUID := public.api_cohort_id(p_cohort);
BEGIN
  IF cid IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN jsonb_build_object('cohortId', cid, 'groups', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
        'id', g.id, 'name', g.name, 'isTeenGroup', COALESCE(g."isTeenGroup", FALSE),
        'meetingDay', g."meetingDay", 'meetingTime', g."meetingTime", 'callPlatform', g."callPlatform",
        'support', CASE WHEN s.id IS NULL THEN NULL ELSE jsonb_build_object('id', s.id, 'name', s.name, 'phone', s.phone) END,
        'participants', (SELECT count(*) FROM public."GroupParticipant" gp JOIN public."Participant" p ON p.id = gp."participantId"
                         WHERE gp."groupId" = g.id AND COALESCE(p."isTest", FALSE) = FALSE)
      ) ORDER BY g.name)
    FROM public."Group" g LEFT JOIN public."User" s ON s.id = g."supportId"
    WHERE g."cohortId" = cid AND g."archivedAt" IS NULL), '[]'::JSONB));
END;
$function$;

CREATE OR REPLACE FUNCTION public.api_cohort_hubs(p_cohort TEXT)
 RETURNS JSONB
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  cid UUID := public.api_cohort_id(p_cohort);
BEGIN
  IF cid IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN jsonb_build_object('cohortId', cid, 'hubs', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
        'id', h.id, 'name', h.name, 'meetingDay', h."meetingDay", 'meetingTime', h."meetingTime", 'callPlatform', h."callPlatform",
        'lead', (SELECT jsonb_build_object('id', u.id, 'name', u.name, 'phone', u.phone) FROM public."User" u WHERE u.id = h."leadUserId"),
        'assistantLead', (SELECT jsonb_build_object('id', u.id, 'name', u.name, 'phone', u.phone) FROM public."User" u WHERE u.id = h."assistantLeadUserId"),
        'members', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', u.id, 'name', u.name) ORDER BY u.name)
                             FROM public."HubMembership" hm JOIN public."User" u ON u.id = hm."userId"
                             WHERE hm."hubId" = h.id AND COALESCE(u."isTest", FALSE) = FALSE), '[]'::JSONB)
      ) ORDER BY h.name)
    FROM public."SupportHub" h WHERE h."cohortId" = cid), '[]'::JSONB));
END;
$function$;

-- Schedule ----------------------------------------------------------------------

-- The ten class weeks: date, title and teacher, and whether the manual and recap exist.
CREATE OR REPLACE FUNCTION public.api_cohort_weeks(p_cohort TEXT)
 RETURNS JSONB
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  cid UUID := public.api_cohort_id(p_cohort);
  c public."Cohort";
BEGIN
  IF cid IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT * INTO c FROM public."Cohort" WHERE id = cid;
  RETURN jsonb_build_object('cohortId', cid, 'weeks', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
        'weekNumber', w."weekNumber", 'title', w.title,
        'classDate', COALESCE(w."classDate", c."startDate" + (w."weekNumber" - 1) * 7),
        'teacher', CASE WHEN w."teacherName" IS NULL THEN NULL ELSE jsonb_build_object('name', w."teacherName", 'role', w."teacherRole", 'photoUrl', w."teacherPhotoUrl") END,
        'classGraphicUrl', w."classGraphicUrl",
        'hasManual', w."manualDocumentUrl" IS NOT NULL,
        'hasRecap', w."recapDocumentUrl" IS NOT NULL OR NULLIF(trim(COALESCE(w."recapSummary", '')), '') IS NOT NULL
      ) ORDER BY w."weekNumber")
    FROM public."Week" w WHERE w."cohortId" = cid), '[]'::JSONB));
END;
$function$;

-- The weekly programme schedule (the admin Schedule page): each week's days and their activities and teams.
CREATE OR REPLACE FUNCTION public.api_cohort_schedule(p_cohort TEXT)
 RETURNS JSONB
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  cid UUID := public.api_cohort_id(p_cohort);
BEGIN
  IF cid IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN jsonb_build_object('cohortId', cid, 'weeks', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('weekNumber', w."weekNumber", 'days', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('day', d."dayName", 'activities', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'time', a.time, 'period', a.period, 'description', a.description,
                'teams', COALESCE((SELECT jsonb_agg(t.name ORDER BY at."order") FROM public."ActivityTeam" at JOIN public."Team" t ON t.id = at."teamId" WHERE at."activityId" = a.id), '[]'::JSONB)
              ) ORDER BY a."orderIndex", a.id)
            FROM public."Activity" a WHERE a."dayId" = d.id), '[]'::JSONB))
          ORDER BY array_position(ARRAY['sunday','monday','tuesday','wednesday','thursday','friday','saturday'], lower(d."dayName")) NULLS LAST, d.id)
        FROM public."Day" d WHERE d."weekId" = w.id), '[]'::JSONB)) ORDER BY w."weekNumber")
    FROM public."Week" w WHERE w."cohortId" = cid), '[]'::JSONB));
END;
$function$;

-- What the planner draws from: real cohorts and their class dates, dates saved for planned cohorts, church events
-- and public holidays. The edge function works out the phases the same way the app's planner does.
CREATE OR REPLACE FUNCTION public.api_planner_inputs()
 RETURNS JSONB
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT jsonb_build_object(
    'cohorts', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'status', c.status,
        'startDate', c."startDate", 'endDate', c."endDate",
        'weeks', COALESCE((SELECT jsonb_agg(jsonb_build_object('weekNumber', w."weekNumber", 'classDate', w."classDate") ORDER BY w."weekNumber")
                           FROM public."Week" w WHERE w."cohortId" = c.id), '[]'::JSONB)) ORDER BY c."startDate")
      FROM public."Cohort" c WHERE c."startDate" IS NOT NULL AND public.api_real_cohort(c.id)), '[]'::JSONB),
    'plannedDates', COALESCE((SELECT s.value::JSONB FROM public."AppSetting" s WHERE s."settingKey" = 'planner_planned_dates'), '{}'::JSONB),
    'churchEvents', COALESCE((SELECT jsonb_agg(jsonb_build_object('name', e.name, 'startDate', e."startDate", 'endDate', e."endDate", 'stopsFof', e."stopsFof") ORDER BY e."startDate")
      FROM public."ChurchEvent" e), '[]'::JSONB),
    'publicHolidays', COALESCE((SELECT jsonb_agg(jsonb_build_object('name', h.name, 'date', h.date, 'isEstimate', h."isEstimate") ORDER BY h.date)
      FROM public."PublicHoliday" h WHERE h.date >= (timezone('Africa/Lagos', now()))::date - 366), '[]'::JSONB)
  );
$function$;

-- Content -----------------------------------------------------------------------

-- Scripture posts that have opened in the current cohort (none from the future), newest first, with totals.
CREATE OR REPLACE FUNCTION public.api_scriptures()
 RETURNS JSONB
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  cid UUID := public.current_programme_cohort_id();
  start_date DATE;
  start_day INTEGER;
  today DATE := (timezone('Africa/Lagos', now()))::date;
BEGIN
  SELECT c."startDate" INTO start_date FROM public."Cohort" c WHERE c.id = cid;
  SELECT CASE WHEN s.value::TEXT ~ '^"?[0-9]+"?$' THEN trim(both '"' from s.value::TEXT)::INTEGER ELSE 1 END
  INTO start_day FROM public."AppSetting" s WHERE s."settingKey" = 'scripture_start_day';
  start_day := COALESCE(start_day, 1);
  IF start_date IS NULL THEN
    RETURN jsonb_build_object('scriptures', '[]'::JSONB);
  END IF;
  RETURN jsonb_build_object('scriptures', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
        'day', s."dayNumber",
        'opensOn', start_date + (start_day - 1) + (s."dayNumber" - 1),
        'imageUrl', s."imageUrl",
        'likes', (SELECT count(*) FROM public."ScriptureEngagement" e WHERE e."scriptureId" = s.id AND e.action = 'LIKE'),
        'downloads', (SELECT count(*) FROM public."ScriptureEngagement" e WHERE e."scriptureId" = s.id AND e.action = 'DOWNLOAD'),
        'shares', (SELECT count(*) FROM public."ScriptureEngagement" e WHERE e."scriptureId" = s.id AND e.action = 'SHARE')
      ) ORDER BY s."dayNumber" DESC)
    FROM public."Scripture" s
    WHERE start_date + (start_day - 1) + (s."dayNumber" - 1) <= today), '[]'::JSONB));
END;
$function$;

-- Announcements sent to everyone or to a whole cohort (never ones aimed at a person, group, hub or label).
CREATE OR REPLACE FUNCTION public.api_announcements(p_limit INTEGER DEFAULT 50)
 RETURNS JSONB
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT jsonb_build_object('announcements', COALESCE(jsonb_agg(x ORDER BY (x->>'sentAt') DESC), '[]'::JSONB))
  FROM (
    SELECT jsonb_build_object('id', a.id, 'subject', a.subject, 'body', a.body, 'sentAt', a."sentAt",
      'audience', a.audience, 'scope', a.scope, 'cohort', (SELECT c.name FROM public."Cohort" c WHERE c.id = a."cohortId"),
      'link', CASE WHEN a."linkUrl" IS NULL THEN NULL ELSE jsonb_build_object('url', a."linkUrl", 'label', a."linkLabel") END) AS x
    FROM public."Announcement" a
    WHERE a."sentAt" IS NOT NULL
      AND a."targetUserId" IS NULL AND a."targetParticipantId" IS NULL AND a."targetGroupId" IS NULL
      AND a."targetHubId" IS NULL AND a."targetLabelId" IS NULL
      AND COALESCE(cardinality(a."targetUserIds"), 0) = 0 AND COALESCE(cardinality(a."targetHubJobs"), 0) = 0
      AND (a."cohortId" IS NULL OR public.api_real_cohort(a."cohortId"))
    ORDER BY a."sentAt" DESC
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200)
  ) s;
$function$;

-- Resources shared with participants or supports (not ones limited to particular hubs).
CREATE OR REPLACE FUNCTION public.api_resources()
 RETURNS JSONB
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT jsonb_build_object('resources', COALESCE(jsonb_agg(jsonb_build_object(
      'id', r.id, 'title', r.title, 'description', r.description, 'type', r.type, 'url', r.url, 'fileName', r."fileName",
      'forParticipants', COALESCE(r."visibleToParticipants", FALSE), 'forSupports', COALESCE(r."visibleToSupports", FALSE),
      'cohort', (SELECT c.name FROM public."Cohort" c WHERE c.id = r."cohortId"), 'updatedAt', COALESCE(r."updatedAt", r."createdAt")
    ) ORDER BY COALESCE(r."updatedAt", r."createdAt") DESC), '[]'::JSONB))
  FROM public."Resource" r
  WHERE (COALESCE(r."visibleToParticipants", FALSE) OR COALESCE(r."visibleToSupports", FALSE))
    AND COALESCE(cardinality(r."hubIds"), 0) = 0
    AND (r."cohortId" IS NULL OR public.api_real_cohort(r."cohortId"));
$function$;

-- Birthdays ---------------------------------------------------------------------

-- Birthdays in the next p_days days (0 = today only): active participants of real cohorts and the active FOF team.
-- Teens are left out unless the key has teens:read (a birthday is part of a date of birth).
CREATE OR REPLACE FUNCTION public.api_birthdays(p_days INTEGER, p_teens BOOLEAN DEFAULT FALSE)
 RETURNS JSONB
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  today DATE := (timezone('Africa/Lagos', now()))::date;
  span INTEGER := LEAST(GREATEST(COALESCE(p_days, 0), 0), 366);
BEGIN
  RETURN jsonb_build_object('today', today, 'birthdays', COALESCE((
    SELECT jsonb_agg(b ORDER BY (b->>'daysUntil')::INT, b->>'name') FROM (
      SELECT jsonb_build_object(
          'kind', 'participant', 'id', p.id, 'name', p."fullName",
          'month', EXTRACT(MONTH FROM p."dateOfBirth")::INT, 'day', EXTRACT(DAY FROM p."dateOfBirth")::INT,
          'daysUntil', public.birthday_next(EXTRACT(MONTH FROM p."dateOfBirth")::INT, EXTRACT(DAY FROM p."dateOfBirth")::INT, today) - today,
          'cohort', c.name, 'isTeen', public.api_is_teen(p.id),
          'photoUrl', NULLIF(trim(COALESCE(p."avatarUrl", '')), '')) AS b
      FROM public."Participant" p JOIN public."Cohort" c ON c.id = p."cohortId"
      WHERE p.status = 'ACTIVE' AND COALESCE(p."isTest", FALSE) = FALSE AND p."dateOfBirth" IS NOT NULL AND public.api_real_cohort(c.id)
        AND public.birthday_next(EXTRACT(MONTH FROM p."dateOfBirth")::INT, EXTRACT(DAY FROM p."dateOfBirth")::INT, today) - today <= span
        AND (p_teens OR NOT public.api_is_teen(p.id))
      UNION ALL
      SELECT jsonb_build_object(
          'kind', 'team', 'id', u.id, 'name', u.name,
          'month', substr(u.birthday, 1, 2)::INT, 'day', substr(u.birthday, 4, 2)::INT,
          'daysUntil', public.birthday_next(substr(u.birthday, 1, 2)::INT, substr(u.birthday, 4, 2)::INT, today) - today,
          'roles', to_jsonb(public.app_user_roles(u)::TEXT[]), 'isTeen', FALSE,
          'photoUrl', NULLIF(trim(COALESCE(u."avatarUrl", '')), ''))
      FROM public."User" u
      WHERE u."isActive" IS NOT FALSE AND COALESCE(u."isTest", FALSE) = FALSE
        AND u.birthday ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'
        AND public.birthday_next(substr(u.birthday, 1, 2)::INT, substr(u.birthday, 4, 2)::INT, today) - today <= span
    ) s), '[]'::JSONB));
END;
$function$;

-- One person's details for a birthday graphic: name, photo, month and day, role label. NULL when not allowed.
CREATE OR REPLACE FUNCTION public.api_birthday_person(p_kind TEXT, p_id UUID, p_teens BOOLEAN DEFAULT FALSE)
 RETURNS JSONB
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  p public."Participant";
  u public."User";
BEGIN
  IF p_kind = 'participant' THEN
    SELECT * INTO p FROM public."Participant" WHERE id = p_id AND COALESCE("isTest", FALSE) = FALSE AND "dateOfBirth" IS NOT NULL;
    IF p.id IS NULL OR NOT public.api_real_cohort(p."cohortId") OR (public.api_is_teen(p.id) AND NOT p_teens) THEN
      RETURN NULL;
    END IF;
    RETURN jsonb_build_object('name', p."fullName", 'photoUrl', NULLIF(trim(COALESCE(p."avatarUrl", '')), ''),
      'month', EXTRACT(MONTH FROM p."dateOfBirth")::INT, 'day', EXTRACT(DAY FROM p."dateOfBirth")::INT, 'roleLabel', 'Participant',
      'isTeen', public.api_is_teen(p.id));
  ELSIF p_kind = 'team' THEN
    SELECT * INTO u FROM public."User" WHERE id = p_id AND COALESCE("isTest", FALSE) = FALSE AND "isActive" IS NOT FALSE
      AND birthday ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$';
    IF u.id IS NULL THEN
      RETURN NULL;
    END IF;
    RETURN jsonb_build_object('name', u.name, 'photoUrl', NULLIF(trim(COALESCE(u."avatarUrl", '')), ''),
      'month', substr(u.birthday, 1, 2)::INT, 'day', substr(u.birthday, 4, 2)::INT,
      'roleLabel', CASE WHEN 'ADMIN' = ANY(public.app_user_roles(u)::TEXT[]) THEN 'FOF Team' ELSE 'Support' END, 'isTeen', FALSE);
  END IF;
  RETURN NULL;
END;
$function$;

-- Lookup: say whether each match is a teen (the name is already shared there).
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
      'isTeen', public.api_is_teen(p.id),
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
    'participants', people,
    'teamRoles', team
  );
END;
$function$;

-- Only the edge function (service_role) may call any of this.
REVOKE ALL ON FUNCTION public.api_finish_request(BIGINT, INTEGER, INTEGER, INTEGER), public.api_create_client(TEXT, TEXT[], TEXT),
  public.api_is_teen(UUID), public.api_cohort_id(TEXT), public.api_participant_json(UUID, BOOLEAN),
  public.api_person(UUID, BOOLEAN), public.api_cohort_participants(TEXT, BOOLEAN, UUID, INTEGER, INTEGER),
  public.api_person_attendance(UUID, BOOLEAN), public.api_person_faith_project(UUID, BOOLEAN), public.api_person_programme_for(UUID, BOOLEAN),
  public.api_cohort_team(TEXT), public.api_cohort_groups(TEXT), public.api_cohort_hubs(TEXT), public.api_cohort_weeks(TEXT),
  public.api_cohort_schedule(TEXT), public.api_planner_inputs(), public.api_scriptures(), public.api_announcements(INTEGER),
  public.api_resources(), public.api_birthdays(INTEGER, BOOLEAN), public.api_birthday_person(TEXT, UUID, BOOLEAN),
  public.api_people_lookup(TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.api_finish_request(BIGINT, INTEGER, INTEGER, INTEGER),
  public.api_person(UUID, BOOLEAN), public.api_cohort_participants(TEXT, BOOLEAN, UUID, INTEGER, INTEGER),
  public.api_person_attendance(UUID, BOOLEAN), public.api_person_faith_project(UUID, BOOLEAN), public.api_person_programme_for(UUID, BOOLEAN),
  public.api_cohort_team(TEXT), public.api_cohort_groups(TEXT), public.api_cohort_hubs(TEXT), public.api_cohort_weeks(TEXT),
  public.api_cohort_schedule(TEXT), public.api_planner_inputs(), public.api_scriptures(), public.api_announcements(INTEGER),
  public.api_resources(), public.api_birthdays(INTEGER, BOOLEAN), public.api_birthday_person(TEXT, UUID, BOOLEAN),
  public.api_people_lookup(TEXT, TEXT)
  TO service_role;
