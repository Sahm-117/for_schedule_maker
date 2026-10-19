-- An admin can open recording for one hub's or group's meeting in one week, outside its normal window.
-- Needed when a meeting is held on a day the programme has no week for (e.g. the break week), or the
-- time was missed: the normal rule (10 minutes before the set time until midnight that day) would
-- refuse every save from the hub lead or support.
--
-- 1. MeetingRecordingOpening: one row per (hub or group, week) an admin opened, open until "openUntil".
-- 2. admin_open_meeting_recording / admin_close_meeting_recording: admins only.
-- 3. meeting_recording_opening: the app reads it to drop the "opens at ..." notice while it is open.
-- 4. fof_assert_meeting_open: allows the write while an opening is live. The rest of the function is
--    the live definition (20261018110000), unchanged.

CREATE TABLE IF NOT EXISTS public."MeetingRecordingOpening" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "hubId" UUID REFERENCES public."SupportHub"(id) ON DELETE CASCADE,
  "groupId" UUID REFERENCES public."Group"(id) ON DELETE CASCADE,
  "weekId" INT NOT NULL REFERENCES public."Week"(id) ON DELETE CASCADE,
  "openUntil" TIMESTAMPTZ NOT NULL,
  "openedById" UUID REFERENCES public."User"(id) ON DELETE SET NULL,
  "openedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (("hubId" IS NULL) <> ("groupId" IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS "MeetingRecordingOpening_hub_week" ON public."MeetingRecordingOpening" ("hubId", "weekId") WHERE "hubId" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "MeetingRecordingOpening_group_week" ON public."MeetingRecordingOpening" ("groupId", "weekId") WHERE "groupId" IS NOT NULL;

-- Read and written only through the functions below.
ALTER TABLE public."MeetingRecordingOpening" ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.admin_open_meeting_recording(p_hub_id UUID, p_group_id UUID, p_week_id INT, p_hours INT DEFAULT 24)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_until TIMESTAMPTZ;
BEGIN
  IF NOT public.app_is_admin() THEN
    RAISE EXCEPTION 'Only admins can open recording';
  END IF;
  IF (p_hub_id IS NULL) = (p_group_id IS NULL) THEN
    RAISE EXCEPTION 'Give either a hub or a group';
  END IF;
  IF p_hours IS NULL OR p_hours < 1 OR p_hours > 168 THEN
    RAISE EXCEPTION 'Hours must be between 1 and 168';
  END IF;
  v_until := now() + make_interval(hours => p_hours);
  IF p_hub_id IS NOT NULL THEN
    INSERT INTO public."MeetingRecordingOpening" ("hubId", "weekId", "openUntil", "openedById")
    VALUES (p_hub_id, p_week_id, v_until, public.app_current_user_id())
    ON CONFLICT ("hubId", "weekId") WHERE "hubId" IS NOT NULL
    DO UPDATE SET "openUntil" = EXCLUDED."openUntil", "openedById" = EXCLUDED."openedById", "openedAt" = now();
  ELSE
    INSERT INTO public."MeetingRecordingOpening" ("groupId", "weekId", "openUntil", "openedById")
    VALUES (p_group_id, p_week_id, v_until, public.app_current_user_id())
    ON CONFLICT ("groupId", "weekId") WHERE "groupId" IS NOT NULL
    DO UPDATE SET "openUntil" = EXCLUDED."openUntil", "openedById" = EXCLUDED."openedById", "openedAt" = now();
  END IF;
  RETURN v_until;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_close_meeting_recording(p_hub_id UUID, p_group_id UUID, p_week_id INT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF NOT public.app_is_admin() THEN
    RAISE EXCEPTION 'Only admins can close recording';
  END IF;
  DELETE FROM public."MeetingRecordingOpening"
  WHERE "weekId" = p_week_id
    AND (("hubId" IS NOT NULL AND "hubId" = p_hub_id) OR ("groupId" IS NOT NULL AND "groupId" = p_group_id));
END;
$$;

-- When the opening ends, or NULL when there is none (or it has ended).
CREATE OR REPLACE FUNCTION public.meeting_recording_opening(p_hub_id UUID, p_group_id UUID, p_week_id INT)
RETURNS TIMESTAMPTZ
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT o."openUntil" FROM public."MeetingRecordingOpening" o
  WHERE o."weekId" = p_week_id AND o."openUntil" > now()
    AND ((o."hubId" IS NOT NULL AND o."hubId" = p_hub_id) OR (o."groupId" IS NOT NULL AND o."groupId" = p_group_id))
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.admin_open_meeting_recording(UUID, UUID, INT, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_close_meeting_recording(UUID, UUID, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.meeting_recording_opening(UUID, UUID, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_open_meeting_recording(UUID, UUID, INT, INT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_close_meeting_recording(UUID, UUID, INT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.meeting_recording_opening(UUID, UUID, INT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.fof_assert_meeting_open(p_group_id UUID, p_hub_id UUID, p_week_id INT)
RETURNS VOID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_day TEXT; v_time TEXT; v_practice BOOLEAN; v_window tstzrange;
BEGIN
  -- Cron jobs and the service key carry no app session; admins may record any time.
  IF public.app_current_token() IS NULL OR public.app_is_admin() OR p_week_id IS NULL THEN
    RETURN;
  END IF;
  IF p_group_id IS NOT NULL THEN
    SELECT g."meetingDay", g."meetingTime", COALESCE(c."isPractice", false)
      INTO v_day, v_time, v_practice
    FROM public."Group" g JOIN public."Cohort" c ON c.id = g."cohortId" WHERE g.id = p_group_id;
  ELSIF p_hub_id IS NOT NULL THEN
    SELECT h."meetingDay", h."meetingTime", COALESCE(c."isPractice", false)
      INTO v_day, v_time, v_practice
    FROM public."SupportHub" h JOIN public."Cohort" c ON c.id = h."cohortId" WHERE h.id = p_hub_id;
  ELSE
    RETURN;
  END IF;
  IF NOT FOUND OR v_practice THEN RETURN; END IF;
  -- An admin opened this week's recording for this hub or group.
  IF public.meeting_recording_opening(p_hub_id, p_group_id, p_week_id) IS NOT NULL THEN
    RETURN;
  END IF;
  IF v_day IS NULL OR v_time IS NULL THEN
    RAISE EXCEPTION 'MEETING_TIME_NOT_SET: set a meeting day and time first';
  END IF;
  v_window := public.fof_meeting_window(v_day, v_time, p_week_id);
  IF v_window IS NULL OR NOT (now() <@ v_window) THEN
    RAISE EXCEPTION 'MEETING_WINDOW_CLOSED: %|%',
      to_char(lower(v_window) AT TIME ZONE 'Africa/Lagos', 'YYYY-MM-DD"T"HH24:MI'),
      to_char(upper(v_window) AT TIME ZONE 'Africa/Lagos', 'YYYY-MM-DD"T"HH24:MI');
  END IF;
END;
$$;
