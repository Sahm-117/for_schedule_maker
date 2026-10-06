-- A support's kind (UserCohort.supportKind) now follows the hub roles, so the
-- builder and the Supports page never miss a hub lead or an operational support.
--
-- Before this, the kind was only set by hand on the Supports page: four of
-- Cohort 10's six hub leads were still "participant support", so the Hub lead
-- filter missed them and the group builder treated them as ordinary supports.
--
--   * Someone made the lead of a hub becomes HUB_LEAD for that hub's cohort.
--   * Someone made IT support (operational) for a hub becomes OPERATIONAL.
--   * Only ever moves a PARTICIPANT_SUPPORT up; a kind an admin chose by hand
--     (e.g. OPERATIONAL) is never overwritten.
--   * Taking the role away puts them back to PARTICIPANT_SUPPORT, but only if
--     they hold no other lead/IT seat in that cohort and still carry the kind
--     this rule gave them.
--
-- Backfill covers the current programme cohort only (practice cohorts keep
-- their own seeding, FLOW_MAP rule 14).
--
-- Rollback: DROP TRIGGER trg_hub_lead_support_kind ON "SupportHub";
-- DROP TRIGGER trg_hub_it_support_kind ON "HubItSupport";
-- DROP FUNCTION hub_lead_support_kind(), hub_it_support_kind().

CREATE OR REPLACE FUNCTION public.hub_lead_support_kind()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW."leadUserId" IS NOT NULL THEN
    UPDATE "UserCohort" SET "supportKind" = 'HUB_LEAD'
    WHERE "userId" = NEW."leadUserId" AND "cohortId" = NEW."cohortId" AND "supportKind" = 'PARTICIPANT_SUPPORT';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD."leadUserId" IS NOT NULL AND OLD."leadUserId" IS DISTINCT FROM NEW."leadUserId" THEN
    UPDATE "UserCohort" SET "supportKind" = 'PARTICIPANT_SUPPORT'
    WHERE "userId" = OLD."leadUserId" AND "cohortId" = OLD."cohortId" AND "supportKind" = 'HUB_LEAD'
      AND NOT EXISTS (SELECT 1 FROM "SupportHub" h WHERE h."cohortId" = OLD."cohortId" AND h."leadUserId" = OLD."leadUserId" AND h.id <> NEW.id);
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_hub_lead_support_kind ON public."SupportHub";
CREATE TRIGGER trg_hub_lead_support_kind
  AFTER INSERT OR UPDATE OF "leadUserId" ON public."SupportHub"
  FOR EACH ROW EXECUTE FUNCTION public.hub_lead_support_kind();

CREATE OR REPLACE FUNCTION public.hub_it_support_kind()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_hub "SupportHub";
  v_user UUID;
BEGIN
  v_user := COALESCE(NEW."userId", OLD."userId");
  SELECT * INTO v_hub FROM "SupportHub" WHERE id = COALESCE(NEW."hubId", OLD."hubId");
  IF v_hub.id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF TG_OP = 'INSERT' THEN
    UPDATE "UserCohort" SET "supportKind" = 'OPERATIONAL'
    WHERE "userId" = v_user AND "cohortId" = v_hub."cohortId" AND "supportKind" = 'PARTICIPANT_SUPPORT';
  ELSE
    UPDATE "UserCohort" SET "supportKind" = 'PARTICIPANT_SUPPORT'
    WHERE "userId" = v_user AND "cohortId" = v_hub."cohortId" AND "supportKind" = 'OPERATIONAL'
      AND NOT EXISTS (
        SELECT 1 FROM "HubItSupport" i JOIN "SupportHub" h ON h.id = i."hubId"
        WHERE i."userId" = v_user AND h."cohortId" = v_hub."cohortId" AND i.id <> OLD.id
      );
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$function$;

DROP TRIGGER IF EXISTS trg_hub_it_support_kind ON public."HubItSupport";
CREATE TRIGGER trg_hub_it_support_kind
  AFTER INSERT OR DELETE ON public."HubItSupport"
  FOR EACH ROW EXECUTE FUNCTION public.hub_it_support_kind();

-- Backfill: the current programme cohort.
UPDATE "UserCohort" uc SET "supportKind" = 'HUB_LEAD'
WHERE uc."supportKind" = 'PARTICIPANT_SUPPORT'
  AND uc."cohortId" = public.current_programme_cohort_id()
  AND EXISTS (SELECT 1 FROM "SupportHub" h WHERE h."cohortId" = uc."cohortId" AND h."leadUserId" = uc."userId");

UPDATE "UserCohort" uc SET "supportKind" = 'OPERATIONAL'
WHERE uc."supportKind" = 'PARTICIPANT_SUPPORT'
  AND uc."cohortId" = public.current_programme_cohort_id()
  AND EXISTS (SELECT 1 FROM "HubItSupport" i JOIN "SupportHub" h ON h.id = i."hubId" WHERE i."userId" = uc."userId" AND h."cohortId" = uc."cohortId");
