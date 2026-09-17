-- V2 welcome + per-page product tours.
--
-- Remembers, per account, which tours someone has seen, so the Welcome modal
-- shows once and the unseen dot on each page's "?" clears on every device.
-- Keys look like 'welcome:v2' or 'page:support:home'.
-- Like AppSession, the table has RLS on, no policies and no grants, so it is
-- reachable only through the session-checked functions below. Works for staff
-- and participants alike, since both sign in through AppSession.

CREATE TABLE IF NOT EXISTS "TourProgress" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" UUID REFERENCES "User"(id) ON DELETE CASCADE,
  "participantId" UUID REFERENCES "Participant"(id) ON DELETE CASCADE,
  "tourKey" TEXT NOT NULL,
  "seenAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "TourProgress_one_actor" CHECK (("userId" IS NULL) <> ("participantId" IS NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_tourprogress_user_key
  ON "TourProgress"("userId", "tourKey") WHERE "userId" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_tourprogress_participant_key
  ON "TourProgress"("participantId", "tourKey") WHERE "participantId" IS NOT NULL;

ALTER TABLE "TourProgress" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "TourProgress" FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_tour_progress(p_token TEXT)
RETURNS TEXT[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  s "AppSession" := public.app_session(p_token);
BEGIN
  IF s.id IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;
  RETURN COALESCE((
    SELECT array_agg(t."tourKey" ORDER BY t."seenAt")
    FROM "TourProgress" t
    WHERE (s."userId" IS NOT NULL AND t."userId" = s."userId")
       OR (s."participantId" IS NOT NULL AND t."participantId" = s."participantId")
  ), ARRAY[]::TEXT[]);
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_tour_seen(p_token TEXT, p_key TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  s "AppSession" := public.app_session(p_token);
BEGIN
  IF s.id IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;
  IF p_key IS NULL OR p_key !~ '^[a-z0-9:_-]{1,80}$' THEN
    RAISE EXCEPTION 'Invalid tour key';
  END IF;

  IF s."userId" IS NOT NULL THEN
    INSERT INTO "TourProgress" ("userId", "tourKey") VALUES (s."userId", p_key)
    ON CONFLICT ("userId", "tourKey") WHERE "userId" IS NOT NULL DO NOTHING;
  ELSE
    INSERT INTO "TourProgress" ("participantId", "tourKey") VALUES (s."participantId", p_key)
    ON CONFLICT ("participantId", "tourKey") WHERE "participantId" IS NOT NULL DO NOTHING;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.get_tour_progress(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_tour_seen(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_tour_progress(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_tour_seen(TEXT, TEXT) TO anon, authenticated;
