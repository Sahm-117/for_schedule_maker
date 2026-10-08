-- Venue map follow-up: anyone already ready (or completed) counts as having done the
-- map step, so they are never asked again and a retry of participant_confirm_ready
-- from them cannot be refused. Only the venueMapAcknowledged line changes.
-- Idempotent.

DO $mig$
DECLARE
  v_def TEXT := pg_get_functiondef('public.participant_onboarding_state(uuid)'::regprocedure);
BEGIN
  IF v_def LIKE '%v_map := v_ob."venueMapAckAt" IS NOT NULL;%' THEN
    v_def := replace(v_def,
      'v_map := v_ob."venueMapAckAt" IS NOT NULL;',
      'v_map := v_ob."venueMapAckAt" IS NOT NULL OR v_ob."readyConfirmedAt" IS NOT NULL OR v_ob."completedAt" IS NOT NULL;');
    EXECUTE v_def;
  END IF;
END
$mig$;
