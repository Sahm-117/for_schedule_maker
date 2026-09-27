-- "What I learned": from 12 noon on a pre-cohort training's day, each support
-- marked present (or late) answers two questions, at least one sentence each:
-- what they learned, and what they'll apply going forward. Stored on their own
-- attendance row; only they can write it, via this RPC. Idempotent.
ALTER TABLE public."SupportSessionAttendance"
  ADD COLUMN IF NOT EXISTS learned TEXT,
  ADD COLUMN IF NOT EXISTS "willApply" TEXT,
  ADD COLUMN IF NOT EXISTS "learnedAt" TIMESTAMPTZ;

DROP FUNCTION IF EXISTS public.submit_training_learned(uuid, text);

CREATE OR REPLACE FUNCTION public.submit_training_learned(p_session_id uuid, p_learned text, p_will_apply text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor_id UUID;
  v_learned TEXT;
  v_apply TEXT;
  v_result public."SupportSessionAttendance";
BEGIN
  IF NOT public.app_is_staff() THEN
    RAISE EXCEPTION 'You must be signed in as a support to do this';
  END IF;
  v_actor_id := public.app_current_user_id();
  v_learned := btrim(COALESCE(p_learned, ''));
  v_apply := btrim(COALESCE(p_will_apply, ''));
  -- One sentence minimum each: a few real words, not a single "ok".
  IF length(v_learned) < 15 OR array_length(regexp_split_to_array(v_learned, '\s+'), 1) < 4 THEN
    RAISE EXCEPTION 'Write at least one full sentence about what you learned';
  END IF;
  IF length(v_apply) < 15 OR array_length(regexp_split_to_array(v_apply, '\s+'), 1) < 4 THEN
    RAISE EXCEPTION 'Write at least one full sentence about what you will apply';
  END IF;

  UPDATE public."SupportSessionAttendance" a
     SET learned = v_learned, "willApply" = v_apply, "learnedAt" = NOW()
    FROM public."SupportSession" s
   WHERE a."sessionId" = p_session_id
     AND a."userId" = v_actor_id
     AND a.status IN ('PRESENT', 'LATE')
     AND s.id = a."sessionId"
     AND s.type = 'PRE_COHORT_TRAINING'
  RETURNING a.* INTO v_result;

  IF v_result.id IS NULL THEN
    RAISE EXCEPTION 'You can only share what you learned for a training you were marked present at';
  END IF;
  RETURN to_jsonb(v_result);
END;
$function$;

REVOKE ALL ON FUNCTION public.submit_training_learned(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_training_learned(uuid, text, text) TO authenticated;
