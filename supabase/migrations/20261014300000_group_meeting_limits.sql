-- Back-office limits on the day, time and length a group call can be set to.
-- The limits live in AppSetting "group_meeting_limits" (Settings > Group call limits). With no row the original
-- rules apply: Wednesday, Friday or Saturday, starting at 5:00 PM or later and ending by 9:00 PM, 45 minutes or 1 hour.
-- The check runs only when a group's meeting day, time or length is being CHANGED, so a group already outside the
-- limits keeps working and can still have its call link edited. Admins and database maintenance are not held to it
-- (admins can set any slot, as they can for hub meetings); everyone else, including a support using the app or the API, is.

CREATE OR REPLACE FUNCTION public.group_meeting_limits()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT COALESCE(
    (SELECT value::JSONB FROM "AppSetting" WHERE "settingKey" = 'group_meeting_limits'),
    '{"days":["WEDNESDAY","FRIDAY","SATURDAY"],"earliestStart":"17:00","latestEnd":"21:00","durations":[45,60]}'::JSONB
  );
$$;
GRANT EXECUTE ON FUNCTION public.group_meeting_limits() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.group_meeting_limits_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  lim JSONB := public.group_meeting_limits();
  start_min INT;
  earliest_min INT;
  end_min INT;
  dur INT;
  allowed_days TEXT[];
  durs INT[];
BEGIN
  -- Only when the slot is being set or changed, and only for people who are held to the limits.
  IF TG_OP = 'UPDATE'
     AND NEW."meetingDay" IS NOT DISTINCT FROM OLD."meetingDay"
     AND NEW."meetingTime" IS NOT DISTINCT FROM OLD."meetingTime"
     AND NEW."meetingDurationMins" IS NOT DISTINCT FROM OLD."meetingDurationMins" THEN
    RETURN NEW;
  END IF;
  IF public.app_current_token() IS NULL OR public.app_current_token() = '' OR public.app_is_admin() THEN RETURN NEW; END IF;
  -- Clearing a field is always fine; the limits judge a full slot.
  IF NEW."meetingDay" IS NULL AND NEW."meetingTime" IS NULL AND NEW."meetingDurationMins" IS NULL THEN RETURN NEW; END IF;

  SELECT array_agg(d) INTO allowed_days FROM jsonb_array_elements_text(lim -> 'days') d;
  SELECT array_agg(x::INT) INTO durs FROM jsonb_array_elements_text(lim -> 'durations') x;
  earliest_min := split_part(lim ->> 'earliestStart', ':', 1)::INT * 60 + split_part(lim ->> 'earliestStart', ':', 2)::INT;
  end_min := split_part(lim ->> 'latestEnd', ':', 1)::INT * 60 + split_part(lim ->> 'latestEnd', ':', 2)::INT;

  IF NEW."meetingDay" IS NOT NULL AND NOT (NEW."meetingDay" = ANY (allowed_days)) THEN
    RAISE EXCEPTION 'MEETING_OUTSIDE_LIMITS: group calls can only be on %', array_to_string(ARRAY(SELECT initcap(lower(d)) FROM unnest(allowed_days) d), ', ');
  END IF;
  IF NEW."meetingDurationMins" IS NOT NULL AND NOT (NEW."meetingDurationMins" = ANY (durs)) THEN
    RAISE EXCEPTION 'MEETING_OUTSIDE_LIMITS: group calls can only run for % minutes', array_to_string(durs, ' or ');
  END IF;
  IF NEW."meetingTime" IS NOT NULL THEN
    IF NEW."meetingTime" !~ '^[0-2][0-9]:[0-5][0-9]$' THEN RAISE EXCEPTION 'MEETING_OUTSIDE_LIMITS: that start time is not valid'; END IF;
    start_min := split_part(NEW."meetingTime", ':', 1)::INT * 60 + split_part(NEW."meetingTime", ':', 2)::INT;
    dur := COALESCE(NEW."meetingDurationMins", (SELECT min(x) FROM unnest(durs) x));
    IF start_min < earliest_min OR start_min + dur > end_min THEN
      RAISE EXCEPTION 'MEETING_OUTSIDE_LIMITS: group calls must start at % or later and finish by %', lim ->> 'earliestStart', lim ->> 'latestEnd';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS group_meeting_limits_guard ON "Group";
CREATE TRIGGER group_meeting_limits_guard
  BEFORE INSERT OR UPDATE ON "Group"
  FOR EACH ROW EXECUTE FUNCTION public.group_meeting_limits_guard();
