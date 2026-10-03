-- Track when a support opens the install-video message, and tell them once when
-- a participant has both opened the installed app and saved a push subscription.
-- Sending a video never marks setup complete. Existing completed setups are
-- seeded silently, so deploying this does not notify everyone about old installs.

CREATE TABLE public."AppNudgeSend" (
  "ownerId" UUID NOT NULL REFERENCES public."User"(id) ON DELETE CASCADE,
  "participantId" UUID NOT NULL REFERENCES public."Participant"(id) ON DELETE CASCADE,
  "sentAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("ownerId", "participantId")
);
ALTER TABLE public."AppNudgeSend" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."AppNudgeSend" FROM anon, authenticated;

CREATE TABLE public."ParticipantAppSetupCompletion" (
  "participantId" UUID PRIMARY KEY REFERENCES public."Participant"(id) ON DELETE CASCADE,
  "ownerId" UUID REFERENCES public."User"(id) ON DELETE SET NULL,
  "completedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public."ParticipantAppSetupCompletion" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."ParticipantAppSetupCompletion" FROM anon, authenticated;

INSERT INTO public."ParticipantAppSetupCompletion" ("participantId")
SELECT s."participantId" FROM public."ParticipantAppState" s
WHERE s."installedAt" IS NOT NULL
  AND EXISTS (SELECT 1 FROM public."ParticipantPushSubscription" ps WHERE ps."participantId" = s."participantId")
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.my_app_nudge(p_token TEXT)
RETURNS JSON
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  staff "User" := public.app_staff(p_token);
BEGIN
  IF staff.id IS NULL THEN RETURN '[]'::JSON; END IF;
  RETURN COALESCE((
    SELECT json_agg(json_build_object(
      'participantId', n.participant_id, 'name', n.full_name, 'phone', n.phone,
      'reason', n.reason, 'sentAt', s."sentAt"
    ) ORDER BY (s."sentAt" IS NOT NULL), n.full_name)
    FROM public.app_nudge_people() n
    LEFT JOIN public."AppNudgeSend" s ON s."participantId" = n.participant_id AND s."ownerId" = n.owner_id
    WHERE n.owner_id = staff.id
  ), '[]'::JSON);
END;
$$;
REVOKE ALL ON FUNCTION public.my_app_nudge(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_app_nudge(TEXT) TO anon, authenticated;

CREATE FUNCTION public.mark_app_nudge_sent(p_token TEXT, p_participant_id UUID)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  staff "User" := public.app_staff(p_token);
  stamp TIMESTAMPTZ;
BEGIN
  IF staff.id IS NULL OR staff.role IS DISTINCT FROM 'SUPPORT' THEN RAISE EXCEPTION 'NOT_AUTHORISED'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.app_nudge_people() n WHERE n.participant_id = p_participant_id AND n.owner_id = staff.id
  ) THEN RAISE EXCEPTION 'This participant no longer needs an app reminder from you.'; END IF;

  INSERT INTO public."AppNudgeSend" ("ownerId", "participantId", "sentAt")
  VALUES (staff.id, p_participant_id, clock_timestamp())
  ON CONFLICT ("ownerId", "participantId") DO UPDATE SET "sentAt" = EXCLUDED."sentAt"
  RETURNING "sentAt" INTO stamp;
  RETURN stamp;
END;
$$;
REVOKE ALL ON FUNCTION public.mark_app_nudge_sent(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_app_nudge_sent(TEXT, UUID) TO anon, authenticated;

CREATE FUNCTION public.complete_participant_app_setup(p_participant_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  person RECORD;
  claimed UUID;
BEGIN
  -- Installation and subscription can arrive in either order, including from
  -- separate concurrent transactions. Serialize the check per participant.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('app-setup:' || p_participant_id::TEXT, 0));
  IF EXISTS (SELECT 1 FROM public."ParticipantAppSetupCompletion" WHERE "participantId" = p_participant_id) THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM public."ParticipantAppState" WHERE "participantId" = p_participant_id AND "installedAt" IS NOT NULL)
    OR NOT EXISTS (SELECT 1 FROM public."ParticipantPushSubscription" WHERE "participantId" = p_participant_id) THEN RETURN; END IF;

  SELECT p."fullName", COALESCE(f."ownerId", gs."supportId") AS owner_id INTO person
  FROM public."Participant" p
  JOIN public."Cohort" c ON c.id = p."cohortId"
  JOIN public."ParticipantAccount" a ON a."participantId" = p.id AND a."isActive" AND a."passwordSetAt" IS NOT NULL
  LEFT JOIN public."FollowUpContact" f ON f.id = p."followUpContactId"
  LEFT JOIN LATERAL (
    SELECT g."supportId" FROM public."GroupParticipant" gp JOIN public."Group" g ON g.id = gp."groupId"
    WHERE gp."participantId" = p.id AND g."archivedAt" IS NULL AND g."supportId" IS NOT NULL
    ORDER BY g."createdAt" DESC LIMIT 1
  ) gs ON TRUE
  JOIN public."User" u ON u.id = COALESCE(f."ownerId", gs."supportId") AND u."isActive" AND NOT COALESCE(u."isTest", FALSE)
  WHERE p.id = p_participant_id AND p.status = 'ACTIVE' AND NOT COALESCE(p."isTest", FALSE)
    AND c.status = 'ACTIVE' AND NOT COALESCE(c."isPractice", FALSE);
  IF NOT FOUND THEN RETURN; END IF;

  INSERT INTO public."ParticipantAppSetupCompletion" ("participantId", "ownerId")
  VALUES (p_participant_id, person.owner_id)
  ON CONFLICT DO NOTHING RETURNING "participantId" INTO claimed;
  IF claimed IS NULL THEN RETURN; END IF;

  -- Write the bell row in the same transaction as the one-time stamp. This
  -- requested bell alert works even when the support has no push subscription.
  INSERT INTO public."Notification" ("userId", title, body, path, type)
  VALUES (person.owner_id, person."fullName" || ' is on the app now',
    person."fullName" || ' has installed FOF Ops and turned on alerts.', '/support', 'APP_SETUP_COMPLETE');
END;
$$;
REVOKE ALL ON FUNCTION public.complete_participant_app_setup(UUID) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.check_participant_app_setup()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.complete_participant_app_setup(NEW."participantId");
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.check_participant_app_setup() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER app_setup_after_install
  AFTER INSERT OR UPDATE OF "installedAt" ON public."ParticipantAppState"
  FOR EACH ROW EXECUTE FUNCTION public.check_participant_app_setup();
CREATE TRIGGER app_setup_after_push
  AFTER INSERT OR UPDATE OF "participantId" ON public."ParticipantPushSubscription"
  FOR EACH ROW EXECUTE FUNCTION public.check_participant_app_setup();
