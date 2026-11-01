-- The admin Supports page's own reads in one database call (admin review, Supports "one database call").
-- Until now the page asked separately for the people, who is in the cohort, the hubs and their members, each
-- support's role for the cohort, who has a note about them, the open follow-ups each holds, when each was last active,
-- and the weekly meeting reports. admin_supports_overview(cohort) returns all of those in one JSON object, shaped like
-- the separate reads, so the page's own code (including countsAsCohortSupport, FLOW_MAP rule 127, which the page still
-- applies to these rows) is unchanged:
--   users        every active user, the columns usersApi.getAll reads (same order, newest first)
--   memberIds    ids in UserCohort for the cohort
--   hubs         SupportHub rows with lead / assistantLead as { id, name }
--   memberships  HubMembership rows for the cohort
--   kinds        { userId: supportKind } from UserCohort
--   notedIds     supports with a NOTE (none, or one in this cohort's hubs), as getSupportIdsWithNotes
--   followUpLoad { ownerId: open follow-ups }, the rule of openLoadByOwner: not archived, not a test contact, not a teen,
--                not closed (computeFollowUpStatus), and in the cohort (or with no cohort yet)
--   lastActive   { userId: time } for support-role people who lead a group in the cohort, or are active members of it,
--                as users_last_active
--   reports      the cohort's MEETING notes (ParticipantNote, with author { id, name }), newest first
-- Admin only (app_is_admin, Team members included). The page's health, people, rules, trainings, onboarding and groups
-- reads are separate and stay as they are.
--
-- Rollback: DROP FUNCTION public.admin_supports_overview(uuid);

CREATE OR REPLACE FUNCTION public.admin_supports_overview(p_cohort_id UUID)
 RETURNS JSONB
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT (SELECT public.app_is_admin()) THEN
    RAISE EXCEPTION 'NOT_ALLOWED';
  END IF;

  RETURN jsonb_build_object(
    'users', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', u.id, 'email', u.email, 'phone', u.phone, 'name', u.name, 'role', u.role, 'roles', u.roles,
        'isActive', u."isActive", 'isTest', u."isTest", 'deactivatedAt', u."deactivatedAt",
        'isCoordinator', u."isCoordinator", 'avatarUrl', u."avatarUrl", 'themeColor', u."themeColor",
        'birthYear', u."birthYear", 'hubLastSeenAt', u."hubLastSeenAt", 'whatsappGroupUrl', u."whatsappGroupUrl",
        'gender', u.gender, 'ageRange', u."ageRange", 'birthday', u.birthday,
        'onboardingCompleted', u."onboardingCompleted", 'onboardingReplayCount', u."onboardingReplayCount",
        'onboardingLastReplayAt', u."onboardingLastReplayAt", 'mustChangePassword', u."mustChangePassword",
        'createdAt', u."createdAt", 'updatedAt', u."updatedAt") ORDER BY u."createdAt" DESC)
      FROM public."User" u WHERE u."isActive" IS TRUE), '[]'::jsonb),

    'memberIds', COALESCE((
      SELECT jsonb_agg(uc."userId") FROM public."UserCohort" uc WHERE uc."cohortId" = p_cohort_id), '[]'::jsonb),

    'hubs', COALESCE((
      SELECT jsonb_agg(to_jsonb(h)
        || jsonb_build_object(
          'lead', (SELECT jsonb_build_object('id', l.id, 'name', l.name) FROM public."User" l WHERE l.id = h."leadUserId"),
          'assistantLead', (SELECT jsonb_build_object('id', a.id, 'name', a.name) FROM public."User" a WHERE a.id = h."assistantLeadUserId")
        ) ORDER BY h.name)
      FROM public."SupportHub" h WHERE h."cohortId" = p_cohort_id), '[]'::jsonb),

    'memberships', COALESCE((
      SELECT jsonb_agg(to_jsonb(m)) FROM public."HubMembership" m WHERE m."cohortId" = p_cohort_id), '[]'::jsonb),

    'kinds', COALESCE((
      SELECT jsonb_object_agg(uc."userId", COALESCE(uc."supportKind", 'PARTICIPANT_SUPPORT'))
      FROM public."UserCohort" uc WHERE uc."cohortId" = p_cohort_id), '{}'::jsonb),

    'notedIds', COALESCE((
      SELECT jsonb_agg(DISTINCT n."supportId")
      FROM public."SupportNote" n
      WHERE n."noteType" = 'NOTE'
        AND (n."hubId" IS NULL OR n."hubId" IN (SELECT h2.id FROM public."SupportHub" h2 WHERE h2."cohortId" = p_cohort_id))
    ), '[]'::jsonb),

    'followUpLoad', COALESCE((
      SELECT jsonb_object_agg(t."ownerId", t.open_count)
      FROM (
        SELECT c."ownerId", COUNT(*) AS open_count
        FROM public."FollowUpContact" c
        WHERE c."ownerId" IS NOT NULL
          AND c."archivedAt" IS NULL
          AND COALESCE(c."isTest", FALSE) = FALSE
          AND (c."cohortId" = p_cohort_id OR c."cohortId" IS NULL)
          -- Not a teen, and not closed: closed is Access confirmed, Attended, Not interested (and its two variants), No
          -- response, or a wrong number (a wrong-number reply or call only counts when the status itself is not one of
          -- the stages that win over it).
          AND COALESCE(c."registrationStatus", '') NOT IN ('ACCESS_CONFIRMED', 'ATTENDED', 'TEENAGER', 'TEEN_ONBOARDED',
                                                           'NOT_INTERESTED', 'NOT_A_GOOD_TIME', 'NOT_A_TCN_MEMBER', 'NO_RESPONSE')
          AND NOT (COALESCE(c."registrationStatus", '') NOT IN ('LOGIN_ISSUE', 'LOGIN_SHARED', 'REGISTERED', 'NEXT_COHORT')
                   AND (c."replyStatus" = 'INCORRECT_NUMBER' OR c."callStatus" = 'INCORRECT_NUMBER'))
        GROUP BY c."ownerId"
      ) t), '{}'::jsonb),

    'lastActive', COALESCE((
      SELECT jsonb_object_agg(x.id, x.seen)
      FROM (
        SELECT u.id, GREATEST((SELECT MAX(s."lastSeenAt") FROM public."AppSession" s WHERE s."userId" = u.id), u."hubLastSeenAt") AS seen
        FROM public."User" u
        WHERE (u.role = 'SUPPORT' OR 'SUPPORT'::public."Role" = ANY(u.roles))
          AND (EXISTS (SELECT 1 FROM public."Group" g WHERE g."cohortId" = p_cohort_id AND g."supportId" = u.id)
               OR (u."isActive" IS NOT FALSE
                   AND EXISTS (SELECT 1 FROM public."UserCohort" uc WHERE uc."userId" = u.id AND uc."cohortId" = p_cohort_id)))
      ) x), '{}'::jsonb),

    'reports', COALESCE((
      SELECT jsonb_agg(to_jsonb(pn)
        || jsonb_build_object('author', (SELECT jsonb_build_object('id', au.id, 'name', au.name) FROM public."User" au WHERE au.id = pn."authorId"))
        ORDER BY pn."createdAt" DESC)
      FROM public."ParticipantNote" pn
      WHERE pn."noteType" = 'MEETING'
        AND pn."groupId" IN (SELECT g2.id FROM public."Group" g2 WHERE g2."cohortId" = p_cohort_id)
    ), '[]'::jsonb)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_supports_overview(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_supports_overview(UUID) TO anon, authenticated;
