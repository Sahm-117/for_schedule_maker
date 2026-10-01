-- Resources: who can see each one, and replacing a document without losing the old one.
--
-- 1. Audience on every resource: supports and/or participants, optionally only
--    supports in chosen hubs, for one cohort or all cohorts (cohortId NULL).
--    Existing resources keep their behaviour: supports see them (visibleToSupports
--    defaults TRUE), participants as before (visibleToParticipants), all cohorts.
-- 2. Staff reads are filtered by that audience at the database: an admin sees
--    everything, a support only what is meant for them. The older catch-all
--    policy and the insert/delete policies are tightened to real admins (the
--    insert/delete ones only checked that SOME admin exists).
-- 3. Participants: participant_home now also respects the cohort. It is patched in
--    place from its live definition (only the Resource filter changes). If a later
--    migration redefines participant_home from older text, re-apply this filter:
--      AND (r."cohortId" IS NULL OR r."cohortId" = person."cohortId")
-- 4. ResourceVersion keeps every superseded file or link. resource_replace_document
--    swaps in a new one (admins only) and files the old one under the version
--    history; resource_versions lists it (admins only).
--
-- The files themselves live in a public storage bucket, so the audience controls
-- who is shown a resource, not who could open a link someone shares.
--
-- Rollback: restore the three policies and participant_home's old filter; DROP
-- FUNCTION resource_visible_to_staff, resource_replace_document, resource_versions;
-- DROP TABLE "ResourceVersion"; drop the added Resource columns.

ALTER TABLE public."Resource"
  ADD COLUMN IF NOT EXISTS "cohortId" UUID,
  ADD COLUMN IF NOT EXISTS "visibleToSupports" BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS "hubIds" UUID[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "updatedById" UUID REFERENCES public."User"(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "updateNote" TEXT,
  ADD COLUMN IF NOT EXISTS "versionCount" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public."ResourceVersion" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "resourceId" UUID NOT NULL REFERENCES public."Resource"(id) ON DELETE CASCADE,
  "versionNo" INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL,
  url TEXT NOT NULL,
  "fileName" TEXT,
  "fileSize" BIGINT,
  note TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL,
  "createdById" UUID REFERENCES public."User"(id) ON DELETE SET NULL,
  "replacedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "replacedById" UUID REFERENCES public."User"(id) ON DELETE SET NULL,
  UNIQUE ("resourceId", "versionNo")
);
ALTER TABLE public."ResourceVersion" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."ResourceVersion" FROM anon, authenticated;

-- Can the signed-in staff member see a resource with this audience?
CREATE OR REPLACE FUNCTION public.resource_visible_to_staff(p_cohort_id UUID, p_supports BOOLEAN, p_hub_ids UUID[])
 RETURNS BOOLEAN
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT public.app_is_admin() OR (
    public.app_is_staff()
    AND p_supports
    AND (
      p_cohort_id IS NULL
      OR EXISTS (SELECT 1 FROM public."UserCohort" uc WHERE uc."userId" = public.app_current_user_id() AND uc."cohortId" = p_cohort_id)
      OR EXISTS (SELECT 1 FROM public."HubMembership" m WHERE m."userId" = public.app_current_user_id() AND m."cohortId" = p_cohort_id)
      OR EXISTS (SELECT 1 FROM public."Group" g WHERE g."supportId" = public.app_current_user_id() AND g."cohortId" = p_cohort_id)
    )
    AND (
      cardinality(p_hub_ids) = 0
      OR EXISTS (
        SELECT 1 FROM public."SupportHub" h
        WHERE h.id = ANY(p_hub_ids)
          AND (
            h."leadUserId" = public.app_current_user_id()
            OR h."assistantLeadUserId" = public.app_current_user_id()
            OR public.app_current_user_id() = ANY(h."recapLeadUserIds")
            OR public.app_current_user_id() = ANY(h."prayerLeadUserIds")
            OR EXISTS (SELECT 1 FROM public."HubMembership" m WHERE m."hubId" = h.id AND m."userId" = public.app_current_user_id())
            OR EXISTS (SELECT 1 FROM public."HubItSupport" i WHERE i."hubId" = h.id AND i."userId" = public.app_current_user_id())
          )
      )
    )
  );
$function$;

ALTER POLICY "Resource: read" ON public."Resource"
  USING (public.app_is_staff() AND public.resource_visible_to_staff("cohortId", "visibleToSupports", "hubIds"));
ALTER POLICY resource_open ON public."Resource"
  USING (public.app_is_admin()) WITH CHECK (public.app_is_admin());
ALTER POLICY "Resource: insert" ON public."Resource"
  WITH CHECK (public.app_is_admin());
ALTER POLICY "Resource: delete" ON public."Resource"
  USING (public.app_is_admin());

-- Participants: respect the cohort too (patch participant_home in place).
DO $patch$
DECLARE
  v_def TEXT;
  v_new TEXT;
BEGIN
  SELECT pg_get_functiondef('public.participant_home(text)'::regprocedure) INTO v_def;
  IF position('r."cohortId" IS NULL OR r."cohortId" = person."cohortId"' IN v_def) > 0 THEN
    RETURN; -- already patched
  END IF;
  v_new := replace(
    v_def,
    'FROM "Resource" r WHERE r."visibleToParticipants"',
    'FROM "Resource" r WHERE r."visibleToParticipants" AND (r."cohortId" IS NULL OR r."cohortId" = person."cohortId")');
  IF v_new = v_def THEN
    RAISE EXCEPTION 'participant_home: the Resource filter was not found';
  END IF;
  EXECUTE v_new;
END
$patch$;

-- Replace a resource's file or link (admins only), keeping the old one.
-- p_url NULL means "keep the file, only change who sees it".
CREATE OR REPLACE FUNCTION public.resource_replace_document(
  p_resource_id UUID,
  p_type TEXT,
  p_url TEXT,
  p_file_name TEXT,
  p_file_size BIGINT,
  p_note TEXT,
  p_visible_to_supports BOOLEAN,
  p_visible_to_participants BOOLEAN,
  p_cohort_id UUID,
  p_hub_ids UUID[]
)
 RETURNS JSONB
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_old public."Resource";
  v_me UUID := public.app_current_user_id();
  v_new public."Resource";
BEGIN
  IF NOT public.app_is_admin() THEN
    RAISE EXCEPTION 'Only admins can update a resource';
  END IF;
  IF NOT (p_visible_to_supports OR p_visible_to_participants) THEN
    RAISE EXCEPTION 'Choose who can see this resource';
  END IF;
  IF p_type IS NOT NULL AND p_type NOT IN ('link', 'pdf', 'doc', 'image', 'file') THEN
    RAISE EXCEPTION 'Invalid resource type';
  END IF;

  SELECT * INTO v_old FROM public."Resource" WHERE id = p_resource_id FOR UPDATE;
  IF v_old.id IS NULL THEN
    RAISE EXCEPTION 'Resource was not found';
  END IF;

  IF p_url IS NOT NULL THEN
    INSERT INTO public."ResourceVersion"
      ("resourceId", "versionNo", title, description, type, url, "fileName", "fileSize", note, "createdAt", "createdById", "replacedAt", "replacedById")
    VALUES (
      v_old.id,
      COALESCE((SELECT max(rv."versionNo") FROM public."ResourceVersion" rv WHERE rv."resourceId" = v_old.id), 0) + 1,
      v_old.title, v_old.description, v_old.type, v_old.url, v_old."fileName", v_old."fileSize",
      v_old."updateNote", COALESCE(v_old."updatedAt", v_old."createdAt"), COALESCE(v_old."updatedById", v_old."addedBy"), NOW(), v_me);
  END IF;

  UPDATE public."Resource" r
  SET type = CASE WHEN p_url IS NOT NULL THEN COALESCE(p_type, r.type) ELSE r.type END,
      url = COALESCE(p_url, r.url),
      "fileName" = CASE WHEN p_url IS NOT NULL THEN p_file_name ELSE r."fileName" END,
      "fileSize" = CASE WHEN p_url IS NOT NULL THEN p_file_size ELSE r."fileSize" END,
      "updateNote" = CASE WHEN p_url IS NOT NULL THEN NULLIF(btrim(COALESCE(p_note, '')), '') ELSE r."updateNote" END,
      "updatedAt" = CASE WHEN p_url IS NOT NULL THEN NOW() ELSE r."updatedAt" END,
      "updatedById" = CASE WHEN p_url IS NOT NULL THEN v_me ELSE r."updatedById" END,
      "versionCount" = r."versionCount" + CASE WHEN p_url IS NOT NULL THEN 1 ELSE 0 END,
      "visibleToSupports" = p_visible_to_supports,
      "visibleToParticipants" = p_visible_to_participants,
      "cohortId" = p_cohort_id,
      "hubIds" = COALESCE(p_hub_ids, '{}')
  WHERE r.id = p_resource_id
  RETURNING * INTO v_new;

  RETURN to_jsonb(v_new);
END;
$function$;

-- Version history (admins only): the current one first, then the earlier ones.
CREATE OR REPLACE FUNCTION public.resource_versions(p_resource_id UUID)
 RETURNS JSONB
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_cur public."Resource";
BEGIN
  IF NOT public.app_is_admin() THEN
    RAISE EXCEPTION 'Only admins can see the version history';
  END IF;
  SELECT * INTO v_cur FROM public."Resource" WHERE id = p_resource_id;
  IF v_cur.id IS NULL THEN
    RAISE EXCEPTION 'Resource was not found';
  END IF;

  RETURN jsonb_build_object(
    'current', jsonb_build_object(
      'versionNo', v_cur."versionCount" + 1, 'type', v_cur.type, 'url', v_cur.url, 'fileName', v_cur."fileName",
      'fileSize', v_cur."fileSize", 'note', v_cur."updateNote",
      'at', COALESCE(v_cur."updatedAt", v_cur."createdAt"),
      'by', (SELECT u.name FROM public."User" u WHERE u.id = COALESCE(v_cur."updatedById", v_cur."addedBy"))),
    'earlier', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'versionNo', rv."versionNo", 'type', rv.type, 'url', rv.url, 'fileName', rv."fileName",
        'fileSize', rv."fileSize", 'note', rv.note, 'at', rv."createdAt",
        'by', (SELECT u.name FROM public."User" u WHERE u.id = rv."createdById")) ORDER BY rv."versionNo" DESC)
      FROM public."ResourceVersion" rv WHERE rv."resourceId" = p_resource_id), '[]'::jsonb)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.resource_replace_document(UUID, TEXT, TEXT, TEXT, BIGINT, TEXT, BOOLEAN, BOOLEAN, UUID, UUID[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resource_versions(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resource_replace_document(UUID, TEXT, TEXT, TEXT, BIGINT, TEXT, BOOLEAN, BOOLEAN, UUID, UUID[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resource_versions(UUID) TO anon, authenticated;
