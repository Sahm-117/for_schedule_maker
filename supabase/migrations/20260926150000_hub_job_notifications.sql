-- Hub job assignment notifications, following the exact mechanism used for
-- "You've been added to <hub>" in 20260925000000_hub_notify_and_ack.sql #4:
-- a DB trigger calling the existing invoke_hub_message_push (defined in
-- 20260924000000_support_hubs.sql #9), which writes the in-app feed row and
-- pushes in one call, routed to /support/my-hub.
--
-- Two triggers, mirroring the two different ways a job is assigned:
--   1. Hub Lead / Assistant Hub Lead / Recap Lead / Prayer Lead are plain
--      columns on SupportHub, set via AdminHubsPage's supportHubsApi.update()
--      (a normal PostgREST UPDATE). An AFTER UPDATE trigger fires on every
--      save; the function only notifies a column whose NEW value is not
--      null AND differs from OLD, so a re-save with the same value, or a
--      column being cleared (removal), never notifies anyone. Reassigning
--      the job to someone else notifies only the new holder, not the
--      previous one (they're being told they lost it, which is a different,
--      not-yet-requested notification).
--   2. IT Support is HubItSupport rows, set via supportHubsApi.setItSupports
--      which (like HubMembership's setMembers) only INSERTs genuinely new
--      rows, so an AFTER INSERT trigger — same shape as
--      notify_hub_membership_added — never re-fires on a re-save.
--
-- Not yet applied to the live database.

-- ── 1. SupportHub role columns → newly assigned lead/assistant/recap/prayer ──
CREATE OR REPLACE FUNCTION public.notify_hub_role_assigned()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NEW."leadUserId" IS NOT NULL AND NEW."leadUserId" IS DISTINCT FROM OLD."leadUserId" THEN
    PERFORM public.invoke_hub_message_push(
      ARRAY[NEW."leadUserId"],
      format('You''re now the Hub Lead for %s', NEW.name),
      'Tap to open My Hub'
    );
  END IF;

  IF NEW."assistantLeadUserId" IS NOT NULL AND NEW."assistantLeadUserId" IS DISTINCT FROM OLD."assistantLeadUserId" THEN
    PERFORM public.invoke_hub_message_push(
      ARRAY[NEW."assistantLeadUserId"],
      format('You''re now the Assistant Hub Lead for %s', NEW.name),
      'Tap to open My Hub'
    );
  END IF;

  IF NEW."recapLeadUserId" IS NOT NULL AND NEW."recapLeadUserId" IS DISTINCT FROM OLD."recapLeadUserId" THEN
    PERFORM public.invoke_hub_message_push(
      ARRAY[NEW."recapLeadUserId"],
      format('You''re now the Recap Lead for %s', NEW.name),
      'Tap to open My Hub'
    );
  END IF;

  IF NEW."prayerLeadUserId" IS NOT NULL AND NEW."prayerLeadUserId" IS DISTINCT FROM OLD."prayerLeadUserId" THEN
    PERFORM public.invoke_hub_message_push(
      ARRAY[NEW."prayerLeadUserId"],
      format('You''re now the Prayer Lead for %s', NEW.name),
      'Tap to open My Hub'
    );
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_hub_role_assigned ON public."SupportHub";
CREATE TRIGGER trg_hub_role_assigned
  AFTER UPDATE ON public."SupportHub"
  FOR EACH ROW
  WHEN (
    NEW."leadUserId" IS DISTINCT FROM OLD."leadUserId"
    OR NEW."assistantLeadUserId" IS DISTINCT FROM OLD."assistantLeadUserId"
    OR NEW."recapLeadUserId" IS DISTINCT FROM OLD."recapLeadUserId"
    OR NEW."prayerLeadUserId" IS DISTINCT FROM OLD."prayerLeadUserId"
  )
  EXECUTE FUNCTION public.notify_hub_role_assigned();

-- ── 2. HubItSupport → newly added IT support. Same shape as ─────────────────
-- notify_hub_membership_added (20260925000000 #4): fires only on INSERT, and
-- setItSupports only inserts genuinely new rows, so a re-save of an
-- unchanged list never notifies anyone.
CREATE OR REPLACE FUNCTION public.notify_hub_it_support_added()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_hub_name TEXT;
BEGIN
  SELECT name INTO v_hub_name FROM public."SupportHub" WHERE id = NEW."hubId";
  PERFORM public.invoke_hub_message_push(
    ARRAY[NEW."userId"],
    format('You''re now the IT Support for %s', COALESCE(v_hub_name, 'a hub')),
    'Tap to open My Hub'
  );
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_hub_it_support_added ON public."HubItSupport";
CREATE TRIGGER trg_hub_it_support_added
  AFTER INSERT ON public."HubItSupport"
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_hub_it_support_added();
