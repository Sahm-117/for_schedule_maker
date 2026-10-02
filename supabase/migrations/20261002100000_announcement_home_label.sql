-- The admin chooses the small heading shown above a pinned Home announcement
-- (it used to be a fixed "Urgent" / "From the FOF team").
ALTER TABLE "Announcement" ADD COLUMN IF NOT EXISTS "homeLabel" TEXT;

-- Return it from the participant Home payload. Patches the live definition so
-- the rest of the function is left exactly as it is.
DO $m$
DECLARE
  def TEXT := pg_get_functiondef('public.participant_home(text)'::regprocedure);
  patched TEXT;
BEGIN
  IF position('homeLabel' IN def) > 0 THEN RETURN; END IF;
  patched := replace(def, '''linkLabel'', a."linkLabel")', '''linkLabel'', a."linkLabel", ''homeLabel'', a."homeLabel")');
  IF patched = def THEN RAISE EXCEPTION 'participant_home announcement block not found'; END IF;
  EXECUTE patched;
END
$m$;
