-- Keep a participant's Faith Project comments closed on later visits. Reading is
-- now recorded only after the participant actually sees the thread, rather than
-- while its data is loading.

CREATE OR REPLACE FUNCTION public.participant_faith(p_token TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  person_id UUID := public.app_participant_id(p_token);
  result JSON;
BEGIN
  IF person_id IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;

  result := json_build_object(
    'project', (
      SELECT json_build_object('id', f.id, 'body', f.body, 'status', f.status, 'updatedAt', f."updatedAt")
      FROM "FaithProject" f WHERE f."participantId" = person_id
      ORDER BY f."updatedAt" DESC LIMIT 1
    ),
    'deadlineAt', (
      SELECT s."deadlineAt" FROM "FaithProjectSetting" s
      JOIN "Participant" p ON p."cohortId" = s."cohortId"
      WHERE p.id = person_id
    ),
    'trail', COALESCE((
      SELECT json_agg(json_build_object(
        'id', n.id, 'body', n.body, 'createdAt', n."createdAt", 'byParticipant', n."byParticipant", 'authorName', u.name
      ) ORDER BY n."createdAt")
      FROM "ParticipantNote" n LEFT JOIN "User" u ON u.id = n."authorId"
      WHERE n."participantId" = person_id AND n."noteType" = 'FAITH_COACH'
    ), '[]'::json)
  );

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_participant_faith_read(p_token TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  person_id UUID := public.app_participant_id(p_token);
BEGIN
  IF person_id IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;

  INSERT INTO "ParticipantThreadRead" ("participantId", "coachLastReadAt") VALUES (person_id, NOW())
  ON CONFLICT ("participantId") DO UPDATE SET "coachLastReadAt" = NOW();
END;
$$;

GRANT EXECUTE ON FUNCTION public.participant_faith(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_participant_faith_read(TEXT) TO anon, authenticated;
