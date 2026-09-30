-- Whether a support or admin has the app on their Home Screen, same idea as
-- ParticipantAppState (20260930260000). The app reports it each time it opens, so a
-- browser tab can say "you already have the app", the launch sheet can back off
-- after it has been put off a few times, and an admin can see who hasn't installed.
--
-- Staff sign in with a session header, so these functions read the signed-in user
-- from it (app_current_user_id) instead of taking a token.

CREATE TABLE IF NOT EXISTS public."UserAppState" (
  "userId" UUID PRIMARY KEY REFERENCES public."User"(id) ON DELETE CASCADE,
  "installedAt" TIMESTAMPTZ,
  "lastOpenedInstalledAt" TIMESTAMPTZ,
  device TEXT,
  "notificationState" TEXT,
  "sheetShown" INTEGER NOT NULL DEFAULT 0,
  "sheetDismissed" INTEGER NOT NULL DEFAULT 0,
  "lastSheetAt" TIMESTAMPTZ,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public."UserAppState" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."UserAppState" FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.record_user_app_state(p_installed BOOLEAN, p_device TEXT, p_notifications TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  me UUID := public.app_current_user_id();
  state_row "UserAppState"%ROWTYPE;
BEGIN
  IF me IS NULL OR NOT public.app_is_staff() THEN
    RAISE EXCEPTION 'You must be signed in as a support or admin';
  END IF;

  INSERT INTO "UserAppState" ("userId", "installedAt", "lastOpenedInstalledAt", device, "notificationState")
  VALUES (
    me,
    CASE WHEN p_installed THEN NOW() END,
    CASE WHEN p_installed THEN NOW() END,
    CASE WHEN p_device IN ('ios', 'ios-inapp', 'android', 'desktop') THEN p_device END,
    CASE WHEN p_notifications IN ('granted', 'denied', 'default', 'unsupported') THEN p_notifications END
  )
  ON CONFLICT ("userId") DO UPDATE SET
    "installedAt" = COALESCE("UserAppState"."installedAt", EXCLUDED."installedAt"),
    "lastOpenedInstalledAt" = COALESCE(EXCLUDED."lastOpenedInstalledAt", "UserAppState"."lastOpenedInstalledAt"),
    device = COALESCE(EXCLUDED.device, "UserAppState".device),
    "notificationState" = COALESCE(EXCLUDED."notificationState", "UserAppState"."notificationState"),
    "updatedAt" = NOW()
  RETURNING * INTO state_row;

  RETURN json_build_object(
    'installedBefore', state_row."installedAt" IS NOT NULL,
    'sheetDismissed', state_row."sheetDismissed"
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.record_user_setup_sheet(p_action TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  me UUID := public.app_current_user_id();
BEGIN
  IF me IS NULL OR NOT public.app_is_staff() THEN
    RAISE EXCEPTION 'You must be signed in as a support or admin';
  END IF;
  IF p_action NOT IN ('shown', 'dismissed') THEN
    RAISE EXCEPTION 'Unknown action';
  END IF;

  INSERT INTO "UserAppState" ("userId", "sheetShown", "sheetDismissed", "lastSheetAt")
  VALUES (me, CASE WHEN p_action = 'shown' THEN 1 ELSE 0 END, CASE WHEN p_action = 'dismissed' THEN 1 ELSE 0 END, NOW())
  ON CONFLICT ("userId") DO UPDATE SET
    "sheetShown" = "UserAppState"."sheetShown" + CASE WHEN p_action = 'shown' THEN 1 ELSE 0 END,
    "sheetDismissed" = "UserAppState"."sheetDismissed" + CASE WHEN p_action = 'dismissed' THEN 1 ELSE 0 END,
    "lastSheetAt" = NOW(),
    "updatedAt" = NOW();
END;
$$;

-- Admin: active supports and admins who have never opened the app from their Home Screen.
CREATE OR REPLACE FUNCTION public.users_without_app()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT public.app_is_admin() THEN
    RAISE EXCEPTION 'You must be signed in as an admin';
  END IF;

  RETURN COALESCE((
    SELECT json_agg(u.id)
    FROM "User" u
    WHERE u."isActive" IS NOT FALSE
      AND u.role IN ('SUPPORT', 'ADMIN', 'SOP_PREPARER')
      AND NOT EXISTS (
        SELECT 1 FROM "UserAppState" s WHERE s."userId" = u.id AND s."installedAt" IS NOT NULL
      )
  ), '[]'::json);
END;
$$;

REVOKE ALL ON FUNCTION public.record_user_app_state(BOOLEAN, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_user_setup_sheet(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.users_without_app() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_user_app_state(BOOLEAN, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_user_setup_sheet(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.users_without_app() TO anon, authenticated;
