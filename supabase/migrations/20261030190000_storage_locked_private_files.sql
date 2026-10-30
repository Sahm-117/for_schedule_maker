-- Storage locked down, and resource files made private (FLOW_MAP rule 129).
--
-- 1. The public "resources" bucket (scripture designs, photos, guides, recaps) keeps its public links, but writing
--    to it now needs a signed-in session: anyone signed in may upload, and only staff may replace, delete or list.
--    The four open policies are tightened in place, not dropped.
-- 2. A private bucket, "private-files", holds files added under Resources. Nobody reads it directly: the
--    file-links function asks private_file_paths which of the requested files this session may see (the same
--    rules as the Resources lists: resource_visible_to_staff for staff, participant_home's rule for participants)
--    and hands out signed links that last two hours. A private file's Resource.url is "fof-private:<path>".
--
-- Rollback: ALTER the four policies back to USING/WITH CHECK (bucket_id = 'resources') for role public;
-- DROP FUNCTION public.private_file_paths; private files would then need moving back before deleting the bucket.

-- Any signed-in session (staff or participant). app_participant_id is closed to the app's roles, so the storage
-- policy calls this instead.
CREATE OR REPLACE FUNCTION public.storage_signed_in()
 RETURNS BOOLEAN
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT public.app_is_staff() OR public.app_participant_id(public.app_current_token()) IS NOT NULL;
$function$;
REVOKE ALL ON FUNCTION public.storage_signed_in() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.storage_signed_in() TO anon, authenticated;

-- The policies keep their dashboard names ("resources_open …"); only storage's owner may rename them.
-- _0 is reading (listing through the API), _1 uploading, _2 deleting, _3 replacing.
ALTER POLICY "resources_open 128fyud_0" ON storage.objects
  USING (bucket_id = 'resources' AND public.app_is_staff());
ALTER POLICY "resources_open 128fyud_1" ON storage.objects
  WITH CHECK (bucket_id = 'resources' AND public.storage_signed_in());
ALTER POLICY "resources_open 128fyud_2" ON storage.objects
  USING (bucket_id = 'resources' AND public.app_is_staff());
ALTER POLICY "resources_open 128fyud_3" ON storage.objects
  USING (bucket_id = 'resources' AND public.app_is_staff());

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('private-files', 'private-files', FALSE, 52428800)
ON CONFLICT (id) DO UPDATE SET public = FALSE;

-- Admins add and remove private files from the browser (deleting needs read access, so admins may read them too);
-- everyone else opens them only through signed links.
DROP POLICY IF EXISTS "private-files: admin read" ON storage.objects;
CREATE POLICY "private-files: admin read" ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'private-files' AND public.app_is_admin());
DROP POLICY IF EXISTS "private-files: admin upload" ON storage.objects;
CREATE POLICY "private-files: admin upload" ON storage.objects FOR INSERT TO public
  WITH CHECK (bucket_id = 'private-files' AND public.app_is_admin());
DROP POLICY IF EXISTS "private-files: admin delete" ON storage.objects;
CREATE POLICY "private-files: admin delete" ON storage.objects FOR DELETE TO public
  USING (bucket_id = 'private-files' AND public.app_is_admin());

-- Which of these private files (resources, or earlier versions of them) this session may open, and where they are.
CREATE OR REPLACE FUNCTION public.private_file_paths(p_kind TEXT, p_ids UUID[])
 RETURNS TABLE (id UUID, path TEXT)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  WITH me AS (
    SELECT public.app_is_staff() AS staff, public.app_participant_id(public.app_current_token()) AS pid
  ),
  wanted AS (
    SELECT r.* FROM public."Resource" r
    WHERE (p_kind = 'resource' AND r.id = ANY(p_ids))
       OR (p_kind = 'version' AND r.id IN (SELECT v."resourceId" FROM public."ResourceVersion" v WHERE v.id = ANY(p_ids)))
  ),
  allowed AS (
    SELECT w.id FROM wanted w, me
    WHERE (me.staff AND public.resource_visible_to_staff(w."cohortId", w."visibleToSupports", w."hubIds"))
       OR (me.pid IS NOT NULL AND COALESCE(w."visibleToParticipants", FALSE)
           AND (w."cohortId" IS NULL OR w."cohortId" = (SELECT p."cohortId" FROM public."Participant" p WHERE p.id = me.pid)))
  )
  SELECT r.id, substring(r.url FROM 13) FROM public."Resource" r
  WHERE p_kind = 'resource' AND r.id IN (SELECT a.id FROM allowed a) AND r.url LIKE 'fof-private:%'
  UNION ALL
  SELECT v.id, substring(v.url FROM 13) FROM public."ResourceVersion" v
  WHERE p_kind = 'version' AND v.id = ANY(p_ids) AND v."resourceId" IN (SELECT a.id FROM allowed a) AND v.url LIKE 'fof-private:%';
$function$;

REVOKE ALL ON FUNCTION public.private_file_paths(TEXT, UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.private_file_paths(TEXT, UUID[]) TO anon, authenticated;

-- Church apps (public API) get the same resources; public-api signs any private link before answering.

-- The version history gives each entry its id (the resource's id for the current one), so an earlier private file
-- can be signed too.
CREATE OR REPLACE FUNCTION public.resource_versions(p_resource_id uuid)
 RETURNS jsonb
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
      'id', v_cur.id, 'versionNo', v_cur."versionCount" + 1, 'type', v_cur.type, 'url', v_cur.url, 'fileName', v_cur."fileName",
      'fileSize', v_cur."fileSize", 'note', v_cur."updateNote",
      'at', COALESCE(v_cur."updatedAt", v_cur."createdAt"),
      'by', (SELECT u.name FROM public."User" u WHERE u.id = COALESCE(v_cur."updatedById", v_cur."addedBy"))),
    'earlier', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', rv.id, 'versionNo', rv."versionNo", 'type', rv.type, 'url', rv.url, 'fileName', rv."fileName",
        'fileSize', rv."fileSize", 'note', rv.note, 'at', rv."createdAt",
        'by', (SELECT u.name FROM public."User" u WHERE u.id = rv."createdById")) ORDER BY rv."versionNo" DESC)
      FROM public."ResourceVersion" rv WHERE rv."resourceId" = p_resource_id), '[]'::jsonb)
  );
END;
$function$;
