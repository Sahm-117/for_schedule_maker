-- Participant notification bell. Every alert sent to a participant (recap out,
-- reminders, "Marked absent", "Your support replied", "Please update your
-- profile", participant announcements) also saves a row here, whether or not
-- the participant has push turned on -- same rule as staff (every push also
-- writes an in-app row). The participant app reads it through the two RPCs
-- below; the table itself is born locked like ParticipantPushSubscription
-- (20260917130000_participant_app_group_faith_profile.sql), and the edge
-- functions write with the service role.
--
-- Additive and idempotent.

CREATE TABLE IF NOT EXISTS "ParticipantNotification" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "participantId" UUID NOT NULL REFERENCES "Participant"(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  path TEXT,
  type TEXT NOT NULL DEFAULT 'GENERAL',
  "readAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "ParticipantNotification_participant_created_idx"
  ON "ParticipantNotification" ("participantId", "createdAt" DESC);

ALTER TABLE "ParticipantNotification" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "ParticipantNotification" FROM anon, authenticated;

-- Newest 50 for the signed-in participant, plus how many are unread.
CREATE OR REPLACE FUNCTION public.participant_notifications(p_token TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  person_id UUID := public.app_participant_id(p_token);
BEGIN
  IF person_id IS NULL THEN
    RAISE EXCEPTION 'SESSION_EXPIRED';
  END IF;

  RETURN json_build_object(
    'unread', (SELECT count(*) FROM "ParticipantNotification" n WHERE n."participantId" = person_id AND n."readAt" IS NULL),
    'items', COALESCE((
      SELECT json_agg(json_build_object(
        'id', x.id, 'title', x.title, 'body', x.body, 'path', x.path, 'type', x.type,
        'readAt', x."readAt", 'createdAt', x."createdAt"
      ) ORDER BY x."createdAt" DESC)
      FROM (
        SELECT * FROM "ParticipantNotification" n
        WHERE n."participantId" = person_id
        ORDER BY n."createdAt" DESC
        LIMIT 50
      ) x
    ), '[]'::json)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.participant_notifications(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.participant_notifications(TEXT) TO anon, authenticated;

-- Marks the given notifications read (only the participant's own); NULL marks all.
CREATE OR REPLACE FUNCTION public.mark_participant_notifications_read(p_token TEXT, p_ids UUID[])
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  person_id UUID := public.app_participant_id(p_token);
BEGIN
  IF person_id IS NULL THEN
    RAISE EXCEPTION 'SESSION_EXPIRED';
  END IF;

  UPDATE "ParticipantNotification" n
  SET "readAt" = NOW()
  WHERE n."participantId" = person_id
    AND n."readAt" IS NULL
    AND (p_ids IS NULL OR n.id = ANY(p_ids));
END;
$$;

REVOKE ALL ON FUNCTION public.mark_participant_notifications_read(TEXT, UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_participant_notifications_read(TEXT, UUID[]) TO anon, authenticated;
