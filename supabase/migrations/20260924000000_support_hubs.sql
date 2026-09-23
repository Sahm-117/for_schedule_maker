-- Phase 3 — Hubs: a cluster of supports (and their groups) in a cohort, with
-- one support picked as Hub lead. Every support sees their hub; the lead can
-- mark Sunday-recap attendance, message the hub and keep private notes on
-- each support. Trainings/get-togethers (Phase 4) share the same session and
-- attendance tables, so the types are allowed here even though nothing in
-- this phase writes them yet.
--
-- All new tables are born locked to app_is_staff()/app_is_admin() rather than
-- USING(true), matching SheetRegistration (20260918010000_form_registrations.sql).

-- 0. Generic "who is this request signed in as" helper, granted to
-- anon/authenticated so it can be used directly inside RLS predicates below
-- (attendance_session_actor_id exists but is deliberately NOT granted to the
-- client role, only called from inside other SECURITY DEFINER functions).
CREATE OR REPLACE FUNCTION public.app_current_user_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
  SELECT s."userId"
  FROM "AppSession" s
  JOIN "User" u ON u.id = s."userId"
  WHERE s."tokenHash" = encode(digest(public.app_current_token(), 'sha256'), 'hex')
    AND s."expiresAt" > NOW()
    AND s."userId" IS NOT NULL
    AND u."isActive" IS NOT FALSE
  LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.app_current_user_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_current_user_id() TO anon, authenticated;

-- 1. SupportHub — one cluster of supports per cohort, one lead.
CREATE TABLE IF NOT EXISTS public."SupportHub" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "cohortId" UUID NOT NULL REFERENCES public."Cohort"(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  "leadUserId" UUID REFERENCES public."User"(id) ON DELETE SET NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("cohortId", name)
);

CREATE INDEX IF NOT EXISTS idx_supporthub_cohort ON public."SupportHub"("cohortId");
CREATE INDEX IF NOT EXISTS idx_supporthub_lead ON public."SupportHub"("leadUserId");

ALTER TABLE public."SupportHub" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff can read hubs" ON public."SupportHub";
CREATE POLICY "Staff can read hubs" ON public."SupportHub" FOR SELECT USING (public.app_is_staff());
DROP POLICY IF EXISTS "Admins manage hubs" ON public."SupportHub";
CREATE POLICY "Admins manage hubs" ON public."SupportHub" FOR ALL USING (public.app_is_admin()) WITH CHECK (public.app_is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public."SupportHub" TO anon, authenticated;

-- 2. HubMembership — one hub per support per cohort. The lead is also a member.
CREATE TABLE IF NOT EXISTS public."HubMembership" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "hubId" UUID NOT NULL REFERENCES public."SupportHub"(id) ON DELETE CASCADE,
  "userId" UUID NOT NULL REFERENCES public."User"(id) ON DELETE CASCADE,
  "cohortId" UUID NOT NULL REFERENCES public."Cohort"(id) ON DELETE CASCADE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("cohortId", "userId")
);

CREATE INDEX IF NOT EXISTS idx_hubmembership_hub ON public."HubMembership"("hubId");
CREATE INDEX IF NOT EXISTS idx_hubmembership_user ON public."HubMembership"("userId");

ALTER TABLE public."HubMembership" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff can read hub memberships" ON public."HubMembership";
CREATE POLICY "Staff can read hub memberships" ON public."HubMembership" FOR SELECT USING (public.app_is_staff());
DROP POLICY IF EXISTS "Admins manage hub memberships" ON public."HubMembership";
CREATE POLICY "Admins manage hub memberships" ON public."HubMembership" FOR ALL USING (public.app_is_admin()) WITH CHECK (public.app_is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public."HubMembership" TO anon, authenticated;

-- 3. SupportSession — one row per attendance-taking event: a hub's Sunday
-- recap for a given week, or (Phase 4) a pre-cohort training / get-together.
-- The (hubId, weekId) unique constraint only bites when both are set (NULLs
-- never conflict in Postgres), so it naturally applies to recaps alone.
CREATE TABLE IF NOT EXISTS public."SupportSession" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "cohortId" UUID NOT NULL REFERENCES public."Cohort"(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('SUNDAY_RECAP', 'PRE_COHORT_TRAINING', 'GET_TOGETHER')),
  title TEXT NOT NULL,
  "sessionDate" DATE NOT NULL DEFAULT CURRENT_DATE,
  "weekId" INTEGER REFERENCES public."Week"(id) ON DELETE CASCADE,
  "hubId" UUID REFERENCES public."SupportHub"(id) ON DELETE CASCADE,
  "createdById" UUID REFERENCES public."User"(id) ON DELETE SET NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("hubId", "weekId")
);

CREATE INDEX IF NOT EXISTS idx_supportsession_cohort ON public."SupportSession"("cohortId");
CREATE INDEX IF NOT EXISTS idx_supportsession_hub ON public."SupportSession"("hubId");
CREATE INDEX IF NOT EXISTS idx_supportsession_week ON public."SupportSession"("weekId");

ALTER TABLE public."SupportSession" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff can read support sessions" ON public."SupportSession";
CREATE POLICY "Staff can read support sessions" ON public."SupportSession" FOR SELECT USING (public.app_is_staff());

-- Writes only via mark_support_attendance (SECURITY DEFINER) below — same
-- lockdown as AttendanceSession/AttendanceRecord in Phase 2.
GRANT SELECT ON public."SupportSession" TO anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public."SupportSession" FROM anon, authenticated;

-- 4. SupportSessionAttendance — one mark per support per session.
CREATE TABLE IF NOT EXISTS public."SupportSessionAttendance" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "sessionId" UUID NOT NULL REFERENCES public."SupportSession"(id) ON DELETE CASCADE,
  "userId" UUID NOT NULL REFERENCES public."User"(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('PRESENT', 'LATE', 'ABSENT', 'EXCUSED')),
  "markedById" UUID REFERENCES public."User"(id) ON DELETE SET NULL,
  "markedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("sessionId", "userId")
);

CREATE INDEX IF NOT EXISTS idx_supportsessionattendance_session ON public."SupportSessionAttendance"("sessionId");
CREATE INDEX IF NOT EXISTS idx_supportsessionattendance_user ON public."SupportSessionAttendance"("userId");

ALTER TABLE public."SupportSessionAttendance" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff can read support session attendance" ON public."SupportSessionAttendance";
CREATE POLICY "Staff can read support session attendance" ON public."SupportSessionAttendance" FOR SELECT USING (public.app_is_staff());

GRANT SELECT ON public."SupportSessionAttendance" TO anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public."SupportSessionAttendance" FROM anon, authenticated;

-- 5. SupportNote — private notes on a support, written by that hub's lead or
-- an admin. The support the note is about must never be able to read it, so
-- this is stricter than plain app_is_staff(): only an admin, or the lead of
-- the hub the note is filed under, can read or write.
CREATE TABLE IF NOT EXISTS public."SupportNote" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "supportId" UUID NOT NULL REFERENCES public."User"(id) ON DELETE CASCADE,
  "authorId" UUID REFERENCES public."User"(id) ON DELETE SET NULL,
  "hubId" UUID REFERENCES public."SupportHub"(id) ON DELETE SET NULL,
  "noteType" TEXT NOT NULL DEFAULT 'NOTE' CHECK ("noteType" IN ('NOTE', 'ELIGIBILITY_OVERRIDE')),
  body TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_supportnote_support ON public."SupportNote"("supportId");
CREATE INDEX IF NOT EXISTS idx_supportnote_hub ON public."SupportNote"("hubId");

ALTER TABLE public."SupportNote" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin or hub lead can manage support notes" ON public."SupportNote";
CREATE POLICY "Admin or hub lead can manage support notes" ON public."SupportNote" FOR ALL
  USING (
    public.app_is_admin()
    OR ("hubId" IS NOT NULL
      AND "SupportNote"."supportId" <> public.app_current_user_id()
      AND EXISTS (
        SELECT 1 FROM public."SupportHub" h
        JOIN public."HubMembership" m ON m."hubId" = h.id AND m."userId" = "SupportNote"."supportId"
        WHERE h.id = "SupportNote"."hubId" AND h."leadUserId" = public.app_current_user_id()
      ))
  )
  WITH CHECK (
    public.app_is_admin()
    OR ("hubId" IS NOT NULL
      AND "SupportNote"."supportId" <> public.app_current_user_id()
      AND EXISTS (
        SELECT 1 FROM public."SupportHub" h
        JOIN public."HubMembership" m ON m."hubId" = h.id AND m."userId" = "SupportNote"."supportId"
        WHERE h.id = "SupportNote"."hubId" AND h."leadUserId" = public.app_current_user_id()
      ))
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public."SupportNote" TO anon, authenticated;

-- 6. HubMessage — a lead's post to their hub. Readable by that hub's members
-- and admin. Direct inserts are blocked: only post_hub_message (below) can
-- write one, so the permission check and the notification write happen
-- together and can't be skipped by calling the table API directly.
CREATE TABLE IF NOT EXISTS public."HubMessage" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "hubId" UUID NOT NULL REFERENCES public."SupportHub"(id) ON DELETE CASCADE,
  "authorId" UUID REFERENCES public."User"(id) ON DELETE SET NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hubmessage_hub ON public."HubMessage"("hubId", "createdAt" DESC);

ALTER TABLE public."HubMessage" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Hub members and admin can read hub messages" ON public."HubMessage";
CREATE POLICY "Hub members and admin can read hub messages" ON public."HubMessage" FOR SELECT
  USING (
    public.app_is_admin()
    OR EXISTS (SELECT 1 FROM public."HubMembership" m WHERE m."hubId" = "HubMessage"."hubId" AND m."userId" = public.app_current_user_id())
  );

GRANT SELECT ON public."HubMessage" TO anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public."HubMessage" FROM anon, authenticated;

-- 7. get_my_hub — the caller's hub for a cohort: the hub itself, whether they
-- lead it, fellow members (with the groups they lead), message history, and
-- their own attendance record (recap + any Phase 4 sessions already marked).
CREATE OR REPLACE FUNCTION public.get_my_hub(p_cohort_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_id UUID;
  v_hub_id UUID;
  v_result JSON;
BEGIN
  IF NOT public.app_is_staff() THEN
    RAISE EXCEPTION 'You must be signed in as a support or admin';
  END IF;

  v_actor_id := public.app_current_user_id();

  SELECT "hubId" INTO v_hub_id
  FROM public."HubMembership"
  WHERE "userId" = v_actor_id AND "cohortId" = p_cohort_id;

  IF v_hub_id IS NULL THEN
    RETURN json_build_object('hub', NULL, 'isLead', FALSE, 'members', '[]'::json, 'messages', '[]'::json, 'myAttendance', '[]'::json);
  END IF;

  SELECT json_build_object(
    'hub', (
      SELECT json_build_object('id', h.id, 'name', h.name, 'leadUserId', h."leadUserId", 'leadName', lead.name, 'cohortId', h."cohortId")
      FROM public."SupportHub" h
      LEFT JOIN public."User" lead ON lead.id = h."leadUserId"
      WHERE h.id = v_hub_id
    ),
    'isLead', EXISTS (SELECT 1 FROM public."SupportHub" h WHERE h.id = v_hub_id AND h."leadUserId" = v_actor_id),
    'members', COALESCE((
      SELECT json_agg(json_build_object(
        'userId', u.id,
        'name', u.name,
        'phone', u.phone,
        'isLead', (u.id = (SELECT "leadUserId" FROM public."SupportHub" WHERE id = v_hub_id)),
        'groupName', (SELECT g.name FROM public."Group" g WHERE g."supportId" = u.id AND g."cohortId" = p_cohort_id AND g."archivedAt" IS NULL ORDER BY g.name LIMIT 1)
      ) ORDER BY u.name)
      FROM public."HubMembership" m
      JOIN public."User" u ON u.id = m."userId"
      WHERE m."hubId" = v_hub_id
    ), '[]'::json),
    'messages', COALESCE((
      SELECT json_agg(json_build_object(
        'id', msg.id, 'subject', msg.subject, 'body', msg.body,
        'authorName', author.name, 'createdAt', msg."createdAt"
      ) ORDER BY msg."createdAt" DESC)
      FROM public."HubMessage" msg
      LEFT JOIN public."User" author ON author.id = msg."authorId"
      WHERE msg."hubId" = v_hub_id
    ), '[]'::json),
    'myAttendance', COALESCE((
      SELECT json_agg(json_build_object(
        'sessionId', s.id, 'type', s.type, 'title', s.title, 'sessionDate', s."sessionDate",
        'weekId', s."weekId", 'status', a.status
      ) ORDER BY s."sessionDate" DESC)
      FROM public."SupportSessionAttendance" a
      JOIN public."SupportSession" s ON s.id = a."sessionId"
      WHERE a."userId" = v_actor_id AND s."cohortId" = p_cohort_id
    ), '[]'::json)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_my_hub(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_hub(UUID) TO anon, authenticated;

-- 8. mark_support_attendance — recap (hub + week, session found-or-created on
-- first mark) or, for Phase 4, an existing training/get-together session
-- passed by id. Who marks: recap is the hub's own lead (or admin); a
-- training/get-together can be marked by any hub lead or admin.
CREATE OR REPLACE FUNCTION public.mark_support_attendance(
  p_status TEXT,
  p_user_id UUID,
  p_hub_id UUID DEFAULT NULL,
  p_week_id INTEGER DEFAULT NULL,
  p_session_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_id UUID;
  v_session public."SupportSession";
  v_week public."Week";
  v_hub public."SupportHub";
  v_is_lead_of_any BOOLEAN;
  v_result public."SupportSessionAttendance";
BEGIN
  IF NOT public.app_is_staff() THEN
    RAISE EXCEPTION 'You must be signed in as a support or admin to mark attendance';
  END IF;
  IF p_status NOT IN ('PRESENT', 'LATE', 'ABSENT', 'EXCUSED') THEN
    RAISE EXCEPTION 'Invalid attendance status';
  END IF;
  v_actor_id := public.app_current_user_id();

  IF p_session_id IS NOT NULL THEN
    SELECT * INTO v_session FROM public."SupportSession" WHERE id = p_session_id;
    IF v_session.id IS NULL THEN RAISE EXCEPTION 'Session was not found'; END IF;
  ELSE
    IF p_hub_id IS NULL OR p_week_id IS NULL THEN
      RAISE EXCEPTION 'Provide either a session, or a hub and week';
    END IF;

    SELECT * INTO v_week FROM public."Week" WHERE id = p_week_id;
    IF v_week.id IS NULL THEN RAISE EXCEPTION 'Week was not found'; END IF;

    SELECT * INTO v_hub FROM public."SupportHub" WHERE id = p_hub_id;
    IF v_hub.id IS NULL THEN RAISE EXCEPTION 'Hub was not found'; END IF;
    IF v_hub."cohortId" IS DISTINCT FROM v_week."cohortId" THEN
      RAISE EXCEPTION 'This hub and week are not in the same cohort';
    END IF;

    INSERT INTO public."SupportSession" ("cohortId", type, title, "sessionDate", "weekId", "hubId", "createdById")
    VALUES (v_week."cohortId", 'SUNDAY_RECAP', format('Sunday recap · Week %s', v_week."weekNumber"), CURRENT_DATE, p_week_id, p_hub_id, v_actor_id)
    ON CONFLICT ("hubId", "weekId") DO NOTHING;

    SELECT * INTO v_session FROM public."SupportSession" WHERE "hubId" = p_hub_id AND "weekId" = p_week_id;
  END IF;

  -- Permission: recap is the session's own hub's lead; trainings/get-togethers
  -- (no fixed hub) can be marked by any hub lead. Admin can always mark.
  IF NOT public.app_is_admin() THEN
    IF v_session."hubId" IS NOT NULL THEN
      IF NOT EXISTS (SELECT 1 FROM public."SupportHub" h WHERE h.id = v_session."hubId" AND h."leadUserId" = v_actor_id) THEN
        RAISE EXCEPTION 'Only this hub''s lead or an admin can mark this attendance';
      END IF;
    ELSE
      SELECT EXISTS (SELECT 1 FROM public."SupportHub" h WHERE h."cohortId" = v_session."cohortId" AND h."leadUserId" = v_actor_id) INTO v_is_lead_of_any;
      IF NOT COALESCE(v_is_lead_of_any, FALSE) THEN
        RAISE EXCEPTION 'Only a hub lead or an admin can mark this attendance';
      END IF;
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public."User" u WHERE u.id = p_user_id AND u."isActive" IS NOT FALSE
  ) THEN
    RAISE EXCEPTION 'That support was not found';
  END IF;

  INSERT INTO public."SupportSessionAttendance" ("sessionId", "userId", status, "markedById", "markedAt")
  VALUES (v_session.id, p_user_id, p_status, v_actor_id, NOW())
  ON CONFLICT ("sessionId", "userId") DO UPDATE
    SET status = EXCLUDED.status, "markedById" = EXCLUDED."markedById", "markedAt" = EXCLUDED."markedAt"
  RETURNING * INTO v_result;

  RETURN jsonb_build_object(
    'id', v_result.id,
    'sessionId', v_result."sessionId",
    'userId', v_result."userId",
    'status', v_result.status,
    'markedById', v_result."markedById",
    'markedAt', v_result."markedAt"
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.mark_support_attendance(TEXT, UUID, UUID, INTEGER, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_support_attendance(TEXT, UUID, UUID, INTEGER, UUID) TO anon, authenticated;

-- 9. Push helper for hub messages — same vault-secret + net.http_post pattern
-- as invoke_attendance_absence_push (20260923000000), but routed through
-- notify-users with userIds so it both writes the in-app feed row (via
-- notify-users' insertNotifications) and pushes, in one call.
CREATE OR REPLACE FUNCTION public.invoke_hub_message_push(p_user_ids UUID[], p_subject TEXT, p_body TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_url text;
  v_key text;
BEGIN
  IF p_user_ids IS NULL OR array_length(p_user_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'project_url';
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'push_reminders_service_key';

  IF v_url IS NULL OR v_key IS NULL THEN
    RAISE NOTICE 'invoke_hub_message_push: vault secrets missing; skipping run';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := v_url || '/functions/v1/notify-users',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', v_key,
      'Authorization', 'Bearer ' || v_key
    ),
    body := jsonb_build_object(
      'userIds', to_jsonb(p_user_ids),
      'title', p_subject,
      'body', p_body,
      'path', '/support/my-hub',
      'type', 'HUB'
    ),
    timeout_milliseconds := 25000
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.invoke_hub_message_push(UUID[], TEXT, TEXT) FROM PUBLIC;

-- 10. post_hub_message — lead or admin only. Writes the message, then pushes
-- + notifies every OTHER member (the poster doesn't need their own message
-- pushed back at them).
CREATE OR REPLACE FUNCTION public.post_hub_message(p_hub_id UUID, p_subject TEXT, p_body TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_id UUID;
  v_subject TEXT;
  v_body TEXT;
  v_message public."HubMessage";
  v_member_ids UUID[];
BEGIN
  IF NOT public.app_is_staff() THEN
    RAISE EXCEPTION 'You must be signed in as a support or admin to message a hub';
  END IF;
  v_actor_id := public.app_current_user_id();

  IF NOT public.app_is_admin() THEN
    IF NOT EXISTS (SELECT 1 FROM public."SupportHub" h WHERE h.id = p_hub_id AND h."leadUserId" = v_actor_id) THEN
      RAISE EXCEPTION 'Only this hub''s lead or an admin can message it';
    END IF;
  END IF;

  v_subject := NULLIF(BTRIM(COALESCE(p_subject, '')), '');
  v_body := NULLIF(BTRIM(COALESCE(p_body, '')), '');
  IF v_subject IS NULL OR v_body IS NULL THEN
    RAISE EXCEPTION 'Subject and message are required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public."SupportHub" WHERE id = p_hub_id) THEN
    RAISE EXCEPTION 'Hub was not found';
  END IF;

  INSERT INTO public."HubMessage" ("hubId", "authorId", subject, body)
  VALUES (p_hub_id, v_actor_id, v_subject, v_body)
  RETURNING * INTO v_message;

  SELECT array_agg("userId") INTO v_member_ids
  FROM public."HubMembership"
  WHERE "hubId" = p_hub_id AND "userId" <> v_actor_id;

  IF v_member_ids IS NOT NULL AND array_length(v_member_ids, 1) > 0 THEN
    PERFORM public.invoke_hub_message_push(v_member_ids, v_subject, v_body);
  END IF;

  RETURN jsonb_build_object(
    'id', v_message.id, 'hubId', v_message."hubId", 'authorId', v_message."authorId",
    'subject', v_message.subject, 'body', v_message.body, 'createdAt', v_message."createdAt"
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.post_hub_message(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.post_hub_message(UUID, TEXT, TEXT) TO anon, authenticated;

-- 11. cohort_people: add supportRecap so a missed (ABSENT, not EXCUSED)
-- recap can count as a missed week in the SAME place sunday/meeting already
-- feed evaluateSupports (frontend/src/utils/programmeRules.ts) — keeping the
-- SQL and TS sides reading the one set of rows rather than two.
CREATE OR REPLACE FUNCTION public.cohort_people(p_cohort_id UUID)
RETURNS JSON
LANGUAGE sql
STABLE
AS $$
  WITH
  people AS (
    SELECT p.id, p."fullName", p.status, p.departments, p."createdAt",
           (SELECT gp."groupId" FROM "GroupParticipant" gp
              JOIN "Group" g ON g.id = gp."groupId" AND g."cohortId" = p_cohort_id
             WHERE gp."participantId" = p.id LIMIT 1) AS "groupId",
           COALESCE(o.contacted AND o."addedToGroup" AND o."introductionDone" AND o."venueAcknowledged", false) AS onboarded
    FROM "Participant" p
    LEFT JOIN "ParticipantOnboardingStatus" o ON o."participantId" = p.id
    WHERE p."cohortId" = p_cohort_id
  ),
  weeks AS (
    SELECT id FROM "Week" WHERE "cohortId" = p_cohort_id
  ),
  onboarding AS (
    SELECT g.id AS "groupId", g."supportId",
           s."groupCreated", s."completedAt",
           (SELECT max(e."createdAt") FROM "OnboardingEvent" e
             WHERE e."groupId" = g.id AND e.type = 'GROUP_ASSIGNED'
               AND e."createdAt" <= COALESCE(s."completedAt", now())) AS "assignedAt"
    FROM "Group" g
    LEFT JOIN "GroupOnboardingStatus" s ON s."groupId" = g.id
    WHERE g."cohortId" = p_cohort_id
  )
  SELECT json_build_object(
    'participants', COALESCE((SELECT json_agg(p ORDER BY p."fullName") FROM people p), '[]'::json),
    'sunday', COALESCE((
      SELECT json_agg(json_build_object(
        'participantId', a."participantId", 'weekId', a."weekId", 'status', a.status, 'lateExcused', a."lateExcused"
      ))
      FROM "AttendanceRecord" a
      JOIN people p ON p.id = a."participantId"
      JOIN weeks w ON w.id = a."weekId"
    ), '[]'::json),
    'meeting', COALESCE((
      SELECT json_agg(json_build_object('participantId', m."participantId", 'weekId', m."weekId", 'status', m.status))
      FROM "MeetingAttendance" m
      JOIN people p ON p.id = m."participantId"
      JOIN weeks w ON w.id = m."weekId"
    ), '[]'::json),
    'onboarding', COALESCE((SELECT json_agg(o) FROM onboarding o), '[]'::json),
    'supportRecap', COALESCE((
      SELECT json_agg(json_build_object('userId', a."userId", 'weekId', s."weekId", 'status', a.status))
      FROM "SupportSessionAttendance" a
      JOIN "SupportSession" s ON s.id = a."sessionId"
      WHERE s."cohortId" = p_cohort_id AND s.type = 'SUNDAY_RECAP' AND s."weekId" IS NOT NULL
    ), '[]'::json)
  );
$$;

GRANT EXECUTE ON FUNCTION public.cohort_people(UUID) TO anon, authenticated;

-- 12. Announcements can target a hub, same shape as targetGroupId.
ALTER TABLE public."Announcement"
  ADD COLUMN IF NOT EXISTS "targetHubId" UUID REFERENCES public."SupportHub"(id) ON DELETE SET NULL;
