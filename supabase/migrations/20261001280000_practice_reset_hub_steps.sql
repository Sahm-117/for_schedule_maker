-- "Reset my experience" left the hub steps ticked (attendance, meeting, message...):
-- they come from the shared Practice hub, which a reset doesn't clear, so the
-- auto-tick found them again. A reset now records the time and only later work counts.
-- Rollback: restore practice_autotick_staff and practice_reset_me from 20261001200000 / 20261001220000;
-- ALTER TABLE "PracticeMember" DROP COLUMN "resetAt".
ALTER TABLE public."PracticeMember" ADD COLUMN IF NOT EXISTS "resetAt" TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.practice_autotick_staff(p_user uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_c UUID := (SELECT id FROM public."Cohort" WHERE "isPractice" LIMIT 1);
  v_since TIMESTAMPTZ;
  v_reset TIMESTAMPTZ;
BEGIN
  IF v_c IS NULL THEN
    RETURN;
  END IF;
  -- After "Reset my experience" only what is done from then on counts, so the
  -- shared hub's older attendance, meetings and messages don't tick it again.
  SELECT "resetAt" INTO v_reset FROM public."PracticeMember" WHERE "userId" = p_user;
  -- Walkthrough steps count only what was done since the walkthrough began.
  SELECT "respondedAt" INTO v_since FROM public."PracticePeer"
   WHERE status = 'ACTIVE' AND p_user IN ("fromUserId", "toUserId") ORDER BY "respondedAt" DESC LIMIT 1;
  WITH
  posts AS (
    SELECT gp."createdAt" AS ts, row_number() OVER (ORDER BY gp."createdAt") AS n
    FROM public."GroupPost" gp JOIN public."Group" g ON g.id = gp."groupId"
    WHERE g."cohortId" = v_c AND gp."authorUserId" = p_user AND gp."deletedAt" IS NULL
  ),
  att AS (
    SELECT min(r."markedAt") AS ts FROM public."AttendanceRecord" r JOIN public."Week" w ON w.id = r."weekId"
    WHERE w."cohortId" = v_c AND r."markedById" = p_user
  ),
  pin AS (
    SELECT min(gp."pinnedAt") AS ts FROM public."GroupPost" gp JOIN public."Group" g ON g.id = gp."groupId"
    WHERE g."cohortId" = v_c AND gp."pinnedById" = p_user
  ),
  reply AS (
    SELECT min(rp."createdAt") AS ts FROM public."GroupPostReply" rp
    JOIN public."GroupPost" gp ON gp.id = rp."postId" JOIN public."Group" g ON g.id = gp."groupId"
    WHERE g."cohortId" = v_c AND rp."authorUserId" = p_user AND rp."deletedAt" IS NULL
  ),
  hubatt AS (
    SELECT min(a."markedAt") AS ts FROM public."SupportSessionAttendance" a JOIN public."SupportSession" s ON s.id = a."sessionId"
    WHERE s."cohortId" = v_c AND s."hubId" IS NOT NULL AND a."markedById" = p_user
  ),
  hubdone AS (
    SELECT min(s."submittedAt") AS ts FROM public."SupportSession" s
    WHERE s."cohortId" = v_c AND s."hubId" IS NOT NULL AND s."submittedById" = p_user
  ),
  hubmsg AS (
    SELECT min(m."createdAt") AS ts FROM public."HubMessage" m JOIN public."SupportHub" h ON h.id = m."hubId"
    WHERE h."cohortId" = v_c AND m."authorId" = p_user
  ),
  hubread AS (
    SELECT min(a."createdAt") AS ts FROM public."HubMessageAck" a
    JOIN public."HubMessage" m ON m.id = a."messageId" JOIN public."SupportHub" h ON h.id = m."hubId"
    WHERE h."cohortId" = v_c AND a."userId" = p_user
  ),
  prayfocus AS (
    SELECT min(s."prayerFocusSetAt") AS ts FROM public."SupportSession" s JOIN public."SupportHub" h ON h.id = s."hubId"
    WHERE s."cohortId" = v_c AND p_user = ANY(h."prayerLeadUserIds")
  ),
  prayfin AS (
    SELECT min(s."prayerFinishedAt") AS ts FROM public."SupportSession" s JOIN public."SupportHub" h ON h.id = s."hubId"
    WHERE s."cohortId" = v_c AND p_user = ANY(h."prayerLeadUserIds")
  ),
  d(key, ts) AS (
    SELECT 'sup-intro', (SELECT ts FROM posts WHERE n = 1)
    UNION ALL SELECT 'sup-post', (SELECT ts FROM posts WHERE n = 2)
    UNION ALL SELECT 'sup-attendance', ts FROM att
    UNION ALL SELECT 'sup-pin', ts FROM pin
    UNION ALL SELECT 'peer-SUPPORT-1', ts FROM reply
    UNION ALL SELECT 'peer-SUPPORT-2', ts FROM pin
    UNION ALL SELECT 'peer-SUPPORT-3', ts FROM att
    UNION ALL SELECT 'hl-attendance', ts FROM hubatt
    UNION ALL SELECT 'as-attendance', ts FROM hubatt
    UNION ALL SELECT 'peer-ASSISTANT-2', ts FROM hubatt
    UNION ALL SELECT 'hl-meeting', ts FROM hubdone
    UNION ALL SELECT 'peer-HUB_LEAD-3', ts FROM hubdone
    UNION ALL SELECT 'hl-message', ts FROM hubmsg
    UNION ALL SELECT 'as-message', ts FROM hubmsg
    UNION ALL SELECT 'peer-HUB_LEAD-1', ts FROM hubmsg
    UNION ALL SELECT 'peer-SUPPORT-hub', ts FROM hubread
    UNION ALL SELECT 'pr-focus', ts FROM prayfocus
    UNION ALL SELECT 'peer-PRAYER_LEAD-2', ts FROM prayfocus
    UNION ALL SELECT 'pr-done', ts FROM prayfin
  )
  INSERT INTO public."PracticeProgress" ("userId", "scenarioKey", "doneAt")
  SELECT p_user, d.key, d.ts FROM d
   WHERE d.ts IS NOT NULL AND (v_reset IS NULL OR d.ts > v_reset) AND (d.key NOT LIKE 'peer-%' OR (v_since IS NOT NULL AND d.ts >= v_since))
  ON CONFLICT ("userId", "scenarioKey") WHERE "userId" IS NOT NULL DO UPDATE
    SET "doneAt" = EXCLUDED."doneAt", "updatedAt" = NOW()
    WHERE public."PracticeProgress"."doneAt" IS NULL AND NOT public."PracticeProgress"."autoDisabled";
END;
$function$;

CREATE OR REPLACE FUNCTION public.practice_reset_me()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_me UUID := public.app_current_user_id();
  v_c UUID;
  v_group public."Group";
  v_no INTEGER;
BEGIN
  IF v_me IS NULL OR NOT EXISTS (SELECT 1 FROM public."PracticeMember" WHERE "userId" = v_me) THEN
    RAISE EXCEPTION 'You are not in Practice';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('practice_place'));
  v_c := public.practice_ensure_cohort();
  DELETE FROM public."PracticeProgress" WHERE "userId" = v_me
    OR "participantId" IN (SELECT gp."participantId" FROM public."GroupParticipant" gp JOIN public."Group" g ON g.id = gp."groupId" WHERE g."supportId" = v_me AND g."cohortId" = v_c);
  UPDATE public."PracticeMember" SET "resetAt" = NOW() WHERE "userId" = v_me;
  SELECT * INTO v_group FROM public."Group" WHERE "supportId" = v_me AND "cohortId" = v_c LIMIT 1;
  IF v_group.id IS NOT NULL THEN
    v_no := COALESCE(NULLIF(regexp_replace(v_group.name, '\D', '', 'g'), '')::int, 1);
    CREATE TEMP TABLE _gone ON COMMIT DROP AS SELECT "participantId" AS id FROM public."GroupParticipant" WHERE "groupId" = v_group.id;
    DELETE FROM public."GroupParticipant" WHERE "groupId" = v_group.id;
    DELETE FROM public."Participant" WHERE id IN (SELECT id FROM _gone);
    DROP TABLE _gone;
    DELETE FROM public."Group" WHERE id = v_group.id;
    PERFORM public.practice_make_group(v_c, v_me, v_no);
  END IF;
END;
$function$;
