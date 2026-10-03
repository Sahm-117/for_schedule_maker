-- Announcement popups: an announcement can be a popup that stays on screen until
-- the person taps "Got it" (or its link).
--
--   Announcement."requirePopup"   the announcement is a popup
--   AnnouncementPopup             one row per person it was sent to (written by the
--                                 send-announcement function, which already works out
--                                 the exact recipients) with when they acknowledged it
--
-- A popup stays pending until acknowledged, until the day it was pinned to Home until
-- (if it is pinned), or 14 days after it was sent. Test accounts are skipped.
--
--   announcement_popups_pending(p_token)            staff or participant: my open popups
--   announcement_popup_ack(p_token, p_announcement) staff or participant: Got it
--   announcement_popup_status(p_token, p_announcement)  admin: who has / has not acknowledged
--
-- Rollback: DROP FUNCTION announcement_popups_pending, announcement_popup_ack,
-- announcement_popup_status; DROP TABLE "AnnouncementPopup";
-- ALTER TABLE "Announcement" DROP COLUMN "requirePopup".

ALTER TABLE public."Announcement" ADD COLUMN IF NOT EXISTS "requirePopup" BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS public."AnnouncementPopup" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "announcementId" UUID NOT NULL REFERENCES public."Announcement"(id) ON DELETE CASCADE,
  "userId" UUID REFERENCES public."User"(id) ON DELETE CASCADE,
  "participantId" UUID REFERENCES public."Participant"(id) ON DELETE CASCADE,
  "ackedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (num_nonnulls("userId", "participantId") = 1)
);
CREATE UNIQUE INDEX IF NOT EXISTS announcement_popup_user ON public."AnnouncementPopup" ("announcementId", "userId") WHERE "userId" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS announcement_popup_participant ON public."AnnouncementPopup" ("announcementId", "participantId") WHERE "participantId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS announcement_popup_open_user ON public."AnnouncementPopup" ("userId") WHERE "ackedAt" IS NULL;
CREATE INDEX IF NOT EXISTS announcement_popup_open_participant ON public."AnnouncementPopup" ("participantId") WHERE "ackedAt" IS NULL;
ALTER TABLE public."AnnouncementPopup" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."AnnouncementPopup" FROM anon, authenticated;

-- Whether an announcement can still be shown as a popup.
CREATE OR REPLACE FUNCTION public.announcement_popup_live(a public."Announcement")
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT a."requirePopup"
    AND a."sentAt" > NOW() - INTERVAL '14 days'
    AND (NOT COALESCE(a."showOnHome", FALSE) OR a."homeUntil" IS NULL OR a."homeUntil" > NOW());
$$;

CREATE OR REPLACE FUNCTION public.announcement_popups_pending(p_token TEXT)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  staff "User" := public.app_staff(p_token);
  pid UUID := public.app_participant_id(p_token);
  out JSON;
BEGIN
  IF staff.id IS NULL AND pid IS NULL THEN
    RETURN '[]'::JSON;
  END IF;

  SELECT COALESCE(json_agg(json_build_object(
    'id', a.id, 'subject', a.subject, 'body', a.body,
    'heading', a."homeLabel", 'linkUrl', a."linkUrl", 'linkLabel', a."linkLabel", 'sentAt', a."sentAt"
  ) ORDER BY a."sentAt"), '[]'::JSON)
  INTO out
  FROM public."AnnouncementPopup" p
  JOIN public."Announcement" a ON a.id = p."announcementId"
  WHERE p."ackedAt" IS NULL
    AND public.announcement_popup_live(a)
    AND ((staff.id IS NOT NULL AND p."userId" = staff.id AND COALESCE(staff."isTest", FALSE) = FALSE)
      OR (staff.id IS NULL AND p."participantId" = pid
          AND NOT EXISTS (SELECT 1 FROM public."Participant" pt WHERE pt.id = pid AND COALESCE(pt."isTest", FALSE))));
  RETURN out;
END;
$$;

CREATE OR REPLACE FUNCTION public.announcement_popup_ack(p_token TEXT, p_announcement UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  staff "User" := public.app_staff(p_token);
  pid UUID := public.app_participant_id(p_token);
BEGIN
  IF staff.id IS NULL AND pid IS NULL THEN
    RAISE EXCEPTION 'SESSION_EXPIRED';
  END IF;
  UPDATE public."AnnouncementPopup"
  SET "ackedAt" = COALESCE("ackedAt", NOW())
  WHERE "announcementId" = p_announcement
    AND ((staff.id IS NOT NULL AND "userId" = staff.id) OR (staff.id IS NULL AND "participantId" = pid));
END;
$$;

CREATE OR REPLACE FUNCTION public.announcement_popup_status(p_token TEXT, p_announcement UUID)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  staff "User" := public.app_staff(p_token);
BEGIN
  IF staff.id IS NULL OR staff.role <> 'ADMIN'::"Role" THEN
    RAISE EXCEPTION 'NOT_AUTHORISED';
  END IF;
  RETURN (
    SELECT json_build_object(
      'total', count(*),
      'acknowledged', count(*) FILTER (WHERE p."ackedAt" IS NOT NULL),
      'waiting', COALESCE(json_agg(COALESCE(u.name, pt."fullName") ORDER BY COALESCE(u.name, pt."fullName")) FILTER (WHERE p."ackedAt" IS NULL), '[]'::JSON)
    )
    FROM public."AnnouncementPopup" p
    LEFT JOIN public."User" u ON u.id = p."userId"
    LEFT JOIN public."Participant" pt ON pt.id = p."participantId"
    WHERE p."announcementId" = p_announcement
  );
END;
$$;

REVOKE ALL ON FUNCTION public.announcement_popups_pending(TEXT), public.announcement_popup_ack(TEXT, UUID), public.announcement_popup_status(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.announcement_popups_pending(TEXT), public.announcement_popup_ack(TEXT, UUID), public.announcement_popup_status(TEXT, UUID) TO anon, authenticated;
