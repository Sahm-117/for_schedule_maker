-- Roadmap step 4: Faith Project "not going well" help, and Testimonies.
--
-- Two new tables, both staff-tier like FaithProject (20260919_faith_projects /
-- 20260918040000_staff_only_meetings_attendance.sql): support and admin read
-- and write them directly through supabase.from(), gated by app_is_staff();
-- the participant never touches either table directly. All participant
-- reads/writes go through SECURITY DEFINER RPCs owned by postgres, same
-- shape as participant_faith/save_faith_project.
--
-- FaithHelpRequest: a participant whose faith project is APPROVED can tell us
-- it "is not going well" -- pick a reason, add an optional note, and choose
-- whether to ask their support to reach out. Support sees it on the
-- participant's card and can mark it resolved.
--
-- Testimony: a participant can share a testimony with just their support (no
-- review needed), their group, or their whole cohort (both need admin
-- approval before anyone else sees them). Approved group/cohort testimonies
-- show in every other participant's "From your group & cohort" feed.
--
-- Notifications, same mechanism existing alerts use:
--  - Help request with wantsContact -> the participant's support: bell + push
--    (frontend calls notify-users after submit_faith_help_request returns
--    supportId, same pattern saveFaithProject/submitWrapUp already use).
--  - New GROUP/COHORT testimony (status PENDING) -> admins: bell + push
--    (frontend calls notifyAdmins after submit_testimony/update_testimony,
--    same pattern faithProjectsApi.raise already uses for PARTICIPANT_FLAG).
--  - Approved testimony -> the participant: bell only, written directly into
--    ParticipantNotification (locked, SECURITY DEFINER bypasses it) by
--    review_testimony. No push -- nothing here needs a function deploy.
--
-- Additive and idempotent. Not yet applied to the live database.

-- ── 1. FaithHelpRequest ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "FaithHelpRequest" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "participantId" UUID NOT NULL REFERENCES "Participant"(id) ON DELETE CASCADE,
  "faithProjectId" UUID REFERENCES "FaithProject"(id) ON DELETE SET NULL,
  reason TEXT NOT NULL CHECK (reason IN ('LOST_MOTIVATION', 'SITUATION_CHANGED', 'UNSURE_NEXT', 'NO_TIME', 'OTHER')),
  note TEXT,
  "wantsContact" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "resolvedAt" TIMESTAMPTZ,
  "resolvedById" UUID REFERENCES "User"(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_faithhelprequest_participant ON "FaithHelpRequest"("participantId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_faithhelprequest_open ON "FaithHelpRequest"("createdAt" DESC) WHERE "resolvedAt" IS NULL;

ALTER TABLE "FaithHelpRequest" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff can manage faith help requests" ON "FaithHelpRequest";
CREATE POLICY "Staff can manage faith help requests" ON "FaithHelpRequest"
  FOR ALL USING (public.app_is_staff()) WITH CHECK (public.app_is_staff());
GRANT SELECT, INSERT, UPDATE, DELETE ON "FaithHelpRequest" TO anon, authenticated;

-- ── 2. Testimony ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "Testimony" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "participantId" UUID NOT NULL REFERENCES "Participant"(id) ON DELETE CASCADE,
  "cohortId" UUID NOT NULL REFERENCES "Cohort"(id) ON DELETE CASCADE,
  "groupId" UUID REFERENCES "Group"(id) ON DELETE SET NULL,
  title TEXT,
  body TEXT NOT NULL CHECK (length(trim(body)) > 0),
  visibility TEXT NOT NULL DEFAULT 'SUPPORT' CHECK (visibility IN ('SUPPORT', 'GROUP', 'COHORT')),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'HIDDEN')),
  "reviewedById" UUID REFERENCES "User"(id) ON DELETE SET NULL,
  "reviewedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_testimony_participant ON "Testimony"("participantId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_testimony_group_feed ON "Testimony"("groupId", status) WHERE visibility = 'GROUP';
CREATE INDEX IF NOT EXISTS idx_testimony_cohort_feed ON "Testimony"("cohortId", status) WHERE visibility = 'COHORT';
CREATE INDEX IF NOT EXISTS idx_testimony_pending ON "Testimony"(status, "createdAt" DESC) WHERE status = 'PENDING';

ALTER TABLE "Testimony" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff can manage testimonies" ON "Testimony";
CREATE POLICY "Staff can manage testimonies" ON "Testimony"
  FOR ALL USING (public.app_is_staff()) WITH CHECK (public.app_is_staff());
GRANT SELECT, INSERT, UPDATE, DELETE ON "Testimony" TO anon, authenticated;

-- ── 3. participant_faith: add openHelpRequest ───────────────────────────────
-- Identical to 20260920210000_mark_faith_replies_read_on_view.sql's version
-- except for the new 'openHelpRequest' field, so the Faith Project page can
-- show "we've told your support" instead of the prompt again while one is
-- unresolved.

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
      SELECT json_build_object('id', f.id, 'body', f.body, 'status', f.status, 'updatedAt', f."updatedAt")
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

-- Grants unchanged by CREATE OR REPLACE (same signature as before), so no
-- GRANT/REVOKE needed here.

-- ── 4. Participant: submit_faith_help_request ───────────────────────────────
-- Returns the assigned support's userId so the frontend can push+bell them
-- when the participant asked to be contacted, same pattern saveFaithProject
-- already uses for FAITH_PROJECT_SUBMITTED.

CREATE OR REPLACE FUNCTION public.submit_faith_help_request(
  p_token TEXT,
  p_reason TEXT,
  p_note TEXT,
  p_wants_contact BOOLEAN
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  person_id UUID := public.app_participant_id(p_token);
  v_faith_project_id UUID;
  v_support_id UUID;
  v_id UUID;
BEGIN
  IF person_id IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  IF p_reason NOT IN ('LOST_MOTIVATION', 'SITUATION_CHANGED', 'UNSURE_NEXT', 'NO_TIME', 'OTHER') THEN
    RAISE EXCEPTION 'INVALID_REASON';
  END IF;

  SELECT id INTO v_faith_project_id FROM "FaithProject" WHERE "participantId" = person_id ORDER BY "updatedAt" DESC LIMIT 1;

  SELECT g."supportId" INTO v_support_id
  FROM "GroupParticipant" gp
  JOIN "Group" g ON g.id = gp."groupId"
  WHERE gp."participantId" = person_id
  LIMIT 1;

  INSERT INTO "FaithHelpRequest" ("participantId", "faithProjectId", reason, note, "wantsContact")
  VALUES (person_id, v_faith_project_id, p_reason, NULLIF(trim(COALESCE(p_note, '')), ''), COALESCE(p_wants_contact, FALSE))
  RETURNING id INTO v_id;

  RETURN json_build_object('id', v_id, 'supportId', v_support_id);
END;
$$;

REVOKE ALL ON FUNCTION public.submit_faith_help_request(TEXT, TEXT, TEXT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_faith_help_request(TEXT, TEXT, TEXT, BOOLEAN) TO anon, authenticated;

-- ── 5. Participant: testimonies (read own + the group/cohort feed) ─────────

CREATE OR REPLACE FUNCTION public.participant_testimonies(p_token TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  person_id UUID := public.app_participant_id(p_token);
  my_cohort_id UUID;
  my_group_id UUID;
BEGIN
  IF person_id IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;

  SELECT "cohortId" INTO my_cohort_id FROM "Participant" WHERE id = person_id;
  SELECT gp."groupId" INTO my_group_id
  FROM "GroupParticipant" gp
  JOIN "Group" g ON g.id = gp."groupId" AND g."cohortId" = my_cohort_id
  WHERE gp."participantId" = person_id
  LIMIT 1;

  RETURN json_build_object(
    'mine', COALESCE((
      SELECT json_agg(json_build_object(
        'id', t.id, 'title', t.title, 'body', t.body, 'visibility', t.visibility, 'status', t.status,
        'createdAt', t."createdAt", 'updatedAt', t."updatedAt"
      ) ORDER BY t."createdAt" DESC)
      FROM "Testimony" t WHERE t."participantId" = person_id
    ), '[]'::json),
    'feed', COALESCE((
      SELECT json_agg(json_build_object(
        'id', t.id, 'title', t.title, 'body', t.body, 'visibility', t.visibility,
        'participantName', split_part(p2."fullName", ' ', 1), 'avatarUrl', p2."avatarUrl",
        'createdAt', t."createdAt"
      ) ORDER BY t."createdAt" DESC)
      FROM "Testimony" t
      JOIN "Participant" p2 ON p2.id = t."participantId"
      WHERE t.status = 'APPROVED' AND t."participantId" <> person_id
        AND (
          (t.visibility = 'GROUP' AND my_group_id IS NOT NULL AND t."groupId" = my_group_id)
          OR (t.visibility = 'COHORT' AND t."cohortId" = my_cohort_id)
        )
    ), '[]'::json)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.participant_testimonies(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.participant_testimonies(TEXT) TO anon, authenticated;

-- ── 6. Participant: submit_testimony ────────────────────────────────────────
-- SUPPORT visibility needs no review, so it is born APPROVED; GROUP/COHORT
-- are born PENDING for an admin to approve before they reach the feed.

CREATE OR REPLACE FUNCTION public.submit_testimony(
  p_token TEXT,
  p_title TEXT,
  p_body TEXT,
  p_visibility TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  person_id UUID := public.app_participant_id(p_token);
  my_cohort_id UUID;
  my_group_id UUID;
  v_body TEXT := NULLIF(trim(COALESCE(p_body, '')), '');
  v_status TEXT;
  v_row "Testimony";
BEGIN
  IF person_id IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  IF v_body IS NULL THEN RAISE EXCEPTION 'BODY_REQUIRED'; END IF;
  IF p_visibility NOT IN ('SUPPORT', 'GROUP', 'COHORT') THEN RAISE EXCEPTION 'INVALID_VISIBILITY'; END IF;

  SELECT "cohortId" INTO my_cohort_id FROM "Participant" WHERE id = person_id;
  SELECT gp."groupId" INTO my_group_id
  FROM "GroupParticipant" gp
  JOIN "Group" g ON g.id = gp."groupId" AND g."cohortId" = my_cohort_id
  WHERE gp."participantId" = person_id
  LIMIT 1;

  v_status := CASE WHEN p_visibility = 'SUPPORT' THEN 'APPROVED' ELSE 'PENDING' END;

  INSERT INTO "Testimony" ("participantId", "cohortId", "groupId", title, body, visibility, status, "reviewedAt")
  VALUES (
    person_id, my_cohort_id, my_group_id, NULLIF(trim(COALESCE(p_title, '')), ''), v_body, p_visibility, v_status,
    CASE WHEN v_status = 'APPROVED' THEN NOW() END
  )
  RETURNING * INTO v_row;

  RETURN json_build_object(
    'id', v_row.id, 'title', v_row.title, 'body', v_row.body, 'visibility', v_row.visibility,
    'status', v_row.status, 'createdAt', v_row."createdAt", 'updatedAt', v_row."updatedAt"
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_testimony(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_testimony(TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;

-- ── 7. Participant: update_testimony / delete_testimony ────────────────────
-- Only while still PENDING (a SUPPORT-visibility testimony is born APPROVED,
-- so it is never editable -- matches "Shared" being a final state in the UI).

CREATE OR REPLACE FUNCTION public.update_testimony(
  p_token TEXT,
  p_id UUID,
  p_title TEXT,
  p_body TEXT,
  p_visibility TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  person_id UUID := public.app_participant_id(p_token);
  v_body TEXT := NULLIF(trim(COALESCE(p_body, '')), '');
  v_status TEXT;
  v_row "Testimony";
BEGIN
  IF person_id IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  IF v_body IS NULL THEN RAISE EXCEPTION 'BODY_REQUIRED'; END IF;
  IF p_visibility NOT IN ('SUPPORT', 'GROUP', 'COHORT') THEN RAISE EXCEPTION 'INVALID_VISIBILITY'; END IF;

  IF NOT EXISTS (SELECT 1 FROM "Testimony" WHERE id = p_id AND "participantId" = person_id AND status = 'PENDING') THEN
    RAISE EXCEPTION 'NOT_EDITABLE';
  END IF;

  v_status := CASE WHEN p_visibility = 'SUPPORT' THEN 'APPROVED' ELSE 'PENDING' END;

  UPDATE "Testimony"
  SET title = NULLIF(trim(COALESCE(p_title, '')), ''),
      body = v_body,
      visibility = p_visibility,
      status = v_status,
      "reviewedById" = NULL,
      "reviewedAt" = CASE WHEN v_status = 'APPROVED' THEN NOW() ELSE NULL END,
      "updatedAt" = NOW()
  WHERE id = p_id
  RETURNING * INTO v_row;

  RETURN json_build_object(
    'id', v_row.id, 'title', v_row.title, 'body', v_row.body, 'visibility', v_row.visibility,
    'status', v_row.status, 'createdAt', v_row."createdAt", 'updatedAt', v_row."updatedAt"
  );
END;
$$;

REVOKE ALL ON FUNCTION public.update_testimony(TEXT, UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_testimony(TEXT, UUID, TEXT, TEXT, TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.delete_testimony(p_token TEXT, p_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  person_id UUID := public.app_participant_id(p_token);
BEGIN
  IF person_id IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;

  DELETE FROM "Testimony" WHERE id = p_id AND "participantId" = person_id AND status = 'PENDING';
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_EDITABLE'; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_testimony(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_testimony(TEXT, UUID) TO anon, authenticated;

-- ── 8. Staff: review_testimony (admin approve/hide) ─────────────────────────
-- Bell-only for the participant (no push needed here) -- written straight
-- into the locked ParticipantNotification table, which this SECURITY DEFINER
-- function (owned by postgres) can reach regardless of its REVOKE ALL.

CREATE OR REPLACE FUNCTION public.review_testimony(p_id UUID, p_status TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_actor_id UUID;
  v_row "Testimony";
BEGIN
  IF NOT public.app_is_staff() THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  IF p_status NOT IN ('APPROVED', 'HIDDEN') THEN RAISE EXCEPTION 'INVALID_STATUS'; END IF;
  v_actor_id := public.app_current_user_id();

  UPDATE "Testimony"
  SET status = p_status, "reviewedById" = v_actor_id, "reviewedAt" = NOW(), "updatedAt" = NOW()
  WHERE id = p_id
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;

  IF p_status = 'APPROVED' THEN
    INSERT INTO "ParticipantNotification" ("participantId", title, body, path, type)
    VALUES (
      v_row."participantId",
      'Your testimony has been shared',
      'It is now visible to the people you chose to share it with.',
      '/me/journey?tab=testimonies',
      'TESTIMONY_APPROVED'
    );
  END IF;

  RETURN json_build_object(
    'id', v_row.id, 'title', v_row.title, 'body', v_row.body, 'visibility', v_row.visibility,
    'status', v_row.status, 'participantId', v_row."participantId",
    'reviewedById', v_row."reviewedById", 'reviewedAt', v_row."reviewedAt",
    'createdAt', v_row."createdAt", 'updatedAt', v_row."updatedAt"
  );
END;
$$;

REVOKE ALL ON FUNCTION public.review_testimony(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_testimony(UUID, TEXT) TO anon, authenticated;
