-- Hub meeting: live "now praying for" focus, one at a time, saved per hub/week.
--
-- Realtime approach — read before touching this: SupportSession's SELECT
-- policy is `USING (public.app_is_staff())`
-- (20260924000000_support_hubs.sql #7/#8), and app_is_staff() reads the
-- caller's session out of the `x-session-token` request header
-- (20260917260000_session_token_header_helpers.sql). That header only exists
-- on PostgREST requests — Supabase Realtime's `postgres_changes` evaluates
-- RLS over its own websocket connection (anon/authenticated JWT, no custom
-- headers), so `request.headers` is NULL there and app_is_staff() always
-- returns FALSE for it. The codebase already hit this: 20260917280000's
-- comment notes Notification is "deliberately left open" (`USING (true)`)
-- specifically because it's the only table in the supabase_realtime
-- publication and locking it down would cut the bell's live feed. Every other
-- table that moved to app_is_staff() gave up on postgres_changes.
--
-- SupportSession is staff-only and that isn't changing for this feature, so
-- postgres_changes on it would silently deliver nothing to anyone. This
-- migration does NOT add SupportSession to the supabase_realtime publication
-- — it would be dead weight. Instead the frontend broadcasts on a plain
-- Realtime **broadcast** channel (`hub-meeting:<hubId>:<weekId>`, no table
-- involved, so RLS doesn't apply) after set_hub_prayer_focus succeeds; every
-- viewer refetches get_hub_prayer_focus on receiving it, and the Hub meeting
-- tab also polls it every 10s as a fallback while open.
--
-- Additive and idempotent. Not yet applied to the live database.

-- ── 1. hub_prayer_list — re-created (latest: 20260926120000_hub_roles.sql ───
-- #13) to also return each project's own FaithProject id. The prayer list UI
-- needs to call set_hub_prayer_focus(..., p_faith_project_id) when someone
-- taps an item, and participantId alone isn't that id (a participant's
-- FaithProject row can in principle change over time). Same signature,
-- same access rule, one added field — no grant change needed.
CREATE OR REPLACE FUNCTION public.hub_prayer_list(p_hub_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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
    'categoryName', cat.name
  ) ORDER BY p."fullName"), '[]'::json)
  INTO v_result
  FROM public."FaithProject" f
  JOIN public."Participant" p ON p.id = f."participantId"
  JOIN public."GroupParticipant" gp ON gp."participantId" = p.id
  JOIN public."Group" g ON g.id = gp."groupId" AND g."archivedAt" IS NULL
  JOIN public."HubMembership" hm ON hm."userId" = g."supportId" AND hm."hubId" = p_hub_id
  LEFT JOIN public."User" support ON support.id = g."supportId"
  LEFT JOIN public."FaithProjectCategory" cat ON cat.id = f."categoryId"
  WHERE f.status = 'APPROVED' AND f."sharedForPrayer" IS TRUE;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.hub_prayer_list(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hub_prayer_list(UUID) TO anon, authenticated;

-- ── 2a. SupportSession: live prayer focus + per-week prayed-for history ──────

ALTER TABLE public."SupportSession"
  ADD COLUMN IF NOT EXISTS "prayerFocusFaithProjectId" UUID REFERENCES public."FaithProject"(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "prayerFocusSetAt" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "prayedForFaithProjectIds" UUID[] NOT NULL DEFAULT '{}';

-- ── 2b. set_hub_prayer_focus — the hub's prayer lead, lead, assistant lead, ──
-- or an admin. NULL clears the current focus. Setting a non-NULL focus
-- validates the project is actually on this hub's prayer list (same join
-- hub_prayer_list uses: approved + sharedForPrayer + participant in a group
-- whose support is a member of this hub), and appends it to the week's
-- prayed-for history (no duplicates).
CREATE OR REPLACE FUNCTION public.set_hub_prayer_focus(p_hub_id UUID, p_week_id INTEGER, p_faith_project_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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
      AND v_hub."prayerLeadUserId" IS DISTINCT FROM v_actor_id
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

REVOKE ALL ON FUNCTION public.set_hub_prayer_focus(UUID, INTEGER, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_hub_prayer_focus(UUID, INTEGER, UUID) TO anon, authenticated;

-- ── 3. get_hub_prayer_focus — any hub member, IT support, or admin. Read-only ─
-- companion the Hub meeting tab (and follow-along mode) polls / refetches on
-- broadcast. No session row yet, or no focus set, both return a null focus
-- with whatever prayed-for history exists (or none).
CREATE OR REPLACE FUNCTION public.get_hub_prayer_focus(p_hub_id UUID, p_week_id INTEGER)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_id UUID;
  v_session public."SupportSession";
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
      RAISE EXCEPTION 'You must be a member, IT support, or admin of this hub to see its prayer focus';
    END IF;
  END IF;

  SELECT * INTO v_session
  FROM public."SupportSession"
  WHERE "hubId" = p_hub_id AND "weekId" = p_week_id AND type = 'SUNDAY_RECAP';

  IF v_session.id IS NULL OR v_session."prayerFocusFaithProjectId" IS NULL THEN
    RETURN json_build_object(
      'faithProjectId', NULL, 'participantName', NULL, 'groupName', NULL, 'projectText', NULL,
      'setAt', NULL,
      'prayedForIds', to_json(COALESCE(v_session."prayedForFaithProjectIds", ARRAY[]::UUID[]))
    );
  END IF;

  SELECT json_build_object(
    'faithProjectId', f.id,
    'participantName', p."fullName",
    'groupName', g.name,
    'projectText', f.body,
    'setAt', v_session."prayerFocusSetAt",
    'prayedForIds', to_json(COALESCE(v_session."prayedForFaithProjectIds", ARRAY[]::UUID[]))
  ) INTO v_result
  FROM public."FaithProject" f
  JOIN public."Participant" p ON p.id = f."participantId"
  LEFT JOIN public."GroupParticipant" gp ON gp."participantId" = p.id
  LEFT JOIN public."Group" g ON g.id = gp."groupId" AND g."archivedAt" IS NULL
  WHERE f.id = v_session."prayerFocusFaithProjectId"
  ORDER BY g.name
  LIMIT 1;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_hub_prayer_focus(UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_hub_prayer_focus(UUID, INTEGER) TO anon, authenticated;
