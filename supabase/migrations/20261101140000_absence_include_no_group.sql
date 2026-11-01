-- Missed-class review and the automatic move now include people in no group (owner's decision, 1 Nov 2026).
-- Before, both lists joined GroupParticipant, so a participant with no group who missed classes 1-2 (or 1-3) was
-- never warned about or moved. Same columns; for someone in no group: groupIds = '{}', groupName/supportId NULL,
-- isTeenGroup FALSE (a teen is still recognised by age range in absence_auto_move). absence_auto_move already
-- handles an empty group list and no support ("no group" in the admin notice; no support notice).
--
-- Rollback: re-run absence_review_candidates from 20261030110000_absence_review.sql (as later amended by
-- 20261030130000_attendance_lock_and_review_fixes.sql) and absence_auto_candidates from
-- 20261031100000_auto_move_three_misses.sql.

CREATE OR REPLACE FUNCTION public.absence_review_candidates(p_cohort_id uuid)
 RETURNS TABLE("participantId" uuid, "fullName" text, "ageRange" text, "groupIds" uuid[], "groupName" text, "supportId" uuid, "supportName" text, "isTeenGroup" boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  WITH early AS (
    SELECT w.id FROM public."Week" w WHERE w."cohortId" = p_cohort_id AND w."weekNumber" IN (1, 2)
  ), missed AS (
    SELECT a."participantId"
    FROM public."AttendanceRecord" a
    WHERE a."weekId" IN (SELECT id FROM early) AND a.status = 'ABSENT'
    GROUP BY a."participantId"
    HAVING COUNT(DISTINCT a."weekId") = 2
  )
  SELECT p.id, p."fullName", p."ageRange",
         COALESCE(array_agg(DISTINCT g.id) FILTER (WHERE g.id IS NOT NULL), '{}'::uuid[]),
         string_agg(DISTINCT g.name, ', '),
         (array_agg(g."supportId" ORDER BY g."createdAt") FILTER (WHERE g."supportId" IS NOT NULL))[1],
         (SELECT u.name FROM public."User" u WHERE u.id = (array_agg(g."supportId" ORDER BY g."createdAt") FILTER (WHERE g."supportId" IS NOT NULL))[1]),
         COALESCE(bool_or(g."isTeenGroup"), FALSE)
  FROM missed m
  JOIN public."Participant" p ON p.id = m."participantId"
  -- People in no group are included too (owner's decision, 1 Nov 2026): their group columns come back empty.
  LEFT JOIN (public."GroupParticipant" gp
    JOIN public."Group" g ON g.id = gp."groupId" AND g."archivedAt" IS NULL)
    ON gp."participantId" = p.id AND g."cohortId" = p_cohort_id
  WHERE p."cohortId" = p_cohort_id
    AND p.status = 'ACTIVE'
    AND p."isTest" IS NOT TRUE
    AND (SELECT COUNT(*) FROM early) = 2
  GROUP BY p.id, p."fullName", p."ageRange";
$function$;
REVOKE ALL ON FUNCTION public.absence_review_candidates(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.absence_auto_candidates(p_cohort_id uuid)
 RETURNS TABLE("participantId" uuid, "fullName" text, "ageRange" text, "groupIds" uuid[], "groupName" text, "supportId" uuid, "supportName" text, "isTeenGroup" boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  WITH early AS (
    SELECT w.id FROM public."Week" w WHERE w."cohortId" = p_cohort_id AND w."weekNumber" IN (1, 2, 3)
  ), missed AS (
    SELECT a."participantId"
    FROM public."AttendanceRecord" a
    WHERE a."weekId" IN (SELECT id FROM early) AND a.status = 'ABSENT'
    GROUP BY a."participantId"
    HAVING COUNT(DISTINCT a."weekId") = 3
  )
  SELECT p.id, p."fullName", p."ageRange",
         COALESCE(array_agg(DISTINCT g.id) FILTER (WHERE g.id IS NOT NULL), '{}'::uuid[]),
         string_agg(DISTINCT g.name, ', '),
         (array_agg(g."supportId" ORDER BY g."createdAt") FILTER (WHERE g."supportId" IS NOT NULL))[1],
         (SELECT u.name FROM public."User" u WHERE u.id = (array_agg(g."supportId" ORDER BY g."createdAt") FILTER (WHERE g."supportId" IS NOT NULL))[1]),
         COALESCE(bool_or(g."isTeenGroup"), FALSE)
  FROM missed m
  JOIN public."Participant" p ON p.id = m."participantId"
  -- People in no group are included too (owner's decision, 1 Nov 2026): their group columns come back empty.
  LEFT JOIN (public."GroupParticipant" gp
    JOIN public."Group" g ON g.id = gp."groupId" AND g."archivedAt" IS NULL)
    ON gp."participantId" = p.id AND g."cohortId" = p_cohort_id
  WHERE p."cohortId" = p_cohort_id
    AND p.status = 'ACTIVE'
    AND p."isTest" IS NOT TRUE
    AND (SELECT COUNT(*) FROM early) = 3
  GROUP BY p.id, p."fullName", p."ageRange";
$function$;
REVOKE ALL ON FUNCTION public.absence_auto_candidates(UUID) FROM PUBLIC, anon, authenticated;
