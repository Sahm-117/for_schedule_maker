-- Reopen a submitted group meeting report for the support (FLOW_MAP rule 134).
--
-- A support's weekly group meeting report (GroupPrayerStatus.done = submitted, MeetingAttendance marks) can only be recorded from
-- 10 minutes before the meeting until midnight that day (rule 77). Before this, "Reopen for the support" only cleared the
-- submitted mark, so a past week stayed shut to the support, and nobody told them. Now:
-- * reopen_group_meeting (admins): clears "submitted", opens that group and week for the support for 48 hours through the existing
--   opening (MeetingRecordingOpening, rule 84), keeps the reason, and tells the support (bell + push through notify-users).
-- * request_group_meeting_reopen (the group's support): "Ask to reopen" with a short reason, for a submitted week; tells admins.
-- * Submitting again ends the opening early (trigger on GroupPrayerStatus), so the week locks again.
-- * group_meeting_reopen_state: the support's (or an admin's) view of requests and openings for one group;
--   group_meeting_reopen_requests: admins' list of requests still waiting, for a cohort.
--
-- Rollback: drop the trigger group_meeting_reopen_close and the functions below, then DROP TABLE "GroupMeetingReopen".
-- MeetingRecordingOpening rows it made expire by themselves.

CREATE TABLE IF NOT EXISTS public."GroupMeetingReopen" (
  "groupId" uuid NOT NULL REFERENCES public."Group"(id) ON DELETE CASCADE,
  "weekId" integer NOT NULL REFERENCES public."Week"(id) ON DELETE CASCADE,
  "requestedAt" timestamptz,
  "requestedById" uuid,
  "requestReason" text,
  "reopenedAt" timestamptz,
  "reopenedById" uuid,
  "reopenReason" text,
  "resubmittedAt" timestamptz,
  PRIMARY KEY ("groupId", "weekId")
);
ALTER TABLE public."GroupMeetingReopen" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."GroupMeetingReopen" FROM PUBLIC, anon, authenticated;

-- Bell + push to staff through notify-users (rule 10); bell only when the secrets are missing.
CREATE OR REPLACE FUNCTION public.group_meeting_notify(p_user_ids uuid[], p_title text, p_body text, p_path text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE
  v_url text;
  v_key text;
BEGIN
  IF p_user_ids IS NULL OR array_length(p_user_ids, 1) IS NULL THEN RETURN; END IF;
  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'project_url';
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'push_reminders_service_key';
  IF v_url IS NULL OR v_key IS NULL THEN
    INSERT INTO public."Notification" ("userId", title, body, path, type)
    SELECT uid, p_title, p_body, p_path, 'GROUP_MEETING' FROM unnest(p_user_ids) AS uid;
    RETURN;
  END IF;
  PERFORM net.http_post(
    url := v_url || '/functions/v1/notify-users',
    headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', v_key, 'Authorization', 'Bearer ' || v_key),
    body := jsonb_build_object('userIds', to_jsonb(p_user_ids), 'title', p_title, 'body', p_body, 'path', p_path, 'type', 'GROUP_MEETING'),
    timeout_milliseconds := 25000);
END;
$$;
REVOKE ALL ON FUNCTION public.group_meeting_notify(uuid[], text, text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.reopen_group_meeting(p_token text, p_group_id uuid, p_week_id integer, p_reason text, p_hours integer DEFAULT 48)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE
  v_actor public."User" := public.app_staff(p_token);
  v_reason text := btrim(COALESCE(p_reason, ''));
  v_group public."Group";
  v_week_number integer;
  v_until timestamptz;
BEGIN
  IF v_actor.id IS NULL OR NOT ('ADMIN'::public."Role" = ANY (public.app_user_roles(v_actor))) THEN RAISE EXCEPTION 'NOT_AUTHORISED'; END IF;
  IF char_length(v_reason) < 3 THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;
  IF char_length(v_reason) > 300 THEN RAISE EXCEPTION 'REASON_TOO_LONG'; END IF;
  IF p_hours IS NULL OR p_hours < 1 OR p_hours > 168 THEN RAISE EXCEPTION 'INVALID_HOURS'; END IF;
  SELECT * INTO v_group FROM public."Group" WHERE id = p_group_id;
  SELECT w."weekNumber" INTO v_week_number FROM public."Week" w WHERE w.id = p_week_id AND w."cohortId" = v_group."cohortId";
  IF v_group.id IS NULL OR v_week_number IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;

  v_until := now() + make_interval(hours => p_hours);
  -- Not submitted any more (admins are not held to the recording window, so this write is allowed).
  UPDATE public."GroupPrayerStatus" SET done = FALSE, "markedAt" = now() WHERE "groupId" = p_group_id AND "weekId" = p_week_id;
  INSERT INTO public."MeetingRecordingOpening" ("groupId", "weekId", "openUntil", "openedById")
  VALUES (p_group_id, p_week_id, v_until, v_actor.id)
  ON CONFLICT ("groupId", "weekId") WHERE "groupId" IS NOT NULL
  DO UPDATE SET "openUntil" = EXCLUDED."openUntil", "openedById" = EXCLUDED."openedById", "openedAt" = now();
  INSERT INTO public."GroupMeetingReopen" ("groupId", "weekId", "reopenedAt", "reopenedById", "reopenReason", "resubmittedAt")
  VALUES (p_group_id, p_week_id, now(), v_actor.id, v_reason, NULL)
  ON CONFLICT ("groupId", "weekId") DO UPDATE SET "reopenedAt" = now(), "reopenedById" = v_actor.id, "reopenReason" = v_reason, "resubmittedAt" = NULL;

  IF v_group."supportId" IS NOT NULL THEN
    PERFORM public.group_meeting_notify(ARRAY[v_group."supportId"],
      format('Week %s meeting reopened', v_week_number),
      format('You can edit your Week %s group meeting report and submit it again until %s.', v_week_number,
             to_char(v_until AT TIME ZONE 'Africa/Lagos', 'Dy FMDD Mon, FMHH12:MI am')),
      '/support/participants?tab=prayers');
  END IF;
  RETURN jsonb_build_object('openUntil', v_until);
END;
$$;

CREATE OR REPLACE FUNCTION public.request_group_meeting_reopen(p_token text, p_group_id uuid, p_week_id integer, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE
  v_actor public."User" := public.app_staff(p_token);
  v_reason text := btrim(COALESCE(p_reason, ''));
  v_group public."Group";
  v_week_number integer;
  v_admins uuid[];
  v_prev timestamptz;
BEGIN
  IF v_actor.id IS NULL THEN RAISE EXCEPTION 'NOT_AUTHORISED'; END IF;
  SELECT * INTO v_group FROM public."Group" WHERE id = p_group_id;
  IF v_group.id IS NULL OR v_group."supportId" IS DISTINCT FROM v_actor.id THEN RAISE EXCEPTION 'NOT_AUTHORISED'; END IF;
  SELECT w."weekNumber" INTO v_week_number FROM public."Week" w WHERE w.id = p_week_id AND w."cohortId" = v_group."cohortId";
  IF v_week_number IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF char_length(v_reason) < 3 THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;
  IF char_length(v_reason) > 300 THEN RAISE EXCEPTION 'REASON_TOO_LONG'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public."GroupPrayerStatus" s WHERE s."groupId" = p_group_id AND s."weekId" = p_week_id AND s.done) THEN
    RAISE EXCEPTION 'NOT_SUBMITTED';
  END IF;
  SELECT r."requestedAt" INTO v_prev FROM public."GroupMeetingReopen" r WHERE r."groupId" = p_group_id AND r."weekId" = p_week_id;
  INSERT INTO public."GroupMeetingReopen" ("groupId", "weekId", "requestedAt", "requestedById", "requestReason")
  VALUES (p_group_id, p_week_id, now(), v_actor.id, v_reason)
  ON CONFLICT ("groupId", "weekId") DO UPDATE SET "requestedAt" = now(), "requestedById" = v_actor.id, "requestReason" = v_reason;

  -- Admins are told once per hour at most for the same group and week (a double tap does not notify twice).
  IF v_prev IS NULL OR v_prev < now() - interval '1 hour' THEN
    SELECT array_agg(u.id) INTO v_admins FROM public."User" u
    WHERE 'ADMIN'::public."Role" = ANY (public.app_user_roles(u)) AND u."isActive" IS NOT FALSE AND COALESCE(u."isTest", FALSE) = FALSE;
    PERFORM public.group_meeting_notify(v_admins,
      format('%s asks to reopen Week %s', split_part(btrim(COALESCE(v_actor.name, 'A support')), ' ', 1), v_week_number),
      format('%s · %s', COALESCE(v_group.name, 'Group'), left(v_reason, 120)),
      '/group-prayers');
  END IF;
  RETURN jsonb_build_object('requestedAt', now());
END;
$$;

-- One group's reopen state per week: for its support, or an admin.
CREATE OR REPLACE FUNCTION public.group_meeting_reopen_state(p_token text, p_group_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $$
DECLARE
  v_actor public."User" := public.app_staff(p_token);
  v_group public."Group";
BEGIN
  SELECT * INTO v_group FROM public."Group" WHERE id = p_group_id;
  IF v_actor.id IS NULL OR v_group.id IS NULL
     OR NOT (v_group."supportId" = v_actor.id OR 'ADMIN'::public."Role" = ANY (public.app_user_roles(v_actor))) THEN
    RAISE EXCEPTION 'NOT_AUTHORISED';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'weekId', r."weekId", 'requestedAt', r."requestedAt", 'requestReason', r."requestReason",
      'reopenedAt', r."reopenedAt", 'reopenReason', r."reopenReason", 'resubmittedAt', r."resubmittedAt",
      'openUntil', public.meeting_recording_opening(NULL, r."groupId", r."weekId")))
    FROM public."GroupMeetingReopen" r WHERE r."groupId" = p_group_id), '[]'::jsonb);
END;
$$;

-- Requests still waiting (asked after the last reopen), for admins.
CREATE OR REPLACE FUNCTION public.group_meeting_reopen_requests(p_token text, p_cohort_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $$
DECLARE
  v_actor public."User" := public.app_staff(p_token);
BEGIN
  IF v_actor.id IS NULL OR NOT ('ADMIN'::public."Role" = ANY (public.app_user_roles(v_actor))) THEN RAISE EXCEPTION 'NOT_AUTHORISED'; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'groupId', r."groupId", 'groupName', g.name, 'weekId', r."weekId", 'weekNumber', w."weekNumber",
      'requestedAt', r."requestedAt", 'requestReason', r."requestReason", 'supportName', u.name) ORDER BY r."requestedAt")
    FROM public."GroupMeetingReopen" r
    JOIN public."Group" g ON g.id = r."groupId" AND g."cohortId" = p_cohort_id
    JOIN public."Week" w ON w.id = r."weekId"
    LEFT JOIN public."User" u ON u.id = r."requestedById"
    WHERE r."requestedAt" IS NOT NULL AND (r."reopenedAt" IS NULL OR r."requestedAt" > r."reopenedAt")), '[]'::jsonb);
END;
$$;

-- Submitting again ends the reopening, so the week locks again.
CREATE OR REPLACE FUNCTION public.group_meeting_reopen_close()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
BEGIN
  IF NEW.done AND (TG_OP = 'INSERT' OR OLD.done IS DISTINCT FROM TRUE)
     AND EXISTS (SELECT 1 FROM public."GroupMeetingReopen" r WHERE r."groupId" = NEW."groupId" AND r."weekId" = NEW."weekId" AND r."reopenedAt" IS NOT NULL AND r."resubmittedAt" IS NULL) THEN
    UPDATE public."GroupMeetingReopen" SET "resubmittedAt" = now() WHERE "groupId" = NEW."groupId" AND "weekId" = NEW."weekId";
    DELETE FROM public."MeetingRecordingOpening" WHERE "groupId" = NEW."groupId" AND "weekId" = NEW."weekId";
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS group_meeting_reopen_close ON public."GroupPrayerStatus";
CREATE TRIGGER group_meeting_reopen_close AFTER INSERT OR UPDATE OF done ON public."GroupPrayerStatus"
  FOR EACH ROW EXECUTE FUNCTION public.group_meeting_reopen_close();

REVOKE ALL ON FUNCTION public.group_meeting_reopen_close() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reopen_group_meeting(text, uuid, integer, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.request_group_meeting_reopen(text, uuid, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.group_meeting_reopen_state(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.group_meeting_reopen_requests(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reopen_group_meeting(text, uuid, integer, text, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_group_meeting_reopen(text, uuid, integer, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.group_meeting_reopen_state(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.group_meeting_reopen_requests(text, uuid) TO anon, authenticated;
