-- Check-ins and reassignment only count people in the current cohort (the ACTIVE cohort with
-- the latest start, plus people with no cohort yet), the same people a support sees in their
-- Follow-ups list and the same definition the admin "waiting to be assigned" alert uses.
-- Before this, people from a finished cohort (hidden from the support's list unless "Show past
-- cohorts" is on) were counted as well. Only the cohort condition below is new.
CREATE OR REPLACE FUNCTION public.followup_stale_contacts()
RETURNS SETOF "FollowUpContact"
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT c.*
  FROM "FollowUpContact" c
  JOIN "User" u ON u.id = c."ownerId"
  WHERE c."archivedAt" IS NULL
    AND c."isTest" IS NOT TRUE
    AND (c."cohortId" IS NULL
         OR c."cohortId" = (SELECT id FROM "Cohort" WHERE status = 'ACTIVE' ORDER BY "startDate" DESC NULLS LAST LIMIT 1))
    AND u.role = 'SUPPORT' AND u."isTest" IS NOT TRUE AND u."isActive" IS NOT FALSE
    AND c."nextAction" IS DISTINCT FROM 'CLOSE'
    AND c."registrationStatus" NOT IN ('ACCESS_CONFIRMED', 'LOGIN_SHARED', 'NOT_INTERESTED', 'NOT_A_GOOD_TIME', 'NOT_A_TCN_MEMBER', 'NO_RESPONSE', 'ATTENDED', 'NEXT_COHORT')
    AND c."replyStatus" <> 'INCORRECT_NUMBER' AND c."callStatus" <> 'INCORRECT_NUMBER'
    AND (c."statusChangedAt" IS NULL OR c."statusChangedAt" <= c."ownerAssignedAt")
    AND NOT EXISTS (
      SELECT 1 FROM "FollowUpIssueContact" ic JOIN "FollowUpIssue" i ON i.id = ic."issueId"
      WHERE ic."contactId" = c.id AND i."createdAt" >= c."ownerAssignedAt"
    )
    AND GREATEST(c."ownerAssignedAt", public.followup_reassign_since()) <= now() - interval '24 hours';
$$;
