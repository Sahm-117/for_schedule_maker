-- Practice: tick scenario steps by themselves when the person has really done
-- them in the Practice cohort (a post, attendance marked, a hub message, the
-- hub meeting submitted, a reflection ...). Detection only ever ticks a step
-- on; unticking a step by hand stops it being detected again.
--
-- Staff are checked on every practice_pulse (every few seconds); participants on
-- every practice_participant_progress. Steps with no trace in the data (or that
-- are just "open this screen") are ticked by the app or by hand.
--
-- Rollback: DROP the two practice_autotick_* functions, drop the column
-- "autoDisabled", and restore practice_set_progress, practice_participant_set_progress,
-- practice_participant_progress and practice_pulse from the two earlier migrations.

ALTER TABLE public."PracticeProgress" ADD COLUMN IF NOT EXISTS "autoDisabled" BOOLEAN NOT NULL DEFAULT FALSE;

CREATE OR REPLACE FUNCTION public.practice_set_progress(p_key TEXT, p_done BOOLEAN, p_stuck BOOLEAN)
 RETURNS VOID
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_me UUID := public.app_current_user_id();
BEGIN
  IF v_me IS NULL OR NOT EXISTS (SELECT 1 FROM public."PracticeMember" WHERE "userId" = v_me) THEN
    RAISE EXCEPTION 'You are not in Practice';
  END IF;
  INSERT INTO public."PracticeProgress" ("userId", "scenarioKey", "doneAt", "stuckAt", "autoDisabled")
  VALUES (v_me, p_key, CASE WHEN p_done THEN NOW() END, CASE WHEN p_stuck THEN NOW() END, NOT p_done AND NOT p_stuck)
  ON CONFLICT ("userId", "scenarioKey") WHERE "userId" IS NOT NULL DO UPDATE
    SET "doneAt" = EXCLUDED."doneAt", "stuckAt" = EXCLUDED."stuckAt",
        "autoDisabled" = CASE WHEN EXCLUDED."doneAt" IS NOT NULL THEN FALSE
                              WHEN EXCLUDED."stuckAt" IS NULL THEN TRUE ELSE public."PracticeProgress"."autoDisabled" END,
        "updatedAt" = NOW();
END;
$function$;

CREATE OR REPLACE FUNCTION public.practice_participant_set_progress(p_token TEXT, p_key TEXT, p_done BOOLEAN, p_stuck BOOLEAN)
 RETURNS VOID
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_pid UUID := public.app_participant_id(p_token);
BEGIN
  IF v_pid IS NULL THEN
    RAISE EXCEPTION 'SESSION_EXPIRED';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "Participant" p JOIN "Cohort" c ON c.id = p."cohortId" WHERE p.id = v_pid AND c."isPractice") THEN
    RAISE EXCEPTION 'This is only for Practice';
  END IF;
  INSERT INTO "PracticeProgress" ("participantId", "scenarioKey", "doneAt", "stuckAt", "autoDisabled")
  VALUES (v_pid, p_key, CASE WHEN p_done THEN NOW() END, CASE WHEN p_stuck THEN NOW() END, NOT p_done AND NOT p_stuck)
  ON CONFLICT ("participantId", "scenarioKey") WHERE "participantId" IS NOT NULL DO UPDATE
    SET "doneAt" = EXCLUDED."doneAt", "stuckAt" = EXCLUDED."stuckAt",
        "autoDisabled" = CASE WHEN EXCLUDED."doneAt" IS NOT NULL THEN FALSE
                              WHEN EXCLUDED."stuckAt" IS NULL THEN TRUE ELSE "PracticeProgress"."autoDisabled" END,
        "updatedAt" = NOW();
END;
$function$;

-- Staff: what has this person really done in Practice?
CREATE OR REPLACE FUNCTION public.practice_autotick_staff(p_user UUID)
 RETURNS VOID
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_c UUID := (SELECT id FROM public."Cohort" WHERE "isPractice" LIMIT 1);
BEGIN
  IF v_c IS NULL THEN
    RETURN;
  END IF;
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
  SELECT p_user, d.key, d.ts FROM d WHERE d.ts IS NOT NULL
  ON CONFLICT ("userId", "scenarioKey") WHERE "userId" IS NOT NULL DO UPDATE
    SET "doneAt" = EXCLUDED."doneAt", "updatedAt" = NOW()
    WHERE public."PracticeProgress"."doneAt" IS NULL AND NOT public."PracticeProgress"."autoDisabled";
END;
$function$;

-- A practice participant: what have they really done?
CREATE OR REPLACE FUNCTION public.practice_autotick_participant(p_pid UUID)
 RETURNS VOID
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  WITH
  post AS (SELECT min("createdAt") AS ts FROM public."GroupPost" WHERE "authorParticipantId" = p_pid AND "deletedAt" IS NULL),
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
    UNION ALL SELECT 'peer-PARTICIPANT-2', ts FROM post
    UNION ALL SELECT 'pt-discuss', ts FROM engage
    UNION ALL SELECT 'pt-reflect', ts FROM refl
  )
  INSERT INTO public."PracticeProgress" ("participantId", "scenarioKey", "doneAt")
  SELECT p_pid, d.key, d.ts FROM d WHERE d.ts IS NOT NULL
  ON CONFLICT ("participantId", "scenarioKey") WHERE "participantId" IS NOT NULL DO UPDATE
    SET "doneAt" = EXCLUDED."doneAt", "updatedAt" = NOW()
    WHERE public."PracticeProgress"."doneAt" IS NULL AND NOT public."PracticeProgress"."autoDisabled";
END;
$function$;

-- A participant's own ticks now include what the data shows they did.
CREATE OR REPLACE FUNCTION public.practice_participant_progress(p_token TEXT)
 RETURNS JSONB
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_pid UUID := public.app_participant_id(p_token);
  v_practice BOOLEAN;
BEGIN
  IF v_pid IS NULL THEN
    RAISE EXCEPTION 'SESSION_EXPIRED';
  END IF;
  SELECT COALESCE(c."isPractice", FALSE) INTO v_practice
  FROM "Participant" p LEFT JOIN "Cohort" c ON c.id = p."cohortId" WHERE p.id = v_pid;
  IF NOT COALESCE(v_practice, FALSE) THEN
    RETURN jsonb_build_object('practice', FALSE, 'items', '[]'::jsonb);
  END IF;
  PERFORM public.practice_autotick_participant(v_pid);
  RETURN jsonb_build_object('practice', TRUE, 'items', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('key', pp."scenarioKey", 'doneAt', pp."doneAt", 'stuckAt', pp."stuckAt"))
    FROM "PracticeProgress" pp WHERE pp."participantId" = v_pid), '[]'::jsonb));
END;
$function$;

-- The pulse checks staff on every beat, and a walkthrough's participant too.
DO $patch$
DECLARE
  v_def TEXT;
  v_new TEXT;
BEGIN
  SELECT pg_get_functiondef('public.practice_pulse()'::regprocedure) INTO v_def;
  IF position('practice_autotick_staff' IN v_def) > 0 THEN
    RETURN;
  END IF;
  v_new := replace(v_def,
    'SELECT COALESCE("practiceOn", FALSE) INTO v_on FROM public."Cohort" WHERE "isPractice" LIMIT 1;',
    E'SELECT COALESCE("practiceOn", FALSE) INTO v_on FROM public."Cohort" WHERE "isPractice" LIMIT 1;\n  IF COALESCE(v_on, FALSE) THEN\n    PERFORM public.practice_autotick_staff(v_me);\n    PERFORM public.practice_autotick_participant(pp."participantId") FROM public."PracticePeer" pp\n      WHERE pp.status = ''ACTIVE'' AND pp."participantId" IS NOT NULL AND v_me IN (pp."fromUserId", pp."toUserId");\n  END IF;');
  IF v_new = v_def THEN
    RAISE EXCEPTION 'practice_pulse: anchor not found';
  END IF;
  EXECUTE v_new;
END
$patch$;

REVOKE ALL ON FUNCTION public.practice_autotick_staff(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.practice_autotick_participant(UUID) FROM PUBLIC, anon, authenticated;
