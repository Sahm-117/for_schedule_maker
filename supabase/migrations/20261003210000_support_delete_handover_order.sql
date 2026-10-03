-- Unassign groups while the support still exists, so the existing handover
-- trigger can capture the departing support's name and valid reference.
-- Groups and participants are preserved by the subsequent user deletion.
CREATE OR REPLACE FUNCTION public.clear_support_group_assignments_before_user_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  UPDATE public."Group" SET "supportId" = NULL WHERE "supportId" = OLD.id;
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.clear_support_group_assignments_before_user_delete()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER user_clear_group_support_before_delete
  BEFORE DELETE ON public."User"
  FOR EACH ROW
  EXECUTE FUNCTION public.clear_support_group_assignments_before_user_delete();
