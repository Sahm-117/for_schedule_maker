-- Follow-up to 20260926160000_testimony_feedback_fixes.sql: that migration
-- left delete_testimony PENDING-only ("matching the UI's Delete button" at
-- the time). Olamide wants participants able to delete ANY of their own
-- testimonies -- including a "Just my support" one (born APPROVED) and an
-- approved group/cohort one -- not just PENDING drafts.
--
-- delete_testimony now drops the status restriction entirely: the ownership
-- check (participantId = app_participant_id(token)) is unchanged, so a
-- participant can still only ever delete their own testimony, in any status
-- (PENDING, APPROVED or HIDDEN).
--
-- Additive and idempotent. Not yet applied to the live database.

CREATE OR REPLACE FUNCTION public.delete_testimony(p_token TEXT, p_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  person_id UUID := public.app_participant_id(p_token);
BEGIN
  IF person_id IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;

  DELETE FROM "Testimony" WHERE id = p_id AND "participantId" = person_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_testimony(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_testimony(TEXT, UUID) TO anon, authenticated;
