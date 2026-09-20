-- Faith Project settings stay inside the Faith Projects module. Categories are
-- cohort-specific and are archived (never deleted) so old reviewed projects
-- keep their history. The deadline is advisory: late participant submissions
-- remain possible for pastoral reasons.

CREATE OR REPLACE FUNCTION public.app_is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM "AppSession" s
    JOIN "User" u ON u.id = s."userId"
    WHERE s."tokenHash" = encode(digest(public.app_current_token(), 'sha256'), 'hex')
      AND s."expiresAt" > NOW()
      AND s."userId" IS NOT NULL
      AND u."isActive" IS NOT FALSE
      AND u.role = 'ADMIN'
  );
$function$;

REVOKE ALL ON FUNCTION public.app_is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_is_admin() TO anon, authenticated;

CREATE TABLE IF NOT EXISTS "FaithProjectSetting" (
  "cohortId" UUID PRIMARY KEY REFERENCES "Cohort"(id) ON DELETE CASCADE,
  "deadlineAt" TIMESTAMPTZ NULL,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "FaithProjectCategory" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "cohortId" UUID NOT NULL REFERENCES "Cohort"(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  "archivedAt" TIMESTAMPTZ NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT faith_project_category_name_not_blank CHECK (length(trim(name)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS faith_project_category_unique_active_name
  ON "FaithProjectCategory" ("cohortId", lower(name))
  WHERE "archivedAt" IS NULL;

ALTER TABLE "FaithProject"
  ADD COLUMN IF NOT EXISTS "categoryId" UUID NULL REFERENCES "FaithProjectCategory"(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_faithproject_category ON "FaithProject"("categoryId");

ALTER TABLE "FaithProjectSetting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FaithProjectCategory" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read faith project settings"
  ON "FaithProjectSetting" FOR SELECT USING (public.app_is_staff());
CREATE POLICY "Admins manage faith project settings"
  ON "FaithProjectSetting" FOR ALL USING (public.app_is_admin()) WITH CHECK (public.app_is_admin());
CREATE POLICY "Staff can read faith project categories"
  ON "FaithProjectCategory" FOR SELECT USING (public.app_is_staff());
CREATE POLICY "Admins manage faith project categories"
  ON "FaithProjectCategory" FOR ALL USING (public.app_is_admin()) WITH CHECK (public.app_is_admin());

-- The participant is only exposed to their own deadline through this existing
-- token-protected function, never through direct table access.
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

  INSERT INTO "ParticipantThreadRead" ("participantId", "coachLastReadAt") VALUES (person_id, NOW())
  ON CONFLICT ("participantId") DO UPDATE SET "coachLastReadAt" = NOW();
  RETURN result;
END;
$$;
