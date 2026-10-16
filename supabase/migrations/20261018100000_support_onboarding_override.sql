-- A support's own onboarding steps (Introduce yourself, participants ready, meeting time and link) are
-- ticked by the app from what it can see; a support cannot tick them. An admin can mark a step done by
-- hand for a group, and undo it. The steps and the marks show on My Group and the support's Home.
--
-- 1. SupportOnboardingOverride: one row per (group, step) an admin marked done.
-- 2. admin_set_support_onboarding_override(group, step, done): admins only.
-- 3. onboarding_progress_json: each group gains "overrides" (the steps an admin marked). The rest of
--    the function is the live definition, unchanged.

CREATE TABLE IF NOT EXISTS public."SupportOnboardingOverride" (
  "groupId" UUID NOT NULL REFERENCES public."Group"(id) ON DELETE CASCADE,
  step TEXT NOT NULL CHECK (step IN ('INTRO', 'READY', 'MEETING')),
  "setById" UUID REFERENCES public."User"(id) ON DELETE SET NULL,
  "setAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY ("groupId", step)
);

-- Read and written only through the functions below.
ALTER TABLE public."SupportOnboardingOverride" ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.admin_set_support_onboarding_override(p_group_id UUID, p_step TEXT, p_done BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF NOT public.app_is_admin() THEN
    RAISE EXCEPTION 'Only admins can mark a support''s step done';
  END IF;
  IF p_step NOT IN ('INTRO', 'READY', 'MEETING') THEN
    RAISE EXCEPTION 'Unknown step %', p_step;
  END IF;
  IF p_done THEN
    INSERT INTO public."SupportOnboardingOverride" ("groupId", step, "setById")
    VALUES (p_group_id, p_step, public.app_current_user_id())
    ON CONFLICT ("groupId", step) DO UPDATE SET "setById" = EXCLUDED."setById", "setAt" = now();
  ELSE
    DELETE FROM public."SupportOnboardingOverride" WHERE "groupId" = p_group_id AND step = p_step;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_support_onboarding_override(UUID, TEXT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_support_onboarding_override(UUID, TEXT, BOOLEAN) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.onboarding_progress_json(p_cohort_id uuid, p_group_id uuid)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT json_build_object(
    'groups', COALESCE((
      SELECT json_agg(json_build_object(
        'groupId', g.id, 'groupName', g.name, 'supportId', g."supportId", 'supportName', u.name,
        'supportIntroPosted', EXISTS (
          SELECT 1 FROM public."GroupPost" gp
          WHERE gp."groupId" = g.id AND gp.kind = 'INTRO' AND gp."authorUserId" = g."supportId"
            AND gp."deletedAt" IS NULL AND gp."removedAt" IS NULL),
        'overrides', COALESCE((
          SELECT json_agg(o.step ORDER BY o.step)
          FROM public."SupportOnboardingOverride" o WHERE o."groupId" = g.id
        ), '[]'::json)
      ) ORDER BY g.name)
      FROM public."Group" g
      LEFT JOIN public."User" u ON u.id = g."supportId"
      WHERE g."cohortId" = p_cohort_id AND g."archivedAt" IS NULL
        AND (p_group_id IS NULL OR g.id = p_group_id)
    ), '[]'::json),
    'participants', COALESCE((
      SELECT json_agg((
        jsonb_build_object(
          'participantId', x.id, 'name', x."fullName", 'avatarUrl', x."avatarUrl",
          'groupId', x."groupId", 'groupName', x."groupName")
        || public.participant_onboarding_state(x.id)
      ) ORDER BY x."groupName" NULLS LAST, x."fullName")
      FROM (
        SELECT p.id, p."fullName", p."avatarUrl", g.id AS "groupId", g.name AS "groupName"
        FROM public."Participant" p
        LEFT JOIN public."Group" g ON g.id = public.discussion_participant_group(p.id)
        WHERE p."cohortId" = p_cohort_id AND p.status = 'ACTIVE'
          AND (p_group_id IS NULL OR g.id = p_group_id)
      ) x
    ), '[]'::json)
  );
$function$;
