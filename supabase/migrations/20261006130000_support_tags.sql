-- Support tags: admins make any tag ("Teen support", "Men only", ...) and put
-- supports on it. The group builder then decides, per tag, which groups it is
-- for (see frontend/src/utils/groupingEngine.ts). Nothing here changes who a
-- support is; a tag is only a label the builder can read.
--
-- Tables are born locked (FLOW_MAP rule 11): staff can read, every write goes
-- through a SECURITY DEFINER RPC that resolves the admin from p_token.
--
--   support_tag_save(p_token, p_id, p_name)          create (p_id NULL) or rename
--   support_tag_delete(p_token, p_id)                removes the tag and its memberships
--   support_tag_set_members(p_token, p_tag_id, ids)  replaces a tag's supports
--   support_set_tags(p_token, p_user_id, tag_ids)    replaces one support's tags
--
-- Only supports (role SUPPORT, or an admin carrying the Support tag, FLOW_MAP
-- rule 16) can be put on a tag.
--
-- Rollback: DROP FUNCTION support_tag_save, support_tag_delete,
-- support_tag_set_members, support_set_tags; DROP TABLE "SupportTagMember",
-- "SupportTag".

CREATE TABLE IF NOT EXISTS public."SupportTag" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (btrim(name) <> '' AND char_length(name) <= 40),
  "createdById" UUID REFERENCES public."User"(id) ON DELETE SET NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS "SupportTag_name_lower_idx" ON public."SupportTag" (lower(btrim(name)));

CREATE TABLE IF NOT EXISTS public."SupportTagMember" (
  "tagId" UUID NOT NULL REFERENCES public."SupportTag"(id) ON DELETE CASCADE,
  "userId" UUID NOT NULL REFERENCES public."User"(id) ON DELETE CASCADE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("tagId", "userId")
);
CREATE INDEX IF NOT EXISTS "SupportTagMember_user_idx" ON public."SupportTagMember" ("userId");

ALTER TABLE public."SupportTag" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."SupportTagMember" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff can read support tags" ON public."SupportTag";
CREATE POLICY "Staff can read support tags" ON public."SupportTag" FOR SELECT USING (public.app_is_staff());
DROP POLICY IF EXISTS "Staff can read support tag members" ON public."SupportTagMember";
CREATE POLICY "Staff can read support tag members" ON public."SupportTagMember" FOR SELECT USING (public.app_is_staff());
GRANT SELECT ON public."SupportTag", public."SupportTagMember" TO anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public."SupportTag", public."SupportTagMember" FROM anon, authenticated;

-- ── Create / rename ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.support_tag_save(p_token TEXT, p_id UUID, p_name TEXT)
RETURNS public."SupportTag"
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  actor "User" := public.app_staff(p_token);
  v_name TEXT := btrim(COALESCE(p_name, ''));
  saved "SupportTag";
BEGIN
  IF actor.id IS NULL OR actor.role <> 'ADMIN'::"Role" THEN
    RAISE EXCEPTION 'NOT_AUTHORISED';
  END IF;
  IF v_name = '' THEN
    RAISE EXCEPTION 'Give the tag a name';
  END IF;
  IF char_length(v_name) > 40 THEN
    RAISE EXCEPTION 'Keep the tag name under 40 characters';
  END IF;
  IF EXISTS (SELECT 1 FROM "SupportTag" WHERE lower(btrim(name)) = lower(v_name) AND id IS DISTINCT FROM p_id) THEN
    RAISE EXCEPTION 'A tag with that name already exists';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO "SupportTag" (name, "createdById") VALUES (v_name, actor.id) RETURNING * INTO saved;
  ELSE
    UPDATE "SupportTag" SET name = v_name WHERE id = p_id RETURNING * INTO saved;
    IF saved.id IS NULL THEN
      RAISE EXCEPTION 'That tag was not found';
    END IF;
  END IF;
  RETURN saved;
END;
$function$;

-- ── Delete ───────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.support_tag_delete(p_token TEXT, p_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  actor "User" := public.app_staff(p_token);
BEGIN
  IF actor.id IS NULL OR actor.role <> 'ADMIN'::"Role" THEN
    RAISE EXCEPTION 'NOT_AUTHORISED';
  END IF;
  DELETE FROM "SupportTag" WHERE id = p_id;
END;
$function$;

-- ── A tag's supports ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.support_tag_set_members(p_token TEXT, p_tag_id UUID, p_user_ids UUID[])
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  actor "User" := public.app_staff(p_token);
  v_ids UUID[] := COALESCE(p_user_ids, '{}');
BEGIN
  IF actor.id IS NULL OR actor.role <> 'ADMIN'::"Role" THEN
    RAISE EXCEPTION 'NOT_AUTHORISED';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "SupportTag" WHERE id = p_tag_id) THEN
    RAISE EXCEPTION 'That tag was not found';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(v_ids) x
    WHERE NOT EXISTS (
      SELECT 1 FROM "User" u
      WHERE u.id = x AND (u.role = 'SUPPORT' OR 'SUPPORT'::"Role" = ANY(u.roles))
    )
  ) THEN
    RAISE EXCEPTION 'Only supports can be put on a tag';
  END IF;

  DELETE FROM "SupportTagMember" WHERE "tagId" = p_tag_id AND "userId" <> ALL (v_ids);
  INSERT INTO "SupportTagMember" ("tagId", "userId")
  SELECT p_tag_id, x FROM unnest(v_ids) x
  ON CONFLICT DO NOTHING;
END;
$function$;

-- ── One support's tags ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.support_set_tags(p_token TEXT, p_user_id UUID, p_tag_ids UUID[])
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  actor "User" := public.app_staff(p_token);
  v_ids UUID[] := COALESCE(p_tag_ids, '{}');
BEGIN
  IF actor.id IS NULL OR actor.role <> 'ADMIN'::"Role" THEN
    RAISE EXCEPTION 'NOT_AUTHORISED';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "User" u WHERE u.id = p_user_id AND (u.role = 'SUPPORT' OR 'SUPPORT'::"Role" = ANY(u.roles))
  ) THEN
    RAISE EXCEPTION 'Only supports can be put on a tag';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_ids) x WHERE NOT EXISTS (SELECT 1 FROM "SupportTag" t WHERE t.id = x)) THEN
    RAISE EXCEPTION 'One of those tags was not found';
  END IF;

  DELETE FROM "SupportTagMember" WHERE "userId" = p_user_id AND "tagId" <> ALL (v_ids);
  INSERT INTO "SupportTagMember" ("tagId", "userId")
  SELECT x, p_user_id FROM unnest(v_ids) x
  ON CONFLICT DO NOTHING;
END;
$function$;

REVOKE ALL ON FUNCTION public.support_tag_save(TEXT, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.support_tag_delete(TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.support_tag_set_members(TEXT, UUID, UUID[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.support_set_tags(TEXT, UUID, UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.support_tag_save(TEXT, UUID, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.support_tag_delete(TEXT, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.support_tag_set_members(TEXT, UUID, UUID[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.support_set_tags(TEXT, UUID, UUID[]) TO anon, authenticated;
