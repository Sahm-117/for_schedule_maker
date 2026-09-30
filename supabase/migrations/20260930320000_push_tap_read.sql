-- Tapping a phone push counts as reading it. The push carries the same title and text as
-- the bell copy, so the app sends those back and these mark the matching unread ones read
-- (for the signed-in person only, from the last 14 days).

CREATE OR REPLACE FUNCTION public.mark_notifications_read_by_content(p_title TEXT, p_body TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  me UUID := public.app_current_user_id();
  changed INTEGER;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'SESSION_EXPIRED';
  END IF;
  UPDATE "Notification" SET "isRead" = TRUE
  WHERE "userId" = me AND NOT "isRead" AND title = p_title AND body = COALESCE(p_body, '')
    AND "createdAt" > NOW() - INTERVAL '14 days';
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_participant_notifications_read_by_content(p_token TEXT, p_title TEXT, p_body TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  person_id UUID := public.app_participant_id(p_token);
  changed INTEGER;
BEGIN
  IF person_id IS NULL THEN
    RAISE EXCEPTION 'SESSION_EXPIRED';
  END IF;
  UPDATE "ParticipantNotification" SET "readAt" = NOW()
  WHERE "participantId" = person_id AND "readAt" IS NULL AND title = p_title AND body = COALESCE(p_body, '')
    AND "createdAt" > NOW() - INTERVAL '14 days';
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_notifications_read_by_content(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_participant_notifications_read_by_content(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_notifications_read_by_content(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_participant_notifications_read_by_content(TEXT, TEXT, TEXT) TO anon, authenticated;
