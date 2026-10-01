-- Automatic reassignment of quiet supports' follow-ups.
--
-- Flow (all times are rolling, checked every 10 minutes by run-followup-assignment):
--  1. A support who has held someone for 24h without moving them (no status change since they
--     were assigned, no issue logged) gets a check: "Are you actively following up?".
--  2. "Yes, I am" gives one more 24h. "Not right now" counts as stepping aside straight away.
--     No answer within 24h counts the same.
--  3. When a check is due, the people still unmoved go to a support who moved someone (a status
--     change, or got them to Logged in) in the last 7 days: same gender, under the limit,
--     fewest open first. People they already moved stay with them.
--  4. A support just reassigned away from (or with an open check) is skipped by auto-assign
--     until they move someone, so people are not handed straight back.
-- Switch: AppSetting 'followup_auto_reassign_enabled' (missing = on). Clocks start from
-- 'followup_auto_reassign_since' (set when this migration is applied), so nobody is penalised
-- for time before the feature existed. Admins can still move people by hand.

INSERT INTO "AppSetting" ("settingKey", value, "updatedAt")
VALUES ('followup_auto_reassign_since', to_jsonb(now()::text), now())
ON CONFLICT ("settingKey") DO NOTHING;

CREATE TABLE IF NOT EXISTS "FollowUpOwnerCheck" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "ownerId" UUID NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "promptedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "deadlineAt" TIMESTAMPTZ NOT NULL,
  answer TEXT CHECK (answer IN ('YES', 'NOT_NOW')),
  "answeredAt" TIMESTAMPTZ,
  extended BOOLEAN NOT NULL DEFAULT FALSE,
  "closedAt" TIMESTAMPTZ,
  "closedReason" TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_followup_owner_check_open ON "FollowUpOwnerCheck" ("ownerId") WHERE "closedAt" IS NULL;
ALTER TABLE "FollowUpOwnerCheck" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "FollowUpOwnerCheck" FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS "FollowUpReassignmentLog" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "contactId" UUID NOT NULL REFERENCES "FollowUpContact"(id) ON DELETE CASCADE,
  "fromUserId" UUID REFERENCES "User"(id) ON DELETE SET NULL,
  "toUserId" UUID REFERENCES "User"(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_followup_reassignment_created ON "FollowUpReassignmentLog" ("createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_followup_reassignment_from ON "FollowUpReassignmentLog" ("fromUserId", "createdAt" DESC);
ALTER TABLE "FollowUpReassignmentLog" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "FollowUpReassignmentLog" FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.followup_reassign_enabled()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT COALESCE((SELECT value <> to_jsonb(false) FROM "AppSetting" WHERE "settingKey" = 'followup_auto_reassign_enabled'), TRUE);
$$;

CREATE OR REPLACE FUNCTION public.followup_reassign_since()
RETURNS TIMESTAMPTZ
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT COALESCE((SELECT (value #>> '{}')::timestamptz FROM "AppSetting" WHERE "settingKey" = 'followup_auto_reassign_since'), now());
$$;

-- People a support has held 24h (counting from the later of: when they were assigned, when
-- this feature started) without moving them or logging an issue. Open, real, reachable
-- contacts of real, active supports only.
CREATE OR REPLACE FUNCTION public.followup_stale_contacts()
RETURNS SETOF "FollowUpContact"
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT c.*
  FROM "FollowUpContact" c
  JOIN "User" u ON u.id = c."ownerId"
  WHERE c."archivedAt" IS NULL
    AND c."isTest" IS NOT TRUE
    AND u.role = 'SUPPORT' AND u."isTest" IS NOT TRUE AND u."isActive" IS NOT FALSE
    AND c."nextAction" IS DISTINCT FROM 'CLOSE'
    AND c."registrationStatus" NOT IN ('ACCESS_CONFIRMED', 'LOGIN_SHARED', 'NOT_INTERESTED', 'NOT_A_GOOD_TIME', 'NOT_A_TCN_MEMBER', 'NO_RESPONSE', 'ATTENDED', 'NEXT_COHORT')
    AND c."replyStatus" <> 'INCORRECT_NUMBER' AND c."callStatus" <> 'INCORRECT_NUMBER'
    AND (c."statusChangedAt" IS NULL OR c."statusChangedAt" <= c."ownerAssignedAt")
    AND NOT EXISTS (
      SELECT 1 FROM "FollowUpIssueContact" ic JOIN "FollowUpIssue" i ON i.id = ic."issueId"
      WHERE ic."contactId" = c.id AND i."createdAt" >= c."ownerAssignedAt"
    )
    AND GREATEST(c."ownerAssignedAt", public.followup_reassign_since()) <= now() - interval '24 hours';
$$;

-- Supports who moved someone's status (including to Logged in) in the last 7 days, on a
-- person they still hold.
CREATE OR REPLACE FUNCTION public.followup_active_supports()
RETURNS SETOF UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT DISTINCT c."ownerId"
  FROM "FollowUpContact" c
  WHERE c."ownerId" IS NOT NULL AND c."isTest" IS NOT TRUE
    AND c."statusChangedAt" >= now() - interval '7 days'
    AND c."statusChangedAt" > c."ownerAssignedAt";
$$;

-- Handed on recently = people were taken from them in the last 7 days and they haven't moved
-- anyone since. Such a support is not given new people or reassigned ones.
CREATE OR REPLACE FUNCTION public.followup_owner_handed_on_recently(p_owner UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT EXISTS (
    SELECT 1 FROM "FollowUpReassignmentLog" l
    WHERE l."fromUserId" = p_owner AND l."createdAt" > now() - interval '7 days'
      AND NOT EXISTS (SELECT 1 FROM "FollowUpContact" c WHERE c."ownerId" = p_owner AND c."statusChangedAt" > l."createdAt")
  );
$$;

-- Quiet = handed on recently, or has a check open right now. Auto-assign skips them, so new
-- people don't pile onto someone who isn't moving the ones they have.
CREATE OR REPLACE FUNCTION public.followup_owner_is_quiet(p_owner UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT EXISTS (SELECT 1 FROM "FollowUpOwnerCheck" k WHERE k."ownerId" = p_owner AND k."closedAt" IS NULL)
      OR public.followup_owner_handed_on_recently(p_owner);
$$;

-- The sweep. Returns what the sender (run-followup-assignment) should tell people:
--   prompted:   [{ownerId, count, names}]  -> "Are you actively following up?"
--   movedTo:    {ownerId: {count, names}}  -> normal new-assignment notice
--   movedFrom:  {ownerId: {count, names}}  -> "Your people were handed on"
CREATE OR REPLACE FUNCTION public.run_followup_reassignment()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_max INT;
  v_load JSONB := '{}'::jsonb;
  v_active UUID[];
  v_prompted JSONB := '[]'::jsonb;
  v_to JSONB := '{}'::jsonb;
  v_from JSONB := '{}'::jsonb;
  v_stuck INT := 0;
  v_moved INT := 0;
  rec RECORD;
  k RECORD;
  c RECORD;
  v_target UUID;
  v_key TEXT;
  v_entry JSONB;
  v_names JSONB;
BEGIN
  IF NOT public.followup_reassign_enabled() THEN
    RETURN jsonb_build_object('enabled', false);
  END IF;

  SELECT COALESCE((value->>'maxFollowUpsPerSupport')::int, 15) INTO v_max
  FROM "AppSetting" WHERE "settingKey" = 'programme_rules';
  IF v_max IS NULL THEN v_max := 15; END IF;

  -- 1. A check whose person has been moved (or who has nobody left stale) is done.
  UPDATE "FollowUpOwnerCheck" ck SET "closedAt" = now(), "closedReason" = 'MOVED'
  WHERE ck."closedAt" IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.followup_stale_contacts() s WHERE s."ownerId" = ck."ownerId");

  -- 2. New checks for supports holding people who have not moved in 24h.
  FOR rec IN
    SELECT s."ownerId" AS owner_id, COUNT(*) AS cnt,
           (array_agg(split_part(s."fullName", ' ', 1) ORDER BY s."ownerAssignedAt"))[1:3] AS names
    FROM public.followup_stale_contacts() s
    WHERE NOT EXISTS (SELECT 1 FROM "FollowUpOwnerCheck" ck WHERE ck."ownerId" = s."ownerId" AND ck."closedAt" IS NULL)
    GROUP BY s."ownerId"
  LOOP
    INSERT INTO "FollowUpOwnerCheck" ("ownerId", "deadlineAt") VALUES (rec.owner_id, now() + interval '24 hours');
    v_prompted := v_prompted || jsonb_build_array(jsonb_build_object('ownerId', rec.owner_id, 'count', rec.cnt, 'names', to_jsonb(rec.names)));
  END LOOP;

  -- 3. Checks that are due: hand the still-unmoved people to supports who are moving people.
  IF EXISTS (SELECT 1 FROM "FollowUpOwnerCheck" WHERE "closedAt" IS NULL AND "deadlineAt" <= now()) THEN
    SELECT COALESCE(array_agg(a), ARRAY[]::UUID[]) INTO v_active FROM public.followup_active_supports() a;

    -- Each support's current open load per cohort, same definition as run_followup_assignment.
    FOR rec IN
      SELECT COALESCE(x."cohortId"::text, '') || '|' || x."ownerId"::text AS key, COUNT(*) AS cnt
      FROM "FollowUpContact" x
      WHERE x."ownerId" IS NOT NULL AND x."archivedAt" IS NULL AND x."isTest" IS NOT TRUE
        AND x."registrationStatus" NOT IN ('ACCESS_CONFIRMED', 'NOT_INTERESTED', 'NOT_A_GOOD_TIME', 'NOT_A_TCN_MEMBER', 'NO_RESPONSE', 'ATTENDED')
        AND NOT (x."registrationStatus" NOT IN ('REGISTERED', 'LOGIN_SHARED', 'LOGIN_ISSUE', 'NEXT_COHORT')
                 AND (x."replyStatus" = 'INCORRECT_NUMBER' OR x."callStatus" = 'INCORRECT_NUMBER'))
      GROUP BY 1
    LOOP
      v_load := jsonb_set(v_load, ARRAY[rec.key], to_jsonb(rec.cnt));
    END LOOP;

    FOR k IN SELECT * FROM "FollowUpOwnerCheck" WHERE "closedAt" IS NULL AND "deadlineAt" <= now() ORDER BY "deadlineAt" LOOP
      FOR c IN SELECT * FROM public.followup_stale_contacts() s WHERE s."ownerId" = k."ownerId" ORDER BY s."ownerAssignedAt" LOOP
        v_target := NULL;
        IF c.gender IN ('Male', 'Female') THEN
          SELECT u.id INTO v_target
          FROM "User" u
          WHERE u.role = 'SUPPORT' AND u."isActive" IS NOT FALSE AND u."isTest" IS NOT TRUE
            AND u.gender = c.gender
            AND u.id <> k."ownerId"
            AND u.id = ANY(v_active)
            AND NOT public.followup_owner_handed_on_recently(u.id)
            AND COALESCE((v_load->>(COALESCE(c."cohortId"::text, '') || '|' || u.id::text))::int, 0) < v_max
          ORDER BY COALESCE((v_load->>(COALESCE(c."cohortId"::text, '') || '|' || u.id::text))::int, 0) ASC, u.name ASC
          LIMIT 1;
        END IF;

        IF v_target IS NULL THEN
          v_stuck := v_stuck + 1;
          CONTINUE;
        END IF;

        UPDATE "FollowUpContact" SET "ownerId" = v_target, "updatedAt" = now() WHERE id = c.id;
        INSERT INTO "FollowUpReassignmentLog" ("contactId", "fromUserId", "toUserId", reason)
        VALUES (c.id, k."ownerId", v_target, CASE WHEN k.answer = 'NOT_NOW' THEN 'NOT_NOW' WHEN k.extended THEN 'NO_MOVEMENT_AFTER_YES' ELSE 'NO_RESPONSE' END);

        v_key := COALESCE(c."cohortId"::text, '') || '|' || v_target::text;
        v_load := jsonb_set(v_load, ARRAY[v_key], to_jsonb(COALESCE((v_load->>v_key)::int, 0) + 1));

        v_entry := COALESCE(v_to->v_target::text, jsonb_build_object('count', 0, 'names', '[]'::jsonb));
        v_names := v_entry->'names';
        IF jsonb_array_length(v_names) < 3 THEN v_names := v_names || to_jsonb(c."fullName"); END IF;
        v_to := jsonb_set(v_to, ARRAY[v_target::text], jsonb_build_object('count', (v_entry->>'count')::int + 1, 'names', v_names));

        v_entry := COALESCE(v_from->k."ownerId"::text, jsonb_build_object('count', 0, 'names', '[]'::jsonb));
        v_names := v_entry->'names';
        IF jsonb_array_length(v_names) < 3 THEN v_names := v_names || to_jsonb(split_part(c."fullName", ' ', 1)); END IF;
        v_from := jsonb_set(v_from, ARRAY[k."ownerId"::text], jsonb_build_object('count', (v_entry->>'count')::int + 1, 'names', v_names));

        v_moved := v_moved + 1;
      END LOOP;

      -- Done only when nobody stale is left; otherwise keep it open and retry quietly next time.
      IF NOT EXISTS (SELECT 1 FROM public.followup_stale_contacts() s WHERE s."ownerId" = k."ownerId") THEN
        UPDATE "FollowUpOwnerCheck" SET "closedAt" = now(), "closedReason" = 'REASSIGNED' WHERE id = k.id;
      END IF;
    END LOOP;
  END IF;

  RETURN jsonb_build_object('enabled', true, 'prompted', v_prompted, 'movedTo', v_to, 'movedFrom', v_from, 'moved', v_moved, 'stuckNoReceiver', v_stuck);
END;
$$;

-- The signed-in support's open question, or null.
CREATE OR REPLACE FUNCTION public.my_followup_check()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  me UUID := public.app_current_user_id();
  ck "FollowUpOwnerCheck";
BEGIN
  IF me IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO ck FROM "FollowUpOwnerCheck" WHERE "ownerId" = me AND "closedAt" IS NULL AND answer IS NULL;
  IF ck.id IS NULL THEN RETURN NULL; END IF;
  RETURN json_build_object(
    'id', ck.id, 'promptedAt', ck."promptedAt", 'deadlineAt', ck."deadlineAt",
    'people', COALESCE((
      SELECT json_agg(json_build_object('id', s.id, 'name', s."fullName") ORDER BY s."ownerAssignedAt")
      FROM public.followup_stale_contacts() s WHERE s."ownerId" = me
    ), '[]'::json)
  );
END;
$$;

-- "Yes, I am" = one more 24 hours (once). "Not right now" = step aside at the next sweep.
CREATE OR REPLACE FUNCTION public.answer_followup_check(p_answer TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  me UUID := public.app_current_user_id();
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  IF p_answer NOT IN ('YES', 'NOT_NOW') THEN RAISE EXCEPTION 'INVALID_ANSWER'; END IF;
  UPDATE "FollowUpOwnerCheck"
  SET answer = p_answer, "answeredAt" = now(),
      extended = (p_answer = 'YES'),
      "deadlineAt" = CASE WHEN p_answer = 'YES' THEN now() + interval '24 hours' ELSE now() END
  WHERE "ownerId" = me AND "closedAt" IS NULL AND answer IS NULL;
END;
$$;

-- Admin view: who was handed on recently, and who is being asked right now.
CREATE OR REPLACE FUNCTION public.followup_reassignments(p_days INTEGER DEFAULT 7)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT public.app_is_admin() THEN RAISE EXCEPTION 'NOT_AUTHORISED'; END IF;
  RETURN json_build_object(
    'recent', COALESCE((
      SELECT json_agg(r ORDER BY r."createdAt" DESC) FROM (
        SELECT l.id, l."createdAt", l.reason, c."fullName" AS "contactName",
               fu.name AS "fromName", tu.name AS "toName"
        FROM "FollowUpReassignmentLog" l
        JOIN "FollowUpContact" c ON c.id = l."contactId"
        LEFT JOIN "User" fu ON fu.id = l."fromUserId"
        LEFT JOIN "User" tu ON tu.id = l."toUserId"
        WHERE l."createdAt" > now() - make_interval(days => GREATEST(p_days, 1))
        ORDER BY l."createdAt" DESC LIMIT 200
      ) r
    ), '[]'::json),
    'waiting', COALESCE((
      SELECT json_agg(w ORDER BY w."deadlineAt") FROM (
        SELECT u.name AS "ownerName", ck."promptedAt", ck."deadlineAt", ck.answer,
               (SELECT COUNT(*) FROM public.followup_stale_contacts() s WHERE s."ownerId" = ck."ownerId") AS people
        FROM "FollowUpOwnerCheck" ck JOIN "User" u ON u.id = ck."ownerId"
        WHERE ck."closedAt" IS NULL
      ) w
    ), '[]'::json),
    'activeSupports', (SELECT COUNT(*) FROM public.followup_active_supports())
  );
END;
$$;

REVOKE ALL ON FUNCTION public.followup_reassign_enabled() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.followup_reassign_since() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.followup_stale_contacts() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.followup_active_supports() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.followup_owner_is_quiet(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.followup_owner_handed_on_recently(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.run_followup_reassignment() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.my_followup_check() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.answer_followup_check(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.followup_reassignments(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_followup_check() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.answer_followup_check(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.followup_reassignments(INTEGER) TO anon, authenticated;

-- Auto-assign skips supports who were just handed on from, or have a check open.
-- Rebuilt from the live body; only the two 'NOT public.followup_owner_is_quiet(u.id)' lines are new.
CREATE OR REPLACE FUNCTION public.run_followup_assignment(p_manual boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_enabled JSONB;
  v_max INT;
  v_load JSONB := '{}'::jsonb;    -- "<cohortId|''>|<ownerId>" -> open count
  v_batches JSONB := '{}'::jsonb; -- "<ownerId>" -> {"count": n, "names": [...]}
  v_assigned INT := 0;
  v_stuck_no_gender INT := 0;
  v_stuck_unknown_gender INT := 0;
  v_stuck_invalid_phone INT := 0;
  rec RECORD;
  v_target UUID;
  v_candidate UUID;
  v_load_key TEXT;
  v_current_load INT;
  v_batch JSONB;
  v_names JSONB;
BEGIN
  IF NOT p_manual THEN
    SELECT value INTO v_enabled FROM "AppSetting" WHERE "settingKey" = 'followup_auto_assign_enabled';
    -- Missing row means on, same convention as scriptures_enabled.
    IF v_enabled IS NOT NULL AND v_enabled = to_jsonb(false) THEN
      RETURN jsonb_build_object('enabled', false, 'assigned', 0, 'stuckNoGender', 0, 'stuckUnknownGender', 0, 'stuckInvalidPhone', 0, 'batches', '{}'::jsonb);
    END IF;
  END IF;

  SELECT COALESCE((value->>'maxFollowUpsPerSupport')::int, 15) INTO v_max
  FROM "AppSetting" WHERE "settingKey" = 'programme_rules';
  IF v_max IS NULL THEN v_max := 15; END IF;

  -- Seed each support's current open load per cohort. "Open" mirrors
  -- openLoadByOwner / isClosedContact in frontend/src/utils/followUps.ts:
  -- not archived and not closed (Access confirmed, not interested, no response, wrong number).
  FOR rec IN
    SELECT COALESCE(c."cohortId"::text, '') || '|' || c."ownerId"::text AS k, COUNT(*) AS cnt
    FROM "FollowUpContact" c
    WHERE c."ownerId" IS NOT NULL
      AND c."archivedAt" IS NULL
      AND c."isTest" IS NOT TRUE
      -- Same as isClosedContact: only Access confirmed closes a successful one, so
      -- Registered, Login shared and Issue with login (not in the app yet) count
      -- towards the limit.
      AND c."registrationStatus" NOT IN ('ACCESS_CONFIRMED', 'NOT_INTERESTED', 'NOT_A_GOOD_TIME', 'NOT_A_TCN_MEMBER', 'NO_RESPONSE', 'ATTENDED')
      AND NOT (c."registrationStatus" NOT IN ('REGISTERED', 'LOGIN_SHARED', 'LOGIN_ISSUE', 'NEXT_COHORT')
               AND (c."replyStatus" = 'INCORRECT_NUMBER' OR c."callStatus" = 'INCORRECT_NUMBER'))
    GROUP BY 1
  LOOP
    v_load := jsonb_set(v_load, ARRAY[rec.k], to_jsonb(rec.cnt));
  END LOOP;

  FOR rec IN
    SELECT * FROM "FollowUpContact" c
    WHERE c."ownerId" IS NULL
      AND c."archivedAt" IS NULL
      -- Closed outcomes are never handed out again (see fof follow-up cohort rule).
      AND c."registrationStatus" NOT IN ('ACCESS_CONFIRMED', 'NEXT_COHORT', 'NOT_INTERESTED', 'NOT_A_GOOD_TIME', 'NOT_A_TCN_MEMBER', 'NO_RESPONSE', 'ATTENDED')
      AND c."replyStatus" <> 'INCORRECT_NUMBER'
      AND c."callStatus" <> 'INCORRECT_NUMBER'
      -- Test contacts are never handed out; an admin assigns them by hand.
      AND c."isTest" IS NOT TRUE
      AND (p_manual OR c."createdAt" <= now() - interval '2 hours')
    ORDER BY c."createdAt" ASC
  LOOP
    -- Held back until an admin fixes the number: a support can't reach them.
    IF NOT public.followup_phone_is_valid(rec.phone) THEN
      v_stuck_invalid_phone := v_stuck_invalid_phone + 1;
      CONTINUE;
    END IF;

    IF rec.gender IS NULL OR rec.gender NOT IN ('Male', 'Female') THEN
      v_stuck_unknown_gender := v_stuck_unknown_gender + 1;
      CONTINUE;
    END IF;

    v_target := NULL;

    -- Rule 2: whoever added them, if same gender and under the limit.
    IF rec."registeredById" IS NOT NULL THEN
      v_candidate := NULL;
      SELECT u.id INTO v_candidate
      FROM "User" u
      WHERE u.id = rec."registeredById"
        AND u.role IN ('SUPPORT', 'ADMIN')
        AND u."isTest" IS NOT TRUE
        AND u."isActive" IS NOT FALSE
        AND u.gender = rec.gender
        AND NOT public.followup_owner_is_quiet(u.id);
      IF v_candidate IS NOT NULL THEN
        v_load_key := COALESCE(rec."cohortId"::text, '') || '|' || v_candidate::text;
        v_current_load := COALESCE((v_load->>v_load_key)::int, 0);
        IF v_current_load < v_max THEN
          v_target := v_candidate;
        END IF;
      END IF;
    END IF;

    -- Rule 3: same-gender support under the limit, fewest open first, ties by name.
    IF v_target IS NULL THEN
      SELECT u.id INTO v_target
      FROM "User" u
      WHERE u.role IN ('SUPPORT', 'ADMIN')
        AND u."isActive" IS NOT FALSE
        AND u."isTest" IS NOT TRUE
        AND u.gender = rec.gender
        AND NOT public.followup_owner_is_quiet(u.id)
        AND COALESCE((v_load->>(COALESCE(rec."cohortId"::text, '') || '|' || u.id::text))::int, 0) < v_max
      ORDER BY COALESCE((v_load->>(COALESCE(rec."cohortId"::text, '') || '|' || u.id::text))::int, 0) ASC, u.name ASC
      LIMIT 1;
    END IF;

    IF v_target IS NULL THEN
      v_stuck_no_gender := v_stuck_no_gender + 1;
      CONTINUE;
    END IF;

    UPDATE "FollowUpContact" SET "ownerId" = v_target, "updatedAt" = now() WHERE id = rec.id;

    v_load_key := COALESCE(rec."cohortId"::text, '') || '|' || v_target::text;
    v_load := jsonb_set(v_load, ARRAY[v_load_key], to_jsonb(COALESCE((v_load->>v_load_key)::int, 0) + 1));

    v_batch := COALESCE(v_batches->v_target::text, jsonb_build_object('count', 0, 'names', '[]'::jsonb));
    v_names := COALESCE(v_batch->'names', '[]'::jsonb);
    IF jsonb_array_length(v_names) < 3 THEN
      v_names := v_names || to_jsonb(rec."fullName");
    END IF;
    v_batch := jsonb_set(v_batch, ARRAY['count'], to_jsonb(COALESCE((v_batch->>'count')::int, 0) + 1));
    v_batch := jsonb_set(v_batch, ARRAY['names'], v_names);
    v_batches := jsonb_set(v_batches, ARRAY[v_target::text], v_batch);

    v_assigned := v_assigned + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'enabled', true,
    'assigned', v_assigned,
    'stuckNoGender', v_stuck_no_gender,
    'stuckUnknownGender', v_stuck_unknown_gender,
    'stuckInvalidPhone', v_stuck_invalid_phone,
    'batches', v_batches
  );
END;
$function$;
