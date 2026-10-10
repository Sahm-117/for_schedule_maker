-- Likes, downloads and shares on the daily Inspirational Scripture posts, from participants and supports.
-- Written only through the functions below; admins read the totals on the Scriptures page.
-- Posts are found by their day number (what the apps already hold), and the row keeps the Scripture id,
-- so re-ordering the posts never moves a like to the wrong picture.
-- Only the Scripture has a real foreign key. The person is a plain id plus a kind (USER or PARTICIPANT), so this
-- table never links User, Participant or Scripture to each other a second way (FLOW_MAP rule 55).

CREATE TABLE IF NOT EXISTS "ScriptureEngagement" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "scriptureId" UUID NOT NULL REFERENCES "Scripture"(id) ON DELETE CASCADE,
  "actorKind" TEXT NOT NULL CHECK ("actorKind" IN ('USER', 'PARTICIPANT')),
  "actorId" UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('LIKE', 'DOWNLOAD', 'SHARE')),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- One like per person per post; downloads and shares are logged each time.
CREATE UNIQUE INDEX IF NOT EXISTS "ScriptureEngagement_one_like"
  ON "ScriptureEngagement" ("scriptureId", "actorKind", "actorId") WHERE action = 'LIKE';
CREATE INDEX IF NOT EXISTS "ScriptureEngagement_scripture_action" ON "ScriptureEngagement" ("scriptureId", action);
ALTER TABLE "ScriptureEngagement" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "ScriptureEngagement" FROM anon, authenticated;

-- Like (toggles), download or share one post, as whoever holds the token (a participant or a staff member).
CREATE OR REPLACE FUNCTION public.scripture_react(p_token TEXT, p_day_number INT, p_action TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  pid UUID := public.app_participant_id(p_token);
  staff "User" := public.app_staff(p_token);
  kind TEXT;
  who UUID;
  sid UUID;
  existed INT;
BEGIN
  IF p_action NOT IN ('LIKE', 'DOWNLOAD', 'SHARE') THEN RAISE EXCEPTION 'BAD_ACTION'; END IF;
  IF pid IS NOT NULL THEN kind := 'PARTICIPANT'; who := pid;
  ELSIF staff.id IS NOT NULL THEN kind := 'USER'; who := staff.id;
  ELSE RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;

  SELECT id INTO sid FROM "Scripture" WHERE "dayNumber" = p_day_number;
  IF sid IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;

  IF p_action = 'LIKE' THEN
    DELETE FROM "ScriptureEngagement" WHERE "scriptureId" = sid AND "actorKind" = kind AND "actorId" = who AND action = 'LIKE';
    GET DIAGNOSTICS existed = ROW_COUNT;
    IF existed = 0 THEN
      INSERT INTO "ScriptureEngagement" ("scriptureId", "actorKind", "actorId", action) VALUES (sid, kind, who, 'LIKE')
      ON CONFLICT DO NOTHING;
      RETURN json_build_object('liked', TRUE);
    END IF;
    RETURN json_build_object('liked', FALSE);
  END IF;

  -- A double tap should not count twice.
  IF NOT EXISTS (
    SELECT 1 FROM "ScriptureEngagement"
    WHERE "scriptureId" = sid AND "actorKind" = kind AND "actorId" = who AND action = p_action AND "createdAt" > NOW() - INTERVAL '10 seconds'
  ) THEN
    INSERT INTO "ScriptureEngagement" ("scriptureId", "actorKind", "actorId", action) VALUES (sid, kind, who, p_action);
  END IF;
  RETURN json_build_object('ok', TRUE);
END;
$$;

-- The day numbers the caller has liked.
CREATE OR REPLACE FUNCTION public.scripture_my_likes(p_token TEXT)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  pid UUID := public.app_participant_id(p_token);
  staff "User" := public.app_staff(p_token);
  kind TEXT;
  who UUID;
BEGIN
  IF pid IS NOT NULL THEN kind := 'PARTICIPANT'; who := pid;
  ELSIF staff.id IS NOT NULL THEN kind := 'USER'; who := staff.id;
  ELSE RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  RETURN COALESCE((
    SELECT json_agg(s."dayNumber" ORDER BY s."dayNumber")
    FROM "ScriptureEngagement" e JOIN "Scripture" s ON s.id = e."scriptureId"
    WHERE e."actorKind" = kind AND e."actorId" = who AND e.action = 'LIKE'
  ), '[]'::JSON);
END;
$$;

-- Admin: counts per post. Likes count people; downloads and shares count every time. Practice cohorts and test
-- accounts are left out, so a test run never changes the real numbers (FLOW_MAP rule 14).
CREATE OR REPLACE FUNCTION public.scripture_engagement_summary(p_token TEXT)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  staff "User" := public.app_staff(p_token);
BEGIN
  IF staff.id IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  IF staff.role <> 'ADMIN' THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  RETURN COALESCE((
    SELECT json_agg(json_build_object(
      'dayNumber', s."dayNumber",
      'likes', COALESCE(c.likes, 0), 'downloads', COALESCE(c.downloads, 0), 'shares', COALESCE(c.shares, 0)
    ) ORDER BY s."dayNumber")
    FROM "Scripture" s
    LEFT JOIN (
      SELECT e."scriptureId",
             COUNT(*) FILTER (WHERE e.action = 'LIKE') AS likes,
             COUNT(*) FILTER (WHERE e.action = 'DOWNLOAD') AS downloads,
             COUNT(*) FILTER (WHERE e.action = 'SHARE') AS shares
      FROM "ScriptureEngagement" e
      LEFT JOIN "Participant" p ON e."actorKind" = 'PARTICIPANT' AND p.id = e."actorId"
      LEFT JOIN "Cohort" pc ON pc.id = p."cohortId"
      LEFT JOIN "User" u ON e."actorKind" = 'USER' AND u.id = e."actorId"
      WHERE (e."actorKind" = 'PARTICIPANT' AND COALESCE(p."isTest", FALSE) = FALSE AND COALESCE(pc."isPractice", FALSE) = FALSE)
         OR (e."actorKind" = 'USER' AND COALESCE(u."isTest", FALSE) = FALSE)
      GROUP BY e."scriptureId"
    ) c ON c."scriptureId" = s.id
  ), '[]'::JSON);
END;
$$;

GRANT EXECUTE ON FUNCTION public.scripture_react(TEXT, INT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.scripture_my_likes(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.scripture_engagement_summary(TEXT) TO anon, authenticated;
