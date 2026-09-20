-- Groups are historical programme records. Archive them instead of deleting so
-- member, onboarding, attendance and label history remains intact.
ALTER TABLE public."Group"
  ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "archivedById" UUID REFERENCES public."User"(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_group_active_cohort
  ON public."Group"("cohortId", name)
  WHERE "archivedAt" IS NULL;

-- A support assigned to a group must be able to see that group’s cohort. This
-- is a database invariant rather than a frontend afterthought, so it covers
-- group creation, reassignment and any future admin entry point.
CREATE OR REPLACE FUNCTION public.ensure_group_support_cohort_membership()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW."supportId" IS NOT NULL THEN
    INSERT INTO public."UserCohort" ("userId", "cohortId")
    VALUES (NEW."supportId", NEW."cohortId")
    ON CONFLICT ("userId", "cohortId") DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ensure_group_support_cohort_membership ON public."Group";
CREATE TRIGGER ensure_group_support_cohort_membership
  AFTER INSERT OR UPDATE OF "supportId", "cohortId" ON public."Group"
  FOR EACH ROW EXECUTE FUNCTION public.ensure_group_support_cohort_membership();

-- Repair assignments created before the invariant existed, including Group 22.
INSERT INTO public."UserCohort" ("userId", "cohortId")
SELECT DISTINCT g."supportId", g."cohortId"
FROM public."Group" g
JOIN public."User" u ON u.id = g."supportId" AND u.role = 'SUPPORT'
WHERE g."supportId" IS NOT NULL
ON CONFLICT ("userId", "cohortId") DO NOTHING;
