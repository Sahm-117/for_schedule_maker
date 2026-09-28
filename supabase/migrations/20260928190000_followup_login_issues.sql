-- "Issue with login" now carries a description, and IT Support get a place to
-- work through them (Mobilisation → IT issues) and a way to mark them sorted.
--
-- What this adds:
--   1. FollowUpLoginIssue: one row per reported login problem (at most one
--      OPEN per contact). Staff can read; writes only through the RPCs below
--      (same locked-table pattern as HubRoleIntroSeen in
--      20260926120000_hub_roles.sql #4).
--   2. followup_contact_it_support_ids(contactId, cohortId): who the IT Support
--      for a contact are. The contact's owner support's hub (HubMembership in
--      the contact's cohort) → that hub's HubItSupport rows. If the owner has
--      no hub there, every IT Support of that cohort's hubs. A contact with no
--      cohort uses p_cohort_id (the app's active cohort), and with neither,
--      every IT Support (the old notify-followup-terminal-status behaviour).
--      Private: called from the RPCs here and by notify-followup-terminal-status
--      on the service role.
--   3. report_followup_login_issue: the support's "What's the problem?" text.
--      Creates the OPEN row, or updates its description if one is already open.
--   4. it_login_issues(cohortId): the IT issues tab. Returns whether the caller
--      is IT Support in that cohort plus the issues they cover (all of them for
--      an admin), joined with contact, owner, reporter and signed-in flag.
--      A SECURITY DEFINER read because ParticipantAccount isn't staff-readable.
--   5. resolve_followup_login_issue: admin or the contact's IT Support marks it
--      sorted. The contact moves to Participant confirmed access (closed, same
--      columns as buildStatusPatch('ACCESS_CONFIRMED')) if they have signed in
--      or chosen a password, else back to Login shared (open). The owner
--      support is told via notify-users (vault + pg_net, same pattern as
--      confirm_followup_access_on_password_set in
--      20260928180000_followup_access_confirmed.sql), never blocking the save.
--   6. participant_login_details: copied verbatim from
--      20260917110000_participant_accounts.sql; the only change is that the
--      contact's IT Support may also view the login details and issue a new
--      code (the LoginDetailsCard on the IT issues tab).
--   7. my_help_contact(token, cohortId): who the ? button's "Message …" goes
--      to. Participant: IT Support of their group's support's hub; with no
--      group yet, of their follow-up support's hub. Support: IT Support of
--      their own hub. The next available one is used: hub IT Support first,
--      then other IT Support in the cohort's hubs (earliest added first),
--      skipping the caller and anyone with no active account or phone. Admin,
--      or nobody found: NULL, and the app falls back to the support_contact
--      setting.
--
-- Additive and idempotent. Not yet applied to the live database.

-- ── 1. FollowUpLoginIssue ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public."FollowUpLoginIssue" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "contactId" UUID NOT NULL REFERENCES public."FollowUpContact"(id) ON DELETE CASCADE,
  "reportedById" UUID REFERENCES public."User"(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'RESOLVED')),
  "resolvedById" UUID REFERENCES public."User"(id) ON DELETE SET NULL,
  "resolvedAt" TIMESTAMPTZ,
  resolution TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_followuploginissue_contact ON public."FollowUpLoginIssue"("contactId");
CREATE INDEX IF NOT EXISTS idx_followuploginissue_status ON public."FollowUpLoginIssue"(status);
-- One open problem per person; a second report updates the first.
CREATE UNIQUE INDEX IF NOT EXISTS uq_followuploginissue_open_contact
  ON public."FollowUpLoginIssue"("contactId") WHERE status = 'OPEN';

ALTER TABLE public."FollowUpLoginIssue" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff can read login issues" ON public."FollowUpLoginIssue";
CREATE POLICY "Staff can read login issues" ON public."FollowUpLoginIssue" FOR SELECT USING (public.app_is_staff());

GRANT SELECT ON public."FollowUpLoginIssue" TO anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public."FollowUpLoginIssue" FROM anon, authenticated;

-- ── 2. Who the IT Support for a contact are ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.followup_contact_it_support_ids(p_contact_id UUID, p_cohort_id UUID DEFAULT NULL)
RETURNS UUID[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_contact public."FollowUpContact";
  v_cohort UUID;
  v_hub UUID;
  v_ids UUID[];
BEGIN
  SELECT * INTO v_contact FROM public."FollowUpContact" WHERE id = p_contact_id;
  IF v_contact.id IS NULL THEN
    RETURN ARRAY[]::UUID[];
  END IF;

  v_cohort := COALESCE(v_contact."cohortId", p_cohort_id);

  IF v_contact."ownerId" IS NOT NULL AND v_cohort IS NOT NULL THEN
    SELECT m."hubId" INTO v_hub
    FROM public."HubMembership" m
    WHERE m."userId" = v_contact."ownerId" AND m."cohortId" = v_cohort
    LIMIT 1;
  END IF;

  IF v_hub IS NOT NULL THEN
    SELECT COALESCE(array_agg(x."userId" ORDER BY x.first_added), ARRAY[]::UUID[]) INTO v_ids
    FROM (
      SELECT hi."userId", MIN(hi."createdAt") AS first_added
      FROM public."HubItSupport" hi
      JOIN public."User" u ON u.id = hi."userId"
      WHERE hi."hubId" = v_hub AND u."isActive" IS NOT FALSE
      GROUP BY hi."userId"
    ) x;
  ELSIF v_cohort IS NOT NULL THEN
    SELECT COALESCE(array_agg(x."userId" ORDER BY x.first_added), ARRAY[]::UUID[]) INTO v_ids
    FROM (
      SELECT hi."userId", MIN(hi."createdAt") AS first_added
      FROM public."HubItSupport" hi
      JOIN public."SupportHub" h ON h.id = hi."hubId"
      JOIN public."User" u ON u.id = hi."userId"
      WHERE h."cohortId" = v_cohort AND u."isActive" IS NOT FALSE
      GROUP BY hi."userId"
    ) x;
  ELSE
    SELECT COALESCE(array_agg(x."userId" ORDER BY x.first_added), ARRAY[]::UUID[]) INTO v_ids
    FROM (
      SELECT hi."userId", MIN(hi."createdAt") AS first_added
      FROM public."HubItSupport" hi
      JOIN public."User" u ON u.id = hi."userId"
      WHERE u."isActive" IS NOT FALSE
      GROUP BY hi."userId"
    ) x;
  END IF;

  RETURN v_ids;
END;
$function$;

REVOKE ALL ON FUNCTION public.followup_contact_it_support_ids(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.followup_contact_it_support_ids(UUID, UUID) TO service_role;

-- ── 3. Report a login problem ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.report_followup_login_issue(p_contact_id UUID, p_description TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_id UUID;
  v_row public."FollowUpLoginIssue";
BEGIN
  IF NOT public.app_is_staff() THEN
    RAISE EXCEPTION 'You must be signed in as a support or admin';
  END IF;
  v_actor_id := public.app_current_user_id();

  IF p_description IS NULL OR btrim(p_description) = '' THEN
    RAISE EXCEPTION 'Say what the problem is';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public."FollowUpContact" WHERE id = p_contact_id) THEN
    RAISE EXCEPTION 'Contact was not found';
  END IF;

  UPDATE public."FollowUpLoginIssue"
  SET description = btrim(p_description),
      "reportedById" = v_actor_id,
      "updatedAt" = NOW()
  WHERE "contactId" = p_contact_id AND status = 'OPEN'
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    INSERT INTO public."FollowUpLoginIssue" ("contactId", "reportedById", description)
    VALUES (p_contact_id, v_actor_id, btrim(p_description))
    RETURNING * INTO v_row;
  END IF;

  RETURN json_build_object(
    'id', v_row.id,
    'contactId', v_row."contactId",
    'description', v_row.description,
    'status', v_row.status,
    'createdAt', v_row."createdAt",
    'updatedAt', v_row."updatedAt"
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.report_followup_login_issue(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.report_followup_login_issue(UUID, TEXT) TO anon, authenticated;

-- ── 4. The IT issues tab ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.it_login_issues(p_cohort_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_id UUID;
  v_is_admin BOOLEAN;
  v_is_it BOOLEAN;
  v_issues JSON;
BEGIN
  IF NOT public.app_is_staff() THEN
    RAISE EXCEPTION 'You must be signed in as a support or admin';
  END IF;
  v_actor_id := public.app_current_user_id();
  v_is_admin := public.app_is_admin();

  v_is_it := EXISTS (
    SELECT 1 FROM public."HubItSupport" hi
    JOIN public."SupportHub" h ON h.id = hi."hubId"
    WHERE hi."userId" = v_actor_id AND h."cohortId" = p_cohort_id
  );

  IF NOT v_is_it AND NOT v_is_admin THEN
    RETURN json_build_object('isItSupport', false, 'issues', '[]'::json);
  END IF;

  SELECT COALESCE(json_agg(row_to_json(x) ORDER BY (x.status = 'OPEN') DESC, x."createdAt" DESC), '[]'::json)
  INTO v_issues
  FROM (
    SELECT
      i.id,
      i."contactId",
      i.description,
      i.status,
      i.resolution,
      i."createdAt",
      i."updatedAt",
      i."resolvedAt",
      i."reportedById",
      rep.name AS "reportedByName",
      res.name AS "resolvedByName",
      c."fullName" AS "contactName",
      c.phone AS "contactPhone",
      c."registrationStatus",
      c."cohortId",
      co.name AS "cohortName",
      co."startDate" AS "cohortStartDate",
      c."ownerId",
      own.name AS "ownerName",
      own.phone AS "ownerPhone",
      EXISTS (
        SELECT 1 FROM public."Participant" p
        JOIN public."ParticipantAccount" a ON a."participantId" = p.id
        WHERE p."followUpContactId" = c.id
          AND (a."passwordSetAt" IS NOT NULL OR a."lastSignInAt" IS NOT NULL)
      ) AS "signedIn"
    FROM public."FollowUpLoginIssue" i
    JOIN public."FollowUpContact" c ON c.id = i."contactId"
    LEFT JOIN public."Cohort" co ON co.id = c."cohortId"
    LEFT JOIN public."User" own ON own.id = c."ownerId"
    LEFT JOIN public."User" rep ON rep.id = i."reportedById"
    LEFT JOIN public."User" res ON res.id = i."resolvedById"
    -- Same cohort scope as contactInCohortScope: this cohort, or no cohort.
    WHERE (c."cohortId" = p_cohort_id OR c."cohortId" IS NULL)
      AND (v_is_admin OR v_actor_id = ANY(public.followup_contact_it_support_ids(c.id, p_cohort_id)))
  ) x;

  RETURN json_build_object('isItSupport', v_is_it, 'issues', v_issues);
END;
$function$;

REVOKE ALL ON FUNCTION public.it_login_issues(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.it_login_issues(UUID) TO anon, authenticated;

-- ── 5. Mark a login problem sorted ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.resolve_followup_login_issue(p_issue_id UUID, p_note TEXT DEFAULT NULL)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_id UUID;
  v_issue public."FollowUpLoginIssue";
  v_contact public."FollowUpContact";
  v_signed_in BOOLEAN;
  v_outcome TEXT;
  v_first_name TEXT;
  v_url text;
  v_key text;
BEGIN
  IF NOT public.app_is_staff() THEN
    RAISE EXCEPTION 'You must be signed in as a support or admin';
  END IF;
  v_actor_id := public.app_current_user_id();

  SELECT * INTO v_issue FROM public."FollowUpLoginIssue" WHERE id = p_issue_id;
  IF v_issue.id IS NULL THEN
    RAISE EXCEPTION 'Login issue was not found';
  END IF;
  IF v_issue.status <> 'OPEN' THEN
    RAISE EXCEPTION 'This login issue is already resolved';
  END IF;

  IF NOT public.app_is_admin()
    AND NOT (v_actor_id = ANY(public.followup_contact_it_support_ids(v_issue."contactId", NULL)))
  THEN
    RAISE EXCEPTION 'Only an admin or IT Support can resolve a login issue';
  END IF;

  UPDATE public."FollowUpLoginIssue"
  SET status = 'RESOLVED',
      "resolvedById" = v_actor_id,
      "resolvedAt" = NOW(),
      resolution = NULLIF(btrim(COALESCE(p_note, '')), ''),
      "updatedAt" = NOW()
  WHERE id = p_issue_id
  RETURNING * INTO v_issue;

  v_signed_in := EXISTS (
    SELECT 1 FROM public."Participant" p
    JOIN public."ParticipantAccount" a ON a."participantId" = p.id
    WHERE p."followUpContactId" = v_issue."contactId"
      AND (a."passwordSetAt" IS NOT NULL OR a."lastSignInAt" IS NOT NULL)
  );

  IF v_signed_in THEN
    v_outcome := 'ACCESS_CONFIRMED';
    UPDATE public."FollowUpContact"
    SET "registrationStatus" = 'ACCESS_CONFIRMED',
        "replyStatus" = 'REPLIED',
        "nextAction" = 'CLOSE',
        "archivedAt" = COALESCE("archivedAt", NOW()),
        "updatedAt" = NOW()
    WHERE id = v_issue."contactId"
      AND "registrationStatus" IN ('REGISTERED', 'LOGIN_SHARED', 'LOGIN_ISSUE', 'ACCESS_CONFIRMED')
    RETURNING * INTO v_contact;
  ELSE
    -- Same columns as buildStatusPatch('LOGIN_SHARED'): open, still owed a sign-in.
    v_outcome := 'LOGIN_SHARED';
    UPDATE public."FollowUpContact"
    SET "registrationStatus" = 'LOGIN_SHARED',
        "replyStatus" = 'REPLIED',
        "nextAction" = 'SEND_MESSAGE',
        "archivedAt" = NULL,
        "updatedAt" = NOW()
    WHERE id = v_issue."contactId"
      AND "registrationStatus" IN ('REGISTERED', 'LOGIN_SHARED', 'LOGIN_ISSUE')
    RETURNING * INTO v_contact;
  END IF;

  -- Someone already moved them on by hand (e.g. Not interested, or already
  -- confirmed): leave the contact as it is and just close the issue.
  IF v_contact.id IS NULL THEN
    SELECT * INTO v_contact FROM public."FollowUpContact" WHERE id = v_issue."contactId";
    v_outcome := v_contact."registrationStatus";
  END IF;

  -- Tell the owner support. Nothing here may stop the resolve saving.
  BEGIN
    IF v_contact."ownerId" IS NOT NULL AND v_contact."ownerId" <> v_actor_id
      AND v_outcome IN ('ACCESS_CONFIRMED', 'LOGIN_SHARED') THEN
      SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'project_url';
      SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'push_reminders_service_key';

      IF v_url IS NULL OR v_key IS NULL THEN
        RAISE NOTICE 'resolve_followup_login_issue: vault secrets missing; skipping push';
      ELSE
        v_first_name := COALESCE(NULLIF(split_part(btrim(v_contact."fullName"), ' ', 1), ''), 'Your contact');
        PERFORM net.http_post(
          url := v_url || '/functions/v1/notify-users',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'apikey', v_key,
            'Authorization', 'Bearer ' || v_key
          ),
          body := jsonb_build_object(
            'userIds', jsonb_build_array(v_contact."ownerId"),
            'title', format('%s''s login issue is sorted', v_first_name),
            'body', CASE WHEN v_outcome = 'ACCESS_CONFIRMED'
              THEN format('%s is in the app. Their follow-up is done.', btrim(v_contact."fullName"))
              ELSE format('IT Support sorted %s''s login. They haven''t signed in yet, so check they can get in.', btrim(v_contact."fullName"))
            END,
            'path', '/support/mobilisation?tab=follow',
            'type', 'FOLLOWUP_TERMINAL'
          ),
          timeout_milliseconds := 25000
        );
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'resolve_followup_login_issue push failed: %', SQLERRM;
  END;

  RETURN json_build_object(
    'id', v_issue.id,
    'status', v_issue.status,
    'resolvedAt', v_issue."resolvedAt",
    'resolution', v_issue.resolution,
    'contactId', v_issue."contactId",
    'registrationStatus', v_outcome
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.resolve_followup_login_issue(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_followup_login_issue(UUID, TEXT) TO anon, authenticated;

-- ── 6. participant_login_details: let the contact's IT Support in ───────────
CREATE OR REPLACE FUNCTION public.participant_login_details(
  p_token TEXT,
  p_participant_id UUID DEFAULT NULL,
  p_follow_up_contact_id UUID DEFAULT NULL,
  p_issue BOOLEAN DEFAULT FALSE,
  p_new_code BOOLEAN DEFAULT FALSE
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  staff "User" := public.app_staff(p_token);
  person "Participant";
  account "ParticipantAccount";
  alphabet CONSTANT TEXT := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  random_bytes BYTEA;
  code TEXT;
  allowed BOOLEAN;
BEGIN
  IF staff.id IS NULL THEN
    RAISE EXCEPTION 'SESSION_EXPIRED';
  END IF;

  IF p_participant_id IS NOT NULL THEN
    SELECT * INTO person FROM "Participant" WHERE id = p_participant_id;
  ELSIF p_follow_up_contact_id IS NOT NULL THEN
    SELECT * INTO person FROM "Participant" WHERE "followUpContactId" = p_follow_up_contact_id;
  END IF;
  -- Older leads marked Registered may never have been added to Participants.
  IF person.id IS NULL THEN
    RETURN json_build_object('status', 'NO_PARTICIPANT');
  END IF;

  allowed := staff.role = 'ADMIN'
    OR (staff.role = 'SUPPORT' AND (
      EXISTS (
        SELECT 1 FROM "GroupParticipant" gp
        JOIN "Group" g ON g.id = gp."groupId"
        WHERE gp."participantId" = person.id AND g."supportId" = staff.id
      )
      OR EXISTS (
        SELECT 1 FROM "GroupParticipant" gp
        JOIN "Group" g ON g.id = gp."groupId"
        JOIN "CoverRequest" cr ON cr."supportId" = g."supportId"
        WHERE gp."participantId" = person.id
          AND cr."coverSupportId" = staff.id
          AND cr.status = 'ASSIGNED'
          AND NOW() BETWEEN cr."startsAt" AND cr."endsAt"
      )
      OR EXISTS (
        SELECT 1 FROM "FollowUpContact" f
        WHERE f.id = person."followUpContactId"
          AND (f."ownerId" = staff.id OR f."registeredById" = staff.id)
      )
      -- New: IT Support for this person's follow-up (their owner support's hub).
      OR (
        person."followUpContactId" IS NOT NULL
        AND staff.id = ANY(public.followup_contact_it_support_ids(person."followUpContactId", person."cohortId"))
      )
    ));
  IF NOT allowed THEN
    RAISE EXCEPTION 'NOT_ALLOWED';
  END IF;

  SELECT * INTO account FROM "ParticipantAccount" WHERE "participantId" = person.id;

  IF (p_issue AND account."participantId" IS NULL) OR (p_new_code AND account."participantId" IS NOT NULL) THEN
    IF public.fof_phone_key(person.phone) IS NULL THEN
      RAISE EXCEPTION 'NO_PHONE';
    END IF;

    random_bytes := gen_random_bytes(6);
    code := 'FOF-';
    FOR i IN 0..5 LOOP
      code := code || substr(alphabet, (get_byte(random_bytes, i) % length(alphabet)) + 1, 1);
    END LOOP;

    INSERT INTO "ParticipantAccount" (
      "participantId", password_hash, "setupCode", "mustChangePassword", "issuedById", "issuedAt", "passwordSetAt"
    )
    VALUES (person.id, crypt(code, gen_salt('bf', 10)), code, TRUE, staff.id, NOW(), NULL)
    ON CONFLICT ("participantId") DO UPDATE SET
      password_hash = EXCLUDED.password_hash,
      "setupCode" = EXCLUDED."setupCode",
      "mustChangePassword" = TRUE,
      "issuedById" = EXCLUDED."issuedById",
      "issuedAt" = EXCLUDED."issuedAt",
      "passwordSetAt" = NULL,
      "updatedAt" = NOW()
    RETURNING * INTO account;

    IF p_new_code THEN
      DELETE FROM "AppSession" WHERE "participantId" = person.id;
    END IF;
  END IF;

  RETURN json_build_object(
    'participantId', person.id,
    'name', person."fullName",
    'phone', person.phone,
    'status', CASE
      WHEN account."participantId" IS NULL THEN 'NONE'
      WHEN account."mustChangePassword" THEN 'CODE_READY'
      ELSE 'ACTIVE'
    END,
    'setupCode', CASE WHEN account."mustChangePassword" THEN account."setupCode" END,
    'issuedAt', account."issuedAt",
    'passwordSetAt', account."passwordSetAt",
    'lastSignInAt', account."lastSignInAt"
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.participant_login_details(TEXT, UUID, UUID, BOOLEAN, BOOLEAN) TO anon, authenticated;

-- ── 7. Who the ? button messages ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.my_help_contact(p_token TEXT, p_cohort_id UUID DEFAULT NULL)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  staff "User" := public.app_staff(p_token);
  person_id UUID;
  person "Participant";
  v_support_id UUID;
  v_cohort UUID;
  v_hub UUID;
  v_it "User";
BEGIN
  IF staff.id IS NOT NULL THEN
    IF staff.role = 'ADMIN' OR p_cohort_id IS NULL THEN
      RETURN NULL;
    END IF;
    v_support_id := staff.id;
    v_cohort := p_cohort_id;
  ELSE
    person_id := public.app_participant_id(p_token);
    IF person_id IS NULL THEN
      RAISE EXCEPTION 'SESSION_EXPIRED';
    END IF;
    SELECT * INTO person FROM "Participant" WHERE id = person_id;
    v_cohort := person."cohortId";

    -- During the programme: their group's support.
    SELECT g."supportId" INTO v_support_id
    FROM "GroupParticipant" gp
    JOIN "Group" g ON g.id = gp."groupId" AND g."cohortId" = person."cohortId"
    WHERE gp."participantId" = person_id
    LIMIT 1;

    -- No group yet: whoever is following them up.
    IF v_support_id IS NULL AND person."followUpContactId" IS NOT NULL THEN
      SELECT f."ownerId", COALESCE(v_cohort, f."cohortId") INTO v_support_id, v_cohort
      FROM "FollowUpContact" f WHERE f.id = person."followUpContactId";
    END IF;
  END IF;

  IF v_support_id IS NULL OR v_cohort IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT m."hubId" INTO v_hub
  FROM "HubMembership" m
  WHERE m."userId" = v_support_id AND m."cohortId" = v_cohort
  LIMIT 1;

  -- Next available IT person: the hub's own IT Support first (earliest
  -- added), then any other IT Support in this cohort's hubs (earliest added),
  -- skipping the caller and anyone without a usable number. None → NULL, and
  -- the app uses the support_contact setting.
  SELECT u.* INTO v_it
  FROM "HubItSupport" hi
  JOIN "SupportHub" h ON h.id = hi."hubId"
  JOIN "User" u ON u.id = hi."userId"
  WHERE h."cohortId" = v_cohort
    AND u."isActive" IS NOT FALSE
    AND NULLIF(btrim(COALESCE(u.phone, '')), '') IS NOT NULL
    AND (staff.id IS NULL OR u.id <> staff.id)
  ORDER BY (v_hub IS NOT NULL AND hi."hubId" = v_hub) DESC, hi."createdAt" ASC, u.name ASC
  LIMIT 1;

  IF v_it.id IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN json_build_object('name', v_it.name, 'phone', v_it.phone);
END;
$$;

REVOKE ALL ON FUNCTION public.my_help_contact(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_help_contact(TEXT, UUID) TO anon, authenticated;

-- Rollback:
--   DROP FUNCTION IF EXISTS public.my_help_contact(TEXT, UUID);
--   Re-run participant_login_details from 20260917110000_participant_accounts.sql.
--   DROP FUNCTION IF EXISTS public.resolve_followup_login_issue(UUID, TEXT);
--   DROP FUNCTION IF EXISTS public.it_login_issues(UUID);
--   DROP FUNCTION IF EXISTS public.report_followup_login_issue(UUID, TEXT);
--   DROP FUNCTION IF EXISTS public.followup_contact_it_support_ids(UUID, UUID);
--   DROP TABLE IF EXISTS public."FollowUpLoginIssue";  (loses the reported descriptions)


-- ── Signing in also closes an open login issue ─────────────────────────────
-- Same function as 20260928180000_followup_access_confirmed.sql, plus one
-- UPDATE: when a participant sets their own password, their open
-- FollowUpLoginIssue is marked RESOLVED ("They signed in by themselves.") so
-- it leaves the IT issues tab, and when one was actually closed the contact's
-- IT Support (followup_contact_it_support_ids) are told, same notify-users
-- pattern as the owner push.
CREATE OR REPLACE FUNCTION public.confirm_followup_access_on_password_set()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_contact RECORD;
  v_first_name TEXT;
  v_url text;
  v_key text;
  v_issues_closed INT := 0;
  v_it_ids UUID[];
BEGIN
  BEGIN
    SELECT c.id, c."fullName", c."ownerId" INTO v_contact
    FROM public."Participant" p
    JOIN public."FollowUpContact" c ON c.id = p."followUpContactId"
    WHERE p.id = NEW."participantId"
      AND c."registrationStatus" IN ('REGISTERED', 'LOGIN_SHARED', 'LOGIN_ISSUE')
    LIMIT 1;

    IF NOT FOUND THEN
      RETURN NEW;
    END IF;

    UPDATE public."FollowUpContact"
    SET "registrationStatus" = 'ACCESS_CONFIRMED',
        "replyStatus" = 'REPLIED',
        "nextAction" = 'CLOSE',
        "archivedAt" = COALESCE("archivedAt", now()),
        "updatedAt" = now()
    WHERE id = v_contact.id;

    -- They got in, so any open login issue for them is sorted too.
    UPDATE public."FollowUpLoginIssue"
    SET status = 'RESOLVED',
        "resolvedAt" = now(),
        resolution = 'They signed in by themselves.',
        "updatedAt" = now()
    WHERE "contactId" = v_contact.id AND status = 'OPEN';
    GET DIAGNOSTICS v_issues_closed = ROW_COUNT;

    -- Nobody to tell: no owner, and no login issue was closed.
    IF v_contact."ownerId" IS NULL AND v_issues_closed = 0 THEN
      RETURN NEW;
    END IF;

    SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'project_url';
    SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'push_reminders_service_key';

    IF v_url IS NULL OR v_key IS NULL THEN
      RAISE NOTICE 'confirm_followup_access_on_password_set: vault secrets missing; skipping push';
      RETURN NEW;
    END IF;

    v_first_name := COALESCE(NULLIF(split_part(trim(v_contact."fullName"), ' ', 1), ''), 'Your contact');

    -- They got in before IT Support marked it sorted: tell that IT Support.
    IF v_issues_closed > 0 THEN
      v_it_ids := public.followup_contact_it_support_ids(v_contact.id, NULL);
      IF COALESCE(array_length(v_it_ids, 1), 0) > 0 THEN
        BEGIN  -- a failed alert must not undo the status change above
          PERFORM net.http_post(
            url := v_url || '/functions/v1/notify-users',
            headers := jsonb_build_object(
              'Content-Type', 'application/json',
              'apikey', v_key,
              'Authorization', 'Bearer ' || v_key
            ),
            body := jsonb_build_object(
              'userIds', to_jsonb(v_it_ids),
              'title', format('%s got in', v_first_name),
              'body', format('%s signed in to the app by themselves, so their login issue is closed. No action needed.', trim(v_contact."fullName")),
              'path', '/support/mobilisation?tab=it',
              'type', 'FOLLOWUP_TERMINAL'
            ),
            timeout_milliseconds := 25000
          );
        EXCEPTION WHEN OTHERS THEN
          RAISE NOTICE 'confirm_followup_access_on_password_set: alert failed: %', SQLERRM;
        END;
      END IF;
    END IF;

    IF v_contact."ownerId" IS NULL THEN
      RETURN NEW;
    END IF;

    BEGIN  -- a failed alert must not undo the status change above
      PERFORM net.http_post(
        url := v_url || '/functions/v1/notify-users',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'apikey', v_key,
          'Authorization', 'Bearer ' || v_key
        ),
        body := jsonb_build_object(
          'userIds', jsonb_build_array(v_contact."ownerId"),
          'title', format('%s is in the app', v_first_name),
          'body', format('%s signed in to the FOF app. Their follow-up is done.', trim(v_contact."fullName")),
          'path', '/support/mobilisation?tab=follow',
          'type', 'FOLLOWUP_TERMINAL'
        ),
        timeout_milliseconds := 25000
      );

    EXCEPTION WHEN OTHERS THEN

      RAISE NOTICE 'confirm_followup_access_on_password_set: alert failed: %', SQLERRM;

    END;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'confirm_followup_access_on_password_set failed: %', SQLERRM;
  END;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.confirm_followup_access_on_password_set() FROM PUBLIC;
