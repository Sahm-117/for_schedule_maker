-- Switching the seat you play ("Play as") starts that seat's steps fresh: the role-specific and
-- walkthrough steps are cleared, and only work done from then on is ticked automatically.
-- The shared support steps (introduce yourself, attendance...) stay. Before, steps ticked in an
-- earlier session (or by another seat) were still ticked when you came back to a seat.
-- Rollback: restore practice_set_my_role from 20261001190000.
CREATE OR REPLACE FUNCTION public.practice_set_my_role(p_role text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_me UUID := public.app_current_user_id();
  v_old TEXT;
BEGIN
  IF v_me IS NULL OR NOT EXISTS (SELECT 1 FROM public."PracticeMember" WHERE "userId" = v_me) THEN
    RAISE EXCEPTION 'You are not in Practice';
  END IF;
  SELECT role INTO v_old FROM public."PracticeMember" WHERE "userId" = v_me;
  IF v_old IS DISTINCT FROM p_role THEN
    DELETE FROM public."PracticeProgress" WHERE "userId" = v_me AND "scenarioKey" NOT LIKE 'sup-%';
    UPDATE public."PracticeMember" SET "resetAt" = NOW() WHERE "userId" = v_me;
  END IF;
  PERFORM public.practice_place(v_me, p_role, NULL);
END;
$function$;
