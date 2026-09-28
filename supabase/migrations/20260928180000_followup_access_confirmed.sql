-- Login shared no longer closes a follow-up; "Participant confirmed access"
-- (ACCESS_CONFIRMED, added in 20260928170000_followup_access_confirmed_values.sql)
-- does. After sign-up the steps are:
--   LOGIN_SHARED     -- login sent, waiting for them to sign in. Open.
--   ACCESS_CONFIRMED -- they're in the app. Closed (archived), set by hand or
--                       by the trigger in #2 when they choose their password.
--   LOGIN_ISSUE      -- they can't get in. Open; the app alerts admins and IT
--                       Support via notify-followup-terminal-status.
--   NEXT_COHORT      -- unchanged.
-- The frontend mirror of all this is frontend/src/utils/followUps.ts
-- (isClosedContact / isClosedRegistrationStatus / buildStatusPatch).
--
-- What changes here:
--   1. run_followup_assignment: copied verbatim from
--      20260928160000_followup_auto_assignment.sql; only its closed lists
--      change (LOGIN_SHARED out, ACCESS_CONFIRMED in; LOGIN_SHARED and
--      LOGIN_ISSUE, like REGISTERED, win over a wrong-number flag, as in
--      computeFollowUpStatus).
--   2. Trigger on ParticipantAccount: the first time a participant sets their
--      password, their follow-up closes as ACCESS_CONFIRMED and their support
--      is told (in-app feed + push, via notify-users).
--   3. One-off backfill of existing LOGIN_SHARED contacts (backed up first).
--
-- Not changed: cohort_health (latest 20260927190000) counts only REGISTERED
-- for 'registered' and 'archivedAt IS NULL' for 'open'; neither needs the new
-- values to stay correct as it is today.
--
-- Not yet applied to the live database.

-- ── 1. Auto-assignment closed lists ─────────────────────────────────────────
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
  -- not archived and not closed (Access confirmed, not interested, no response, wrong number).
  FOR rec IN
    SELECT COALESCE(c."cohortId"::text, '') || '|' || c."ownerId"::text AS k, COUNT(*) AS cnt
    FROM "FollowUpContact" c
    WHERE c."ownerId" IS NOT NULL
      AND c."archivedAt" IS NULL
      -- Same as isClosedContact: only Access confirmed closes a successful one, so
      -- Registered, Login shared and Issue with login (not in the app yet) count
      -- towards the limit.
      AND c."registrationStatus" NOT IN ('ACCESS_CONFIRMED', 'NOT_INTERESTED', 'NOT_A_GOOD_TIME', 'NOT_A_TCN_MEMBER', 'NO_RESPONSE')
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
      AND c."registrationStatus" NOT IN ('ACCESS_CONFIRMED', 'NEXT_COHORT', 'NOT_INTERESTED', 'NOT_A_GOOD_TIME', 'NOT_A_TCN_MEMBER', 'NO_RESPONSE')
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

-- ── 2. Participant sets their password → follow-up done, support told ───────
-- set_participant_password (20260917110000) stamps passwordSetAt the first
-- time; a new login code resets it to NULL, so a fresh code + password after
-- an "Issue with login" confirms them too. Close columns match buildStatusPatch
-- ('ACCESS_CONFIRMED'). The push goes through notify-users with userIds,
-- same vault-secret + net.http_post pattern as invoke_hub_message_push
-- (20260924000000_support_hubs.sql #9). Everything is inside one exception
-- block: nothing here may ever stop a participant saving their password.
CREATE OR REPLACE FUNCTION public.confirm_followup_access_on_password_set()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_contact RECORD;
  v_first_name TEXT;
  v_url text;
  v_key text;
BEGIN
  BEGIN
    SELECT c.id, c."fullName", c."ownerId" INTO v_contact
    FROM public."Participant" p
    JOIN public."FollowUpContact" c ON c.id = p."followUpContactId"
    WHERE p.id = NEW."participantId"
      AND c."registrationStatus" IN ('REGISTERED', 'LOGIN_SHARED', 'LOGIN_ISSUE')
    LIMIT 1;

    IF NOT FOUND THEN
      RETURN NEW;
    END IF;

    UPDATE public."FollowUpContact"
    SET "registrationStatus" = 'ACCESS_CONFIRMED',
        "replyStatus" = 'REPLIED',
        "nextAction" = 'CLOSE',
        "archivedAt" = COALESCE("archivedAt", now()),
        "updatedAt" = now()
    WHERE id = v_contact.id;

    IF v_contact."ownerId" IS NULL THEN
      RETURN NEW;
    END IF;

    SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'project_url';
    SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'push_reminders_service_key';

    IF v_url IS NULL OR v_key IS NULL THEN
      RAISE NOTICE 'confirm_followup_access_on_password_set: vault secrets missing; skipping push';
      RETURN NEW;
    END IF;

    v_first_name := COALESCE(NULLIF(split_part(trim(v_contact."fullName"), ' ', 1), ''), 'Your contact');

    PERFORM net.http_post(
      url := v_url || '/functions/v1/notify-users',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', v_key,
        'Authorization', 'Bearer ' || v_key
      ),
      body := jsonb_build_object(
        'userIds', jsonb_build_array(v_contact."ownerId"),
        'title', format('%s is in the app', v_first_name),
        'body', format('%s signed in to the FOF app. Their follow-up is done.', trim(v_contact."fullName")),
        'path', '/support/mobilisation?tab=follow',
        'type', 'FOLLOWUP_TERMINAL'
      ),
      timeout_milliseconds := 25000
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'confirm_followup_access_on_password_set failed: %', SQLERRM;
  END;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.confirm_followup_access_on_password_set() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_followup_access_confirmed ON public."ParticipantAccount";
CREATE TRIGGER trg_followup_access_confirmed
  AFTER UPDATE OF "passwordSetAt" ON public."ParticipantAccount"
  FOR EACH ROW
  WHEN (OLD."passwordSetAt" IS NULL AND NEW."passwordSetAt" IS NOT NULL)
  EXECUTE FUNCTION public.confirm_followup_access_on_password_set();

-- ── 3. Backfill existing LOGIN_SHARED contacts (one-off) ────────────────────
-- Preview first (read-only) -- per support, how many get confirmed and how
-- many open again:
--
--   SELECT COALESCE(u.name, 'Unassigned') AS support,
--          count(*) FILTER (WHERE x.signed_in) AS confirmed,
--          count(*) FILTER (WHERE NOT x.signed_in AND c."archivedAt" IS NOT NULL
--                             AND (c."cohortId" IS NULL OR co."endDate" IS NULL OR co."endDate" >= current_date)) AS reopened,
--          count(*) FILTER (WHERE NOT x.signed_in AND c."archivedAt" IS NOT NULL
--                             AND co."endDate" < current_date) AS left_filed_past_cohort
--   FROM "FollowUpContact" c
--   LEFT JOIN "User" u ON u.id = c."ownerId"
--   LEFT JOIN "Cohort" co ON co.id = c."cohortId"
--   CROSS JOIN LATERAL (
--     SELECT EXISTS (
--       SELECT 1 FROM "Participant" p
--       JOIN "ParticipantAccount" a ON a."participantId" = p.id
--       WHERE p."followUpContactId" = c.id
--         AND (a."passwordSetAt" IS NOT NULL OR a."lastSignInAt" IS NOT NULL)
--     ) AS signed_in
--   ) x
--   WHERE c."registrationStatus" = 'LOGIN_SHARED'
--   GROUP BY 1
--   ORDER BY 1;

-- Backup of every LOGIN_SHARED contact before anything is touched.
CREATE TABLE IF NOT EXISTS public."FollowUpContactStatusBackup_20260928" AS
SELECT id, "registrationStatus", "archivedAt", "nextAction", "updatedAt"
FROM public."FollowUpContact"
WHERE "registrationStatus" = 'LOGIN_SHARED';

-- Operator-only: keep it out of the public API.
ALTER TABLE public."FollowUpContactStatusBackup_20260928" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."FollowUpContactStatusBackup_20260928" FROM anon, authenticated;

-- Signed in already (chose a password, or has signed in) → confirmed + closed.
UPDATE public."FollowUpContact" c
SET "registrationStatus" = 'ACCESS_CONFIRMED',
    "replyStatus" = 'REPLIED',
    "nextAction" = 'CLOSE',
    "archivedAt" = COALESCE(c."archivedAt", now()),
    "updatedAt" = now()
WHERE c."registrationStatus" = 'LOGIN_SHARED'
  AND EXISTS (
    SELECT 1 FROM public."Participant" p
    JOIN public."ParticipantAccount" a ON a."participantId" = p.id
    WHERE p."followUpContactId" = c.id
      AND (a."passwordSetAt" IS NOT NULL OR a."lastSignInAt" IS NOT NULL)
  );

-- The rest stay LOGIN_SHARED and open again -- but only in a cohort that
-- hasn't ended (or with no cohort). Past cohorts' ones stay filed away as they
-- are (the app reads them as finished, see isFiledLoginShared).
UPDATE public."FollowUpContact" c
SET "archivedAt" = NULL,
    "nextAction" = 'SEND_MESSAGE',
    "updatedAt" = now()
WHERE c."registrationStatus" = 'LOGIN_SHARED'
  AND c."archivedAt" IS NOT NULL
  AND (
    c."cohortId" IS NULL
    OR EXISTS (
      SELECT 1 FROM public."Cohort" co
      WHERE co.id = c."cohortId"
        AND (co."endDate" IS NULL OR co."endDate" >= current_date)
    )
  );

-- Rollback:
--   1. DROP TRIGGER IF EXISTS trg_followup_access_confirmed ON public."ParticipantAccount";
--      DROP FUNCTION IF EXISTS public.confirm_followup_access_on_password_set();
--   2. Re-run the run_followup_assignment definition from
--      20260928160000_followup_auto_assignment.sql.
--   3. Put the backed-up contacts back exactly as they were (this also undoes
--      any that the trigger confirmed since, for those contacts only):
--        UPDATE public."FollowUpContact" c
--        SET "registrationStatus" = b."registrationStatus",
--            "archivedAt" = b."archivedAt",
--            "nextAction" = b."nextAction",
--            "updatedAt" = b."updatedAt"
--        FROM public."FollowUpContactStatusBackup_20260928" b
--        WHERE b.id = c.id;
--      (The backfill also set replyStatus = 'REPLIED' on confirmed ones; every
--      LOGIN_SHARED contact already had REPLIED from buildStatusPatch.)
--   4. Contacts marked ACCESS_CONFIRMED / LOGIN_ISSUE by hand after this ran
--      aren't in the backup; move them back to LOGIN_SHARED / REGISTERED first.
--   Drop the backup table only once you're sure:
--      DROP TABLE public."FollowUpContactStatusBackup_20260928";
