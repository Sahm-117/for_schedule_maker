-- Automatic follow-up assignment (leadership rules, Sep 2026):
--   1. Same gender only.
--   2. Whoever added them (Mobilisation "Met someone" -> registeredById, or a
--      matched "Who Registered You for FOF?" name -- see
--      20260928150000_followup_registered_by_from_form.sql), if same gender
--      and under the limit.
--   3. Otherwise the same-gender support under the limit with the fewest open
--      follow-ups, ties broken by name.
--   4. Nobody qualifies, or gender is unknown -> stays unassigned (the admin
--      Follow-ups page explains why; see frontend/src/utils/followUps.ts
--      unassignedFollowUpTag, a read-only mirror of this same eligibility
--      check, used only for the on-screen tag).
--
-- One function holds the whole rule so the 10-minute scheduled sweep and the
-- admin "Assign now" button can never disagree. It only writes ownerId --
-- callers are responsible for the matching web-push notification, exactly the
-- way a manual bulk-assign already works (assignMany calls
-- notify-followup-assignment once per owner); see:
--   - frontend/src/services/supabase-api.ts followUpContactsApi.assignPendingNow
--     (calls assign_followups_now, then notifies each owner)
--   - supabase/functions/run-followup-assignment/index.ts (the scheduled run)

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
      RETURN jsonb_build_object('enabled', false, 'assigned', 0, 'stuckNoGender', 0, 'stuckUnknownGender', 0, 'batches', '{}'::jsonb);
    END IF;
  END IF;

  SELECT COALESCE((value->>'maxFollowUpsPerSupport')::int, 15) INTO v_max
  FROM "AppSetting" WHERE "settingKey" = 'programme_rules';
  IF v_max IS NULL THEN v_max := 15; END IF;

  -- Seed each support's current open load per cohort. "Open" mirrors
  -- openLoadByOwner / isClosedContact in frontend/src/utils/followUps.ts:
  -- not archived and not closed (Login shared, not interested, no response, wrong number).
  FOR rec IN
    SELECT COALESCE(c."cohortId"::text, '') || '|' || c."ownerId"::text AS k, COUNT(*) AS cnt
    FROM "FollowUpContact" c
    WHERE c."ownerId" IS NOT NULL
      AND c."archivedAt" IS NULL
      -- Same as isClosedContact: only Login shared closes a successful one, so
      -- Registered (login still to hand over) counts towards the limit.
      AND c."registrationStatus" NOT IN ('LOGIN_SHARED', 'NOT_INTERESTED', 'NOT_A_GOOD_TIME', 'NOT_A_TCN_MEMBER', 'NO_RESPONSE')
      AND NOT (c."registrationStatus" NOT IN ('REGISTERED', 'NEXT_COHORT')
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
      AND c."registrationStatus" NOT IN ('LOGIN_SHARED', 'NEXT_COHORT', 'NOT_INTERESTED', 'NOT_A_GOOD_TIME', 'NOT_A_TCN_MEMBER', 'NO_RESPONSE')
      AND c."replyStatus" <> 'INCORRECT_NUMBER'
      AND c."callStatus" <> 'INCORRECT_NUMBER'
      AND (p_manual OR c."createdAt" <= now() - interval '2 hours')
    ORDER BY c."createdAt" ASC
  LOOP
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
    'batches', v_batches
  );
END;
$$;

-- Only the cron runner (service_role) and the admin wrapper below may call this.
REVOKE ALL ON FUNCTION public.run_followup_assignment(BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_followup_assignment(BOOLEAN) TO service_role;

-- Admin "Assign now" button: same app_staff(p_token) admin-check convention as
-- create_user / other admin-only RPCs.
CREATE OR REPLACE FUNCTION public.assign_followups_now(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  actor "User" := public.app_staff(p_token);
BEGIN
  IF actor.id IS NULL OR actor.role <> 'ADMIN'::"Role" THEN
    RAISE EXCEPTION 'NOT_AUTHORISED';
  END IF;
  RETURN public.run_followup_assignment(TRUE);
END;
$$;

REVOKE ALL ON FUNCTION public.assign_followups_now(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_followups_now(TEXT) TO anon, authenticated;

-- Admin alert dedupe: one alert per 2-hour window while anyone is waiting,
-- same claim-by-unique-insert idiom as PushReminderLog / claimReminder in
-- push-reminders. windowStart is the run-followup-assignment edge function's
-- 2-hour UTC bucket; a repeat cron tick inside the same window gets 23505 and
-- skips silently.
CREATE TABLE IF NOT EXISTS "FollowUpAdminAlertLog" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "windowStart" TIMESTAMPTZ NOT NULL UNIQUE,
  "waitingCount" INTEGER NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE "FollowUpAdminAlertLog" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all operations" ON "FollowUpAdminAlertLog";
CREATE POLICY "Allow all operations" ON "FollowUpAdminAlertLog" FOR ALL USING (true);

-- Cron: invoke the new edge function every 10 minutes, same pg_net + vault
-- pattern as invoke_push_reminders in
-- 20260728000000_push_reminders_cron_and_dedupe.sql (reuses the same
-- 'project_url' / 'push_reminders_service_key' vault secrets -- they hold a
-- generic project URL + service-role JWT, nothing push-reminders-specific).
CREATE OR REPLACE FUNCTION public.invoke_followup_assignment()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_url text;
  v_key text;
BEGIN
  SELECT decrypted_secret INTO v_url
    FROM vault.decrypted_secrets WHERE name = 'project_url';
  SELECT decrypted_secret INTO v_key
    FROM vault.decrypted_secrets WHERE name = 'push_reminders_service_key';

  IF v_url IS NULL OR v_key IS NULL THEN
    RAISE NOTICE 'run-followup-assignment: vault secrets missing; skipping run';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := v_url || '/functions/v1/run-followup-assignment',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', v_key,
      'Authorization', 'Bearer ' || v_key
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
END
$$;

REVOKE ALL ON FUNCTION public.invoke_followup_assignment() FROM PUBLIC;

SELECT cron.unschedule('followup_assignment_every_10min')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'followup_assignment_every_10min');

-- Start with automatic assigning OFF so the admin can look over the waiting
-- list first; they turn it on in Settings (or use Assign now).
INSERT INTO "AppSetting" ("settingKey", value)
VALUES ('followup_auto_assign_enabled', 'false'::jsonb)
ON CONFLICT ("settingKey") DO NOTHING;

SELECT cron.schedule(
  'followup_assignment_every_10min',
  '*/10 * * * *',
  $$select public.invoke_followup_assignment();$$
);

-- Rollback (stops the sweep instantly, no redeploy needed):
--   select cron.unschedule('followup_assignment_every_10min');
