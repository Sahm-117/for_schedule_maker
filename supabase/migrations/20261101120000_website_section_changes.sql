-- When each part of the public website was last changed, and by whom (admin review, Website 2).
-- The website words are one JSON row in AppSetting ("landing_content", one key per section: hero, about,
-- curriculum, howItWorks, journey, faq, footer) and the photos another ("landing_images"). The editor saves them
-- with a plain upsert, so a trigger notices which sections actually changed and records the time and the signed-in
-- person (app_current_user_id, from the session header) in a small locked table, one row per section.
--   * "photos" is the landing_images row. A save that leaves a section's value the same records nothing for it.
--   * Nothing is back-filled: a section shows "Changed ..." only after its next change.
--   * WebsiteSectionChange is locked (RLS on, no grants); admins read it only through website_section_changes().
--
-- Rollback: DROP TRIGGER website_section_changes_trg ON public."AppSetting";
--   DROP FUNCTION public.website_section_changes_trg(); DROP FUNCTION public.website_section_changes();
--   DROP TABLE public."WebsiteSectionChange";

CREATE TABLE IF NOT EXISTS public."WebsiteSectionChange" (
  section TEXT PRIMARY KEY,
  "changedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "changedById" UUID REFERENCES public."User"(id) ON DELETE SET NULL
);
ALTER TABLE public."WebsiteSectionChange" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."WebsiteSectionChange" FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.website_section_changes_trg()
 RETURNS TRIGGER
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_old JSONB := '{}'::jsonb;
  v_new JSONB := NEW.value;
  v_sections TEXT[] := '{}';
  v_who UUID := public.app_current_user_id();
BEGIN
  IF TG_OP = 'UPDATE' AND jsonb_typeof(OLD.value) = 'object' THEN v_old := OLD.value; END IF;

  IF NEW."settingKey" = 'landing_images' THEN
    IF TG_OP = 'INSERT' OR v_new IS DISTINCT FROM OLD.value THEN v_sections := ARRAY['photos']; END IF;
  ELSIF NEW."settingKey" = 'landing_content' AND jsonb_typeof(v_new) = 'object' THEN
    -- Sections whose value differs from before, plus any that were removed.
    SELECT COALESCE(array_agg(DISTINCT k), '{}') INTO v_sections
    FROM (
      SELECT n.k FROM jsonb_object_keys(v_new) AS n(k) WHERE v_new -> n.k IS DISTINCT FROM v_old -> n.k
      UNION ALL
      SELECT o.k FROM jsonb_object_keys(v_old) AS o(k) WHERE NOT v_new ? o.k
    ) changed(k);
  END IF;

  IF array_length(v_sections, 1) IS NOT NULL THEN
    INSERT INTO public."WebsiteSectionChange" (section, "changedAt", "changedById")
    SELECT s, NOW(), v_who FROM unnest(v_sections) AS s
    ON CONFLICT (section) DO UPDATE SET "changedAt" = EXCLUDED."changedAt", "changedById" = EXCLUDED."changedById";
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.website_section_changes_trg() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS website_section_changes_trg ON public."AppSetting";
CREATE TRIGGER website_section_changes_trg
  AFTER INSERT OR UPDATE ON public."AppSetting"
  FOR EACH ROW
  WHEN (NEW."settingKey" IN ('landing_content', 'landing_images'))
  EXECUTE FUNCTION public.website_section_changes_trg();

-- { "<section>": { "at": <time>, "by": "<name>" } } for the admin Website page.
CREATE OR REPLACE FUNCTION public.website_section_changes()
 RETURNS JSONB
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT CASE WHEN (SELECT public.app_is_admin()) THEN COALESCE((
    SELECT jsonb_object_agg(c.section, jsonb_build_object('at', c."changedAt", 'by', u.name))
    FROM public."WebsiteSectionChange" c
    LEFT JOIN public."User" u ON u.id = c."changedById"
  ), '{}'::jsonb) END;
$function$;

REVOKE ALL ON FUNCTION public.website_section_changes() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.website_section_changes() TO anon, authenticated;
