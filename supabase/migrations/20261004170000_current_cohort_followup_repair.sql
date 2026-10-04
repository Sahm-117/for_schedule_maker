-- One authoritative definition of the programme cohort that automatic work
-- should use. This deliberately does not use Cohort.createdAt: planned dates
-- are the operational source of truth, and practice cohorts are never live.
CREATE OR REPLACE FUNCTION public.current_programme_cohort_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
  WITH candidates AS (
    SELECT
      c.id,
      c."startDate",
      c."endDate",
      (timezone('Africa/Lagos', now()))::date AS today
    FROM public."Cohort" c
    WHERE c.status = 'ACTIVE'
      AND COALESCE(c."isPractice", FALSE) IS FALSE
  ), ranked AS (
    SELECT *,
      CASE
        WHEN "startDate" IS NOT NULL
          AND "startDate" <= today
          AND ("endDate" IS NULL OR "endDate" >= today) THEN 0
        WHEN "startDate" IS NOT NULL AND "startDate" > today THEN 1
        ELSE 2
      END AS cohort_rank
    FROM candidates
  )
  SELECT id
  FROM ranked
  ORDER BY
    cohort_rank ASC,
    -- If dates overlap, the cohort that started most recently is current.
    CASE WHEN cohort_rank = 0 THEN "startDate" END DESC NULLS LAST,
    -- Before a cohort starts, choose the next scheduled one.
    CASE WHEN cohort_rank = 1 THEN "startDate" END ASC NULLS LAST,
    -- With no running or upcoming cohort, retain the most recently finished
    -- programme. A missing start date is never allowed to outrank a dated one.
    CASE WHEN cohort_rank = 2 AND "startDate" IS NULL THEN 1 ELSE 0 END ASC,
    CASE WHEN cohort_rank = 2 THEN COALESCE("endDate", "startDate") END DESC NULLS LAST,
    CASE WHEN cohort_rank = 2 THEN "startDate" END DESC NULLS LAST,
    id ASC
  LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.current_programme_cohort_id() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.current_programme_cohort_id() TO anon, authenticated, service_role;

-- Preserve the latest stale-contact behaviour (including the no-open-issue
-- rule) while replacing its duplicated latest-ACTIVE selector with the helper.
CREATE OR REPLACE FUNCTION public.followup_stale_contacts()
RETURNS SETOF "FollowUpContact"
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
  SELECT c.*
  FROM "FollowUpContact" c
  JOIN "User" u ON u.id = c."ownerId"
  WHERE c."archivedAt" IS NULL
    AND c."isTest" IS NOT TRUE
    AND (c."cohortId" IS NULL
         OR c."cohortId" = public.current_programme_cohort_id())
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

-- Keep the deployed assignment body intact, including the later relaxed
-- assignment rules and JSON result shape. The only insertion is current-cohort
-- scoping for unowned automatic work. CREATE OR REPLACE preserves its grants.
DO $patch$
DECLARE
  v_definition TEXT;
  v_rewritten TEXT;
BEGIN
  SELECT pg_get_functiondef('public.run_followup_assignment(boolean)'::regprocedure)
    INTO v_definition;

  IF position('current_programme_cohort_id()' IN v_definition) > 0 THEN
    RETURN;
  END IF;

  v_rewritten := replace(
    v_definition,
    E'      AND c."isTest" IS NOT TRUE\n      AND (p_manual OR c."createdAt" <= now() - interval ''2 hours'')',
    E'      AND c."isTest" IS NOT TRUE\n'
    || E'      AND (p_manual OR c."cohortId" IS NULL OR c."cohortId" = public.current_programme_cohort_id())\n'
    || E'      AND (p_manual OR c."createdAt" <= now() - interval ''2 hours'')'
  );

  IF v_rewritten = v_definition THEN
    RAISE EXCEPTION 'run_followup_assignment: current-cohort scope anchor not found';
  END IF;

  EXECUTE v_rewritten;
END
$patch$;

-- The source cohort reference is deliberately removed by the repair, so retain
-- the exact validated IDs in a private, append-only audit record. It makes a
-- re-run distinguish a completed repair from a partial/manual change without
-- guessing from later form registrations.
CREATE TABLE IF NOT EXISTS public."Cohort10FollowUpRepairLedger" (
  "repairKey" TEXT PRIMARY KEY,
  "sourceCohortId" UUID NOT NULL REFERENCES public."Cohort"(id),
  "targetCohortId" UUID NOT NULL REFERENCES public."Cohort"(id),
  "contactIds" UUID[] NOT NULL CHECK (cardinality("contactIds") = 29),
  "participantIds" UUID[] NOT NULL CHECK (cardinality("participantIds") = 29),
  "accountParticipantIds" UUID[] NOT NULL CHECK (cardinality("accountParticipantIds") = 4),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public."Cohort10FollowUpRepairLedger" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."Cohort10FollowUpRepairLedger" FROM PUBLIC, anon, authenticated;

-- The 29 real registrations below were attached to an accidentally-created
-- future QA cohort. Every guard is evaluated before a data row is changed.
-- An already-complete repair is a no-op; any incomplete or different state
-- raises inside this transaction so neither contacts nor participants move.
DO $repair$
DECLARE
  v_repair_key CONSTANT TEXT := 'cohort10_followup_qa_20261004';
  v_qa_id CONSTANT UUID := '7e71825e-4bab-4f49-8e5c-ff74ead9643a';
  v_target_id CONSTANT UUID := 'feaac060-bd12-44fc-b681-9109d3b070fe';
  v_qa public."Cohort"%ROWTYPE;
  v_target public."Cohort"%ROWTYPE;
  v_ledger public."Cohort10FollowUpRepairLedger"%ROWTYPE;
  v_contact_ids UUID[];
  v_participant_ids UUID[];
  v_account_participant_ids UUID[];
  v_count INTEGER;
  v_registered INTEGER;
  v_login_shared INTEGER;
  v_bad_per_contact INTEGER;
  v_extra_contacts INTEGER;
  v_extra_participants INTEGER;
  v_distinct_participant_contacts INTEGER;
  v_account_total INTEGER;
  v_account_expected INTEGER;
  v_membership_total INTEGER;
  v_membership_expected INTEGER;
  v_moved_contacts INTEGER;
  v_moved_participants INTEGER;
  v_archived INTEGER;
  v_coll_total INTEGER;
  v_coll_known INTEGER;
BEGIN
  -- Block concurrent foreign-key references to QA until this transaction has
  -- either moved the verified rows and archived it, or rolled back.
  SELECT * INTO v_qa FROM public."Cohort" WHERE id = v_qa_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cohort 10 repair: QA cohort % is missing', v_qa_id;
  END IF;
  IF v_qa.name IS DISTINCT FROM 'ZZ Resources QA'
     OR v_qa."isPractice" IS NOT FALSE
     OR v_qa."startDate" IS DISTINCT FROM DATE '2099-10-11'
     OR v_qa."endDate" IS DISTINCT FROM DATE '2099-12-13'
     OR v_qa."createdAt" IS DISTINCT FROM TIMESTAMPTZ '2026-10-04T00:49:55.556122+00' THEN
    RAISE EXCEPTION 'Cohort 10 repair: QA cohort identity guard failed';
  END IF;

  SELECT * INTO v_target FROM public."Cohort" WHERE id = v_target_id;
  IF NOT FOUND
     OR v_target.name IS DISTINCT FROM 'Cohort 10'
     OR v_target."startDate" IS DISTINCT FROM DATE '2026-10-11'
     OR v_target."endDate" IS DISTINCT FROM DATE '2026-12-27' THEN
    RAISE EXCEPTION 'Cohort 10 repair: Cohort 10 identity guard failed';
  END IF;

  -- A completed repair is verifiable only from its durable ledger: after the
  -- move, form registrations alone cannot distinguish these 29 people from a
  -- later legitimate Cohort 10 registration.
  IF v_qa.status = 'ARCHIVED' THEN
    SELECT * INTO v_ledger
    FROM public."Cohort10FollowUpRepairLedger"
    WHERE "repairKey" = v_repair_key;
    IF NOT FOUND
       OR v_ledger."sourceCohortId" IS DISTINCT FROM v_qa_id
       OR v_ledger."targetCohortId" IS DISTINCT FROM v_target_id
       OR cardinality(v_ledger."contactIds") <> 29
       OR cardinality(v_ledger."participantIds") <> 29
       OR cardinality(v_ledger."accountParticipantIds") <> 4 THEN
      RAISE EXCEPTION 'Cohort 10 repair: archived QA has no valid repair ledger';
    END IF;

    SELECT COUNT(*) INTO v_extra_contacts
    FROM public."FollowUpContact" c
    WHERE c."cohortId" = v_qa_id
      AND c."isTest" IS NOT TRUE;
    SELECT COUNT(*) INTO v_extra_participants
    FROM public."Participant" p
    WHERE p."cohortId" = v_qa_id
      AND p."isTest" IS NOT TRUE;
    IF v_extra_contacts <> 0 OR v_extra_participants <> 0 THEN
      RAISE EXCEPTION 'Cohort 10 repair: archived QA still has % non-test contacts and % non-test participants', v_extra_contacts, v_extra_participants;
    END IF;

    SELECT COUNT(DISTINCT r."contactId") INTO v_count
    FROM public."SheetRegistration" r
    WHERE r."contactId" = ANY(v_ledger."contactIds")
      AND r."createdAt" >= v_qa."createdAt";
    IF v_count <> 29 THEN
      RAISE EXCEPTION 'Cohort 10 repair: archived ledger contacts no longer have their required form-registration linkage';
    END IF;

    SELECT COUNT(*) INTO v_count
    FROM public."FollowUpContact" c
    WHERE c.id = ANY(v_ledger."contactIds")
      AND c."cohortId" = v_target_id
      AND c."isTest" IS NOT TRUE;
    IF v_count <> 29 THEN
      RAISE EXCEPTION 'Cohort 10 repair: archived ledger contacts are not exactly in Cohort 10';
    END IF;

    SELECT COUNT(*), COUNT(DISTINCT p."followUpContactId")
    INTO v_count, v_distinct_participant_contacts
    FROM public."Participant" p
    WHERE p.id = ANY(v_ledger."participantIds")
      AND p."cohortId" = v_target_id
      AND p."isTest" IS NOT TRUE
      AND p."followUpContactId" = ANY(v_ledger."contactIds");
    IF v_count <> 29 OR v_distinct_participant_contacts <> 29 THEN
      RAISE EXCEPTION 'Cohort 10 repair: archived ledger participants are not the exact Cohort 10 contact set';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM unnest(v_ledger."accountParticipantIds") AS account_participant(id)
      WHERE NOT (account_participant.id = ANY(v_ledger."participantIds"))
    ) THEN
      RAISE EXCEPTION 'Cohort 10 repair: archived ledger account IDs are outside the participant set';
    END IF;
    SELECT
      COUNT(*),
      COUNT(*) FILTER (
        WHERE a."participantId" = ANY(v_ledger."accountParticipantIds")
          AND a."isActive" IS TRUE
          AND a."mustChangePassword" IS TRUE
          AND a."lastSignInAt" IS NULL
      )
    INTO v_account_total, v_account_expected
    FROM public."ParticipantAccount" a
    WHERE a."participantId" = ANY(v_ledger."participantIds");
    IF v_account_total <> 4 OR v_account_expected <> 4 THEN
      RAISE EXCEPTION 'Cohort 10 repair: archived ledger account rows changed';
    END IF;
    RETURN;
  END IF;

  IF v_qa.status IS DISTINCT FROM 'ACTIVE' THEN
    RAISE EXCEPTION 'Cohort 10 repair: QA cohort must be ACTIVE before repair';
  END IF;

  SELECT array_agg(candidate.id ORDER BY candidate.id), COUNT(*)
    INTO v_contact_ids, v_count
  FROM (
    SELECT DISTINCT c.id
    FROM public."FollowUpContact" c
    JOIN public."SheetRegistration" r
      ON r."contactId" = c.id
     AND r."createdAt" >= v_qa."createdAt"
    WHERE c."cohortId" = v_qa_id
      AND c."isTest" IS NOT TRUE
  ) candidate;
  IF v_count <> 29 THEN
    RAISE EXCEPTION 'Cohort 10 repair: expected 29 distinct non-test QA contacts linked to post-QA form registrations, found %', v_count;
  END IF;

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE c."registrationStatus" = 'REGISTERED'),
    COUNT(*) FILTER (WHERE c."registrationStatus" = 'LOGIN_SHARED')
  INTO v_count, v_registered, v_login_shared
  FROM public."FollowUpContact" c
  WHERE c.id = ANY(v_contact_ids);
  IF v_count <> 29 OR v_registered <> 26 OR v_login_shared <> 3 THEN
    RAISE EXCEPTION 'Cohort 10 repair: candidate statuses must be 26 REGISTERED and 3 LOGIN_SHARED';
  END IF;

  SELECT COUNT(*) INTO v_extra_contacts
  FROM public."FollowUpContact" c
  WHERE c."cohortId" = v_qa_id
    AND c."isTest" IS NOT TRUE
    AND NOT (c.id = ANY(v_contact_ids));
  IF v_extra_contacts <> 0 THEN
    RAISE EXCEPTION 'Cohort 10 repair: QA has % extra non-test contacts outside the exact 29 candidates', v_extra_contacts;
  END IF;

  SELECT array_agg(p.id ORDER BY p.id), COUNT(*)
    INTO v_participant_ids, v_count
  FROM public."Participant" p
  WHERE p."cohortId" = v_qa_id
    AND p."followUpContactId" = ANY(v_contact_ids)
    AND p.status = 'ACTIVE'
    AND p."isTest" IS NOT TRUE;
  IF v_count <> 29 THEN
    RAISE EXCEPTION 'Cohort 10 repair: expected 29 active non-test QA participants, found %', v_count;
  END IF;

  SELECT COUNT(*) INTO v_bad_per_contact
  FROM (
    SELECT p."followUpContactId"
    FROM public."Participant" p
    WHERE p."cohortId" = v_qa_id
      AND p."followUpContactId" = ANY(v_contact_ids)
      AND p.status = 'ACTIVE'
      AND p."isTest" IS NOT TRUE
    GROUP BY p."followUpContactId"
    HAVING COUNT(*) <> 1
  ) bad;
  IF v_bad_per_contact <> 0 THEN
    RAISE EXCEPTION 'Cohort 10 repair: every candidate must have exactly one active non-test QA participant';
  END IF;

  SELECT COUNT(*) INTO v_extra_participants
  FROM public."Participant" p
  WHERE p."cohortId" = v_qa_id
    AND p."isTest" IS NOT TRUE
    AND NOT (p.id = ANY(v_participant_ids));
  IF v_extra_participants <> 0 THEN
    RAISE EXCEPTION 'Cohort 10 repair: QA has % extra non-test participants outside the exact 29 candidates', v_extra_participants;
  END IF;

  -- Verified 2026-10-04: exactly one phone number is shared across the two
  -- cohorts by two different people (Funmilayo Ewayenikan, in Cohort 10 since
  -- 27 Sept with an ACCESS_CONFIRMED contact; Jeremiah Williams, in QA since
  -- today with a REGISTERED contact). The app models shared numbers, so this
  -- exact pair is permitted; any other collision still raises.
  SELECT COUNT(*),
    COUNT(*) FILTER (WHERE target_participant.id = '0476b50f-de92-4b0a-baa9-0c8c05052b0f'
      AND candidate_participant.id = '80c19324-5ca4-4f91-bc63-ccf4ba5f0a7e'
      AND target_participant."fullName" IS NOT DISTINCT FROM 'Funmilayo Ewayenikan'
      AND candidate_participant."fullName" IS NOT DISTINCT FROM 'Jeremiah Williams')
  INTO v_coll_total, v_coll_known
  FROM public."Participant" target_participant
  JOIN public."Participant" candidate_participant
    ON candidate_participant.id = ANY(v_participant_ids)
  WHERE target_participant."cohortId" = v_target_id
    AND target_participant.id <> candidate_participant.id
    AND public.fof_phone_key(target_participant.phone) IS NOT NULL
    AND public.fof_phone_key(target_participant.phone) = public.fof_phone_key(candidate_participant.phone);
  IF v_coll_total <> 1 OR v_coll_known <> 1 THEN
    RAISE EXCEPTION 'Cohort 10 repair: Cohort 10 has an unexpected phone-key collision with a QA candidate';
  END IF;

  IF EXISTS (SELECT 1 FROM public."Group" WHERE "cohortId" = v_qa_id)
     OR EXISTS (SELECT 1 FROM public."Week" WHERE "cohortId" = v_qa_id)
     OR EXISTS (SELECT 1 FROM public."GroupParticipant" WHERE "participantId" = ANY(v_participant_ids)) THEN
    RAISE EXCEPTION 'Cohort 10 repair: QA cohort has groups, weeks, or candidate group memberships';
  END IF;

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE u.role = 'SUPPORT' AND u."isTest" IS TRUE)
  INTO v_membership_total, v_membership_expected
  FROM public."UserCohort" uc
  JOIN public."User" u ON u.id = uc."userId"
  WHERE uc."cohortId" = v_qa_id;
  IF v_membership_total <> 2 OR v_membership_expected <> 2 THEN
    RAISE EXCEPTION 'Cohort 10 repair: QA must have exactly two test SUPPORT memberships';
  END IF;

  SELECT
    array_agg(a."participantId" ORDER BY a."participantId"),
    COUNT(*),
    COUNT(*) FILTER (WHERE a."isActive" IS TRUE AND a."mustChangePassword" IS TRUE AND a."lastSignInAt" IS NULL)
  INTO v_account_participant_ids, v_account_total, v_account_expected
  FROM public."ParticipantAccount" a
  WHERE a."participantId" = ANY(v_participant_ids);
  IF v_account_total <> 4 OR v_account_expected <> 4 THEN
    RAISE EXCEPTION 'Cohort 10 repair: expected four active reset-required never-signed-in participant accounts';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public."Cohort10FollowUpRepairLedger"
    WHERE "repairKey" = v_repair_key
  ) THEN
    RAISE EXCEPTION 'Cohort 10 repair: repair ledger already exists while QA is still ACTIVE';
  END IF;

  INSERT INTO public."Cohort10FollowUpRepairLedger" (
    "repairKey",
    "sourceCohortId",
    "targetCohortId",
    "contactIds",
    "participantIds",
    "accountParticipantIds"
  ) VALUES (
    v_repair_key,
    v_qa_id,
    v_target_id,
    v_contact_ids,
    v_participant_ids,
    v_account_participant_ids
  );

  WITH moved AS (
    UPDATE public."Participant"
    SET "cohortId" = v_target_id,
        "updatedAt" = now()
    WHERE id = ANY(v_participant_ids)
    RETURNING id
  )
  SELECT COUNT(*) INTO v_moved_participants FROM moved;
  IF v_moved_participants <> 29 THEN
    RAISE EXCEPTION 'Cohort 10 repair: moved % participants, expected 29', v_moved_participants;
  END IF;

  WITH moved AS (
    UPDATE public."FollowUpContact"
    SET "cohortId" = v_target_id,
        "updatedAt" = now()
    WHERE id = ANY(v_contact_ids)
    RETURNING id
  )
  SELECT COUNT(*) INTO v_moved_contacts FROM moved;
  IF v_moved_contacts <> 29 THEN
    RAISE EXCEPTION 'Cohort 10 repair: moved % contacts, expected 29', v_moved_contacts;
  END IF;

  WITH archived AS (
    UPDATE public."Cohort"
    SET status = 'ARCHIVED',
        "updatedAt" = now()
    WHERE id = v_qa_id
      AND status = 'ACTIVE'
    RETURNING id
  )
  SELECT COUNT(*) INTO v_archived FROM archived;
  IF v_archived <> 1 THEN
    RAISE EXCEPTION 'Cohort 10 repair: QA cohort archive count was %, expected 1', v_archived;
  END IF;
END
$repair$;
