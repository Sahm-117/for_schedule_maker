-- Get-the-app nudge for supports, and message templates that carry the install videos.
--
-- Who needs a nudge: a participant in a cohort that has not started yet, who has signed
-- in and set their password, and either
--   NOT_INSTALLED  has never opened the app from their Home Screen, or
--   NO_ALERTS      has the app but no device that can receive alerts.
-- The nudge goes to the support who followed them up (or, failing that, leads their group), once a day, and ends on the day
-- the cohort starts (Cohort."startDate"). Test accounts, archived groups and the Practice
-- cohort are skipped.
--
--   my_app_nudge(p_token)   a support: their own people who need the app (for the Home card)
--   app_nudge_due()         the daily push job: owners not yet told today (claims the day)
--   AppNudgeLog             one row per support per day, so it is never sent twice
--
-- Four follow-up templates are added for the app steps, with the install video links written
-- into the text (edit them in the Message Bank if the videos change).
--
-- Rollback: DROP FUNCTION my_app_nudge, app_nudge_due, app_nudge_people; DROP TABLE "AppNudgeLog";
-- DELETE FROM "MessageTemplate" WHERE "useCase" IN (the four names below).

CREATE TABLE IF NOT EXISTS public."AppNudgeLog" (
  "ownerId" UUID NOT NULL REFERENCES public."User"(id) ON DELETE CASCADE,
  "nudgeDate" DATE NOT NULL,
  PRIMARY KEY ("ownerId", "nudgeDate")
);
ALTER TABLE public."AppNudgeLog" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."AppNudgeLog" FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.app_nudge_people()
RETURNS TABLE (owner_id UUID, participant_id UUID, full_name TEXT, phone TEXT, reason TEXT)
LANGUAGE sql
STABLE
SET search_path = public, extensions
AS $$
  -- The owner is the support who followed them up (and shared the login); before they
  -- are in a group that is the only owner there is, and after, the group's support is the fallback.
  SELECT COALESCE(f."ownerId", gs."supportId") AS owner_id, p.id, p."fullName", p.phone,
    CASE WHEN s."installedAt" IS NULL THEN 'NOT_INSTALLED' ELSE 'NO_ALERTS' END
  FROM "Participant" p
  JOIN "Cohort" c ON c.id = p."cohortId"
  JOIN "ParticipantAccount" a ON a."participantId" = p.id
  LEFT JOIN "FollowUpContact" f ON f.id = p."followUpContactId"
  LEFT JOIN LATERAL (
    SELECT g."supportId" FROM "GroupParticipant" gp JOIN "Group" g ON g.id = gp."groupId"
    WHERE gp."participantId" = p.id AND g."archivedAt" IS NULL AND g."supportId" IS NOT NULL
    ORDER BY g."createdAt" DESC LIMIT 1
  ) gs ON TRUE
  JOIN "User" u ON u.id = COALESCE(f."ownerId", gs."supportId") AND u."isActive" AND COALESCE(u."isTest", FALSE) = FALSE
  LEFT JOIN "ParticipantAppState" s ON s."participantId" = p.id
  WHERE p.status = 'ACTIVE'
    AND COALESCE(p."isTest", FALSE) = FALSE
    AND COALESCE(c."isPractice", FALSE) = FALSE
    AND c."startDate" IS NOT NULL
    AND c."startDate" > (NOW() AT TIME ZONE 'Africa/Lagos')::date
    AND a."isActive"
    AND a."passwordSetAt" IS NOT NULL
    AND (
      s."installedAt" IS NULL
      OR NOT EXISTS (SELECT 1 FROM "ParticipantPushSubscription" ps WHERE ps."participantId" = p.id)
    );
$$;
REVOKE ALL ON FUNCTION public.app_nudge_people() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.my_app_nudge(p_token TEXT)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  staff "User" := public.app_staff(p_token);
BEGIN
  IF staff.id IS NULL THEN
    RETURN '[]'::JSON;
  END IF;
  RETURN COALESCE((
    SELECT json_agg(json_build_object('participantId', n.participant_id, 'name', n.full_name, 'phone', n.phone, 'reason', n.reason) ORDER BY n.full_name)
    FROM public.app_nudge_people() n
    WHERE n.owner_id = staff.id
  ), '[]'::JSON);
END;
$$;
REVOKE ALL ON FUNCTION public.my_app_nudge(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_app_nudge(TEXT) TO anon, authenticated;

-- The daily push job: who to tell right now, claiming today so nobody is told twice.
CREATE OR REPLACE FUNCTION public.app_nudge_due()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  today DATE := (NOW() AT TIME ZONE 'Africa/Lagos')::date;
  out JSON;
BEGIN
  WITH todo AS (
    SELECT n.owner_id,
           count(*) FILTER (WHERE n.reason = 'NOT_INSTALLED') AS not_installed,
           count(*) FILTER (WHERE n.reason = 'NO_ALERTS') AS no_alerts,
           array_agg(n.full_name ORDER BY n.full_name) AS names
    FROM public.app_nudge_people() n
    WHERE NOT EXISTS (SELECT 1 FROM "AppNudgeLog" l WHERE l."ownerId" = n.owner_id AND l."nudgeDate" = today)
    GROUP BY n.owner_id
  ), claimed AS (
    INSERT INTO "AppNudgeLog" ("ownerId", "nudgeDate")
    SELECT owner_id, today FROM todo
    ON CONFLICT DO NOTHING
    RETURNING "ownerId"
  )
  SELECT COALESCE(json_agg(json_build_object('ownerId', t.owner_id, 'notInstalled', t.not_installed, 'noAlerts', t.no_alerts, 'names', t.names)), '[]'::JSON)
  INTO out
  FROM todo t JOIN claimed c ON c."ownerId" = t.owner_id;
  RETURN out;
END;
$$;
REVOKE ALL ON FUNCTION public.app_nudge_due() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_nudge_due() TO service_role;

-- Follow-up templates for the app steps. Added once; edit them in the Message Bank.
INSERT INTO "MessageTemplate" ("useCase", body, "whenToUse", category)
SELECT v.use_case, v.body, v.when_to_use, 'FOLLOW_UP'
FROM (VALUES
  ('After login shared: no response',
   E'Hi {{first_name}}, good day. It''s {{user.name}} from FOF at TCN Ikorodu.\n\nI sent you your login for the FOF app and wanted to make sure it reached you. Have you been able to sign in?\n\nIf anything is unclear, just reply here or tell me a good time to call. It only takes a couple of minutes and I''m happy to walk you through it.',
   'A day after the login is shared, if they have not replied'),
  ('After login shared: install the app and turn on alerts',
   E'Hi {{first_name}}! Now that you have your login, the next step is to put the FOF app on your Home Screen and turn on alerts, so you never miss a class or a message.\n\nPlease watch the short video for your phone:\n\nAndroid: https://www.loom.com/share/244dcdeda1ce4ebe959a8b70a0df9006\niPhone: https://www.loom.com/share/c7cb2b0378ae439db52eb8f773857529\n\nThen open the app from your Home Screen, sign in, and tap *Allow* when it asks about notifications.',
   'Right after the login is shared, to get them to install the app and enable alerts'),
  ('Signed in, but the app is not on the Home Screen',
   E'Hi {{first_name}}, I can see you have signed in to the FOF app. Well done!\n\nTo get your class and group reminders, please add the app to your Home Screen. This short video shows how:\n\nAndroid: https://www.loom.com/share/244dcdeda1ce4ebe959a8b70a0df9006\niPhone: https://www.loom.com/share/c7cb2b0378ae439db52eb8f773857529\n\nAfter you open it from your Home Screen, tap *Allow* when it asks about notifications. Message me if you get stuck.',
   'When they have signed in but have not installed the app (shows as "Not installed")'),
  ('App installed, but alerts are off',
   E'Hi {{first_name}}, you have the FOF app. Thank you!\n\nOne thing is left: alerts are still off, so you will not get your class and group reminders.\n\nOpen the app and tap *Allow* when it asks about notifications. If it does not ask, go to *Profile → Reminders* and tap *Enable on this device*. The video for your phone shows how:\n\nAndroid: https://www.loom.com/share/244dcdeda1ce4ebe959a8b70a0df9006\niPhone: https://www.loom.com/share/c7cb2b0378ae439db52eb8f773857529',
   'When the app is installed but they cannot get alerts (shows as "No alerts")')
) AS v(use_case, body, when_to_use)
WHERE NOT EXISTS (SELECT 1 FROM "MessageTemplate" t WHERE t."useCase" = v.use_case);
