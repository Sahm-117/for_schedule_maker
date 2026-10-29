-- Church app access, managed from the admin app (Settings → Church app access).
--
-- Full admins (role ADMIN; not Team members) can issue a key for a church app, choose its scopes, switch it off or
-- back on, and see its recent requests. The key itself is shown once, at creation, and only its hash is stored
-- (ApiClient, 20261029120000_public_api_foundation.sql). Who created each key is kept in ApiClient."createdById".
--
-- Rollback: DROP FUNCTION api_admin_clients, api_admin_create_client, api_admin_update_client,
-- api_admin_client_activity, api_admin_check; ALTER TABLE "ApiClient" DROP COLUMN "createdById".

ALTER TABLE public."ApiClient" ADD COLUMN IF NOT EXISTS "createdById" UUID REFERENCES public."User"(id) ON DELETE SET NULL;

-- The signed-in full admin, or an error. Team members are refused: keys reach every part of the API.
CREATE OR REPLACE FUNCTION public.api_admin_check(p_token TEXT)
 RETURNS public."User"
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  u "User" := public.app_staff_real(p_token);
BEGIN
  IF u.id IS NULL THEN
    RAISE EXCEPTION 'SESSION_EXPIRED';
  END IF;
  IF u.role <> 'ADMIN'::"Role" THEN
    RAISE EXCEPTION 'NOT_ALLOWED';
  END IF;
  RETURN u;
END;
$function$;

-- Every app with a key, newest first, with how much it has been used.
CREATE OR REPLACE FUNCTION public.api_admin_clients(p_token TEXT)
 RETURNS JSONB
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  PERFORM public.api_admin_check(p_token);
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
        'id', c.id, 'name', c.name, 'keyPrefix', c."keyPrefix", 'scopes', to_jsonb(c.scopes), 'notes', c.notes,
        'isActive', c."isActive" AND c."revokedAt" IS NULL, 'createdAt', c."createdAt", 'lastUsedAt', c."lastUsedAt",
        'createdBy', (SELECT u.name FROM "User" u WHERE u.id = c."createdById"),
        'requests7d', (SELECT count(*) FROM "ApiRequestLog" l WHERE l."clientId" = c.id AND l."createdAt" > NOW() - INTERVAL '7 days'),
        'refused7d', (SELECT count(*) FROM "ApiRequestLog" l WHERE l."clientId" = c.id AND l."createdAt" > NOW() - INTERVAL '7 days' AND l.status >= 400),
        'teenRecords30d', (SELECT COALESCE(sum(l."teenRecords"), 0) FROM "ApiRequestLog" l WHERE l."clientId" = c.id AND l."createdAt" > NOW() - INTERVAL '30 days')
      ) ORDER BY c."createdAt" DESC)
    FROM "ApiClient" c), '[]'::JSONB);
END;
$function$;

-- Issue a key. Returns the key once, with the new app's id and scopes.
CREATE OR REPLACE FUNCTION public.api_admin_create_client(p_token TEXT, p_name TEXT, p_scopes TEXT[], p_notes TEXT DEFAULT NULL)
 RETURNS JSONB
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  admin "User" := public.api_admin_check(p_token);
  created JSONB;
BEGIN
  IF length(trim(COALESCE(p_name, ''))) > 80 THEN
    RAISE EXCEPTION 'Keep the name under 80 characters';
  END IF;
  created := public.api_create_client(p_name, p_scopes, NULLIF(left(trim(COALESCE(p_notes, '')), 500), ''));
  UPDATE "ApiClient" SET "createdById" = admin.id WHERE id = (created->>'id')::UUID;
  RETURN created;
END;
$function$;

-- Rename, change scopes, or switch an app off or back on. NULL leaves that part as it is.
CREATE OR REPLACE FUNCTION public.api_admin_update_client(p_token TEXT, p_id UUID, p_active BOOLEAN DEFAULT NULL,
  p_scopes TEXT[] DEFAULT NULL, p_name TEXT DEFAULT NULL, p_notes TEXT DEFAULT NULL)
 RETURNS VOID
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  allowed CONSTANT TEXT[] := ARRAY['people:lookup', 'people:read', 'teens:read', 'faith:read', 'team:read',
    'groups:read', 'schedule:read', 'planner:read', 'content:read', 'birthdays:read', 'cohorts:read'];
BEGIN
  PERFORM public.api_admin_check(p_token);
  IF NOT EXISTS (SELECT 1 FROM "ApiClient" WHERE id = p_id) THEN
    RAISE EXCEPTION 'That app no longer exists';
  END IF;
  IF p_scopes IS NOT NULL AND (cardinality(p_scopes) = 0 OR NOT (p_scopes <@ allowed)) THEN
    RAISE EXCEPTION 'Choose at least one thing the app may read';
  END IF;
  IF p_name IS NOT NULL AND (trim(p_name) = '' OR length(trim(p_name)) > 80) THEN
    RAISE EXCEPTION 'Give the app a name under 80 characters';
  END IF;
  UPDATE "ApiClient" SET
    "isActive" = COALESCE(p_active, "isActive"),
    "revokedAt" = CASE WHEN p_active IS NULL THEN "revokedAt" WHEN p_active THEN NULL ELSE COALESCE("revokedAt", NOW()) END,
    scopes = COALESCE(p_scopes, scopes),
    name = COALESCE(NULLIF(trim(p_name), ''), name),
    notes = CASE WHEN p_notes IS NULL THEN notes ELSE NULLIF(left(trim(p_notes), 500), '') END
  WHERE id = p_id;
END;
$function$;

-- One app's most recent requests: address (ids hidden), result, teen records shown, when.
CREATE OR REPLACE FUNCTION public.api_admin_client_activity(p_token TEXT, p_id UUID, p_limit INTEGER DEFAULT 50)
 RETURNS JSONB
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  PERFORM public.api_admin_check(p_token);
  RETURN COALESCE((
    SELECT jsonb_agg(x ORDER BY (x->>'at') DESC) FROM (
      SELECT jsonb_build_object('path', l.path, 'status', l.status, 'teenRecords', l."teenRecords",
        'durationMs', l."durationMs", 'at', l."createdAt") AS x
      FROM "ApiRequestLog" l WHERE l."clientId" = p_id
      ORDER BY l."createdAt" DESC
      LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200)
    ) s), '[]'::JSONB);
END;
$function$;

REVOKE ALL ON FUNCTION public.api_admin_check(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.api_admin_clients(TEXT), public.api_admin_create_client(TEXT, TEXT, TEXT[], TEXT),
  public.api_admin_update_client(TEXT, UUID, BOOLEAN, TEXT[], TEXT, TEXT), public.api_admin_client_activity(TEXT, UUID, INTEGER) FROM PUBLIC;
-- Called from the app with the admin's session token, like the app's other admin functions.
GRANT EXECUTE ON FUNCTION public.api_admin_clients(TEXT), public.api_admin_create_client(TEXT, TEXT, TEXT[], TEXT),
  public.api_admin_update_client(TEXT, UUID, BOOLEAN, TEXT[], TEXT, TEXT), public.api_admin_client_activity(TEXT, UUID, INTEGER) TO anon, authenticated;
