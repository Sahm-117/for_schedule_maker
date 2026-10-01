-- "Sam (Admin)": when someone who holds more than one role makes a change while
-- acting as Admin, the record remembers it so the app can show "Sam (Admin)".
-- Acting as Support (or having only one role) leaves the plain name, and records
-- made before this stay as they are.
--
-- For each actor column (e.g. "updatedById") a sibling column ("updatedByActedAs")
-- holds 'ADMIN' or NULL. A trigger fills it from the session, so no client can
-- choose it.
--
-- Rollback: DROP TRIGGER acted_as_<col> on each table and DROP the "...ActedAs"
-- columns; DROP FUNCTION set_acted_as(), app_acted_as().

CREATE OR REPLACE FUNCTION public.app_acted_as()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT CASE WHEN cardinality(public.app_user_roles(u)) > 1
               AND public.app_effective_role(u, s."activeRole") = 'ADMIN' THEN 'ADMIN' END
  FROM "AppSession" s
  JOIN "User" u ON u.id = s."userId"
  WHERE s."tokenHash" = encode(digest(public.app_current_token(), 'sha256'), 'hex')
    AND s."expiresAt" > NOW()
    AND s."userId" IS NOT NULL
    AND u."isActive" IS NOT FALSE
  LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.set_acted_as()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  actor_col TEXT := TG_ARGV[0];
  acted_col TEXT := regexp_replace(TG_ARGV[0], 'Id$', '') || 'ActedAs';
  new_j JSONB := to_jsonb(NEW);
  actor TEXT := to_jsonb(NEW) ->> TG_ARGV[0];
  me UUID := public.app_current_user_id();
  mine BOOLEAN;
  val TEXT := NULL;
BEGIN
  mine := actor IS NOT NULL AND me IS NOT NULL AND actor = me::text;
  IF TG_OP = 'INSERT' OR actor IS DISTINCT FROM (to_jsonb(OLD) ->> actor_col) OR mine THEN
    IF mine THEN val := public.app_acted_as(); END IF;
    NEW := jsonb_populate_record(NEW, jsonb_build_object(acted_col, val));
  END IF;
  RETURN NEW;
END;
$function$;

DO $mig$
DECLARE
  pair TEXT[];
  pairs TEXT[][] := ARRAY[
    ['FaithProject','updatedById'],
    ['GroupOnboardingStatus','updatedById'],
    ['ParticipantOnboardingStatus','updatedById'],
    ['DepartmentReferral','loggedById'],
    ['DepartmentReferral','updatedById'],
    ['ParticipantStageChange','changedById'],
    ['FaithHelpRequest','resolvedById'],
    ['Testimony','reviewedById'],
    ['GroupPrayer','createdById'],
    ['GroupPrayerFocus','setById'],
    ['ParticipantFlag','raisedById'],
    ['ParticipantFlag','clearedById'],
    ['FollowUpContact','registeredById'],
    ['FollowUpLoginIssue','resolvedById'],
    ['ManualQuestion','repliedById'],
    ['CoverRequest','reviewedById'],
    ['PlannerChange','createdById'],
    ['Resource','updatedById'],
    ['HubLeadsMeeting','updatedById']
  ];
  acted TEXT;
BEGIN
  FOREACH pair SLICE 1 IN ARRAY pairs LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = pair[1] AND column_name = pair[2] AND data_type = 'uuid') THEN
      acted := regexp_replace(pair[2], 'Id$', '') || 'ActedAs';
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS %I TEXT', pair[1], acted);
      EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', 'acted_as_' || pair[2], pair[1]);
      EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_acted_as(%L)', 'acted_as_' || pair[2], pair[1], pair[2]);
      EXECUTE format('GRANT SELECT (%I) ON public.%I TO anon, authenticated', acted, pair[1]);
    ELSE
      RAISE NOTICE 'skipped %.%', pair[1], pair[2];
    END IF;
  END LOOP;
END
$mig$;
