-- A contact with an open issue is being looked into, so the auto-reassign must
-- leave it with its owner. Before, only an issue logged AFTER the contact was
-- last assigned counted, which missed contacts whose assignment date was later
-- refreshed (Biodun Bello was moved to another support while Kenneth Alonge's
-- issue about his missing number was still open).
CREATE OR REPLACE FUNCTION public.followup_stale_contacts()
RETURNS SETOF "FollowUpContact"
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
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
      WHERE ic."contactId" = c.id AND (i.status = 'OPEN' OR i."createdAt" >= c."ownerAssignedAt")
    )
    AND NOT EXISTS (
      SELECT 1 FROM "FollowUpIssue" i WHERE i."contactId" = c.id AND i.status = 'OPEN'
    )
    AND GREATEST(c."ownerAssignedAt", public.followup_reassign_since()) <= now() - interval '24 hours';
$function$;
