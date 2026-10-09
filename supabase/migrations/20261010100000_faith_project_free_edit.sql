-- Faith projects: save straight, edit any time, keep every version; prayer is opt-out.
--
-- What changes
--   * A project is now NOT_DRAFTED (nothing saved yet) or SAVED. The review chain (NEEDS_REFINEMENT, UNDER_REFINEMENT, AWAITING_DRAFT,
--     APPROVED) is retired: every project with text becomes SAVED and the old comments and approvals are no longer shown. Nothing is
--     deleted (reviewHistory and the FAITH_COACH / FAITH_OFFICE notes stay in the database).
--   * save_faith_project always saves; it no longer locks a project that was sent for review. It says whether it was a first save
--     or a change so the support can be told.
--   * "FaithProjectVersion" keeps the full text of every save (who, when). A trigger writes it, so no save path can skip the history.
--   * Prayer is opt-out. Participant."prayerConsent" is NULL (not answered, counts as included), 'IN' or 'OUT'.
--     A project is prayable when it is SAVED, has text, the person has not opted out, and either they said yes / were already
--     shared (sharedForPrayer) or corporate prayers have started for the cohort (faith_project_prayable).
--   * FaithProjectSetting gets "prayersStartWeekNumber" (the week whose class day corporate prayers start on) and
--     "prayerPopupDaysBefore" (how many days before that the opt-out pop-up begins; default 3).
--   * hub_prayer_list, set_hub_prayer_focus and participant_home (group prayer focus) use faith_project_prayable instead of
--     "APPROVED and shared". participant_home also returns prayerConsent and prayerPrompt. participant_faith returns the
--     history and the consent and an empty comment trail. The two practice functions create SAVED projects.
--
-- Rollback: restore the previous definitions of the functions listed above from the earlier migrations; the new columns and the
-- version table can stay (they are additive). Old statuses are not restored.


-- ── Tables and columns ────────────────────────────────────────────────────────

ALTER TABLE public."Participant"
  ADD COLUMN IF NOT EXISTS "prayerConsent" TEXT CHECK ("prayerConsent" IN ('IN', 'OUT')),
  ADD COLUMN IF NOT EXISTS "prayerConsentAt" TIMESTAMPTZ;

ALTER TABLE public."FaithProjectSetting"
  ADD COLUMN IF NOT EXISTS "prayersStartWeekNumber" INTEGER CHECK ("prayersStartWeekNumber" IS NULL OR "prayersStartWeekNumber" >= 1),
  ADD COLUMN IF NOT EXISTS "prayerPopupDaysBefore" INTEGER NOT NULL DEFAULT 3 CHECK ("prayerPopupDaysBefore" BETWEEN 0 AND 30);

CREATE TABLE IF NOT EXISTS public."FaithProjectVersion" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "projectId" UUID NOT NULL REFERENCES public."FaithProject"(id) ON DELETE CASCADE,
  "participantId" UUID NOT NULL REFERENCES public."Participant"(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  "savedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "savedById" UUID REFERENCES public."User"(id) ON DELETE SET NULL,
  "savedByName" TEXT
);
CREATE INDEX IF NOT EXISTS "FaithProjectVersion_participant_idx" ON public."FaithProjectVersion" ("participantId", "savedAt" DESC);
ALTER TABLE public."FaithProjectVersion" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff can read faith project versions" ON public."FaithProjectVersion";
CREATE POLICY "Staff can read faith project versions" ON public."FaithProjectVersion" FOR SELECT USING (public.app_is_staff());

-- Every save of a project with text keeps its full text. Staff saves record who; a participant's own save leaves the name empty.
CREATE OR REPLACE FUNCTION public.faith_project_keep_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_actor UUID := public.app_current_user_id();
BEGIN
  INSERT INTO "FaithProjectVersion" ("projectId", "participantId", body, "savedById", "savedByName")
  VALUES (NEW.id, NEW."participantId", NEW.body, v_actor, (SELECT u.name FROM "User" u WHERE u.id = v_actor));
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS faith_project_keep_version ON public."FaithProject";
DROP TRIGGER IF EXISTS faith_project_keep_version_ins ON public."FaithProject";
DROP TRIGGER IF EXISTS faith_project_keep_version_upd ON public."FaithProject";
CREATE TRIGGER faith_project_keep_version_ins
  AFTER INSERT ON public."FaithProject"
  FOR EACH ROW
  WHEN (NEW.status = 'SAVED' AND NULLIF(btrim(COALESCE(NEW.body, '')), '') IS NOT NULL)
  EXECUTE FUNCTION public.faith_project_keep_version();
CREATE TRIGGER faith_project_keep_version_upd
  AFTER UPDATE OF body, status ON public."FaithProject"
  FOR EACH ROW
  WHEN (NEW.status = 'SAVED' AND NULLIF(btrim(COALESCE(NEW.body, '')), '') IS NOT NULL
        AND (OLD.body IS DISTINCT FROM NEW.body OR OLD.status IS DISTINCT FROM NEW.status))
  EXECUTE FUNCTION public.faith_project_keep_version();

-- ── Retire the review states (nothing is deleted) ─────────────────────────────

ALTER TABLE public."FaithProject" DISABLE TRIGGER faith_project_keep_version_upd;
UPDATE public."FaithProject" SET status = 'SAVED'
  WHERE status IN ('NEEDS_REFINEMENT', 'UNDER_REFINEMENT', 'AWAITING_DRAFT', 'APPROVED')
    AND NULLIF(btrim(COALESCE(body, '')), '') IS NOT NULL;
UPDATE public."FaithProject" SET status = 'NOT_DRAFTED'
  WHERE status IN ('NEEDS_REFINEMENT', 'UNDER_REFINEMENT', 'AWAITING_DRAFT', 'APPROVED');
ALTER TABLE public."FaithProject" ENABLE TRIGGER faith_project_keep_version_upd;

-- The text each saved project has today is its first (earlier) version in the history.
INSERT INTO public."FaithProjectVersion" ("projectId", "participantId", body, "savedAt")
SELECT f.id, f."participantId", f.body, f."updatedAt"
FROM public."FaithProject" f
WHERE f.status = 'SAVED' AND NULLIF(btrim(COALESCE(f.body, '')), '') IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public."FaithProjectVersion" v WHERE v."projectId" = f.id);

-- ── When corporate prayers start, and who is prayable ─────────────────────────

-- The class day of the chosen week (its own date once the Planner moved it), or NULL while no start week is set.
CREATE OR REPLACE FUNCTION public.faith_prayers_start_date(p_cohort_id UUID)
RETURNS DATE
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
  SELECT public.week_class_date(c."startDate", s."prayersStartWeekNumber", w."classDate")
  FROM "FaithProjectSetting" s
  JOIN "Cohort" c ON c.id = s."cohortId"
  LEFT JOIN "Week" w ON w."cohortId" = c.id AND w."weekNumber" = s."prayersStartWeekNumber"
  WHERE s."cohortId" = p_cohort_id AND s."prayersStartWeekNumber" IS NOT NULL;
$function$;

CREATE OR REPLACE FUNCTION public.faith_prayers_started(p_cohort_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
  SELECT COALESCE(public.faith_prayers_start_date(p_cohort_id) <= (now() AT TIME ZONE 'Africa/Lagos')::date, FALSE);
$function$;

-- True from "days before" the start until they have answered the pop-up.
CREATE OR REPLACE FUNCTION public.faith_prayers_prompt_due(p_cohort_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
  SELECT COALESCE(
    (now() AT TIME ZONE 'Africa/Lagos')::date >= public.faith_prayers_start_date(p_cohort_id)
      - COALESCE((SELECT s."prayerPopupDaysBefore" FROM "FaithProjectSetting" s WHERE s."cohortId" = p_cohort_id), 3),
    FALSE);
$function$;

CREATE OR REPLACE FUNCTION public.faith_project_prayable(f public."FaithProject")
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
  SELECT f.status = 'SAVED'
    AND NULLIF(btrim(COALESCE(f.body, '')), '') IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM "Participant" p
      WHERE p.id = f."participantId"
        AND p."prayerConsent" IS DISTINCT FROM 'OUT'
        AND (f."sharedForPrayer" OR public.faith_prayers_started(p."cohortId")));
$function$;

-- ── Participant: save, history, consent ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.save_faith_project(p_token text, p_body text, p_submit boolean)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  person_id UUID := public.app_participant_id(p_token);
  project "FaithProject";
  support_id UUID;
  cleaned TEXT := NULLIF(trim(COALESCE(p_body, '')), '');
  v_created BOOLEAN := FALSE;
  v_changed BOOLEAN := FALSE;
BEGIN
  IF person_id IS NULL THEN
    RAISE EXCEPTION 'SESSION_EXPIRED';
  END IF;
  IF cleaned IS NULL THEN
    RAISE EXCEPTION 'PROJECT_REQUIRED';
  END IF;

  SELECT * INTO project FROM "FaithProject" WHERE "participantId" = person_id ORDER BY "updatedAt" DESC LIMIT 1;

  IF project.id IS NULL THEN
    INSERT INTO "FaithProject" ("participantId", body, status)
    VALUES (person_id, cleaned, 'SAVED')
    RETURNING * INTO project;
    v_created := TRUE;
    v_changed := TRUE;
  ELSIF project.status IS DISTINCT FROM 'SAVED' OR project.body IS DISTINCT FROM cleaned THEN
    v_created := project.status IS DISTINCT FROM 'SAVED';
    v_changed := TRUE;
    UPDATE "FaithProject"
    SET body = cleaned, status = 'SAVED', "updatedById" = NULL, "updatedAt" = NOW()
    WHERE id = project.id
    RETURNING * INTO project;
  END IF;

  SELECT g."supportId" INTO support_id
  FROM "GroupParticipant" gp
  JOIN "Group" g ON g.id = gp."groupId"
  JOIN "Participant" p ON p.id = gp."participantId" AND g."cohortId" = p."cohortId"
  WHERE gp."participantId" = person_id
  LIMIT 1;

  RETURN json_build_object(
    'project', json_build_object('id', project.id, 'body', project.body, 'status', project.status, 'updatedAt', project."updatedAt", 'sharedForPrayer', project."sharedForPrayer"),
    'supportId', support_id,
    'created', v_created,
    'changed', v_changed
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.participant_faith(p_token text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  person_id UUID := public.app_participant_id(p_token);
  v_cohort UUID;
  result JSON;
BEGIN
  IF person_id IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  SELECT "cohortId" INTO v_cohort FROM "Participant" WHERE id = person_id;

  result := json_build_object(
    'project', (
      SELECT json_build_object('id', f.id, 'body', f.body, 'status', f.status, 'updatedAt', f."updatedAt", 'sharedForPrayer', f."sharedForPrayer",
        'fromForm', f.status = 'NOT_DRAFTED' AND f.body IS NOT NULL AND EXISTS (
          SELECT 1 FROM "SheetRegistration" s
          JOIN "Participant" p ON p."followUpContactId" = s."contactId"
          WHERE p.id = person_id
            AND trim(s.answers->>'SMART REQUEST (One major prayer request or goal you want answered or achieved within the next three months)') = f.body
        ))
      FROM "FaithProject" f WHERE f."participantId" = person_id
      ORDER BY f."updatedAt" DESC LIMIT 1
    ),
    'deadlineAt', (SELECT s."deadlineAt" FROM "FaithProjectSetting" s WHERE s."cohortId" = v_cohort),
    'history', COALESCE((
      SELECT json_agg(json_build_object('id', v.id, 'body', v.body, 'savedAt', v."savedAt", 'savedByName', v."savedByName") ORDER BY v."savedAt" DESC)
      FROM (SELECT * FROM "FaithProjectVersion" WHERE "participantId" = person_id ORDER BY "savedAt" DESC LIMIT 50) v
    ), '[]'::json),
    'prayerConsent', (SELECT "prayerConsent" FROM "Participant" WHERE id = person_id),
    'prayersStartsOn', public.faith_prayers_start_date(v_cohort),
    'trail', '[]'::json,
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
$function$;

-- Opt in or out of corporate prayers. Answering is what clears the pop-up.
CREATE OR REPLACE FUNCTION public.set_prayer_consent(p_token text, p_consent boolean)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  person_id UUID := public.app_participant_id(p_token);
  v_consent TEXT := CASE WHEN COALESCE(p_consent, FALSE) THEN 'IN' ELSE 'OUT' END;
BEGIN
  IF person_id IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  UPDATE "Participant" SET "prayerConsent" = v_consent, "prayerConsentAt" = NOW() WHERE id = person_id;
  UPDATE "FaithProject" SET "sharedForPrayer" = (v_consent = 'IN') WHERE "participantId" = person_id;
  RETURN json_build_object('prayerConsent', v_consent);
END;
$function$;

-- The older toggle (cached apps) now just records the same answer.
CREATE OR REPLACE FUNCTION public.set_faith_project_prayer_share(p_token text, p_shared boolean)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_row "FaithProject";
BEGIN
  PERFORM public.set_prayer_consent(p_token, p_shared);
  SELECT f.* INTO v_row FROM "FaithProject" f WHERE f."participantId" = public.app_participant_id(p_token) ORDER BY f."updatedAt" DESC LIMIT 1;
  RETURN json_build_object('id', v_row.id, 'sharedForPrayer', COALESCE(v_row."sharedForPrayer", FALSE));
END;
$function$;

REVOKE ALL ON FUNCTION public.set_prayer_consent(text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_prayer_consent(text, boolean) TO anon, authenticated;

-- ── Existing functions, rewritten from their live definitions ─────────────────

CREATE OR REPLACE FUNCTION public.hub_prayer_list(p_hub_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor_id UUID;
  v_result JSON;
BEGIN
  IF NOT public.app_is_staff() THEN
    RAISE EXCEPTION 'You must be signed in as a support or admin';
  END IF;
  v_actor_id := public.app_current_user_id();

  IF NOT public.app_is_admin() THEN
    IF NOT EXISTS (SELECT 1 FROM public."HubMembership" m WHERE m."hubId" = p_hub_id AND m."userId" = v_actor_id)
      AND NOT EXISTS (SELECT 1 FROM public."HubItSupport" hi WHERE hi."hubId" = p_hub_id AND hi."userId" = v_actor_id)
    THEN
      RAISE EXCEPTION 'You must be a member, IT support, or admin of this hub to see its prayer list';
    END IF;
  END IF;

  SELECT COALESCE(json_agg(json_build_object(
    'faithProjectId', f.id,
    'participantId', p.id,
    'fullName', p."fullName",
    'groupName', g.name,
    'supportName', support.name,
    'body', f.body,
    'categoryName', cat.name,
    'timesPrayedFor', (
      SELECT COUNT(*) FROM public."SupportSession" s2
      WHERE s2."hubId" = p_hub_id AND s2.type = 'SUNDAY_RECAP'
        AND f.id = ANY(COALESCE(s2."prayedForFaithProjectIds", ARRAY[]::UUID[]))
    ),
    'lastPrayedWeek', (
      SELECT w2."weekNumber" FROM public."SupportSession" s2
      JOIN public."Week" w2 ON w2.id = s2."weekId"
      WHERE s2."hubId" = p_hub_id AND s2.type = 'SUNDAY_RECAP'
        AND f.id = ANY(COALESCE(s2."prayedForFaithProjectIds", ARRAY[]::UUID[]))
      ORDER BY w2."weekNumber" DESC LIMIT 1
    )
  ) ORDER BY p."fullName"), '[]'::json)
  INTO v_result
  FROM public."FaithProject" f
  JOIN public."Participant" p ON p.id = f."participantId"
  JOIN public."GroupParticipant" gp ON gp."participantId" = p.id
  JOIN public."Group" g ON g.id = gp."groupId" AND g."archivedAt" IS NULL
  JOIN public."HubMembership" hm ON hm."userId" = g."supportId" AND hm."hubId" = p_hub_id
  JOIN public."SupportHub" hub ON hub.id = hm."hubId" AND hub."cohortId" = g."cohortId"
  LEFT JOIN public."User" support ON support.id = g."supportId"
  LEFT JOIN public."FaithProjectCategory" cat ON cat.id = f."categoryId"
  WHERE public.faith_project_prayable(f);

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_hub_prayer_focus(p_hub_id uuid, p_week_id integer, p_faith_project_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor_id UUID;
  v_hub public."SupportHub";
  v_week public."Week";
  v_session public."SupportSession";
BEGIN
  IF NOT public.app_is_staff() THEN
    RAISE EXCEPTION 'You must be signed in as a support or admin';
  END IF;
  v_actor_id := public.app_current_user_id();

  SELECT * INTO v_hub FROM public."SupportHub" WHERE id = p_hub_id;
  IF v_hub.id IS NULL THEN
    RAISE EXCEPTION 'Hub was not found';
  END IF;

  IF NOT public.app_is_admin() THEN
    IF v_hub."leadUserId" IS DISTINCT FROM v_actor_id
      AND v_hub."assistantLeadUserId" IS DISTINCT FROM v_actor_id
      AND NOT COALESCE(v_actor_id = ANY(v_hub."prayerLeadUserIds"), FALSE)
    THEN
      RAISE EXCEPTION 'Only this hub''s lead, assistant lead, prayer lead, or an admin can set its prayer focus';
    END IF;
  END IF;

  IF p_faith_project_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public."FaithProject" f
      JOIN public."Participant" p ON p.id = f."participantId"
      JOIN public."GroupParticipant" gp ON gp."participantId" = p.id
      JOIN public."Group" g ON g.id = gp."groupId" AND g."archivedAt" IS NULL
      JOIN public."HubMembership" hm ON hm."userId" = g."supportId" AND hm."hubId" = p_hub_id AND hm."cohortId" = g."cohortId"
      WHERE f.id = p_faith_project_id
        AND public.faith_project_prayable(f)
    ) THEN
      RAISE EXCEPTION 'That Faith Project is not on this hub''s prayer list';
    END IF;
  END IF;

  SELECT * INTO v_week FROM public."Week" WHERE id = p_week_id;
  IF v_week.id IS NULL THEN RAISE EXCEPTION 'Week was not found'; END IF;
  IF v_hub."cohortId" IS DISTINCT FROM v_week."cohortId" THEN
    RAISE EXCEPTION 'This hub and week are not in the same cohort';
  END IF;

  -- Find-or-create the week's SUNDAY_RECAP session, same as
  -- mark_support_attendance / submit_hub_meeting.
  INSERT INTO public."SupportSession" ("cohortId", type, title, "sessionDate", "weekId", "hubId", "createdById")
  VALUES (v_week."cohortId", 'SUNDAY_RECAP', format('Sunday recap · Week %s', v_week."weekNumber"), CURRENT_DATE, p_week_id, p_hub_id, v_actor_id)
  ON CONFLICT ("hubId", "weekId") DO NOTHING;

  UPDATE public."SupportSession"
  SET "prayerFocusFaithProjectId" = p_faith_project_id,
      "prayerFocusSetAt" = CASE WHEN p_faith_project_id IS NOT NULL THEN NOW() ELSE NULL END,
      "prayedForFaithProjectIds" = CASE
        WHEN p_faith_project_id IS NOT NULL
          AND NOT (p_faith_project_id = ANY(COALESCE("prayedForFaithProjectIds", ARRAY[]::UUID[])))
          THEN array_append(COALESCE("prayedForFaithProjectIds", ARRAY[]::UUID[]), p_faith_project_id)
        ELSE COALESCE("prayedForFaithProjectIds", ARRAY[]::UUID[])
      END
  WHERE "hubId" = p_hub_id AND "weekId" = p_week_id AND type = 'SUNDAY_RECAP'
  RETURNING * INTO v_session;

  RETURN jsonb_build_object(
    'sessionId', v_session.id,
    'hubId', v_session."hubId",
    'weekId', v_session."weekId",
    'faithProjectId', v_session."prayerFocusFaithProjectId",
    'setAt', v_session."prayerFocusSetAt",
    'prayedForIds', to_jsonb(COALESCE(v_session."prayedForFaithProjectIds", ARRAY[]::UUID[]))
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.participant_home(p_token text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  person_id UUID := public.app_participant_id(p_token);
  person "Participant";
  cohort "Cohort";
  grp "Group";
  support "User";
BEGIN
  IF person_id IS NULL THEN
    RAISE EXCEPTION 'SESSION_EXPIRED';
  END IF;

  SELECT * INTO person FROM "Participant" WHERE id = person_id;
  SELECT * INTO cohort FROM "Cohort" WHERE id = person."cohortId";
  SELECT g.* INTO grp
  FROM "GroupParticipant" gp
  JOIN "Group" g ON g.id = gp."groupId" AND g."cohortId" = person."cohortId"
  WHERE gp."participantId" = person_id
  LIMIT 1;
  SELECT * INTO support FROM "User" WHERE id = grp."supportId";

  RETURN json_build_object(
    'now', NOW(),
    'participant', json_build_object('id', person.id, 'name', person."fullName", 'phone', person.phone),
    'cohort', CASE WHEN cohort.id IS NULL THEN NULL ELSE json_build_object(
      'id', cohort.id, 'name', cohort.name, 'startDate', cohort."startDate", 'endDate', cohort."endDate",
      'status', cohort.status, 'venue', cohort.venue
    ) END,
    'group', CASE WHEN grp.id IS NULL THEN NULL ELSE json_build_object(
      'id', grp.id, 'name', grp.name, 'meetingDay', grp."meetingDay", 'meetingTime', grp."meetingTime",
      'meetingDurationMins', grp."meetingDurationMins", 'callPlatform', grp."callPlatform", 'callLink', grp."callLink",
      'supportName', support.name, 'supportPhone', support.phone, 'supportAvatarUrl', support."avatarUrl"
    ) END,
    'groupMeetingLive', (
      SELECT json_build_object('weekId', gm."weekId", 'startedAt', gm.started, 'prayerFinished', gps."prayerFinishedAt" IS NOT NULL, 'recapFinished', gps."recapFinishedAt" IS NOT NULL,
        'recap', CASE WHEN gps."prayerFinishedAt" IS NOT NULL
          AND COALESCE(lw."shareWithParticipants", FALSE)
          AND (btrim(COALESCE(lw."recapSummary", '')) <> '' OR lw."recapDocumentUrl" IS NOT NULL)
          THEN json_build_object(
            'recapSummary', lw."recapSummary", 'discussionPrompt', lw."discussionPrompt",
            'recapDocumentUrl', lw."recapDocumentUrl", 'recapDocumentName', lw."recapDocumentName"
          ) END)
      FROM (
        SELECT m."weekId" AS "weekId", MIN(m."markedAt") AS started
        FROM "MeetingAttendance" m
        WHERE m."groupId" = grp.id
        GROUP BY m."weekId"
      ) gm
      LEFT JOIN "GroupPrayerStatus" gps ON gps."groupId" = grp.id AND gps."weekId" = gm."weekId"
      LEFT JOIN "Week" lw ON lw.id = gm."weekId"
      WHERE gm.started > NOW() - INTERVAL '3 hours'
        AND COALESCE(gps.done, FALSE) = FALSE
      ORDER BY gm.started DESC
      LIMIT 1
    ),
    'groupPrayerFocus', (
      SELECT json_build_object(
        'weekId', f."weekId",
        'participantName', fp_person."fullName",
        'projectText', (
          SELECT fp.body FROM "FaithProject" fp
          WHERE fp."participantId" = fp_person.id AND public.faith_project_prayable(fp)
          ORDER BY fp."updatedAt" DESC LIMIT 1
        )
      )
      FROM "GroupPrayerFocus" f
      JOIN "Participant" fp_person ON fp_person.id = f."participantId"
      WHERE f."groupId" = grp.id
        AND f."weekId" = (
          SELECT gm."weekId"
          FROM (
            SELECT m."weekId" AS "weekId", MIN(m."markedAt") AS started
            FROM "MeetingAttendance" m
            WHERE m."groupId" = grp.id
            GROUP BY m."weekId"
          ) gm
          LEFT JOIN "GroupPrayerStatus" gps ON gps."groupId" = grp.id AND gps."weekId" = gm."weekId"
          WHERE gm.started > NOW() - INTERVAL '3 hours'
            AND COALESCE(gps.done, FALSE) = FALSE
          ORDER BY gm.started DESC
          LIMIT 1
        )
    ),
    'weeks', COALESCE((
      SELECT json_agg(json_build_object(
        'id', w.id,
        'weekNumber', w."weekNumber",
        'classDate', public.week_class_date(cohort."startDate", w."weekNumber", w."classDate"),
        'title', w.title,
        'teacher', CASE WHEN btrim(COALESCE(w."teacherName", '')) <> '' THEN json_build_object(
          'name', btrim(w."teacherName"), 'role', NULLIF(btrim(COALESCE(w."teacherRole", '')), ''),
          'bio', NULLIF(btrim(COALESCE(w."teacherBio", '')), ''), 'photoUrl', w."teacherPhotoUrl"
        ) END,
        'classGraphicUrl', w."classGraphicUrl",
        'manualReleasesAt', CASE WHEN NOT manual_rel.released AND w."manualDocumentUrl" IS NOT NULL
          THEN public.recap_release_at(public.week_class_date(cohort."startDate", w."weekNumber", w."classDate"), 'manual') END,
        'classTime', (
          SELECT a.time FROM "Day" d JOIN "Activity" a ON a."dayId" = d.id
          WHERE d."weekId" = w.id AND d."dayName" = 'Sunday' AND a.description ~* '^\s*class\s*[0-9]|introductory class'
          ORDER BY a.time LIMIT 1
        ),
        'expectations', w.expectations,
        'shared', w."shareWithParticipants",
        'released', rel.released,
        'releasedAt', rel."releasedAt",
        'recapSummary', CASE WHEN rel.released THEN w."recapSummary" END,
        'discussionPrompt', CASE WHEN rel.released THEN w."discussionPrompt" END,
        'recapDocumentUrl', CASE WHEN rel.released THEN w."recapDocumentUrl" END,
        'recapDocumentName', CASE WHEN rel.released THEN w."recapDocumentName" END,
        'manual', CASE WHEN manual_rel.released AND w."manualDocumentUrl" IS NOT NULL THEN json_build_object(
          'documentUrl', w."manualDocumentUrl", 'documentName', w."manualDocumentName",
          'summary', w."manualSummary", 'discussionPrompt', w."manualDiscussionPrompt"
        ) END,
        'manualQuestions', COALESCE((
          SELECT json_agg(json_build_object(
            'id', mq.id, 'body', mq.body, 'status', mq.status, 'reply', mq.reply, 'createdAt', mq."createdAt"
          ) ORDER BY mq."createdAt")
          FROM "ManualQuestion" mq WHERE mq."weekId" = w.id AND mq."participantId" = person_id
        ), '[]'::json),
        'manualNote', (SELECT n.body FROM "ManualNote" n WHERE n."weekId" = w.id AND n."participantId" = person_id)
      ) ORDER BY w."weekNumber")
      FROM "Week" w
      CROSS JOIN LATERAL (
        SELECT
          COALESCE(w."shareWithParticipants" AND (
            btrim(COALESCE(w."recapSummary", '')) <> ''
            OR w."recapDocumentUrl" IS NOT NULL
          ) AND (
            w."participantReleasedEarlyAt" IS NOT NULL
            OR COALESCE(cohort."isPractice", FALSE)
            OR NOW() >= public.recap_release_at(public.week_class_date(cohort."startDate", w."weekNumber", w."classDate"), 'participant')
          ), FALSE) AS released,
          COALESCE(w."participantReleasedEarlyAt", public.recap_release_at(public.week_class_date(cohort."startDate", w."weekNumber", w."classDate"), 'participant')) AS "releasedAt"
        FROM (SELECT 1) one
      ) rel
      CROSS JOIN LATERAL (
        SELECT COALESCE(
          w."manualReleasedEarlyAt" IS NOT NULL
          OR NOW() >= public.recap_release_at(public.week_class_date(cohort."startDate", w."weekNumber", w."classDate"), 'manual'),
          FALSE
        ) AS released
      ) manual_rel
      WHERE w."cohortId" = person."cohortId"
    ), '[]'::json),
    'reflections', COALESCE((
      SELECT json_agg(json_build_object(
        'weekId', r."weekId", 'stoodOut', r."stoodOut", 'goal', r.goal, 'goalCheck', r."goalCheck",
        'goalDoneAt', r."goalDoneAt", 'createdAt', r."createdAt", 'updatedAt', r."updatedAt"
      ))
      FROM "Reflection" r WHERE r."participantId" = person_id
    ), '[]'::json),
    'sunday', COALESCE((
      SELECT json_agg(json_build_object('weekId', a."weekId", 'status', a.status, 'lateExcused', a."lateExcused"))
      FROM "AttendanceRecord" a JOIN "Week" w ON w.id = a."weekId" AND w."cohortId" = person."cohortId"
      WHERE a."participantId" = person_id
    ), '[]'::json),
    'meeting', COALESCE((
      SELECT json_agg(json_build_object('weekId', m."weekId", 'status', m.status))
      FROM "MeetingAttendance" m JOIN "Week" w ON w.id = m."weekId" AND w."cohortId" = person."cohortId"
      WHERE m."participantId" = person_id
    ), '[]'::json),
    'openWindow', (
      SELECT jsonb_build_object(
        'weekId', s."weekId",
        'closesAt', s."closesAt",
        'myStatus', (SELECT a.status FROM "AttendanceRecord" a WHERE a."weekId" = s."weekId" AND a."participantId" = person_id)
      )
      FROM "AttendanceSession" s
      JOIN "Week" w2 ON w2.id = s."weekId" AND w2."cohortId" = person."cohortId"
      WHERE s."startedAt" IS NOT NULL AND s."closesAt" > NOW() AND s."finalizedAt" IS NULL
      ORDER BY s."startedAt" DESC LIMIT 1
    ),
    'faithProjectStatus', (SELECT f.status FROM "FaithProject" f WHERE f."participantId" = person_id ORDER BY f."updatedAt" DESC LIMIT 1),
    'prayerConsent', person."prayerConsent",
    'prayerPrompt', CASE WHEN person."prayerConsent" IS NULL AND public.faith_prayers_prompt_due(person."cohortId")
      THEN json_build_object('startsOn', public.faith_prayers_start_date(person."cohortId")) ELSE NULL END,
    'rules', (SELECT value FROM "AppSetting" WHERE "settingKey" = 'programme_rules'),
    'scriptures', CASE WHEN COALESCE((SELECT (value #>> '{}')::boolean FROM "AppSetting" WHERE "settingKey" = 'scriptures_enabled'), TRUE)
      THEN COALESCE((
        SELECT json_agg(json_build_object('dayNumber', sc."dayNumber", 'imageUrl', sc."imageUrl") ORDER BY sc."dayNumber")
        FROM "Scripture" sc
      ), '[]'::json)
      ELSE '[]'::json
    END,
    'scriptureStartDay', COALESCE((SELECT (value #>> '{}')::int FROM "AppSetting" WHERE "settingKey" = 'scripture_start_day'), 1),
    'members', COALESCE((
      SELECT json_agg(json_build_object('name', m."fullName", 'avatarUrl', m."avatarUrl") ORDER BY m."fullName")
      FROM "GroupParticipant" gp JOIN "Participant" m ON m.id = gp."participantId"
      WHERE gp."groupId" = grp.id AND m.id <> person_id AND m.status = 'ACTIVE'
    ), '[]'::json),
    'profile', json_build_object(
      'email', person.email,
      'avatarUrl', person."avatarUrl",
      'gender', person.gender,
      'ageRange', person."ageRange",
      'dateOfBirth', person."dateOfBirth",
      'occupation', COALESCE(person.occupation, (SELECT f.occupation FROM "FollowUpContact" f WHERE f.id = person."followUpContactId"))
    ),
    'faithUnread', EXISTS (
      SELECT 1 FROM "ParticipantNote" n
      WHERE n."participantId" = person_id AND n."noteType" = 'FAITH_COACH' AND NOT n."byParticipant"
        AND n."createdAt" > GREATEST(
          COALESCE((SELECT t."coachLastReadAt" FROM "ParticipantThreadRead" t WHERE t."participantId" = person_id), '-infinity'::timestamptz),
          '2026-09-17T02:00:00Z'::timestamptz)
    ),
    'reminders', (
      SELECT json_build_object(
        'meetingRemindMinutes', COALESCE(rs."meetingRemindMinutes", '[60]'::jsonb),
        'recapReleased', COALESCE(rs."recapReleased", TRUE)
      )
      FROM (SELECT 1) one LEFT JOIN "ParticipantReminderSetting" rs ON rs."participantId" = person_id
    ),
    'resources', COALESCE((
      SELECT json_agg(json_build_object('id', r.id, 'title', r.title, 'description', r.description, 'type', r.type, 'url', r.url, 'fileName', r."fileName") ORDER BY r.title)
      FROM "Resource" r WHERE r."visibleToParticipants" AND (r."cohortId" IS NULL OR r."cohortId" = person."cohortId")
    ), '[]'::json),
    'announcement', (
      SELECT json_build_object('id', a.id, 'subject', a.subject, 'body', a.body, 'linkUrl', a."linkUrl", 'linkLabel', a."linkLabel", 'homeLabel', a."homeLabel")
      FROM "Announcement" a
      WHERE a."showOnHome" AND a."homeUntil" > NOW() AND a.audience IN ('PARTICIPANTS', 'EVERYONE')
        AND (a.scope = 'ALL_USERS' OR a."cohortId" IS NULL OR a."cohortId" = person."cohortId")
        AND a."targetUserId" IS NULL
        AND (a."targetParticipantId" IS NULL OR a."targetParticipantId" = person_id)
      ORDER BY a."sentAt" DESC LIMIT 1
    ),
    'wrapUp', (
      SELECT json_build_object('submitted', w."participantId" IS NOT NULL, 'department', w.department)
      FROM (SELECT 1) one
      LEFT JOIN "ParticipantWrapUp" w ON w."participantId" = person_id AND w."cohortId" = person."cohortId"
    ),
    'profileFields', public.participant_profile_fields(person_id),
    'profileCompletion', public.profile_completion_for(person_id),
    'lastCheckIn', (
      SELECT json_build_object('response', c.response, 'sundayMisses', c."sundayMisses", 'meetingMisses', c."meetingMisses", 'createdAt', c."createdAt")
      FROM "ParticipantCheckIn" c WHERE c."participantId" = person_id
      ORDER BY c."createdAt" DESC LIMIT 1
    ),
    'classFeedbackDue', (
      SELECT json_build_object(
        'weekId', w3.id,
        'weekNumber', w3."weekNumber",
        'open', NOW() >= public.class_feedback_release_at(public.week_class_date(cohort."startDate", w3."weekNumber", w3."classDate"), 'participant')
      )
      FROM (
        SELECT wk.* FROM "Week" wk
        WHERE wk."cohortId" = person."cohortId"
          AND cohort."startDate" IS NOT NULL
          AND (public.week_class_date(cohort."startDate", wk."weekNumber", wk."classDate")::TIMESTAMP AT TIME ZONE 'Africa/Lagos') <= NOW()
        ORDER BY wk."weekNumber" DESC
        LIMIT 1
      ) w3
      WHERE NOT EXISTS (SELECT 1 FROM "ParticipantClassFeedbackDone" d WHERE d."participantId" = person_id AND d."weekId" = w3.id)
    ),
    'departmentPromptDue', COALESCE((
      SELECT TRUE
      FROM "AppSetting" cft
      WHERE cft."settingKey" = 'class_feedback_times'
        AND (cft.value->>'departmentWeek') IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM "ParticipantWrapUp" ww WHERE ww."participantId" = person_id AND ww."cohortId" = person."cohortId")
        AND EXISTS (
          SELECT 1 FROM "Week" dwk
          WHERE dwk."cohortId" = person."cohortId"
            AND dwk."weekNumber" >= (cft.value->>'departmentWeek')::int
            AND NOW() >= (public.week_class_date(cohort."startDate", dwk."weekNumber", dwk."classDate")::TIMESTAMP AT TIME ZONE 'Africa/Lagos')
        )
    ), FALSE)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.practice_make_group(p_cohort uuid, p_user uuid, p_no integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_group UUID;
  v_pid UUID;
  k INTEGER;
  v_names TEXT[] := ARRAY['Ada', 'Bola', 'Chidi', 'Dayo', 'Efe', 'Femi', 'Gozie', 'Hauwa', 'Ifeanyi', 'Jide', 'Kemi', 'Lola'];
BEGIN
  INSERT INTO public."Group" ("cohortId", name, "supportId")
  VALUES (p_cohort, format('Practice Group %s', p_no), p_user)
  RETURNING id INTO v_group;

  FOR k IN 1..3 LOOP
    INSERT INTO public."Participant" ("fullName", phone, "cohortId", status, "isTest", gender)
    VALUES (
      format('%s Practice %s', v_names[((p_no - 1) * 3 + k - 1) % 12 + 1], p_no),
      '0800999' || lpad((p_no * 10 + k)::text, 4, '0'),
      p_cohort, 'ACTIVE', TRUE, CASE WHEN k % 2 = 0 THEN 'Male' ELSE 'Female' END)
    RETURNING id INTO v_pid;
    INSERT INTO public."GroupParticipant" ("groupId", "participantId") VALUES (v_group, v_pid);
    INSERT INTO public."ParticipantAccount" ("participantId", password_hash, "setupCode", "mustChangePassword", "isActive", "issuedAt")
    VALUES (v_pid, extensions.crypt('FOF-PRACTICE', extensions.gen_salt('bf', 10)), 'FOF-PRACTICE', TRUE, TRUE, NOW());
    IF k = 1 THEN
      INSERT INTO public."FaithProject" ("participantId", title, body, status, "sharedForPrayer")
      VALUES (v_pid, 'Practice faith project', 'A short practice faith project, here so there is something to pray for.', 'SAVED', TRUE);
    END IF;
  END LOOP;
  RETURN v_group;
END;
$function$;

CREATE OR REPLACE FUNCTION public.practice_reset_participant(p_participant_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_c UUID;
  v_p public."Participant";
  v_group UUID;
  v_new UUID;
  v_first BOOLEAN;
BEGIN
  IF NOT public.app_is_admin() THEN
    RAISE EXCEPTION 'Only admins can reset Practice';
  END IF;
  v_c := public.practice_ensure_cohort();
  SELECT * INTO v_p FROM public."Participant" WHERE id = p_participant_id AND "cohortId" = v_c;
  IF v_p.id IS NULL THEN
    RAISE EXCEPTION 'That is not a practice participant';
  END IF;
  SELECT "groupId" INTO v_group FROM public."GroupParticipant" WHERE "participantId" = v_p.id LIMIT 1;
  v_first := EXISTS (SELECT 1 FROM public."FaithProject" WHERE "participantId" = v_p.id);
  DELETE FROM public."GroupParticipant" WHERE "participantId" = v_p.id;
  DELETE FROM public."Participant" WHERE id = v_p.id;
  INSERT INTO public."Participant" ("fullName", phone, "cohortId", status, "isTest", gender)
  VALUES (v_p."fullName", v_p.phone, v_c, 'ACTIVE', TRUE, v_p.gender) RETURNING id INTO v_new;
  IF v_group IS NOT NULL THEN
    INSERT INTO public."GroupParticipant" ("groupId", "participantId") VALUES (v_group, v_new);
  END IF;
  INSERT INTO public."ParticipantAccount" ("participantId", password_hash, "setupCode", "mustChangePassword", "isActive", "issuedAt")
  VALUES (v_new, extensions.crypt('FOF-PRACTICE', extensions.gen_salt('bf', 10)), 'FOF-PRACTICE', TRUE, TRUE, NOW());
  IF v_first THEN
    INSERT INTO public."FaithProject" ("participantId", title, body, status, "sharedForPrayer")
    VALUES (v_new, 'Practice faith project', 'A short practice faith project, here so there is something to pray for.', 'SAVED', TRUE);
  END IF;
END;
$function$;

