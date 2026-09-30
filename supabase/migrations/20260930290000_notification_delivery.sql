-- Announcements → "Sent & read": what notifications went out, to whom, and who has read them.
--
-- 1. Staff notifications only stored read / unread. "readAt" (set by a trigger, so
--    every code path that marks one read is covered) adds WHEN, from now on.
--    Older rows stay read/unread with no time.
-- 2. notification_sends(days): admin-only list of sends, one row per batch. A batch is
--    the same type + title + text + link created within the same 10 minutes. Pushes
--    that have no bell row (the 8am reminder, meeting reminders) come from their logs,
--    with read not tracked.
-- 3. notification_send_recipients(...): admin-only, who got one batch and whether they read it.
-- Reminding the unread uses the existing notify-users function; no new sender.

ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "readAt" TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.notification_stamp_read()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."isRead" THEN
    IF NOT COALESCE(OLD."isRead", FALSE) AND NEW."readAt" IS NULL THEN
      NEW."readAt" := NOW();
    END IF;
  ELSE
    NEW."readAt" := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notification_stamp_read ON "Notification";
CREATE TRIGGER trg_notification_stamp_read
  BEFORE UPDATE OF "isRead" ON "Notification"
  FOR EACH ROW EXECUTE FUNCTION public.notification_stamp_read();

CREATE OR REPLACE FUNCTION public.push_kind_label(p_kind TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_kind = 'OPEN_CONTACTS_8AM' THEN 'Follow-ups need attention (8am push)'
    WHEN p_kind LIKE 'NO_ACTIVITY_%' THEN 'No activity on your follow-ups'
    WHEN p_kind = 'GROUP_MEETING' THEN 'Group meeting reminder'
    WHEN p_kind = 'HUB_MEETING' THEN 'Hub meeting reminder'
    WHEN p_kind = 'ACTIVITY' THEN 'Activity reminder'
    WHEN p_kind = 'RECAP_SUPPORT' THEN 'Class recap reminder'
    WHEN p_kind = 'MANUAL_SUPPORT' THEN 'Class manual reminder'
    ELSE p_kind
  END;
$$;

CREATE OR REPLACE FUNCTION public.notification_sends(p_days INTEGER DEFAULT 14)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT public.app_is_admin() THEN
    RAISE EXCEPTION 'NOT_AUTHORISED';
  END IF;

  RETURN COALESCE((
    SELECT json_agg(r ORDER BY r."sentAt" DESC) FROM (
      SELECT 'STAFF'::TEXT AS source, n.type, n.title, n.body, COALESCE(n.path, '') AS path,
             MIN(n."createdAt") AS "sentAt", MAX(n."createdAt") AS "lastAt",
             COUNT(*)::INT AS recipients, (COUNT(*) FILTER (WHERE n."isRead"))::INT AS "readCount",
             TRUE AS tracked
      FROM "Notification" n
      WHERE n."createdAt" > NOW() - make_interval(days => GREATEST(p_days, 1))
      GROUP BY n.type, n.title, n.body, COALESCE(n.path, ''), FLOOR(EXTRACT(EPOCH FROM n."createdAt") / 600)
      UNION ALL
      SELECT 'PARTICIPANT', n.type, n.title, n.body, COALESCE(n.path, ''),
             MIN(n."createdAt"), MAX(n."createdAt"),
             COUNT(*)::INT, (COUNT(*) FILTER (WHERE n."readAt" IS NOT NULL))::INT, TRUE
      FROM "ParticipantNotification" n
      WHERE n."createdAt" > NOW() - make_interval(days => GREATEST(p_days, 1))
      GROUP BY n.type, n.title, n.body, COALESCE(n.path, ''), FLOOR(EXTRACT(EPOCH FROM n."createdAt") / 600)
      UNION ALL
      SELECT 'PUSH', l.kind, public.push_kind_label(l.kind), '', '',
             MIN(l."createdAt"), MAX(l."createdAt"), COUNT(DISTINCT l."userId")::INT, 0, FALSE
      FROM "FollowUpOwnerReminderLog" l
      WHERE l."createdAt" > NOW() - make_interval(days => GREATEST(p_days, 1))
      GROUP BY l.kind, l."reminderDate"
      UNION ALL
      SELECT 'PUSH', l.kind, public.push_kind_label(l.kind), '', '',
             MIN(l."createdAt"), MAX(l."createdAt"), COUNT(DISTINCT l."userId")::INT, 0, FALSE
      FROM "PushReminderLog" l
      WHERE l."createdAt" > NOW() - make_interval(days => GREATEST(p_days, 1))
      GROUP BY l.kind, l."reminderDate"
    ) r
  ), '[]'::JSON);
END;
$$;

CREATE OR REPLACE FUNCTION public.notification_send_recipients(
  p_source TEXT, p_type TEXT, p_title TEXT, p_body TEXT, p_path TEXT,
  p_from TIMESTAMPTZ, p_to TIMESTAMPTZ
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT public.app_is_admin() THEN
    RAISE EXCEPTION 'NOT_AUTHORISED';
  END IF;

  IF p_source = 'STAFF' THEN
    RETURN COALESCE((
      SELECT json_agg(x ORDER BY x.read, x.name) FROM (
        SELECT n."userId" AS id, u.name, u.role::TEXT AS role, n."isRead" AS read, n."readAt" AS "readAt",
               n."createdAt" AS "sentAt",
               EXISTS (SELECT 1 FROM "PushSubscription" s WHERE s."userId" = n."userId") AS "hasPush"
        FROM "Notification" n JOIN "User" u ON u.id = n."userId"
        WHERE n.type = p_type AND n.title = p_title AND n.body = p_body
          AND COALESCE(n.path, '') = COALESCE(p_path, '')
          AND n."createdAt" BETWEEN p_from AND p_to
      ) x
    ), '[]'::JSON);
  ELSIF p_source = 'PARTICIPANT' THEN
    RETURN COALESCE((
      SELECT json_agg(x ORDER BY x.read, x.name) FROM (
        SELECT n."participantId" AS id, p."fullName" AS name, 'PARTICIPANT'::TEXT AS role,
               (n."readAt" IS NOT NULL) AS read, n."readAt" AS "readAt", n."createdAt" AS "sentAt",
               EXISTS (SELECT 1 FROM "ParticipantPushSubscription" s WHERE s."participantId" = n."participantId") AS "hasPush"
        FROM "ParticipantNotification" n JOIN "Participant" p ON p.id = n."participantId"
        WHERE n.type = p_type AND n.title = p_title AND n.body = p_body
          AND COALESCE(n.path, '') = COALESCE(p_path, '')
          AND n."createdAt" BETWEEN p_from AND p_to
      ) x
    ), '[]'::JSON);
  ELSE
    -- Push only: who it was sent to. Read is not tracked.
    RETURN COALESCE((
      SELECT json_agg(x ORDER BY x.name) FROM (
        SELECT DISTINCT l."userId" AS id, u.name, u.role::TEXT AS role, NULL::BOOLEAN AS read,
               NULL::TIMESTAMPTZ AS "readAt", l."createdAt" AS "sentAt", TRUE AS "hasPush"
        FROM (
          SELECT "userId", kind, "createdAt" FROM "FollowUpOwnerReminderLog"
          UNION ALL
          SELECT "userId", kind, "createdAt" FROM "PushReminderLog"
        ) l JOIN "User" u ON u.id = l."userId"
        WHERE l.kind = p_type AND l."createdAt" BETWEEN p_from AND p_to
      ) x
    ), '[]'::JSON);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.notification_sends(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notification_send_recipients(TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notification_sends(INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notification_send_recipients(TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ) TO anon, authenticated;
