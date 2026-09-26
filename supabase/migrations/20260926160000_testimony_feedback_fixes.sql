-- Review feedback fixes for the Faith Project Testimonies feature
-- (20260926090000_faith_help_testimonies.sql / commit cb56589).
--
-- 1. "Just my support" testimonies never told the support -- submit_testimony
--    and update_testimony now also resolve and return the participant's
--    current supportId (same GroupParticipant -> Group lookup
--    submit_faith_help_request already uses), so the frontend can bell+push
--    them exactly like the FAITH_HELP mechanism does.
--
-- 2. Editing was only allowed while a testimony was still PENDING, so a
--    SUPPORT-visibility one (born APPROVED) could never be edited at all.
--    update_testimony (and its ownership check) now also allows editing an
--    APPROVED testimony: staying on SUPPORT keeps it APPROVED ("Shared"),
--    moving to GROUP/COHORT sends it back to PENDING for re-approval -- the
--    status computation already did this, only the WHERE clause was too
--    strict. HIDDEN stays non-editable (a moderation outcome). delete_testimony
--    is unchanged (still PENDING-only, matching the UI's Delete button).
--
-- 3. Testimony gets viewedAt/viewedById so the support app can show a "New
--    testimony" pill until they open the participant's card, then clear it
--    with a plain update() -- staff already have full read/write via the
--    existing "Staff can manage testimonies" RLS policy, so no new policy or
--    RPC is needed for this.
--
-- Additive and idempotent. Not yet applied to the live database.

-- ── 1. Testimony: viewed tracking ───────────────────────────────────────────

ALTER TABLE "Testimony" ADD COLUMN IF NOT EXISTS "viewedAt" TIMESTAMPTZ;
ALTER TABLE "Testimony" ADD COLUMN IF NOT EXISTS "viewedById" UUID REFERENCES "User"(id) ON DELETE SET NULL;

-- ── 2. submit_testimony: also resolve + return the participant's supportId ──

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
  v_support_id UUID;
  v_body TEXT := NULLIF(trim(COALESCE(p_body, '')), '');
  v_status TEXT;
  v_row "Testimony";
BEGIN
  IF person_id IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  IF v_body IS NULL THEN RAISE EXCEPTION 'BODY_REQUIRED'; END IF;
  IF p_visibility NOT IN ('SUPPORT', 'GROUP', 'COHORT') THEN RAISE EXCEPTION 'INVALID_VISIBILITY'; END IF;

  SELECT "cohortId" INTO my_cohort_id FROM "Participant" WHERE id = person_id;
  SELECT gp."groupId", g."supportId" INTO my_group_id, v_support_id
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
    'status', v_row.status, 'createdAt', v_row."createdAt", 'updatedAt', v_row."updatedAt",
    'supportId', v_support_id
  );
END;
$$;

-- Grants unchanged by CREATE OR REPLACE (same signature as before).

-- ── 3. update_testimony: editable once APPROVED too, and also returns supportId ─

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
  my_cohort_id UUID;
  v_support_id UUID;
  v_body TEXT := NULLIF(trim(COALESCE(p_body, '')), '');
  v_status TEXT;
  v_row "Testimony";
BEGIN
  IF person_id IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  IF v_body IS NULL THEN RAISE EXCEPTION 'BODY_REQUIRED'; END IF;
  IF p_visibility NOT IN ('SUPPORT', 'GROUP', 'COHORT') THEN RAISE EXCEPTION 'INVALID_VISIBILITY'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM "Testimony" WHERE id = p_id AND "participantId" = person_id AND status IN ('PENDING', 'APPROVED')
  ) THEN
    RAISE EXCEPTION 'NOT_EDITABLE';
  END IF;

  SELECT "cohortId" INTO my_cohort_id FROM "Participant" WHERE id = person_id;
  SELECT g."supportId" INTO v_support_id
  FROM "GroupParticipant" gp
  JOIN "Group" g ON g.id = gp."groupId" AND g."cohortId" = my_cohort_id
  WHERE gp."participantId" = person_id
  LIMIT 1;

  v_status := CASE WHEN p_visibility = 'SUPPORT' THEN 'APPROVED' ELSE 'PENDING' END;

  UPDATE "Testimony"
  SET title = NULLIF(trim(COALESCE(p_title, '')), ''),
      body = v_body,
      visibility = p_visibility,
      status = v_status,
      "reviewedById" = NULL,
      "reviewedAt" = CASE WHEN v_status = 'APPROVED' THEN NOW() ELSE NULL END,
      "viewedAt" = NULL,
      "viewedById" = NULL,
      "updatedAt" = NOW()
  WHERE id = p_id
  RETURNING * INTO v_row;

  RETURN json_build_object(
    'id', v_row.id, 'title', v_row.title, 'body', v_row.body, 'visibility', v_row.visibility,
    'status', v_row.status, 'createdAt', v_row."createdAt", 'updatedAt', v_row."updatedAt",
    'supportId', v_support_id
  );
END;
$$;

-- Grants unchanged by CREATE OR REPLACE (same signature as before).
