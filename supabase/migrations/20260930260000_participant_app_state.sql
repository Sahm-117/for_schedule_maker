-- Whether a participant has the app on their Home Screen and notifications on.
--
-- A browser tab can't see whether the same person installed the app (on iPhone
-- the Home Screen app keeps its own storage), so the app tells us each time it
-- opens. With that, a browser tab can say "you already have the app, open it from
-- your Home Screen" instead of showing the install steps again, the Get the app
-- sheet can back off after it has been dismissed a few times, and staff can see
-- who still hasn't installed.
--
-- The table is locked like the other participant tables: reachable only through
-- the functions below.

CREATE TABLE IF NOT EXISTS public."ParticipantAppState" (
  "participantId" UUID PRIMARY KEY REFERENCES public."Participant"(id) ON DELETE CASCADE,
  -- First time the app was opened from the Home Screen.
  "installedAt" TIMESTAMPTZ,
  "lastOpenedInstalledAt" TIMESTAMPTZ,
  -- ios | ios-inapp | android | desktop, from the most recent open.
  device TEXT,
  -- granted | denied | default | unsupported, from the most recent open.
  "notificationState" TEXT,
  -- The automatic Get the app sheet: how often shown, and how often put off.
  "sheetShown" INTEGER NOT NULL DEFAULT 0,
  "sheetDismissed" INTEGER NOT NULL DEFAULT 0,
  "lastSheetAt" TIMESTAMPTZ,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public."ParticipantAppState" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."ParticipantAppState" FROM anon, authenticated;

-- Called by the participant app each time it opens. Returns what the browser
-- can't know for itself.
CREATE OR REPLACE FUNCTION public.record_participant_app_state(
  p_token TEXT, p_installed BOOLEAN, p_device TEXT, p_notifications TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  person_id UUID := public.app_participant_id(p_token);
  state_row "ParticipantAppState"%ROWTYPE;
BEGIN
  IF person_id IS NULL THEN
    RAISE EXCEPTION 'SESSION_EXPIRED';
  END IF;

  INSERT INTO "ParticipantAppState" ("participantId", "installedAt", "lastOpenedInstalledAt", device, "notificationState")
  VALUES (
    person_id,
    CASE WHEN p_installed THEN NOW() END,
    CASE WHEN p_installed THEN NOW() END,
    CASE WHEN p_device IN ('ios', 'ios-inapp', 'android', 'desktop') THEN p_device END,
    CASE WHEN p_notifications IN ('granted', 'denied', 'default', 'unsupported') THEN p_notifications END
  )
  ON CONFLICT ("participantId") DO UPDATE SET
    "installedAt" = COALESCE("ParticipantAppState"."installedAt", EXCLUDED."installedAt"),
    "lastOpenedInstalledAt" = COALESCE(EXCLUDED."lastOpenedInstalledAt", "ParticipantAppState"."lastOpenedInstalledAt"),
    device = COALESCE(EXCLUDED.device, "ParticipantAppState".device),
    "notificationState" = COALESCE(EXCLUDED."notificationState", "ParticipantAppState"."notificationState"),
    "updatedAt" = NOW()
  RETURNING * INTO state_row;

  RETURN json_build_object(
    'installedBefore', state_row."installedAt" IS NOT NULL,
    'sheetDismissed', state_row."sheetDismissed"
  );
END;
$$;

-- 'shown' or 'dismissed' for the automatic Get the app sheet.
CREATE OR REPLACE FUNCTION public.record_participant_setup_sheet(p_token TEXT, p_action TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  person_id UUID := public.app_participant_id(p_token);
BEGIN
  IF person_id IS NULL THEN
    RAISE EXCEPTION 'SESSION_EXPIRED';
  END IF;
  IF p_action NOT IN ('shown', 'dismissed') THEN
    RAISE EXCEPTION 'Unknown action';
  END IF;

  INSERT INTO "ParticipantAppState" ("participantId", "sheetShown", "sheetDismissed", "lastSheetAt")
  VALUES (person_id, CASE WHEN p_action = 'shown' THEN 1 ELSE 0 END, CASE WHEN p_action = 'dismissed' THEN 1 ELSE 0 END, NOW())
  ON CONFLICT ("participantId") DO UPDATE SET
    "sheetShown" = "ParticipantAppState"."sheetShown" + CASE WHEN p_action = 'shown' THEN 1 ELSE 0 END,
    "sheetDismissed" = "ParticipantAppState"."sheetDismissed" + CASE WHEN p_action = 'dismissed' THEN 1 ELSE 0 END,
    "lastSheetAt" = NOW(),
    "updatedAt" = NOW();
END;
$$;

-- Staff: participants who have signed in (set a password) but have never opened
-- the app from their Home Screen. Same pattern as participants_without_push().
CREATE OR REPLACE FUNCTION public.participants_without_app()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT public.app_is_staff() THEN
    RAISE EXCEPTION 'You must be signed in as a support or admin';
  END IF;

  RETURN COALESCE((
    SELECT json_agg(a."participantId")
    FROM "ParticipantAccount" a
    WHERE a."isActive"
      AND a."passwordSetAt" IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM "ParticipantAppState" s
        WHERE s."participantId" = a."participantId" AND s."installedAt" IS NOT NULL
      )
  ), '[]'::json);
END;
$$;

REVOKE ALL ON FUNCTION public.record_participant_app_state(TEXT, BOOLEAN, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_participant_setup_sheet(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.participants_without_app() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_participant_app_state(TEXT, BOOLEAN, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_participant_setup_sheet(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.participants_without_app() TO anon, authenticated;
