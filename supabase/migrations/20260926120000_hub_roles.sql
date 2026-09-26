-- Hub roles: assistant hub lead (with granular permissions), recap lead,
-- prayer lead, and an operational IT support who can cover 2+ hubs without
-- being a HubMembership member of any one of them. Also: admin tagging of a
-- support's kind, faith-project prayer sharing, hub meeting notes/submission,
-- and first-time role-intro popup tracking.
--
-- Design notes, read before touching the functions below:
--
-- 1. get_my_hub(p_cohort_id) KEEPS its existing signature and output shape
--    (only additive fields), so no existing frontend caller breaks. Postgres
--    can't add a parameter to a function via CREATE OR REPLACE without
--    changing callers, so the multi-hub cases this phase adds live in two
--    NEW functions instead:
--      - get_my_hubs(p_cohort_id) -> every hub the caller is a member of OR
--        an IT support for, in that cohort (an operational support may cover
--        2+ hubs, which is exactly the case get_my_hub can't represent).
--      - get_hub_view(p_hub_id)   -> one hub by id, for a caller who is a
--        member, IT support, or admin of it.
--    get_my_hub itself now also falls back to an IT-support hub (first by
--    name) when the caller has no HubMembership row, so an operational
--    support who only covers one hub still gets a sensible result from the
--    old call; a support covering several should move to get_my_hubs.
--    All three share one private builder, public.build_hub_view(hubId,
--    cohortId, actorId) -- REVOKE ALL FROM PUBLIC, no anon/authenticated
--    grant, since it is only ever called from inside another SECURITY
--    DEFINER function (same pattern as invoke_hub_message_push in
--    20260924000000_support_hubs.sql #9).
--
-- 2. Assistant hub lead permissions are granular and set by the hub lead:
--    SupportHub.assistantPermissions is a TEXT[] subset of
--    ('MEETING', 'ATTENDANCE', 'MESSAGE'), defaulting to just MEETING.
--    public.app_hub_can(hubId, perm) replaces a single "is lead or
--    assistant" check: TRUE for the lead always, TRUE for the assistant only
--    when perm is in their granted list. Editing a message/deleting it stays
--    open to its own author regardless of permission, same as before this
--    migration. Trainings/get-togethers and SupportNote are untouched and
--    stay lead-only (they're cohort-wide/support-specific, not this hub's
--    assistant's business).
--
-- 3. UserCohort's RLS already lets any staff member write any column
--    (ALTER POLICY ... USING (app_is_staff()) in
--    20260917280000_staff_only_programme_tables.sql) -- that's existing,
--    unrelated behaviour this migration does not touch. supportKind is
--    meant to be admin-set only, so the sanctioned way to change it is the
--    new set_support_kind RPC below; the frontend should call that rather
--    than writing the column directly.
--
-- Additive and idempotent. Not yet applied to the live database.

-- ── 1. UserCohort.supportKind ────────────────────────────────────────────────

ALTER TABLE public."UserCohort"
  ADD COLUMN IF NOT EXISTS "supportKind" TEXT NOT NULL DEFAULT 'PARTICIPANT_SUPPORT';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'UserCohort_supportKind_check') THEN
    ALTER TABLE public."UserCohort" ADD CONSTRAINT "UserCohort_supportKind_check"
      CHECK ("supportKind" IN ('PARTICIPANT_SUPPORT', 'HUB_LEAD', 'OPERATIONAL'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.set_support_kind(p_user_id UUID, p_cohort_id UUID, p_kind TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_row public."UserCohort";
BEGIN
  IF NOT public.app_is_admin() THEN
    RAISE EXCEPTION 'Only an admin can set a support''s kind';
  END IF;
  IF p_kind NOT IN ('PARTICIPANT_SUPPORT', 'HUB_LEAD', 'OPERATIONAL') THEN
    RAISE EXCEPTION 'Invalid support kind';
  END IF;

  UPDATE public."UserCohort"
  SET "supportKind" = p_kind
  WHERE "userId" = p_user_id AND "cohortId" = p_cohort_id
  RETURNING * INTO v_row;

  IF v_row."userId" IS NULL THEN
    RAISE EXCEPTION 'That support is not a member of this cohort';
  END IF;

  RETURN jsonb_build_object('userId', v_row."userId", 'cohortId', v_row."cohortId", 'supportKind', v_row."supportKind");
END;
$function$;

REVOKE ALL ON FUNCTION public.set_support_kind(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_support_kind(UUID, UUID, TEXT) TO anon, authenticated;

-- ── 2. SupportHub: assistant/recap/prayer leads + assistant permissions ─────

ALTER TABLE public."SupportHub"
  ADD COLUMN IF NOT EXISTS "assistantLeadUserId" UUID REFERENCES public."User"(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "recapLeadUserId" UUID REFERENCES public."User"(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "prayerLeadUserId" UUID REFERENCES public."User"(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "assistantPermissions" TEXT[] NOT NULL DEFAULT ARRAY['MEETING']::TEXT[];

CREATE INDEX IF NOT EXISTS idx_supporthub_assistant ON public."SupportHub"("assistantLeadUserId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SupportHub_assistantPermissions_check') THEN
    ALTER TABLE public."SupportHub" ADD CONSTRAINT "SupportHub_assistantPermissions_check"
      CHECK ("assistantPermissions" <@ ARRAY['MEETING', 'ATTENDANCE', 'MESSAGE']::TEXT[]);
  END IF;
END $$;

-- ── 3. HubItSupport — operational support(s) covering this hub without ─────
-- being a HubMembership member of it. RLS/grants mirror HubMembership.

CREATE TABLE IF NOT EXISTS public."HubItSupport" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "hubId" UUID NOT NULL REFERENCES public."SupportHub"(id) ON DELETE CASCADE,
  "userId" UUID NOT NULL REFERENCES public."User"(id) ON DELETE CASCADE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("hubId", "userId")
);

CREATE INDEX IF NOT EXISTS idx_hubitsupport_hub ON public."HubItSupport"("hubId");
CREATE INDEX IF NOT EXISTS idx_hubitsupport_user ON public."HubItSupport"("userId");

ALTER TABLE public."HubItSupport" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff can read hub it supports" ON public."HubItSupport";
CREATE POLICY "Staff can read hub it supports" ON public."HubItSupport" FOR SELECT USING (public.app_is_staff());
DROP POLICY IF EXISTS "Admins manage hub it supports" ON public."HubItSupport";
CREATE POLICY "Admins manage hub it supports" ON public."HubItSupport" FOR ALL USING (public.app_is_admin()) WITH CHECK (public.app_is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public."HubItSupport" TO anon, authenticated;

-- ── 4. HubRoleIntroSeen — has this user dismissed the "what this job means" ─
-- popup for a given job at a given hub. Personal to the user, so unlike
-- HubMessageAck (which the lead needs to see per member) only the user
-- themself or an admin can read their own rows; writes only via
-- mark_hub_role_intro_seen below.

CREATE TABLE IF NOT EXISTS public."HubRoleIntroSeen" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL REFERENCES public."User"(id) ON DELETE CASCADE,
  "hubId" UUID NOT NULL REFERENCES public."SupportHub"(id) ON DELETE CASCADE,
  job TEXT NOT NULL CHECK (job IN ('HUB_LEAD', 'ASSISTANT_HUB_LEAD', 'RECAP_LEAD', 'PRAYER_LEAD', 'IT_SUPPORT')),
  "seenAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("userId", "hubId", job)
);

CREATE INDEX IF NOT EXISTS idx_hubroleintroseen_user ON public."HubRoleIntroSeen"("userId");

ALTER TABLE public."HubRoleIntroSeen" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Caller and admin can read own role intro seen" ON public."HubRoleIntroSeen";
CREATE POLICY "Caller and admin can read own role intro seen" ON public."HubRoleIntroSeen" FOR SELECT
  USING (public.app_is_admin() OR "userId" = public.app_current_user_id());

GRANT SELECT ON public."HubRoleIntroSeen" TO anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public."HubRoleIntroSeen" FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.mark_hub_role_intro_seen(p_hub_id UUID, p_job TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_id UUID;
BEGIN
  IF NOT public.app_is_staff() THEN
    RAISE EXCEPTION 'You must be signed in as a support or admin';
  END IF;
  IF p_job NOT IN ('HUB_LEAD', 'ASSISTANT_HUB_LEAD', 'RECAP_LEAD', 'PRAYER_LEAD', 'IT_SUPPORT') THEN
    RAISE EXCEPTION 'Invalid job';
  END IF;
  v_actor_id := public.app_current_user_id();

  IF NOT EXISTS (SELECT 1 FROM public."SupportHub" WHERE id = p_hub_id) THEN
    RAISE EXCEPTION 'Hub was not found';
  END IF;

  INSERT INTO public."HubRoleIntroSeen" ("userId", "hubId", job)
  VALUES (v_actor_id, p_hub_id, p_job)
  ON CONFLICT ("userId", "hubId", job) DO NOTHING;
END;
$function$;

REVOKE ALL ON FUNCTION public.mark_hub_role_intro_seen(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_hub_role_intro_seen(UUID, TEXT) TO anon, authenticated;

-- ── 5. FaithProject.sharedForPrayer ──────────────────────────────────────────

ALTER TABLE "FaithProject"
  ADD COLUMN IF NOT EXISTS "sharedForPrayer" BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_faithproject_shared_for_prayer
  ON "FaithProject"("participantId")
  WHERE status = 'APPROVED' AND "sharedForPrayer" = TRUE;

CREATE OR REPLACE FUNCTION public.set_faith_project_prayer_share(p_token TEXT, p_shared BOOLEAN)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  person_id UUID := public.app_participant_id(p_token);
  v_row "FaithProject";
BEGIN
  IF person_id IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;

  UPDATE "FaithProject"
  SET "sharedForPrayer" = COALESCE(p_shared, FALSE)
  WHERE id = (
    SELECT id FROM "FaithProject" WHERE "participantId" = person_id ORDER BY "updatedAt" DESC LIMIT 1
  )
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;

  RETURN json_build_object('id', v_row.id, 'sharedForPrayer', v_row."sharedForPrayer");
END;
$$;

REVOKE ALL ON FUNCTION public.set_faith_project_prayer_share(TEXT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_faith_project_prayer_share(TEXT, BOOLEAN) TO anon, authenticated;

-- Re-create participant_faith (latest: 20260926090000_faith_help_testimonies.sql
-- #3) verbatim, adding sharedForPrayer to the project object only. Same
-- signature as before, so no grant change needed.
CREATE OR REPLACE FUNCTION public.participant_faith(p_token TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  person_id UUID := public.app_participant_id(p_token);
  result JSON;
BEGIN
  IF person_id IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;

  result := json_build_object(
    'project', (
      SELECT json_build_object('id', f.id, 'body', f.body, 'status', f.status, 'updatedAt', f."updatedAt", 'sharedForPrayer', f."sharedForPrayer")
      FROM "FaithProject" f WHERE f."participantId" = person_id
      ORDER BY f."updatedAt" DESC LIMIT 1
    ),
    'deadlineAt', (
      SELECT s."deadlineAt" FROM "FaithProjectSetting" s
      JOIN "Participant" p ON p."cohortId" = s."cohortId"
      WHERE p.id = person_id
    ),
    'trail', COALESCE((
      SELECT json_agg(json_build_object(
        'id', n.id, 'body', n.body, 'createdAt', n."createdAt", 'byParticipant', n."byParticipant", 'authorName', u.name
      ) ORDER BY n."createdAt")
      FROM "ParticipantNote" n LEFT JOIN "User" u ON u.id = n."authorId"
      WHERE n."participantId" = person_id AND n."noteType" = 'FAITH_COACH'
    ), '[]'::json),
    'openHelpRequest', (
      SELECT json_build_object(
        'id', h.id, 'reason', h.reason, 'note', h.note, 'wantsContact', h."wantsContact", 'createdAt', h."createdAt"
      )
      FROM "FaithHelpRequest" h
      WHERE h."participantId" = person_id AND h."resolvedAt" IS NULL
      ORDER BY h."createdAt" DESC LIMIT 1
    )
  );

  RETURN result;
END;
$$;

-- ── 6. SupportSession: notes/submittedAt/submittedById ──────────────────────

ALTER TABLE public."SupportSession"
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS "submittedAt" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "submittedById" UUID REFERENCES public."User"(id) ON DELETE SET NULL;

-- ── 7. app_hub_can — replaces a flat "lead or assistant" check. TRUE for the
-- lead always; TRUE for the assistant only when p_perm is in their granted
-- assistantPermissions. FALSE (never NULL) when the hub doesn't exist, so a
-- caller doing `IF NOT app_hub_can(...)` never mistakes "hub missing" for
-- "permission granted".

CREATE OR REPLACE FUNCTION public.app_hub_can(p_hub_id UUID, p_perm TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
  SELECT COALESCE((
    SELECT CASE
      WHEN h."leadUserId" = public.app_current_user_id() THEN TRUE
      WHEN h."assistantLeadUserId" = public.app_current_user_id()
        THEN p_perm = ANY(COALESCE(h."assistantPermissions", ARRAY[]::TEXT[]))
      ELSE FALSE
    END
    FROM public."SupportHub" h
    WHERE h.id = p_hub_id
  ), FALSE);
$function$;

REVOKE ALL ON FUNCTION public.app_hub_can(UUID, TEXT) FROM PUBLIC;

-- 7a. mark_support_attendance (latest: 20260924000000_support_hubs.sql #8) —
-- only the SUNDAY_RECAP branch's check changes, to app_hub_can(hubId,
-- 'ATTENDANCE'). Trainings/get-togethers (no fixed hub) stay lead-only.
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

  -- Permission: recap is the session's own hub's lead or (with ATTENDANCE
  -- permission) its assistant lead; trainings/get-togethers (no fixed hub)
  -- stay lead-only, any hub. Admin can always mark.
  IF NOT public.app_is_admin() THEN
    IF v_session."hubId" IS NOT NULL THEN
      IF NOT public.app_hub_can(v_session."hubId", 'ATTENDANCE') THEN
        RAISE EXCEPTION 'Only this hub''s lead, its assistant lead, or an admin can mark this attendance';
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

-- 7b. update_hub_meeting (latest: 20260925030000 #5) — MEETING permission.
CREATE OR REPLACE FUNCTION public.update_hub_meeting(
  p_hub_id UUID,
  p_meeting_day TEXT,
  p_meeting_time TEXT,
  p_meeting_duration_mins INTEGER,
  p_call_platform TEXT,
  p_call_link TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_id UUID;
  v_hub public."SupportHub";
BEGIN
  IF NOT public.app_is_staff() THEN
    RAISE EXCEPTION 'You must be signed in as a support or admin';
  END IF;
  v_actor_id := public.app_current_user_id();

  IF NOT public.app_is_admin() THEN
    IF NOT public.app_hub_can(p_hub_id, 'MEETING') THEN
      RAISE EXCEPTION 'Only this hub''s lead, its assistant lead, or an admin can set its meeting';
    END IF;
  END IF;

  IF p_call_platform IS NOT NULL AND p_call_platform NOT IN ('WHATSAPP', 'GOOGLE_MEET') THEN
    RAISE EXCEPTION 'Invalid call platform';
  END IF;

  UPDATE public."SupportHub"
  SET "meetingDay" = p_meeting_day,
      "meetingTime" = p_meeting_time,
      "meetingDurationMins" = p_meeting_duration_mins,
      "callPlatform" = p_call_platform,
      "callLink" = p_call_link
  WHERE id = p_hub_id
  RETURNING * INTO v_hub;

  IF v_hub.id IS NULL THEN
    RAISE EXCEPTION 'Hub was not found';
  END IF;

  RETURN jsonb_build_object(
    'id', v_hub.id, 'name', v_hub.name, 'leadUserId', v_hub."leadUserId", 'cohortId', v_hub."cohortId",
    'meetingDay', v_hub."meetingDay", 'meetingTime', v_hub."meetingTime",
    'meetingDurationMins', v_hub."meetingDurationMins",
    'callPlatform', v_hub."callPlatform", 'callLink', v_hub."callLink"
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.update_hub_meeting(UUID, TEXT, TEXT, INTEGER, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_hub_meeting(UUID, TEXT, TEXT, INTEGER, TEXT, TEXT) TO anon, authenticated;

-- 7c. post_hub_message (latest: 20260924000000 #10) — MESSAGE permission.
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
    IF NOT public.app_hub_can(p_hub_id, 'MESSAGE') THEN
      RAISE EXCEPTION 'Only this hub''s lead, its assistant lead, or an admin can message it';
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

-- 7d. update_hub_message (latest: 20260925030000 #3) — author keeps editing
-- their own message regardless of permission; the lead/assistant path now
-- needs MESSAGE.
CREATE OR REPLACE FUNCTION public.update_hub_message(p_message_id UUID, p_subject TEXT, p_body TEXT)
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
BEGIN
  IF NOT public.app_is_staff() THEN
    RAISE EXCEPTION 'You must be signed in as a support or admin';
  END IF;
  v_actor_id := public.app_current_user_id();

  SELECT * INTO v_message FROM public."HubMessage" WHERE id = p_message_id;
  IF v_message.id IS NULL THEN
    RAISE EXCEPTION 'Message was not found';
  END IF;

  IF NOT public.app_is_admin() THEN
    IF v_message."authorId" IS DISTINCT FROM v_actor_id
      AND NOT public.app_hub_can(v_message."hubId", 'MESSAGE')
    THEN
      RAISE EXCEPTION 'Only the author, this hub''s lead, its assistant lead, or an admin can edit this message';
    END IF;
  END IF;

  v_subject := NULLIF(BTRIM(COALESCE(p_subject, '')), '');
  v_body := NULLIF(BTRIM(COALESCE(p_body, '')), '');
  IF v_subject IS NULL OR v_body IS NULL THEN
    RAISE EXCEPTION 'Subject and message are required';
  END IF;

  UPDATE public."HubMessage"
  SET subject = v_subject, body = v_body, "editedAt" = NOW()
  WHERE id = p_message_id
  RETURNING * INTO v_message;

  RETURN jsonb_build_object(
    'id', v_message.id, 'hubId', v_message."hubId", 'authorId', v_message."authorId",
    'subject', v_message.subject, 'body', v_message.body,
    'createdAt', v_message."createdAt", 'editedAt', v_message."editedAt"
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.update_hub_message(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_hub_message(UUID, TEXT, TEXT) TO anon, authenticated;

-- 7e. delete_hub_message (latest: 20260925030000 #4) — same MESSAGE change.
CREATE OR REPLACE FUNCTION public.delete_hub_message(p_message_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_id UUID;
  v_hub_id UUID;
  v_author_id UUID;
BEGIN
  IF NOT public.app_is_staff() THEN
    RAISE EXCEPTION 'You must be signed in as a support or admin';
  END IF;
  v_actor_id := public.app_current_user_id();

  SELECT "hubId", "authorId" INTO v_hub_id, v_author_id FROM public."HubMessage" WHERE id = p_message_id;
  IF v_hub_id IS NULL THEN
    RAISE EXCEPTION 'Message was not found';
  END IF;

  IF NOT public.app_is_admin() THEN
    IF v_author_id IS DISTINCT FROM v_actor_id
      AND NOT public.app_hub_can(v_hub_id, 'MESSAGE')
    THEN
      RAISE EXCEPTION 'Only the author, this hub''s lead, its assistant lead, or an admin can delete this message';
    END IF;
  END IF;

  DELETE FROM public."HubMessage" WHERE id = p_message_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.delete_hub_message(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_hub_message(UUID) TO anon, authenticated;

-- ── 8. set_assistant_permissions — the hub's lead, or an admin. Not the ─────
-- assistant themselves (they don't get to grant themselves more).
CREATE OR REPLACE FUNCTION public.set_assistant_permissions(p_hub_id UUID, p_perms TEXT[])
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_id UUID;
  v_perms TEXT[];
  v_perm TEXT;
  v_hub public."SupportHub";
BEGIN
  IF NOT public.app_is_staff() THEN
    RAISE EXCEPTION 'You must be signed in as a support or admin';
  END IF;
  v_actor_id := public.app_current_user_id();

  IF NOT public.app_is_admin() THEN
    IF NOT EXISTS (SELECT 1 FROM public."SupportHub" h WHERE h.id = p_hub_id AND h."leadUserId" = v_actor_id) THEN
      RAISE EXCEPTION 'Only this hub''s lead or an admin can set its assistant''s permissions';
    END IF;
  END IF;

  v_perms := COALESCE(p_perms, ARRAY[]::TEXT[]);
  FOREACH v_perm IN ARRAY v_perms LOOP
    IF v_perm NOT IN ('MEETING', 'ATTENDANCE', 'MESSAGE') THEN
      RAISE EXCEPTION 'Invalid permission: %', v_perm;
    END IF;
  END LOOP;

  UPDATE public."SupportHub"
  SET "assistantPermissions" = v_perms
  WHERE id = p_hub_id
  RETURNING * INTO v_hub;

  IF v_hub.id IS NULL THEN
    RAISE EXCEPTION 'Hub was not found';
  END IF;

  RETURN jsonb_build_object('id', v_hub.id, 'assistantPermissions', v_hub."assistantPermissions");
END;
$function$;

REVOKE ALL ON FUNCTION public.set_assistant_permissions(UUID, TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_assistant_permissions(UUID, TEXT[]) TO anon, authenticated;

-- ── 9. build_hub_view — shared JSON builder for get_my_hub/get_my_hubs/ ─────
-- get_hub_view. Internal only (see design note #1 at the top): REVOKE ALL
-- FROM PUBLIC, no anon/authenticated grant.
CREATE OR REPLACE FUNCTION public.build_hub_view(p_hub_id UUID, p_cohort_id UUID, p_actor_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_hub public."SupportHub";
  v_is_lead BOOLEAN;
  v_is_assistant BOOLEAN;
  v_is_it_support BOOLEAN;
  v_can_meeting BOOLEAN;
  v_can_attendance BOOLEAN;
  v_can_message BOOLEAN;
  v_show_acks BOOLEAN;
  v_my_jobs TEXT[];
  v_result JSON;
BEGIN
  SELECT * INTO v_hub FROM public."SupportHub" WHERE id = p_hub_id;
  IF v_hub.id IS NULL THEN
    RETURN NULL;
  END IF;

  v_is_lead := (v_hub."leadUserId" = p_actor_id);
  v_is_assistant := (v_hub."assistantLeadUserId" = p_actor_id);
  v_is_it_support := EXISTS (SELECT 1 FROM public."HubItSupport" WHERE "hubId" = p_hub_id AND "userId" = p_actor_id);

  v_can_meeting := v_is_lead OR (v_is_assistant AND 'MEETING' = ANY(COALESCE(v_hub."assistantPermissions", ARRAY[]::TEXT[])));
  v_can_attendance := v_is_lead OR (v_is_assistant AND 'ATTENDANCE' = ANY(COALESCE(v_hub."assistantPermissions", ARRAY[]::TEXT[])));
  v_can_message := v_is_lead OR (v_is_assistant AND 'MESSAGE' = ANY(COALESCE(v_hub."assistantPermissions", ARRAY[]::TEXT[])));
  v_show_acks := v_is_lead OR v_is_assistant OR public.app_is_admin();

  v_my_jobs := array_remove(ARRAY[
    CASE WHEN v_is_lead THEN 'HUB_LEAD' END,
    CASE WHEN v_is_assistant THEN 'ASSISTANT_HUB_LEAD' END,
    CASE WHEN v_hub."recapLeadUserId" = p_actor_id THEN 'RECAP_LEAD' END,
    CASE WHEN v_hub."prayerLeadUserId" = p_actor_id THEN 'PRAYER_LEAD' END,
    CASE WHEN v_is_it_support THEN 'IT_SUPPORT' END
  ], NULL);

  SELECT json_build_object(
    'hub', json_build_object(
      'id', v_hub.id, 'name', v_hub.name, 'cohortId', v_hub."cohortId",
      'leadUserId', v_hub."leadUserId", 'leadName', (SELECT name FROM public."User" WHERE id = v_hub."leadUserId"),
      'assistantLeadUserId', v_hub."assistantLeadUserId", 'assistantLeadName', (SELECT name FROM public."User" WHERE id = v_hub."assistantLeadUserId"),
      'assistantPermissions', to_json(v_hub."assistantPermissions"),
      'recapLeadUserId', v_hub."recapLeadUserId", 'recapLeadName', (SELECT name FROM public."User" WHERE id = v_hub."recapLeadUserId"),
      'prayerLeadUserId', v_hub."prayerLeadUserId", 'prayerLeadName', (SELECT name FROM public."User" WHERE id = v_hub."prayerLeadUserId"),
      'meetingDay', v_hub."meetingDay", 'meetingTime', v_hub."meetingTime", 'meetingDurationMins', v_hub."meetingDurationMins",
      'callPlatform', v_hub."callPlatform", 'callLink', v_hub."callLink",
      'itSupports', COALESCE((
        SELECT json_agg(json_build_object('userId', u.id, 'name', u.name) ORDER BY u.name)
        FROM public."HubItSupport" hi JOIN public."User" u ON u.id = hi."userId"
        WHERE hi."hubId" = v_hub.id
      ), '[]'::json)
    ),
    'isLead', v_is_lead,
    'isAssistant', v_is_assistant,
    'isItSupport', v_is_it_support,
    'canMeeting', v_can_meeting,
    'canAttendance', v_can_attendance,
    'canMessage', v_can_message,
    'myJobs', to_json(v_my_jobs),
    'unseenIntroJobs', to_json(COALESCE((
      SELECT array_agg(j) FROM unnest(v_my_jobs) j
      WHERE j NOT IN (SELECT job FROM public."HubRoleIntroSeen" WHERE "userId" = p_actor_id AND "hubId" = v_hub.id)
    ), ARRAY[]::TEXT[])),
    'members', COALESCE((
      SELECT json_agg(json_build_object(
        'userId', u.id,
        'name', u.name,
        'phone', u.phone,
        'isLead', (u.id = v_hub."leadUserId"),
        'groupName', (SELECT g.name FROM public."Group" g WHERE g."supportId" = u.id AND g."cohortId" = p_cohort_id AND g."archivedAt" IS NULL ORDER BY g.name LIMIT 1),
        'jobs', to_json(array_remove(ARRAY[
          CASE WHEN u.id = v_hub."leadUserId" THEN 'HUB_LEAD' END,
          CASE WHEN u.id = v_hub."assistantLeadUserId" THEN 'ASSISTANT_HUB_LEAD' END,
          CASE WHEN u.id = v_hub."recapLeadUserId" THEN 'RECAP_LEAD' END,
          CASE WHEN u.id = v_hub."prayerLeadUserId" THEN 'PRAYER_LEAD' END
        ], NULL))
      ) ORDER BY u.name)
      FROM public."HubMembership" m
      JOIN public."User" u ON u.id = m."userId"
      WHERE m."hubId" = v_hub.id
    ), '[]'::json),
    'messages', COALESCE((
      SELECT json_agg(json_build_object(
        'id', msg.id, 'subject', msg.subject, 'body', msg.body,
        'authorId', msg."authorId", 'authorName', author.name,
        'createdAt', msg."createdAt", 'editedAt', msg."editedAt",
        'ackedByMe', EXISTS (SELECT 1 FROM public."HubMessageAck" a WHERE a."messageId" = msg.id AND a."userId" = p_actor_id),
        'ackCount', (SELECT COUNT(*) FROM public."HubMessageAck" a WHERE a."messageId" = msg.id),
        'memberCount', (SELECT COUNT(*) FROM public."HubMembership" m WHERE m."hubId" = v_hub.id AND m."userId" <> p_actor_id),
        'ackedUserIds', CASE WHEN v_show_acks THEN (
          SELECT COALESCE(json_agg(a."userId"), '[]'::json) FROM public."HubMessageAck" a WHERE a."messageId" = msg.id
        ) ELSE NULL END
      ) ORDER BY msg."createdAt" DESC)
      FROM public."HubMessage" msg
      LEFT JOIN public."User" author ON author.id = msg."authorId"
      WHERE msg."hubId" = v_hub.id
    ), '[]'::json),
    'myAttendance', COALESCE((
      SELECT json_agg(json_build_object(
        'sessionId', s.id, 'type', s.type, 'title', s.title, 'sessionDate', s."sessionDate",
        'weekId', s."weekId", 'status', a.status, 'notes', s.notes, 'submittedAt', s."submittedAt"
      ) ORDER BY s."sessionDate" DESC)
      FROM public."SupportSessionAttendance" a
      JOIN public."SupportSession" s ON s.id = a."sessionId"
      WHERE a."userId" = p_actor_id AND s."cohortId" = p_cohort_id
    ), '[]'::json)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.build_hub_view(UUID, UUID, UUID) FROM PUBLIC;

-- ── 10. get_my_hub — same signature as 20260925030000 #6, now falling back ──
-- to an IT-support hub (first by name) when the caller has no HubMembership.
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
    -- Operational support with no HubMembership: fall back to the first (by
    -- name) hub they IT-support in this cohort. A support covering 2+ hubs
    -- should use get_my_hubs/get_hub_view for the full list.
    SELECT h.id INTO v_hub_id
    FROM public."HubItSupport" hi
    JOIN public."SupportHub" h ON h.id = hi."hubId"
    WHERE hi."userId" = v_actor_id AND h."cohortId" = p_cohort_id
    ORDER BY h.name
    LIMIT 1;
  END IF;

  IF v_hub_id IS NULL THEN
    RETURN json_build_object(
      'hub', NULL, 'isLead', FALSE, 'isAssistant', FALSE, 'isItSupport', FALSE,
      'canMeeting', FALSE, 'canAttendance', FALSE, 'canMessage', FALSE,
      'myJobs', '[]'::json, 'unseenIntroJobs', '[]'::json,
      'members', '[]'::json, 'messages', '[]'::json, 'myAttendance', '[]'::json
    );
  END IF;

  SELECT public.build_hub_view(v_hub_id, p_cohort_id, v_actor_id) INTO v_result;
  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_my_hub(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_hub(UUID) TO anon, authenticated;

-- ── 11. get_my_hubs — every hub the caller belongs to or IT-supports, in ────
-- one cohort. New.
CREATE OR REPLACE FUNCTION public.get_my_hubs(p_cohort_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_id UUID;
  v_result JSON;
BEGIN
  IF NOT public.app_is_staff() THEN
    RAISE EXCEPTION 'You must be signed in as a support or admin';
  END IF;
  v_actor_id := public.app_current_user_id();

  SELECT COALESCE(json_agg(public.build_hub_view(h.id, p_cohort_id, v_actor_id) ORDER BY h.name), '[]'::json)
  INTO v_result
  FROM public."SupportHub" h
  WHERE h."cohortId" = p_cohort_id
    AND (
      EXISTS (SELECT 1 FROM public."HubMembership" m WHERE m."hubId" = h.id AND m."userId" = v_actor_id)
      OR EXISTS (SELECT 1 FROM public."HubItSupport" hi WHERE hi."hubId" = h.id AND hi."userId" = v_actor_id)
    );

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_my_hubs(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_hubs(UUID) TO anon, authenticated;

-- ── 12. get_hub_view — one hub by id, for a member/IT-support/admin. New. ───
CREATE OR REPLACE FUNCTION public.get_hub_view(p_hub_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_id UUID;
  v_hub public."SupportHub";
  v_result JSON;
BEGIN
  IF NOT public.app_is_staff() THEN
    RAISE EXCEPTION 'You must be signed in as a support or admin';
  END IF;
  v_actor_id := public.app_current_user_id();

  SELECT * INTO v_hub FROM public."SupportHub" WHERE id = p_hub_id;
  IF v_hub.id IS NULL THEN
    RAISE EXCEPTION 'Hub was not found';
  END IF;

  IF NOT public.app_is_admin() THEN
    IF NOT EXISTS (SELECT 1 FROM public."HubMembership" m WHERE m."hubId" = p_hub_id AND m."userId" = v_actor_id)
      AND NOT EXISTS (SELECT 1 FROM public."HubItSupport" hi WHERE hi."hubId" = p_hub_id AND hi."userId" = v_actor_id)
    THEN
      RAISE EXCEPTION 'You must be a member, IT support, or admin to view this hub';
    END IF;
  END IF;

  SELECT public.build_hub_view(p_hub_id, v_hub."cohortId", v_actor_id) INTO v_result;
  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_hub_view(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_hub_view(UUID) TO anon, authenticated;

-- ── 13. hub_prayer_list — approved + shared faith projects for a hub's ──────
-- members' groups. Caller must be a member, IT support, or admin.
CREATE OR REPLACE FUNCTION public.hub_prayer_list(p_hub_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_id UUID;
  v_result JSON;
BEGIN
  IF NOT public.app_is_staff() THEN
    RAISE EXCEPTION 'You must be signed in as a support or admin';
  END IF;
  v_actor_id := public.app_current_user_id();

  IF NOT public.app_is_admin() THEN
    IF NOT EXISTS (SELECT 1 FROM public."HubMembership" m WHERE m."hubId" = p_hub_id AND m."userId" = v_actor_id)
      AND NOT EXISTS (SELECT 1 FROM public."HubItSupport" hi WHERE hi."hubId" = p_hub_id AND hi."userId" = v_actor_id)
    THEN
      RAISE EXCEPTION 'You must be a member, IT support, or admin of this hub to see its prayer list';
    END IF;
  END IF;

  SELECT COALESCE(json_agg(json_build_object(
    'participantId', p.id,
    'fullName', p."fullName",
    'groupName', g.name,
    'supportName', support.name,
    'body', f.body,
    'categoryName', cat.name
  ) ORDER BY p."fullName"), '[]'::json)
  INTO v_result
  FROM public."FaithProject" f
  JOIN public."Participant" p ON p.id = f."participantId"
  JOIN public."GroupParticipant" gp ON gp."participantId" = p.id
  JOIN public."Group" g ON g.id = gp."groupId" AND g."archivedAt" IS NULL
  JOIN public."HubMembership" hm ON hm."userId" = g."supportId" AND hm."hubId" = p_hub_id
  LEFT JOIN public."User" support ON support.id = g."supportId"
  LEFT JOIN public."FaithProjectCategory" cat ON cat.id = f."categoryId"
  WHERE f.status = 'APPROVED' AND f."sharedForPrayer" IS TRUE;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.hub_prayer_list(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hub_prayer_list(UUID) TO anon, authenticated;

-- ── 14. submit_hub_meeting / reopen_hub_meeting — the hub's Sunday-recap ────
-- meeting notes, upserted/reopened the same way mark_support_attendance
-- finds-or-creates the session. Requires ATTENDANCE permission or admin.
CREATE OR REPLACE FUNCTION public.submit_hub_meeting(p_hub_id UUID, p_week_id INTEGER, p_notes TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_id UUID;
  v_hub public."SupportHub";
  v_week public."Week";
  v_session public."SupportSession";
BEGIN
  IF NOT public.app_is_staff() THEN
    RAISE EXCEPTION 'You must be signed in as a support or admin';
  END IF;
  v_actor_id := public.app_current_user_id();

  IF NOT public.app_is_admin() AND NOT public.app_hub_can(p_hub_id, 'ATTENDANCE') THEN
    RAISE EXCEPTION 'Only this hub''s lead, its assistant lead, or an admin can submit its meeting';
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

  UPDATE public."SupportSession"
  SET notes = NULLIF(BTRIM(COALESCE(p_notes, '')), ''),
      "submittedAt" = NOW(),
      "submittedById" = v_actor_id
  WHERE "hubId" = p_hub_id AND "weekId" = p_week_id
  RETURNING * INTO v_session;

  RETURN jsonb_build_object(
    'sessionId', v_session.id, 'hubId', v_session."hubId", 'weekId', v_session."weekId",
    'notes', v_session.notes, 'submittedAt', v_session."submittedAt", 'submittedById', v_session."submittedById"
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.submit_hub_meeting(UUID, INTEGER, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_hub_meeting(UUID, INTEGER, TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.reopen_hub_meeting(p_hub_id UUID, p_week_id INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_id UUID;
  v_session public."SupportSession";
BEGIN
  IF NOT public.app_is_staff() THEN
    RAISE EXCEPTION 'You must be signed in as a support or admin';
  END IF;
  v_actor_id := public.app_current_user_id();

  IF NOT public.app_is_admin() AND NOT public.app_hub_can(p_hub_id, 'ATTENDANCE') THEN
    RAISE EXCEPTION 'Only this hub''s lead, its assistant lead, or an admin can reopen its meeting';
  END IF;

  UPDATE public."SupportSession"
  SET "submittedAt" = NULL
  WHERE "hubId" = p_hub_id AND "weekId" = p_week_id AND type = 'SUNDAY_RECAP'
  RETURNING * INTO v_session;

  IF v_session.id IS NULL THEN
    RAISE EXCEPTION 'No meeting record was found for this week';
  END IF;

  RETURN jsonb_build_object('sessionId', v_session.id, 'hubId', v_session."hubId", 'weekId', v_session."weekId", 'submittedAt', v_session."submittedAt");
END;
$function$;

REVOKE ALL ON FUNCTION public.reopen_hub_meeting(UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reopen_hub_meeting(UUID, INTEGER) TO anon, authenticated;
