-- Group call limits: each day can have its own earliest and latest start, and call lengths are no longer limited.
-- AppSetting "group_meeting_limits" now reads { days, earliestStart, latestStart, dayTimes: { SUNDAY: { earliestStart, latestStart } } }.
-- A day without a "dayTimes" entry uses the top-level earliestStart/latestStart. A row saved before this change has a
-- "latestEnd" instead of "latestStart": it is read as the latest start, so nothing needs rewriting. Same rules as before
-- otherwise: checked only when a group's day or time is being CHANGED, admins and database maintenance are not held to it.

CREATE OR REPLACE FUNCTION public.group_meeting_limits()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT COALESCE(
    (SELECT value::JSONB FROM "AppSetting" WHERE "settingKey" = 'group_meeting_limits'),
    '{"days":["WEDNESDAY","FRIDAY","SATURDAY"],"earliestStart":"17:00","latestStart":"21:00","dayTimes":{}}'::JSONB
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
     AND NEW."meetingTime" IS NOT DISTINCT FROM OLD."meetingTime"
     AND NEW."meetingDurationMins" IS NOT DISTINCT FROM OLD."meetingDurationMins" THEN
    RETURN NEW;
  END IF;
  IF public.app_current_token() IS NULL OR public.app_current_token() = '' OR public.app_is_admin() THEN RETURN NEW; END IF;
  -- Clearing a field is always fine; the limits judge a full slot.
  IF NEW."meetingDay" IS NULL AND NEW."meetingTime" IS NULL AND NEW."meetingDurationMins" IS NULL THEN RETURN NEW; END IF;

  SELECT array_agg(d) INTO allowed_days FROM jsonb_array_elements_text(lim -> 'days') d;

  IF NEW."meetingDay" IS NOT NULL AND NOT (NEW."meetingDay" = ANY (allowed_days)) THEN
    RAISE EXCEPTION 'MEETING_OUTSIDE_LIMITS: group calls can only be on %', array_to_string(ARRAY(SELECT initcap(lower(d)) FROM unnest(allowed_days) d), ', ');
  END IF;
  -- Length is not limited, but a stored one must be sane (it drives how long the Join button stays open).
  IF NEW."meetingDurationMins" IS NOT NULL AND (NEW."meetingDurationMins" < 1 OR NEW."meetingDurationMins" > 480) THEN
    RAISE EXCEPTION 'MEETING_OUTSIDE_LIMITS: the call length is not valid';
  END IF;
  IF NEW."meetingTime" IS NOT NULL THEN
    IF NEW."meetingTime" !~ '^[0-2][0-9]:[0-5][0-9]$' THEN RAISE EXCEPTION 'MEETING_OUTSIDE_LIMITS: that start time is not valid'; END IF;
    start_min := split_part(NEW."meetingTime", ':', 1)::INT * 60 + split_part(NEW."meetingTime", ':', 2)::INT;
    win := CASE WHEN NEW."meetingDay" IS NOT NULL THEN lim -> 'dayTimes' -> NEW."meetingDay" END;
    earliest := COALESCE(win ->> 'earliestStart', lim ->> 'earliestStart');
    latest := COALESCE(win ->> 'latestStart', lim ->> 'latestStart', lim ->> 'latestEnd');
    earliest_min := split_part(earliest, ':', 1)::INT * 60 + split_part(earliest, ':', 2)::INT;
    latest_min := split_part(latest, ':', 1)::INT * 60 + split_part(latest, ':', 2)::INT;
    IF start_min < earliest_min OR start_min > latest_min THEN
      RAISE EXCEPTION 'MEETING_OUTSIDE_LIMITS: group calls must start between % and %', earliest, latest;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
