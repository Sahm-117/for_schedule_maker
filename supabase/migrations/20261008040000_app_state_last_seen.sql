-- "Last seen" for the participant phone line used to be ParticipantAppState."updatedAt", but admin
-- "Reset first-time experience" and the practice reset also bump that, so a reset made someone
-- look seen today. This adds a column that only the signed-in app itself sets (every time it runs
-- and reports its state), and participants_app_details() now reads that. Existing rows start from
-- their updatedAt, the best guess available. The details are also limited to participants of an
-- ACTIVE cohort, so the list no longer grows with every past cohort.
ALTER TABLE "ParticipantAppState" ADD COLUMN IF NOT EXISTS "lastSeenAt" timestamptz;
UPDATE "ParticipantAppState" SET "lastSeenAt" = "updatedAt" WHERE "lastSeenAt" IS NULL;

CREATE OR REPLACE FUNCTION public.record_participant_app_state(p_token text, p_installed boolean, p_device text, p_notifications text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  person_id UUID := public.app_participant_id(p_token);
  state_row "ParticipantAppState"%ROWTYPE;
BEGIN
  IF person_id IS NULL THEN
    RAISE EXCEPTION 'SESSION_EXPIRED';
  END IF;

  INSERT INTO "ParticipantAppState" ("participantId", "installedAt", "lastOpenedInstalledAt", "lastSeenAt", device, "notificationState")
  VALUES (
    person_id,
    CASE WHEN p_installed THEN NOW() END,
    CASE WHEN p_installed THEN NOW() END,
    NOW(),
    CASE WHEN p_device IN ('ios', 'ios-inapp', 'android', 'desktop') THEN p_device END,
    CASE WHEN p_notifications IN ('granted', 'denied', 'default', 'unsupported') THEN p_notifications END
  )
  ON CONFLICT ("participantId") DO UPDATE SET
    "installedAt" = COALESCE("ParticipantAppState"."installedAt", EXCLUDED."installedAt"),
    "lastOpenedInstalledAt" = COALESCE(EXCLUDED."lastOpenedInstalledAt", "ParticipantAppState"."lastOpenedInstalledAt"),
    "lastSeenAt" = NOW(),
    device = COALESCE(EXCLUDED.device, "ParticipantAppState".device),
    "notificationState" = COALESCE(EXCLUDED."notificationState", "ParticipantAppState"."notificationState"),
    "updatedAt" = NOW()
  RETURNING * INTO state_row;

  RETURN json_build_object(
    'installedBefore', state_row."installedAt" IS NOT NULL,
    'sheetDismissed', state_row."sheetDismissed"
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.participants_app_details()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NOT public.app_is_staff() THEN
    RAISE EXCEPTION 'You must be signed in as a support or admin';
  END IF;

  RETURN COALESCE((
    SELECT json_agg(json_build_object(
      'participantId', s."participantId",
      'device', s.device,
      'installedAt', s."installedAt",
      'lastOpenedInstalledAt', s."lastOpenedInstalledAt",
      'lastSeenAt', s."lastSeenAt"
    ))
    FROM "ParticipantAppState" s
    JOIN "Participant" p ON p.id = s."participantId"
    JOIN "Cohort" c ON c.id = p."cohortId"
    WHERE c.status = 'ACTIVE'
  ), '[]'::json);
END;
$function$;
