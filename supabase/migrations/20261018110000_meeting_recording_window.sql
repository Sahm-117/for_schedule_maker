-- Meetings can only be recorded around their call: from 10 minutes before the set start time until
-- midnight (Lagos) at the end of that day. Meetings have no set length. Outside that window only an
-- admin can record or change anything. A group or hub with no meeting day and time set cannot record
-- at all until one is set (an admin still can). This covers Support-to-participant group meetings,
-- Teen Support meetings (teen groups now set a day and time too) and hub meetings.
--
-- Covered, by trigger so every way in is checked (the app writes some of these tables directly):
--   - group meetings: MeetingAttendance and GroupPrayerStatus (attendance, prayer, recap, "held", notes)
--   - hub meetings: SupportSession (SUNDAY_RECAP: opened, prayer, notes, submit, reopen) and
--     SupportSessionAttendance on those sessions. Trainings and get-togethers are not affected.
-- The meeting for week N is the group's (or hub's) first meeting day on or after that week's class date
-- (public.week_class_date: the class Sunday, or the day it was moved to), at its meeting time, Lagos time.
--
-- Not checked: requests without an app session token (cron jobs and the service key, e.g. automatic
-- finalising), admins, deletes, and practice cohorts (Cohort.isPractice).
-- Error for the app: MEETING_WINDOW_CLOSED: <opens>|<closes> (Lagos, YYYY-MM-DDTHH:MI) or MEETING_TIME_NOT_SET.

CREATE OR REPLACE FUNCTION public.fof_meeting_window(p_day TEXT, p_time TEXT, p_week_id INT)
RETURNS tstzrange
LANGUAGE sql
STABLE
SET search_path TO ''
AS $$
  SELECT CASE
    WHEN p_day IS NULL OR p_time IS NULL OR p_time !~ '^\d{1,2}:\d{2}'
      OR array_position(ARRAY['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'], upper(p_day)) IS NULL THEN NULL
    ELSE tstzrange(
      (x.meeting_date::timestamp + p_time::time) AT TIME ZONE 'Africa/Lagos' - interval '10 minutes',
      (x.meeting_date + 1)::timestamp AT TIME ZONE 'Africa/Lagos',
      '[)')
  END
  FROM (
    -- The first meeting day on or after the class date (a moved class need not be on a Sunday).
    SELECT d.class_date
           + ((array_position(ARRAY['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'], upper(p_day)) - 1
               - extract(dow FROM d.class_date)::int + 7) % 7) AS meeting_date
    FROM (
      SELECT public.week_class_date(c."startDate"::date, w."weekNumber", w."classDate"::date) AS class_date
      FROM public."Week" w JOIN public."Cohort" c ON c.id = w."cohortId"
      WHERE w.id = p_week_id
    ) d
  ) x;
$$;

-- Raises unless now is inside the meeting window of this group's or hub's meeting for that week.
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

CREATE OR REPLACE FUNCTION public.fof_meeting_window_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
  v_group UUID; v_hub UUID; v_week INT; v_type TEXT;
BEGIN
  IF TG_TABLE_NAME = 'MeetingAttendance' THEN
    v_group := COALESCE(NEW."groupId", public.discussion_participant_group(NEW."participantId"));
    v_week := NEW."weekId";
  ELSIF TG_TABLE_NAME = 'GroupPrayerStatus' THEN
    v_group := NEW."groupId";
    v_week := NEW."weekId";
  ELSIF TG_TABLE_NAME = 'SupportSession' THEN
    IF NEW.type IS DISTINCT FROM 'SUNDAY_RECAP' THEN RETURN NEW; END IF;
    v_hub := NEW."hubId";
    v_week := NEW."weekId";
  ELSIF TG_TABLE_NAME = 'SupportSessionAttendance' THEN
    SELECT s.type, s."hubId", s."weekId" INTO v_type, v_hub, v_week
    FROM public."SupportSession" s WHERE s.id = NEW."sessionId";
    IF v_type IS DISTINCT FROM 'SUNDAY_RECAP' THEN RETURN NEW; END IF;
  END IF;
  PERFORM public.fof_assert_meeting_open(v_group, v_hub, v_week);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS meeting_window_guard ON public."MeetingAttendance";
CREATE TRIGGER meeting_window_guard BEFORE INSERT OR UPDATE ON public."MeetingAttendance"
  FOR EACH ROW EXECUTE FUNCTION public.fof_meeting_window_guard();
DROP TRIGGER IF EXISTS meeting_window_guard ON public."GroupPrayerStatus";
CREATE TRIGGER meeting_window_guard BEFORE INSERT OR UPDATE ON public."GroupPrayerStatus"
  FOR EACH ROW EXECUTE FUNCTION public.fof_meeting_window_guard();
DROP TRIGGER IF EXISTS meeting_window_guard ON public."SupportSession";
CREATE TRIGGER meeting_window_guard BEFORE INSERT OR UPDATE ON public."SupportSession"
  FOR EACH ROW EXECUTE FUNCTION public.fof_meeting_window_guard();
DROP TRIGGER IF EXISTS meeting_window_guard ON public."SupportSessionAttendance";
CREATE TRIGGER meeting_window_guard BEFORE INSERT OR UPDATE ON public."SupportSessionAttendance"
  FOR EACH ROW EXECUTE FUNCTION public.fof_meeting_window_guard();

-- The app reads the window to show "Opens at …" before the call.
GRANT EXECUTE ON FUNCTION public.fof_meeting_window(TEXT, TEXT, INT) TO anon, authenticated;
