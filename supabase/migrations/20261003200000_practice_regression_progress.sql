-- Practice regressions: apply reset/walkthrough cutoffs before aggregating
-- activity, and end walkthroughs before replacing practice participants.
-- Rollback: restore practice_autotick_staff/participant, practice_reset_me,
-- practice_reset_person from their preceding migrations.

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
  -- resetAt is also advanced by seat changes. Preserve that cutoff: already
  -- completed shared sup-* rows remain intact on conflict, while absent rows
  -- can only be filled by qualifying activity after the cutoff.
  SELECT "resetAt" INTO v_reset FROM public."PracticeMember" WHERE "userId" = p_user;
  SELECT "respondedAt" INTO v_since FROM public."PracticePeer"
   WHERE status = 'ACTIVE' AND p_user IN ("fromUserId", "toUserId")
   ORDER BY "respondedAt" DESC LIMIT 1;
  WITH
  posts AS (
    SELECT gp."createdAt" AS ts, row_number() OVER (ORDER BY gp."createdAt") AS n
    FROM public."GroupPost" gp JOIN public."Group" g ON g.id = gp."groupId"
    WHERE g."cohortId" = v_c AND gp."authorUserId" = p_user AND gp."deletedAt" IS NULL
  ),
  att AS (
    SELECT min(r."markedAt") AS ts FROM public."AttendanceRecord" r JOIN public."Week" w ON w.id = r."weekId"
    WHERE w."cohortId" = v_c AND r."markedById" = p_user
      AND (v_reset IS NULL OR r."markedAt" > v_reset)
  ),
  pin AS (
    SELECT min(gp."pinnedAt") AS ts FROM public."GroupPost" gp JOIN public."Group" g ON g.id = gp."groupId"
    WHERE g."cohortId" = v_c AND gp."pinnedById" = p_user
      AND (v_reset IS NULL OR gp."pinnedAt" > v_reset)
  ),
  reply AS (
    SELECT min(rp."createdAt") AS ts FROM public."GroupPostReply" rp
    JOIN public."GroupPost" gp ON gp.id = rp."postId" JOIN public."Group" g ON g.id = gp."groupId"
    WHERE g."cohortId" = v_c AND rp."authorUserId" = p_user AND rp."deletedAt" IS NULL
      AND (v_reset IS NULL OR rp."createdAt" > v_reset)
      AND v_since IS NOT NULL AND rp."createdAt" >= v_since
  ),
  hubatt AS (
    SELECT min(a."markedAt") AS ts FROM public."SupportSessionAttendance" a JOIN public."SupportSession" s ON s.id = a."sessionId"
    WHERE s."cohortId" = v_c AND s."hubId" IS NOT NULL AND a."markedById" = p_user
      AND (v_reset IS NULL OR a."markedAt" > v_reset)
  ),
  hubdone AS (
    SELECT min(s."submittedAt") AS ts FROM public."SupportSession" s
    WHERE s."cohortId" = v_c AND s."hubId" IS NOT NULL AND s."submittedById" = p_user
      AND (v_reset IS NULL OR s."submittedAt" > v_reset)
  ),
  hubmsg AS (
    SELECT min(m."createdAt") AS ts FROM public."HubMessage" m JOIN public."SupportHub" h ON h.id = m."hubId"
    WHERE h."cohortId" = v_c AND m."authorId" = p_user
      AND (v_reset IS NULL OR m."createdAt" > v_reset)
  ),
  hubread AS (
    SELECT min(a."createdAt") AS ts FROM public."HubMessageAck" a
    JOIN public."HubMessage" m ON m.id = a."messageId" JOIN public."SupportHub" h ON h.id = m."hubId"
    WHERE h."cohortId" = v_c AND a."userId" = p_user
      AND (v_reset IS NULL OR a."createdAt" > v_reset)
  ),
  prayfocus AS (
    SELECT min(s."prayerFocusSetAt") AS ts FROM public."SupportSession" s JOIN public."SupportHub" h ON h.id = s."hubId"
    WHERE s."cohortId" = v_c AND p_user = ANY(h."prayerLeadUserIds")
      AND (v_reset IS NULL OR s."prayerFocusSetAt" > v_reset)
  ),
  prayfin AS (
    SELECT min(s."prayerFinishedAt") AS ts FROM public."SupportSession" s JOIN public."SupportHub" h ON h.id = s."hubId"
    WHERE s."cohortId" = v_c AND p_user = ANY(h."prayerLeadUserIds")
      AND (v_reset IS NULL OR s."prayerFinishedAt" > v_reset)
  ),
  -- Peer events are filtered individually before their minima are computed;
  -- an old reply/message cannot hide a later event from the active walkthrough.
  peer_pin AS (
    SELECT min(gp."pinnedAt") AS ts FROM public."GroupPost" gp JOIN public."Group" g ON g.id = gp."groupId"
    WHERE g."cohortId" = v_c AND gp."pinnedById" = p_user
      AND (v_reset IS NULL OR gp."pinnedAt" > v_reset)
      AND v_since IS NOT NULL AND gp."pinnedAt" >= v_since
  ),
  peer_att AS (
    SELECT min(r."markedAt") AS ts FROM public."AttendanceRecord" r JOIN public."Week" w ON w.id = r."weekId"
    WHERE w."cohortId" = v_c AND r."markedById" = p_user
      AND (v_reset IS NULL OR r."markedAt" > v_reset)
      AND v_since IS NOT NULL AND r."markedAt" >= v_since
  ),
  peer_hubatt AS (
    SELECT min(a."markedAt") AS ts FROM public."SupportSessionAttendance" a JOIN public."SupportSession" s ON s.id = a."sessionId"
    WHERE s."cohortId" = v_c AND s."hubId" IS NOT NULL AND a."markedById" = p_user
      AND (v_reset IS NULL OR a."markedAt" > v_reset)
      AND v_since IS NOT NULL AND a."markedAt" >= v_since
  ),
  peer_hubdone AS (
    SELECT min(s."submittedAt") AS ts FROM public."SupportSession" s
    WHERE s."cohortId" = v_c AND s."hubId" IS NOT NULL AND s."submittedById" = p_user
      AND (v_reset IS NULL OR s."submittedAt" > v_reset)
      AND v_since IS NOT NULL AND s."submittedAt" >= v_since
  ),
  peer_hubmsg AS (
    SELECT min(m."createdAt") AS ts FROM public."HubMessage" m JOIN public."SupportHub" h ON h.id = m."hubId"
    WHERE h."cohortId" = v_c AND m."authorId" = p_user
      AND (v_reset IS NULL OR m."createdAt" > v_reset)
      AND v_since IS NOT NULL AND m."createdAt" >= v_since
  ),
  peer_hubread AS (
    SELECT min(a."createdAt") AS ts FROM public."HubMessageAck" a
    JOIN public."HubMessage" m ON m.id = a."messageId" JOIN public."SupportHub" h ON h.id = m."hubId"
    WHERE h."cohortId" = v_c AND a."userId" = p_user
      AND (v_reset IS NULL OR a."createdAt" > v_reset)
      AND v_since IS NOT NULL AND a."createdAt" >= v_since
  ),
  peer_focus AS (
    SELECT min(s."prayerFocusSetAt") AS ts FROM public."SupportSession" s JOIN public."SupportHub" h ON h.id = s."hubId"
    WHERE s."cohortId" = v_c AND p_user = ANY(h."prayerLeadUserIds")
      AND (v_reset IS NULL OR s."prayerFocusSetAt" > v_reset)
      AND v_since IS NOT NULL AND s."prayerFocusSetAt" >= v_since
  ),
  d(key, ts) AS (
    SELECT 'sup-intro', (SELECT ts FROM posts WHERE n = 1 AND (v_reset IS NULL OR ts > v_reset))
    UNION ALL SELECT 'sup-post', (SELECT min(ts) FROM posts WHERE n >= 2 AND (v_reset IS NULL OR ts > v_reset))
    UNION ALL SELECT 'sup-attendance', ts FROM att
    UNION ALL SELECT 'sup-pin', ts FROM pin
    UNION ALL SELECT 'peer-SUPPORT-1', ts FROM reply
    UNION ALL SELECT 'peer-SUPPORT-2', ts FROM peer_pin
    UNION ALL SELECT 'peer-SUPPORT-3', ts FROM peer_att
    UNION ALL SELECT 'hl-attendance', ts FROM hubatt
    UNION ALL SELECT 'as-attendance', ts FROM hubatt
    UNION ALL SELECT 'peer-ASSISTANT-2', ts FROM peer_hubatt
    UNION ALL SELECT 'hl-meeting', ts FROM hubdone
    UNION ALL SELECT 'peer-HUB_LEAD-3', ts FROM peer_hubdone
    UNION ALL SELECT 'hl-message', ts FROM hubmsg
    UNION ALL SELECT 'as-message', ts FROM hubmsg
    UNION ALL SELECT 'peer-HUB_LEAD-1', ts FROM peer_hubmsg
    UNION ALL SELECT 'peer-SUPPORT-hub', ts FROM peer_hubread
    UNION ALL SELECT 'pr-focus', ts FROM prayfocus
    UNION ALL SELECT 'peer-PRAYER_LEAD-2', ts FROM peer_focus
    UNION ALL SELECT 'pr-done', ts FROM prayfin
  )
  INSERT INTO public."PracticeProgress" ("userId", "scenarioKey", "doneAt")
  SELECT p_user, d.key, d.ts FROM d
   WHERE d.ts IS NOT NULL
  ON CONFLICT ("userId", "scenarioKey") WHERE "userId" IS NOT NULL DO UPDATE
    SET "doneAt" = EXCLUDED."doneAt", "updatedAt" = NOW()
    WHERE public."PracticeProgress"."doneAt" IS NULL AND NOT public."PracticeProgress"."autoDisabled";
END;
$function$;

CREATE OR REPLACE FUNCTION public.practice_autotick_participant(p_pid uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_since TIMESTAMPTZ;
BEGIN
  SELECT "respondedAt" INTO v_since FROM public."PracticePeer"
   WHERE status = 'ACTIVE' AND "participantId" = p_pid ORDER BY "respondedAt" DESC LIMIT 1;
  WITH
  post AS (SELECT min("createdAt") AS ts FROM public."GroupPost" WHERE "authorParticipantId" = p_pid AND "deletedAt" IS NULL),
  peer_post AS (
    SELECT min("createdAt") AS ts FROM public."GroupPost"
     WHERE "authorParticipantId" = p_pid AND "deletedAt" IS NULL
       AND v_since IS NOT NULL AND "createdAt" >= v_since
  ),
  engage AS (
    SELECT min(ts) AS ts FROM (
      SELECT "createdAt" AS ts FROM public."GroupPostLike" WHERE "participantId" = p_pid
      UNION ALL SELECT "createdAt" FROM public."GroupPostReply" WHERE "authorParticipantId" = p_pid AND "deletedAt" IS NULL
    ) x
  ),
  refl AS (SELECT min("createdAt") AS ts FROM public."Reflection" WHERE "participantId" = p_pid),
  pw AS (SELECT "passwordSetAt" AS ts FROM public."ParticipantAccount" WHERE "participantId" = p_pid AND NOT "mustChangePassword"),
  prof AS (SELECT "updatedAt" AS ts FROM public."Participant" WHERE id = p_pid AND ("occupation" IS NOT NULL OR "dateOfBirth" IS NOT NULL)),
  d(key, ts) AS (
    SELECT 'pt-signin', COALESCE((SELECT ts FROM pw), CASE WHEN EXISTS (SELECT 1 FROM pw) THEN NOW() END)
    UNION ALL SELECT 'pt-profile', ts FROM prof
    UNION ALL SELECT 'pt-intro', ts FROM post
    UNION ALL SELECT 'peer-PARTICIPANT-2', ts FROM peer_post
    UNION ALL SELECT 'pt-discuss', ts FROM engage
    UNION ALL SELECT 'pt-reflect', ts FROM refl
  )
  INSERT INTO public."PracticeProgress" ("participantId", "scenarioKey", "doneAt")
  SELECT p_pid, d.key, d.ts FROM d
   WHERE d.ts IS NOT NULL
  ON CONFLICT ("participantId", "scenarioKey") WHERE "participantId" IS NOT NULL DO UPDATE
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
  SELECT * INTO v_group FROM public."Group" WHERE "supportId" = v_me AND "cohortId" = v_c LIMIT 1;

  UPDATE public."PracticeMember" pm SET "inParticipantView" = FALSE
   WHERE pm."userId" = v_me OR EXISTS (
     SELECT 1 FROM public."PracticePeer" pp
      WHERE pp.status = 'ACTIVE' AND pm."userId" IN (pp."fromUserId", pp."toUserId")
        AND (v_me IN (pp."fromUserId", pp."toUserId") OR pp."participantId" IN (
          SELECT gp."participantId" FROM public."GroupParticipant" gp
          WHERE gp."groupId" = v_group.id))
   );
  UPDATE public."PracticePeer" pp
     SET status = 'ENDED', "endedAt" = NOW()
   WHERE pp.status = 'ACTIVE'
     AND (v_me IN (pp."fromUserId", pp."toUserId") OR pp."participantId" IN (
       SELECT gp."participantId" FROM public."GroupParticipant" gp
       WHERE gp."groupId" = v_group.id));

  DELETE FROM public."PracticeProgress" WHERE "userId" = v_me
    OR "participantId" IN (SELECT gp."participantId" FROM public."GroupParticipant" gp JOIN public."Group" g ON g.id = gp."groupId" WHERE g."supportId" = v_me AND g."cohortId" = v_c);
  UPDATE public."PracticeMember" SET "resetAt" = NOW() WHERE "userId" = v_me;

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

CREATE OR REPLACE FUNCTION public.practice_reset_person(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_c UUID;
  v_group public."Group";
  v_no INTEGER;
BEGIN
  IF NOT public.app_is_admin() THEN
    RAISE EXCEPTION 'Only admins can reset Practice';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('practice_place'));
  v_c := public.practice_ensure_cohort();
  SELECT * INTO v_group FROM public."Group" WHERE "supportId" = p_user_id AND "cohortId" = v_c LIMIT 1;

  UPDATE public."PracticeMember" pm SET "inParticipantView" = FALSE
   WHERE pm."userId" = p_user_id OR EXISTS (
     SELECT 1 FROM public."PracticePeer" pp
      WHERE pp.status = 'ACTIVE' AND pm."userId" IN (pp."fromUserId", pp."toUserId")
        AND (p_user_id IN (pp."fromUserId", pp."toUserId") OR pp."participantId" IN (
          SELECT gp."participantId" FROM public."GroupParticipant" gp
          WHERE gp."groupId" = v_group.id))
   );
  UPDATE public."PracticePeer" pp
     SET status = 'ENDED', "endedAt" = NOW()
   WHERE pp.status = 'ACTIVE'
     AND (p_user_id IN (pp."fromUserId", pp."toUserId") OR pp."participantId" IN (
       SELECT gp."participantId" FROM public."GroupParticipant" gp
       WHERE gp."groupId" = v_group.id));

  DELETE FROM public."PracticeProgress" WHERE "userId" = p_user_id
    OR "participantId" IN (SELECT gp."participantId" FROM public."GroupParticipant" gp JOIN public."Group" g ON g.id = gp."groupId" WHERE g."supportId" = p_user_id AND g."cohortId" = v_c);
  UPDATE public."PracticeMember" SET "resetAt" = NOW() WHERE "userId" = p_user_id;
  IF v_group.id IS NOT NULL THEN
    v_no := COALESCE(NULLIF(regexp_replace(v_group.name, '\D', '', 'g'), '')::int, 1);
    CREATE TEMP TABLE _gone ON COMMIT DROP AS SELECT "participantId" AS id FROM public."GroupParticipant" WHERE "groupId" = v_group.id;
    DELETE FROM public."GroupParticipant" WHERE "groupId" = v_group.id;
    DELETE FROM public."Participant" WHERE id IN (SELECT id FROM _gone);
    DROP TABLE _gone;
    DELETE FROM public."Group" WHERE id = v_group.id;
    PERFORM public.practice_make_group(v_c, p_user_id, v_no);
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.practice_autotick_staff(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.practice_autotick_participant(uuid) FROM PUBLIC, anon, authenticated;
