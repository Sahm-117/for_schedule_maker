-- Admins who also carry the Support tag (roles include SUPPORT) count as supports in
-- the follow-up stale list, follow-up reassignment and the attendance-report push.
-- Same functions, same permissions; only the "is this person a support" test widens
-- from role = 'SUPPORT' to role = 'SUPPORT' OR roles contains SUPPORT.
--
-- Rollback: re-run the previous definitions (20261004170000_current_cohort_followup_repair.sql
-- and the migrations that last defined notify_attendance_report / followup_stale_contacts).

CREATE OR REPLACE FUNCTION public.notify_attendance_report(p_week_id integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_cohort_id UUID;
  v_week_number INTEGER;
  v_attended_count INTEGER;
  v_absent_count INTEGER;
  v_already_notified_at TIMESTAMPTZ;
  v_title TEXT;
  v_body TEXT;
  v_user_ids UUID[];
  v_url text;
  v_key text;
BEGIN
  SELECT w."cohortId", w."weekNumber", s."reportNotifiedAt"
  INTO v_cohort_id, v_week_number, v_already_notified_at
  FROM public."Week" w
  JOIN public."AttendanceSession" s ON s."weekId" = w.id
  WHERE w.id = p_week_id
  FOR UPDATE OF s;

  IF v_cohort_id IS NULL OR v_already_notified_at IS NOT NULL THEN RETURN; END IF;

  SELECT
    COUNT(*) FILTER (WHERE a.status = 'PRESENT' OR (a.status IN ('LATE', 'LEFT_EARLY') AND a."lateExcused")),
    COUNT(*) FILTER (WHERE a.status = 'ABSENT')
  INTO v_attended_count, v_absent_count
  FROM public."AttendanceRecord" a
  JOIN public."Participant" p ON p.id = a."participantId"
  WHERE a."weekId" = p_week_id AND p."cohortId" = v_cohort_id AND p.status = 'ACTIVE';

  UPDATE public."AttendanceSession"
  SET "reportNotifiedAt" = NOW(), "updatedAt" = NOW()
  WHERE "weekId" = p_week_id;

  SELECT array_agg(DISTINCT u.id) INTO v_user_ids
  FROM public."Group" g
  JOIN public."User" u ON u.id = g."supportId"
  WHERE g."cohortId" = v_cohort_id
    AND (u.role = 'SUPPORT' OR 'SUPPORT'::"Role" = ANY(u.roles))
    AND u."isActive" IS NOT FALSE;

  IF v_user_ids IS NULL OR array_length(v_user_ids, 1) IS NULL THEN RETURN; END IF;

  v_title := format('Attendance report · Week %s', v_week_number);
  v_body := format('%s attended · %s absent. Open your schedule for any follow-up assigned to you.', v_attended_count, v_absent_count);

  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'project_url';
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'push_reminders_service_key';

  IF v_url IS NULL OR v_key IS NULL THEN
    -- No push possible: still write the bell rows so nobody misses the report.
    RAISE NOTICE 'notify_attendance_report: vault secrets missing; bell only';
    INSERT INTO public."Notification" ("userId", title, body, path, type)
    SELECT uid, v_title, v_body, '/support/attendance', 'ATTENDANCE_REPORT' FROM unnest(v_user_ids) AS uid;
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
      'userIds', to_jsonb(v_user_ids),
      'title', v_title,
      'body', v_body,
      'path', '/support/attendance',
      'type', 'ATTENDANCE_REPORT'
    ),
    timeout_milliseconds := 25000
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.followup_stale_contacts()
 RETURNS SETOF "FollowUpContact"
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT c.*
  FROM "FollowUpContact" c
  JOIN "User" u ON u.id = c."ownerId"
  WHERE c."archivedAt" IS NULL
    AND c."isTest" IS NOT TRUE
    AND (c."cohortId" IS NULL
         OR c."cohortId" = public.current_programme_cohort_id())
    AND (u.role = 'SUPPORT' OR 'SUPPORT'::"Role" = ANY(u.roles)) AND u."isTest" IS NOT TRUE AND u."isActive" IS NOT FALSE
    AND c."nextAction" IS DISTINCT FROM 'CLOSE'
    AND c."registrationStatus" NOT IN ('ACCESS_CONFIRMED', 'LOGIN_SHARED', 'NOT_INTERESTED', 'NOT_A_GOOD_TIME', 'NOT_A_TCN_MEMBER', 'NO_RESPONSE', 'ATTENDED', 'NEXT_COHORT')
    AND c."replyStatus" <> 'INCORRECT_NUMBER' AND c."callStatus" <> 'INCORRECT_NUMBER'
    AND (c."statusChangedAt" IS NULL OR c."statusChangedAt" <= c."ownerAssignedAt")
    AND NOT EXISTS (
      SELECT 1 FROM "FollowUpIssueContact" ic JOIN "FollowUpIssue" i ON i.id = ic."issueId"
      WHERE ic."contactId" = c.id AND (i.status = 'OPEN' OR i."createdAt" >= c."ownerAssignedAt")
    )
    AND NOT EXISTS (
      SELECT 1 FROM "FollowUpIssue" i WHERE i."contactId" = c.id AND i.status = 'OPEN'
    )
    AND GREATEST(c."ownerAssignedAt", public.followup_reassign_since()) <= now() - interval '24 hours';
$function$;

CREATE OR REPLACE FUNCTION public.run_followup_reassignment()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
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
          WHERE (u.role = 'SUPPORT' OR 'SUPPORT'::"Role" = ANY(u.roles)) AND u."isActive" IS NOT FALSE AND u."isTest" IS NOT TRUE
            AND u.gender = c.gender
            AND u.id <> k."ownerId"
            AND u.id = ANY(v_active)
            AND NOT public.followup_owner_handed_on_recently(u.id)
            AND NOT public.followup_support_inactive(u.id)
            AND COALESCE((v_load->>(COALESCE(c."cohortId"::text, '') || '|' || u.id::text))::int, 0) < v_max
          ORDER BY COALESCE((v_load->>(COALESCE(c."cohortId"::text, '') || '|' || u.id::text))::int, 0) ASC, u.name ASC
          LIMIT 1;
        END IF;

        -- Relaxed steps, only when no same-gender receiver was found.
        IF v_target IS NULL AND public.followup_relax_on('followup_relax_adder', TRUE) THEN
          SELECT u.id INTO v_target FROM "User" u
          WHERE u.id = (SELECT x."registeredById" FROM "FollowUpContact" x WHERE x.id = c.id)
            AND (u.role = 'SUPPORT' OR 'SUPPORT'::"Role" = ANY(u.roles)) AND u."isActive" IS NOT FALSE AND u."isTest" IS NOT TRUE
            AND u.id <> k."ownerId" AND u.id = ANY(v_active)
            AND NOT public.followup_owner_handed_on_recently(u.id) AND NOT public.followup_support_inactive(u.id)
            AND COALESCE((v_load->>(COALESCE(c."cohortId"::text, '') || '|' || u.id::text))::int, 0) < v_max;
        END IF;
        IF v_target IS NULL AND public.followup_relax_on('followup_relax_any_gender', TRUE) THEN
          SELECT u.id INTO v_target FROM "User" u
          WHERE (u.role = 'SUPPORT' OR 'SUPPORT'::"Role" = ANY(u.roles)) AND u."isActive" IS NOT FALSE AND u."isTest" IS NOT TRUE
            AND u.id <> k."ownerId" AND u.id = ANY(v_active)
            AND NOT public.followup_owner_handed_on_recently(u.id) AND NOT public.followup_support_inactive(u.id)
            AND COALESCE((v_load->>(COALESCE(c."cohortId"::text, '') || '|' || u.id::text))::int, 0) < v_max
          ORDER BY COALESCE((v_load->>(COALESCE(c."cohortId"::text, '') || '|' || u.id::text))::int, 0) ASC, u.name ASC
          LIMIT 1;
        END IF;
        IF v_target IS NULL AND public.followup_relax_on('followup_relax_over_limit', FALSE) THEN
          SELECT u.id INTO v_target FROM "User" u
          WHERE (u.role = 'SUPPORT' OR 'SUPPORT'::"Role" = ANY(u.roles)) AND u."isActive" IS NOT FALSE AND u."isTest" IS NOT TRUE
            AND u.id <> k."ownerId" AND u.id = ANY(v_active)
            AND NOT public.followup_owner_handed_on_recently(u.id) AND NOT public.followup_support_inactive(u.id)
          ORDER BY (u.gender = c.gender) DESC, COALESCE((v_load->>(COALESCE(c."cohortId"::text, '') || '|' || u.id::text))::int, 0) ASC, u.name ASC
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
$function$;

