-- Group calls are taken to last 1 hour (was 30 minutes in 20261021100000_group_call_window_end.sql). The second time of
-- each day in Settings > Group call limits is when calls must END, so the latest start is 60 minutes before it: with
-- Thursday 16:00 to 21:00 a call can start from 16:00 to 20:00. Matches CALL_MINUTES in frontend/src/utils/groupMeetingLimits.ts.
-- Same rules otherwise: checked only when a group's day or time is being CHANGED; admins and maintenance are not held to it.

CREATE OR REPLACE FUNCTION public.group_meeting_limits_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  lim JSONB := public.group_meeting_limits();
  win JSONB;
  start_min INT;
  earliest TEXT;
  latest TEXT;
  earliest_min INT;
  latest_min INT;
  allowed_days TEXT[];
BEGIN
  -- Only when the slot is being set or changed, and only for people who are held to the limits.
  IF TG_OP = 'UPDATE'
     AND NEW."meetingDay" IS NOT DISTINCT FROM OLD."meetingDay"
     AND NEW."meetingTime" IS NOT DISTINCT FROM OLD."meetingTime" THEN
    RETURN NEW;
  END IF;
  IF public.app_current_token() IS NULL OR public.app_current_token() = '' OR public.app_is_admin() THEN RETURN NEW; END IF;
  -- Clearing a field is always fine; the limits judge a full slot.
  IF NEW."meetingDay" IS NULL AND NEW."meetingTime" IS NULL THEN RETURN NEW; END IF;

  SELECT array_agg(d) INTO allowed_days FROM jsonb_array_elements_text(lim -> 'days') d;

  IF NEW."meetingDay" IS NOT NULL AND NOT (NEW."meetingDay" = ANY (allowed_days)) THEN
    RAISE EXCEPTION 'MEETING_OUTSIDE_LIMITS: group calls can only be on %', array_to_string(ARRAY(SELECT initcap(lower(d)) FROM unnest(allowed_days) d), ', ');
  END IF;
  IF NEW."meetingTime" IS NOT NULL THEN
    IF NEW."meetingTime" !~ '^[0-2][0-9]:[0-5][0-9]$' THEN RAISE EXCEPTION 'MEETING_OUTSIDE_LIMITS: that start time is not valid'; END IF;
    start_min := split_part(NEW."meetingTime", ':', 1)::INT * 60 + split_part(NEW."meetingTime", ':', 2)::INT;
    win := CASE WHEN NEW."meetingDay" IS NOT NULL THEN lim -> 'dayTimes' -> NEW."meetingDay" END;
    earliest := COALESCE(win ->> 'earliestStart', lim ->> 'earliestStart');
    latest := COALESCE(win ->> 'latestStart', lim ->> 'latestStart', lim ->> 'latestEnd');
    earliest_min := split_part(earliest, ':', 1)::INT * 60 + split_part(earliest, ':', 2)::INT;
    -- The stored time is the end of the window; a 1-hour call must start by 60 minutes before it.
    latest_min := split_part(latest, ':', 1)::INT * 60 + split_part(latest, ':', 2)::INT - 60;
    IF start_min < earliest_min OR start_min > latest_min THEN
      RAISE EXCEPTION 'MEETING_OUTSIDE_LIMITS: group calls must start between % and %', earliest,
        lpad((GREATEST(latest_min, 0) / 60)::TEXT, 2, '0') || ':' || lpad((GREATEST(latest_min, 0) % 60)::TEXT, 2, '0');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
