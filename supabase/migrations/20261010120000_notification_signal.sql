-- A tiny "anything new?" answer for the notification poll, so a tab that is only checking
-- does not download the whole list (about 14 KB) every time. The app fetches the full list
-- only when this changes. Plus an index that matches the list's real ORDER BY.

-- my_notifications filters on userId and sorts by createdAt DESC only; the existing index
-- also has isRead in the middle, so it cannot serve that sort.
CREATE INDEX IF NOT EXISTS idx_notification_user_created
  ON public."Notification" ("userId", "createdAt" DESC);

CREATE OR REPLACE FUNCTION public.my_notifications_signal()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  me UUID := public.app_current_user_id();
BEGIN
  IF me IS NULL THEN
    RETURN json_build_object('unread', 0, 'latestId', NULL, 'latestAt', NULL);
  END IF;
  RETURN json_build_object(
    'unread', (SELECT count(*) FROM "Notification" WHERE "userId" = me AND "isRead" = false),
    'latestId', (SELECT id FROM "Notification" WHERE "userId" = me ORDER BY "createdAt" DESC LIMIT 1),
    'latestAt', (SELECT "createdAt" FROM "Notification" WHERE "userId" = me ORDER BY "createdAt" DESC LIMIT 1)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.my_notifications_signal() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_notifications_signal() TO anon, authenticated;
