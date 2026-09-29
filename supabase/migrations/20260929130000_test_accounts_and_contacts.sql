-- Test accounts and test contacts.
--
-- Admins can mark an app account (User) or a follow-up contact as test. Test
-- accounts work like any other account but are left out of follow-up
-- assignment and counts; test contacts are left out of assignment, counts and
-- exports, and only reach a support an admin assigns them to (usually a test
-- account, to try things out).
--
-- "User"."isTest" is readable by the app but only changed through
-- set_user_test (admins only), the same way set_user_role guards the role
-- column. "FollowUpContact" already has table-wide grants, so its new column
-- is covered.
--
-- run_followup_assignment below is verbatim from
-- 20260929121000_followup_attended.sql, plus: test contacts are neither
-- counted in a support's load nor handed out, and test accounts are never
-- picked as the support. Same signature and grants.
--
-- Rollback: re-apply run_followup_assignment from
-- 20260929121000_followup_attended.sql, DROP FUNCTION public.set_user_test,
-- then drop the two "isTest" columns.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isTest" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "FollowUpContact" ADD COLUMN IF NOT EXISTS "isTest" BOOLEAN NOT NULL DEFAULT FALSE;

GRANT SELECT ("isTest") ON "User" TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.set_user_test(
  p_token TEXT,
  target_user UUID,
  p_is_test BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  actor "User" := public.app_staff(p_token);
BEGIN
  IF actor.id IS NULL OR actor.role <> 'ADMIN'::"Role" THEN
    RAISE EXCEPTION 'NOT_AUTHORISED';
  END IF;

  UPDATE "User"
  SET "isTest" = COALESCE(p_is_test, FALSE),
      "updatedAt" = NOW()
  WHERE id = target_user;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_user_test(TEXT, UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_user_test(TEXT, UUID, BOOLEAN) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.run_followup_assignment(p_manual BOOLEAN DEFAULT FALSE)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
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
        AND u.gender = rec.gender;
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
$$;

-- Only the cron runner (service_role) and the admin wrapper (assign_followups_now) may call this.
REVOKE ALL ON FUNCTION public.run_followup_assignment(BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_followup_assignment(BOOLEAN) TO service_role;
