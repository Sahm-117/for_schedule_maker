-- Hub leads can message a participant on WhatsApp from the group overview.
--
-- hub_group_overview (20261001100000) deliberately returned no phone numbers. It now also returns, for each participant:
--   * isTeen   - the group is a teen group, the age range is "10 - 17", or the contact is on the teen path
--                (TEENAGER / TEEN_ONBOARDED), the same test used on the Mobilisation cards;
--   * phone    - the participant's own number, or NULL for a teen (a teen's number is never shown outside their Teen Support).
-- Same access check as before (discussion_staff_access: hub lead, assistant with "See groups", the group's support, admin).
-- Nothing else changes. Idempotent (CREATE OR REPLACE).
--
-- Rollback: re-apply 20261001100000_hub_group_overview.sql.

CREATE OR REPLACE FUNCTION public.hub_group_overview(p_group_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_group public."Group";
BEGIN
  IF public.discussion_staff_access(p_group_id) IS NULL THEN
    RAISE EXCEPTION 'You can''t see this group''s overview';
  END IF;

  SELECT * INTO v_group FROM public."Group" WHERE id = p_group_id;

  RETURN (
    WITH j AS (
      SELECT w.id AS "weekId", w."weekNumber"
      FROM public."Week" w
      JOIN public."AttendanceSession" s ON s."weekId" = w.id AND s."finalizedAt" IS NOT NULL
      WHERE w."cohortId" = v_group."cohortId"
    )
    SELECT json_build_object(
      'groupId', v_group.id,
      'groupName', v_group.name,
      'support', (
        SELECT json_build_object(
          'id', u.id,
          'name', u.name,
          'hasPhoto', NULLIF(btrim(COALESCE(u."avatarUrl", '')), '') IS NOT NULL,
          'hasGender', NULLIF(btrim(COALESCE(u.gender, '')), '') IS NOT NULL,
          'hasAgeRange', NULLIF(btrim(COALESCE(u."ageRange", '')), '') IS NOT NULL,
          'hasPhone', NULLIF(btrim(COALESCE(u.phone, '')), '') IS NOT NULL,
          'hasPush', EXISTS (SELECT 1 FROM public."PushSubscription" ps WHERE ps."userId" = u.id)
        )
        FROM public."User" u WHERE u.id = v_group."supportId"
      ),
      'classesRun', (SELECT count(*) FROM j),
      'participants', COALESCE((
        SELECT json_agg(json_build_object(
          'participantId', p.id,
          'name', p."fullName",
          'avatarUrl', p."avatarUrl",
          'isTeen', (v_group."isTeenGroup" OR p."ageRange" = '10 - 17' OR EXISTS (
            SELECT 1 FROM public."FollowUpContact" fc
            WHERE fc.id = p."followUpContactId" AND fc."registrationStatus"::text IN ('TEENAGER', 'TEEN_ONBOARDED'))),
          'phone', CASE WHEN (v_group."isTeenGroup" OR p."ageRange" = '10 - 17' OR EXISTS (
            SELECT 1 FROM public."FollowUpContact" fc
            WHERE fc.id = p."followUpContactId" AND fc."registrationStatus"::text IN ('TEENAGER', 'TEEN_ONBOARDED'))) THEN NULL ELSE NULLIF(btrim(COALESCE(p.phone, '')), '') END,
          'onboarding', public.participant_onboarding_state(p.id),
          'faithProjectStatus', (
            SELECT fp.status FROM public."FaithProject" fp
            WHERE fp."participantId" = p.id ORDER BY fp."updatedAt" DESC LIMIT 1),
          'hasPush', EXISTS (SELECT 1 FROM public."ParticipantPushSubscription" ps WHERE ps."participantId" = p.id),
          'classesAttended', (
            SELECT count(*) FROM public."AttendanceRecord" r JOIN j ON j."weekId" = r."weekId"
            WHERE r."participantId" = p.id
              AND (r.status = 'PRESENT' OR (r.status IN ('LATE', 'LEFT_EARLY') AND r."lateExcused"))),
          'recent', COALESCE((
            SELECT json_agg(x ORDER BY x."weekNumber" DESC) FROM (
              SELECT j2."weekNumber", COALESCE(r.status, 'NONE') AS status,
                     (r.status = 'PRESENT' OR (r.status IN ('LATE', 'LEFT_EARLY') AND COALESCE(r."lateExcused", FALSE))) AS attended
              FROM j j2
              LEFT JOIN public."AttendanceRecord" r ON r."weekId" = j2."weekId" AND r."participantId" = p.id
              ORDER BY j2."weekNumber" DESC LIMIT 4
            ) x
          ), '[]'::json)
        ) ORDER BY p."fullName")
        FROM public."GroupParticipant" gp
        JOIN public."Participant" p ON p.id = gp."participantId"
        WHERE gp."groupId" = v_group.id AND p.status = 'ACTIVE' AND p."isTest" IS NOT TRUE
      ), '[]'::json)
    )
  );
END;
$function$
;

REVOKE ALL ON FUNCTION public.hub_group_overview(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hub_group_overview(UUID) TO anon, authenticated;
