-- Several Recap Leads / Prayer Leads per hub, and an admin-only
-- "person of interest" tag on hub members.
--
-- Design notes, read before touching anything below:
--
-- 1. SupportHub gets "recapLeadUserIds" / "prayerLeadUserIds" UUID[] (same
--    array-column shape as "assistantPermissions"), backfilled from the old
--    single "recapLeadUserId" / "prayerLeadUserId" columns. The old columns
--    are left in place but no longer read or written by anything below or
--    by the frontend. Hub Lead, Assistant Lead and IT Support stay single.
--
-- 2. build_hub_view, set_hub_prayer_focus, set_hub_prayer_state and
--    notify_hub_role_assigned are CREATE OR REPLACE'd verbatim from the live
--    database, changing only the recap/prayer lead checks to "= ANY(array)"
--    (and, in build_hub_view, the person-of-interest field). build_hub_view's
--    hub object swaps recapLeadUserId (and prayer) for recapLeadUserIds /
--    recapLeadNames lists; recapLeadName becomes the names joined with " & ".
--
-- 3. HubPersonOfInterest: one row = this member is tagged at this hub.
--    RLS is admin-only (no staff read, unlike HubItSupport), so other
--    supports can't read it through the API. The hub's lead sees it only via
--    build_hub_view's members[].isPersonOfInterest (null for anyone who isn't
--    the lead or an admin). Only admins set it.
--
-- Additive and idempotent.

-- ── 1. SupportHub list columns ──────────────────────────────────────────────

ALTER TABLE public."SupportHub"
  ADD COLUMN IF NOT EXISTS "recapLeadUserIds" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  ADD COLUMN IF NOT EXISTS "prayerLeadUserIds" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[];

UPDATE public."SupportHub" SET "recapLeadUserIds" = ARRAY["recapLeadUserId"]
WHERE "recapLeadUserId" IS NOT NULL AND cardinality("recapLeadUserIds") = 0;
UPDATE public."SupportHub" SET "prayerLeadUserIds" = ARRAY["prayerLeadUserId"]
WHERE "prayerLeadUserId" IS NOT NULL AND cardinality("prayerLeadUserIds") = 0;

-- ── 2. HubPersonOfInterest ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public."HubPersonOfInterest" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "hubId" UUID NOT NULL REFERENCES public."SupportHub"(id) ON DELETE CASCADE,
  "userId" UUID NOT NULL REFERENCES public."User"(id) ON DELETE CASCADE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("hubId", "userId")
);

CREATE INDEX IF NOT EXISTS idx_hubpersonofinterest_hub ON public."HubPersonOfInterest"("hubId");

ALTER TABLE public."HubPersonOfInterest" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage hub people of interest" ON public."HubPersonOfInterest";
CREATE POLICY "Admins manage hub people of interest" ON public."HubPersonOfInterest" FOR ALL USING (public.app_is_admin()) WITH CHECK (public.app_is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public."HubPersonOfInterest" TO anon, authenticated;

-- ── 3. build_hub_view — live version + lead lists + isPersonOfInterest ──────

CREATE OR REPLACE FUNCTION public.build_hub_view(p_hub_id uuid, p_cohort_id uuid, p_actor_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_hub public."SupportHub";
  v_is_lead BOOLEAN;
  v_is_assistant BOOLEAN;
  v_is_it_support BOOLEAN;
  v_can_meeting BOOLEAN;
  v_can_attendance BOOLEAN;
  v_can_message BOOLEAN;
  v_show_acks BOOLEAN;
  v_show_poi BOOLEAN;
  v_my_jobs TEXT[];
  v_result JSON;
BEGIN
  SELECT * INTO v_hub FROM public."SupportHub" WHERE id = p_hub_id;
  IF v_hub.id IS NULL THEN
    RETURN NULL;
  END IF;

  v_is_lead := (v_hub."leadUserId" = p_actor_id);
  v_is_assistant := (v_hub."assistantLeadUserId" = p_actor_id);
  v_is_it_support := EXISTS (SELECT 1 FROM public."HubItSupport" WHERE "hubId" = p_hub_id AND "userId" = p_actor_id);

  v_can_meeting := v_is_lead OR (v_is_assistant AND 'MEETING' = ANY(COALESCE(v_hub."assistantPermissions", ARRAY[]::TEXT[])));
  v_can_attendance := v_is_lead OR (v_is_assistant AND 'ATTENDANCE' = ANY(COALESCE(v_hub."assistantPermissions", ARRAY[]::TEXT[])));
  v_can_message := v_is_lead OR (v_is_assistant AND 'MESSAGE' = ANY(COALESCE(v_hub."assistantPermissions", ARRAY[]::TEXT[])));
  v_show_acks := v_is_lead OR v_is_assistant OR public.app_is_admin();
  -- Person-of-interest tag: admins and this hub's lead only (not assistant).
  v_show_poi := v_is_lead OR public.app_is_admin();

  v_my_jobs := array_remove(ARRAY[
    CASE WHEN v_is_lead THEN 'HUB_LEAD' END,
    CASE WHEN v_is_assistant THEN 'ASSISTANT_HUB_LEAD' END,
    CASE WHEN p_actor_id = ANY(v_hub."recapLeadUserIds") THEN 'RECAP_LEAD' END,
    CASE WHEN p_actor_id = ANY(v_hub."prayerLeadUserIds") THEN 'PRAYER_LEAD' END,
    CASE WHEN v_is_it_support THEN 'IT_SUPPORT' END
  ], NULL);

  SELECT json_build_object(
    'hub', json_build_object(
      'id', v_hub.id, 'name', v_hub.name, 'cohortId', v_hub."cohortId",
      'leadUserId', v_hub."leadUserId", 'leadName', (SELECT name FROM public."User" WHERE id = v_hub."leadUserId"),
      'assistantLeadUserId', v_hub."assistantLeadUserId", 'assistantLeadName', (SELECT name FROM public."User" WHERE id = v_hub."assistantLeadUserId"),
      'assistantPermissions', to_json(v_hub."assistantPermissions"),
      'recapLeadUserIds', to_json(v_hub."recapLeadUserIds"),
      'recapLeadNames', COALESCE((SELECT json_agg(u.name ORDER BY u.name) FROM public."User" u WHERE u.id = ANY(v_hub."recapLeadUserIds")), '[]'::json),
      'prayerLeadUserIds', to_json(v_hub."prayerLeadUserIds"),
      'prayerLeadNames', COALESCE((SELECT json_agg(u.name ORDER BY u.name) FROM public."User" u WHERE u.id = ANY(v_hub."prayerLeadUserIds")), '[]'::json),
      -- Joined names kept under the old keys so an older cached app build still
      -- shows who leads each part.
      'recapLeadName', (SELECT string_agg(u.name, ' & ' ORDER BY u.name) FROM public."User" u WHERE u.id = ANY(v_hub."recapLeadUserIds")),
      'prayerLeadName', (SELECT string_agg(u.name, ' & ' ORDER BY u.name) FROM public."User" u WHERE u.id = ANY(v_hub."prayerLeadUserIds")),
      'meetingDay', v_hub."meetingDay", 'meetingTime', v_hub."meetingTime", 'meetingDurationMins', v_hub."meetingDurationMins",
      'callPlatform', v_hub."callPlatform", 'callLink', v_hub."callLink",
      'itSupports', COALESCE((
        SELECT json_agg(json_build_object('userId', u.id, 'name', u.name) ORDER BY u.name)
        FROM public."HubItSupport" hi JOIN public."User" u ON u.id = hi."userId"
        WHERE hi."hubId" = v_hub.id
      ), '[]'::json)
    ),
    'isLead', v_is_lead,
    'isAssistant', v_is_assistant,
    'isItSupport', v_is_it_support,
    'canMeeting', v_can_meeting,
    'canAttendance', v_can_attendance,
    'canMessage', v_can_message,
    'myJobs', to_json(v_my_jobs),
    'unseenIntroJobs', to_json(COALESCE((
      SELECT array_agg(j) FROM unnest(v_my_jobs) j
      WHERE j NOT IN (SELECT job FROM public."HubRoleIntroSeen" WHERE "userId" = p_actor_id AND "hubId" = v_hub.id)
    ), ARRAY[]::TEXT[])),
    'members', COALESCE((
      SELECT json_agg(json_build_object(
        'userId', u.id,
        'name', u.name,
        'phone', u.phone,
        'isLead', (u.id = v_hub."leadUserId"),
        'groupName', (SELECT g.name FROM public."Group" g WHERE g."supportId" = u.id AND g."cohortId" = p_cohort_id AND g."archivedAt" IS NULL ORDER BY g.name LIMIT 1),
        'jobs', to_json(array_remove(ARRAY[
          CASE WHEN u.id = v_hub."leadUserId" THEN 'HUB_LEAD' END,
          CASE WHEN u.id = v_hub."assistantLeadUserId" THEN 'ASSISTANT_HUB_LEAD' END,
          CASE WHEN u.id = ANY(v_hub."recapLeadUserIds") THEN 'RECAP_LEAD' END,
          CASE WHEN u.id = ANY(v_hub."prayerLeadUserIds") THEN 'PRAYER_LEAD' END
        ], NULL)),
        'isPersonOfInterest', CASE WHEN v_show_poi THEN EXISTS (
          SELECT 1 FROM public."HubPersonOfInterest" poi WHERE poi."hubId" = v_hub.id AND poi."userId" = u.id
        ) ELSE NULL END
      ) ORDER BY u.name)
      FROM public."HubMembership" m
      JOIN public."User" u ON u.id = m."userId"
      WHERE m."hubId" = v_hub.id
    ), '[]'::json),
    'messages', COALESCE((
      SELECT json_agg(json_build_object(
        'id', msg.id, 'subject', msg.subject, 'body', msg.body,
        'authorId', msg."authorId", 'authorName', author.name,
        'createdAt', msg."createdAt", 'editedAt', msg."editedAt",
        'ackedByMe', EXISTS (SELECT 1 FROM public."HubMessageAck" a WHERE a."messageId" = msg.id AND a."userId" = p_actor_id),
        'ackCount', (SELECT COUNT(*) FROM public."HubMessageAck" a WHERE a."messageId" = msg.id),
        'memberCount', (SELECT COUNT(*) FROM public."HubMembership" m WHERE m."hubId" = v_hub.id AND m."userId" <> p_actor_id),
        'ackedUserIds', CASE WHEN v_show_acks THEN (
          SELECT COALESCE(json_agg(a."userId"), '[]'::json) FROM public."HubMessageAck" a WHERE a."messageId" = msg.id
        ) ELSE NULL END
      ) ORDER BY msg."createdAt" DESC)
      FROM public."HubMessage" msg
      LEFT JOIN public."User" author ON author.id = msg."authorId"
      WHERE msg."hubId" = v_hub.id
    ), '[]'::json),
    'myAttendance', COALESCE((
      SELECT json_agg(json_build_object(
        'sessionId', s.id, 'type', s.type, 'title', s.title, 'sessionDate', s."sessionDate",
        'weekId', s."weekId", 'status', a.status, 'notes', s.notes, 'submittedAt', s."submittedAt"
      ) ORDER BY s."sessionDate" DESC)
      FROM public."SupportSessionAttendance" a
      JOIN public."SupportSession" s ON s.id = a."sessionId"
      WHERE a."userId" = p_actor_id AND s."cohortId" = p_cohort_id
    ), '[]'::json),
    'meetingLive', (
      SELECT CASE
        WHEN s."startedAt" IS NOT NULL AND s."submittedAt" IS NULL AND s."startedAt" > NOW() - INTERVAL '3 hours'
          THEN json_build_object('weekId', s."weekId", 'startedAt', s."startedAt")
        ELSE NULL
      END
      FROM public."SupportSession" s
      WHERE s."hubId" = v_hub.id AND s.type = 'SUNDAY_RECAP' AND s."startedAt" IS NOT NULL
      ORDER BY s."startedAt" DESC
      LIMIT 1
    )
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.build_hub_view(UUID, UUID, UUID) FROM PUBLIC;

-- ── 4. set_hub_prayer_focus / set_hub_prayer_state — any Prayer Lead ────────

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
      JOIN public."HubMembership" hm ON hm."userId" = g."supportId" AND hm."hubId" = p_hub_id
      WHERE f.id = p_faith_project_id
        AND f.status = 'APPROVED'
        AND f."sharedForPrayer" IS TRUE
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

CREATE OR REPLACE FUNCTION public.set_hub_prayer_state(p_hub_id uuid, p_week_id integer, p_hub_prayer_done boolean DEFAULT NULL::boolean, p_prayer_finished boolean DEFAULT NULL::boolean)
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
      RAISE EXCEPTION 'Only this hub''s lead, assistant lead, prayer lead, or an admin can set its prayer state';
    END IF;
  END IF;

  SELECT * INTO v_week FROM public."Week" WHERE id = p_week_id;
  IF v_week.id IS NULL THEN RAISE EXCEPTION 'Week was not found'; END IF;
  IF v_hub."cohortId" IS DISTINCT FROM v_week."cohortId" THEN
    RAISE EXCEPTION 'This hub and week are not in the same cohort';
  END IF;

  -- Find-or-create the week's SUNDAY_RECAP session, same as
  -- set_hub_prayer_focus / mark_support_attendance / submit_hub_meeting.
  INSERT INTO public."SupportSession" ("cohortId", type, title, "sessionDate", "weekId", "hubId", "createdById")
  VALUES (v_week."cohortId", 'SUNDAY_RECAP', format('Sunday recap · Week %s', v_week."weekNumber"), CURRENT_DATE, p_week_id, p_hub_id, v_actor_id)
  ON CONFLICT ("hubId", "weekId") DO NOTHING;

  UPDATE public."SupportSession"
  SET "hubPrayerDoneAt" = CASE
        WHEN p_hub_prayer_done IS NULL THEN "hubPrayerDoneAt"
        WHEN p_hub_prayer_done THEN NOW()
        ELSE NULL
      END,
      "prayerFinishedAt" = CASE
        WHEN p_prayer_finished IS NULL THEN "prayerFinishedAt"
        WHEN p_prayer_finished THEN NOW()
        ELSE NULL
      END,
      -- Finishing prayer takes the live focus off everyone's screen too.
      "prayerFocusFaithProjectId" = CASE WHEN p_prayer_finished IS TRUE THEN NULL ELSE "prayerFocusFaithProjectId" END,
      "prayerFocusSetAt" = CASE WHEN p_prayer_finished IS TRUE THEN NULL ELSE "prayerFocusSetAt" END
  WHERE "hubId" = p_hub_id AND "weekId" = p_week_id AND type = 'SUNDAY_RECAP'
  RETURNING * INTO v_session;

  RETURN jsonb_build_object(
    'sessionId', v_session.id,
    'hubId', v_session."hubId",
    'weekId', v_session."weekId",
    'hubPrayerDone', v_session."hubPrayerDoneAt" IS NOT NULL,
    'prayerFinished', v_session."prayerFinishedAt" IS NOT NULL,
    'faithProjectId', v_session."prayerFocusFaithProjectId",
    'setAt', v_session."prayerFocusSetAt",
    'prayedForIds', to_jsonb(COALESCE(v_session."prayedForFaithProjectIds", ARRAY[]::UUID[]))
  );
END;
$function$;

-- ── 5. Role notifications — newly added Recap/Prayer Leads ──────────────────

CREATE OR REPLACE FUNCTION public.notify_hub_role_assigned()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_new_ids UUID[];
BEGIN
  IF NEW."leadUserId" IS NOT NULL AND NEW."leadUserId" IS DISTINCT FROM OLD."leadUserId" THEN
    PERFORM public.invoke_hub_message_push(
      ARRAY[NEW."leadUserId"],
      format('You''re now the Hub Lead for %s', NEW.name),
      'Tap to open My Hub'
    );
  END IF;

  IF NEW."assistantLeadUserId" IS NOT NULL AND NEW."assistantLeadUserId" IS DISTINCT FROM OLD."assistantLeadUserId" THEN
    PERFORM public.invoke_hub_message_push(
      ARRAY[NEW."assistantLeadUserId"],
      format('You''re now the Assistant Hub Lead for %s', NEW.name),
      'Tap to open My Hub'
    );
  END IF;

  -- Recap/Prayer Lead are lists: notify only ids newly added to the list.
  v_new_ids := ARRAY(SELECT unnest(NEW."recapLeadUserIds") EXCEPT SELECT unnest(COALESCE(OLD."recapLeadUserIds", ARRAY[]::UUID[])));
  IF cardinality(v_new_ids) > 0 THEN
    PERFORM public.invoke_hub_message_push(
      v_new_ids,
      format('You''re now a Recap Lead for %s', NEW.name),
      'Tap to open My Hub'
    );
  END IF;

  v_new_ids := ARRAY(SELECT unnest(NEW."prayerLeadUserIds") EXCEPT SELECT unnest(COALESCE(OLD."prayerLeadUserIds", ARRAY[]::UUID[])));
  IF cardinality(v_new_ids) > 0 THEN
    PERFORM public.invoke_hub_message_push(
      v_new_ids,
      format('You''re now a Prayer Lead for %s', NEW.name),
      'Tap to open My Hub'
    );
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_hub_role_assigned ON public."SupportHub";
CREATE TRIGGER trg_hub_role_assigned
  AFTER UPDATE ON public."SupportHub"
  FOR EACH ROW
  WHEN (
    NEW."leadUserId" IS DISTINCT FROM OLD."leadUserId"
    OR NEW."assistantLeadUserId" IS DISTINCT FROM OLD."assistantLeadUserId"
    OR NEW."recapLeadUserIds" IS DISTINCT FROM OLD."recapLeadUserIds"
    OR NEW."prayerLeadUserIds" IS DISTINCT FROM OLD."prayerLeadUserIds"
  )
  EXECUTE FUNCTION public.notify_hub_role_assigned();
