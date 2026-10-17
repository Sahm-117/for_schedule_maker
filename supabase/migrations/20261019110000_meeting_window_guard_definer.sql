-- The meeting-window trigger looked up a participant's group with discussion_participant_group, a private
-- helper only the owner and service role may run. The trigger ran as the signed-in support, so marking
-- attendance failed with "permission denied for function discussion_participant_group". The trigger now
-- runs with the owner's rights, like the other guards; the window rule itself is unchanged.
CREATE OR REPLACE FUNCTION public.fof_meeting_window_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
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
