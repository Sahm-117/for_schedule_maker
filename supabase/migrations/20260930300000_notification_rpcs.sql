-- Staff notifications: the bell reads and updates through checked functions, so the
-- Notification table itself can be closed to the public key (next migration).
-- Also closes FollowUpAdminAlertLog: a server-function log that nothing in the app reads.

CREATE OR REPLACE FUNCTION public.my_notifications(p_limit INTEGER DEFAULT 50)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  me UUID := public.app_current_user_id();
BEGIN
  IF me IS NULL THEN
    RETURN '[]'::JSON;
  END IF;
  RETURN COALESCE((
    SELECT json_agg(n ORDER BY n."createdAt" DESC)
    FROM (
      SELECT id, "userId", title, body, path, type, "isRead", "createdAt"
      FROM "Notification"
      WHERE "userId" = me
      ORDER BY "createdAt" DESC
      LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200)
    ) n
  ), '[]'::JSON);
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_notification_read(p_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  me UUID := public.app_current_user_id();
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'SESSION_EXPIRED';
  END IF;
  UPDATE "Notification" SET "isRead" = TRUE WHERE id = p_id AND "userId" = me AND NOT "isRead";
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_all_notifications_read()
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
  UPDATE "Notification" SET "isRead" = TRUE WHERE "userId" = me AND NOT "isRead";
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed;
END;
$$;

REVOKE ALL ON FUNCTION public.my_notifications(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_notification_read(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_all_notifications_read() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_notifications(INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_notification_read(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_all_notifications_read() TO anon, authenticated;

-- Only edge functions (service role) use this log.
DROP POLICY IF EXISTS "Allow all operations" ON "FollowUpAdminAlertLog";
REVOKE ALL ON "FollowUpAdminAlertLog" FROM anon, authenticated;
