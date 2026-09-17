-- Participant profile completion and admin "Request information".
--   - Every participant has a profile checklist: photo, email, gender, age range,
--     date of birth, occupation, plus any required fields admins request.
--   - Admins add fields and choose who they apply to: one or more cohorts (all or
--     selected groups) or specific participants. The rule is kept, so people who
--     join those cohorts or groups later get the field too.
--   - Optional fields are shown but do not count towards completion.
-- Staff read fields and answers like the other operational tables; participants
-- read and write their own through session-checked functions. Additive.

CREATE TABLE IF NOT EXISTS "ProfileField" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,
  "helpText" TEXT,
  "fieldType" TEXT NOT NULL CHECK ("fieldType" IN ('SHORT_TEXT', 'LONG_TEXT', 'DATE', 'CHOICE', 'YES_NO')),
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  required BOOLEAN NOT NULL DEFAULT TRUE,
  -- Who it applies to: participants in these cohorts (all groups when groupIds is
  -- NULL, otherwise only these groups), or only these participants when set.
  "cohortIds" UUID[] NOT NULL DEFAULT '{}',
  "groupIds" UUID[],
  "participantIds" UUID[],
  "createdById" UUID REFERENCES "User"(id) ON DELETE SET NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Set when admins stop asking. Answers are kept.
  "archivedAt" TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS "ProfileFieldAnswer" (
  "fieldId" UUID NOT NULL REFERENCES "ProfileField"(id) ON DELETE CASCADE,
  "participantId" UUID NOT NULL REFERENCES "Participant"(id) ON DELETE CASCADE,
  value TEXT,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("fieldId", "participantId")
);

ALTER TABLE "ProfileField" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all operations" ON "ProfileField";
CREATE POLICY "Allow all operations" ON "ProfileField" FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE "ProfileFieldAnswer" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all operations" ON "ProfileFieldAnswer";
CREATE POLICY "Allow all operations" ON "ProfileFieldAnswer" FOR ALL USING (true) WITH CHECK (true);

-- ── Helpers ──────────────────────────────────────────────────────────────────

-- Whether an active requested field applies to a participant.
CREATE OR REPLACE FUNCTION public.profile_field_applies(f "ProfileField", p_participant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT f."archivedAt" IS NULL AND (
    CASE
      WHEN COALESCE(array_length(f."participantIds", 1), 0) > 0 THEN p_participant_id = ANY (f."participantIds")
      ELSE EXISTS (
        SELECT 1 FROM "Participant" p
        WHERE p.id = p_participant_id
          AND p."cohortId" = ANY (f."cohortIds")
          AND (
            f."groupIds" IS NULL
            OR EXISTS (SELECT 1 FROM "GroupParticipant" gp WHERE gp."participantId" = p.id AND gp."groupId" = ANY (f."groupIds"))
          )
      )
    END
  );
$$;

-- The requested fields that apply to a participant, with their answers.
CREATE OR REPLACE FUNCTION public.participant_profile_fields(p_participant_id UUID)
RETURNS JSON
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT COALESCE(json_agg(json_build_object(
    'id', f.id, 'label', f.label, 'helpText', f."helpText", 'fieldType', f."fieldType",
    'options', f.options, 'required', f.required, 'value', a.value
  ) ORDER BY f."createdAt"), '[]'::json)
  FROM "ProfileField" f
  LEFT JOIN "ProfileFieldAnswer" a ON a."fieldId" = f.id AND a."participantId" = p_participant_id
  WHERE public.profile_field_applies(f, p_participant_id);
$$;

-- Completion: photo, email, gender, age range, date of birth, occupation (the
-- lead's occupation counts), and every required requested field that applies.
CREATE OR REPLACE FUNCTION public.profile_completion_for(p_participant_id UUID)
RETURNS JSON
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  WITH p AS (
    SELECT pa.*, (SELECT f.occupation FROM "FollowUpContact" f WHERE f.id = pa."followUpContactId") AS lead_occupation
    FROM "Participant" pa WHERE pa.id = p_participant_id
  ),
  checks AS (
    SELECT unnest(ARRAY[
      NULLIF(trim(COALESCE(p."avatarUrl", '')), '') IS NOT NULL,
      NULLIF(trim(COALESCE(p.email, '')), '') IS NOT NULL,
      NULLIF(trim(COALESCE(p.gender, '')), '') IS NOT NULL,
      NULLIF(trim(COALESCE(p."ageRange", '')), '') IS NOT NULL,
      p."dateOfBirth" IS NOT NULL,
      NULLIF(trim(COALESCE(p.occupation, p.lead_occupation, '')), '') IS NOT NULL
    ]) AS done
    FROM p
    UNION ALL
    SELECT NULLIF(trim(COALESCE(a.value, '')), '') IS NOT NULL
    FROM "ProfileField" f
    LEFT JOIN "ProfileFieldAnswer" a ON a."fieldId" = f.id AND a."participantId" = p_participant_id
    WHERE f.required AND public.profile_field_applies(f, p_participant_id)
  )
  SELECT json_build_object(
    'percent', CASE WHEN count(*) = 0 THEN 100 ELSE round(100.0 * count(*) FILTER (WHERE done) / count(*))::int END,
    'missing', count(*) FILTER (WHERE NOT done)
  )
  FROM checks;
$$;

-- ── Participant: home (adds requested fields and completion) ─────────────────

CREATE OR REPLACE FUNCTION public.participant_home(p_token TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  person_id UUID := public.app_participant_id(p_token);
  person "Participant";
  cohort "Cohort";
  grp "Group";
  support "User";
BEGIN
  IF person_id IS NULL THEN
    RAISE EXCEPTION 'SESSION_EXPIRED';
  END IF;

  SELECT * INTO person FROM "Participant" WHERE id = person_id;
  SELECT * INTO cohort FROM "Cohort" WHERE id = person."cohortId";
  SELECT g.* INTO grp
  FROM "GroupParticipant" gp
  JOIN "Group" g ON g.id = gp."groupId" AND g."cohortId" = person."cohortId"
  WHERE gp."participantId" = person_id
  LIMIT 1;
  SELECT * INTO support FROM "User" WHERE id = grp."supportId";

  RETURN json_build_object(
    'now', NOW(),
    'participant', json_build_object('id', person.id, 'name', person."fullName", 'phone', person.phone),
    'cohort', CASE WHEN cohort.id IS NULL THEN NULL ELSE json_build_object(
      'id', cohort.id, 'name', cohort.name, 'startDate', cohort."startDate", 'endDate', cohort."endDate",
      'status', cohort.status, 'venue', cohort.venue
    ) END,
    'group', CASE WHEN grp.id IS NULL THEN NULL ELSE json_build_object(
      'id', grp.id, 'name', grp.name, 'meetingDay', grp."meetingDay", 'meetingTime', grp."meetingTime",
      'meetingDurationMins', grp."meetingDurationMins", 'callPlatform', grp."callPlatform", 'callLink', grp."callLink",
      'supportName', support.name, 'supportPhone', support.phone
    ) END,
    'weeks', COALESCE((
      SELECT json_agg(json_build_object(
        'id', w.id,
        'weekNumber', w."weekNumber",
        'title', w.title,
        'classTime', (
          SELECT a.time FROM "Day" d JOIN "Activity" a ON a."dayId" = d.id
          WHERE d."weekId" = w.id AND d."dayName" = 'Sunday' AND a.description ~* '^\s*class\s*[0-9]|introductory class'
          ORDER BY a.time LIMIT 1
        ),
        'expectations', w.expectations,
        'shared', w."shareWithParticipants",
        'released', rel.released,
        'releasedAt', rel."releasedAt",
        'recapSummary', CASE WHEN rel.released THEN w."recapSummary" END,
        'discussionPrompt', CASE WHEN rel.released THEN w."discussionPrompt" END,
        'recapDocumentUrl', CASE WHEN rel.released THEN w."recapDocumentUrl" END,
        'recapDocumentName', CASE WHEN rel.released THEN w."recapDocumentName" END
      ) ORDER BY w."weekNumber")
      FROM "Week" w
      CROSS JOIN LATERAL (
        SELECT
          COALESCE(w."shareWithParticipants" AND (
            r."releasedAt" IS NOT NULL
            OR NOW() >= public.recap_auto_release_at(cohort."startDate", w."weekNumber", grp."meetingDay", grp."meetingTime")
          ), FALSE) AS released,
          COALESCE(r."releasedAt", public.recap_auto_release_at(cohort."startDate", w."weekNumber", grp."meetingDay", grp."meetingTime")) AS "releasedAt"
        FROM (SELECT 1) one
        LEFT JOIN "RecapRelease" r ON r."groupId" = grp.id AND r."weekId" = w.id
      ) rel
      WHERE w."cohortId" = person."cohortId"
    ), '[]'::json),
    'reflections', COALESCE((
      SELECT json_agg(json_build_object(
        'weekId', r."weekId", 'stoodOut', r."stoodOut", 'goal', r.goal, 'goalCheck', r."goalCheck",
        'goalDoneAt', r."goalDoneAt", 'createdAt', r."createdAt", 'updatedAt', r."updatedAt"
      ))
      FROM "Reflection" r WHERE r."participantId" = person_id
    ), '[]'::json),
    'sunday', COALESCE((
      SELECT json_agg(json_build_object('weekId', a."weekId", 'status', a.status))
      FROM "AttendanceRecord" a JOIN "Week" w ON w.id = a."weekId" AND w."cohortId" = person."cohortId"
      WHERE a."participantId" = person_id
    ), '[]'::json),
    'meeting', COALESCE((
      SELECT json_agg(json_build_object('weekId', m."weekId", 'status', m.status))
      FROM "MeetingAttendance" m JOIN "Week" w ON w.id = m."weekId" AND w."cohortId" = person."cohortId"
      WHERE m."participantId" = person_id
    ), '[]'::json),
    'faithProjectStatus', (SELECT f.status FROM "FaithProject" f WHERE f."participantId" = person_id ORDER BY f."updatedAt" DESC LIMIT 1),
    'rules', (SELECT value FROM "AppSetting" WHERE "settingKey" = 'programme_rules'),
    'scriptures', COALESCE((
      SELECT json_agg(json_build_object('dayNumber', sc."dayNumber", 'imageUrl', sc."imageUrl") ORDER BY sc."dayNumber")
      FROM "Scripture" sc
    ), '[]'::json),
    'members', COALESCE((
      SELECT json_agg(json_build_object('name', m."fullName") ORDER BY m."fullName")
      FROM "GroupParticipant" gp JOIN "Participant" m ON m.id = gp."participantId"
      WHERE gp."groupId" = grp.id AND m.id <> person_id AND m.status = 'ACTIVE'
    ), '[]'::json),
    'profile', json_build_object(
      'email', person.email,
      'avatarUrl', person."avatarUrl",
      'gender', person.gender,
      'ageRange', person."ageRange",
      'dateOfBirth', person."dateOfBirth",
      -- Occupation from the lead registration when they haven't added their own.
      'occupation', COALESCE(person.occupation, (SELECT f.occupation FROM "FollowUpContact" f WHERE f.id = person."followUpContactId"))
    ),
    'faithUnread', EXISTS (
      SELECT 1 FROM "ParticipantNote" n
      WHERE n."participantId" = person_id AND n."noteType" = 'FAITH_COACH' AND NOT n."byParticipant"
        AND n."createdAt" > GREATEST(
          COALESCE((SELECT t."coachLastReadAt" FROM "ParticipantThreadRead" t WHERE t."participantId" = person_id), '-infinity'::timestamptz),
          '2026-09-17T02:00:00Z'::timestamptz)
    ),
    'reminders', (
      SELECT json_build_object(
        'meetingRemindMinutes', COALESCE(rs."meetingRemindMinutes", '[60]'::jsonb),
        'recapReleased', COALESCE(rs."recapReleased", TRUE)
      )
      FROM (SELECT 1) one LEFT JOIN "ParticipantReminderSetting" rs ON rs."participantId" = person_id
    ),
    'resources', COALESCE((
      SELECT json_agg(json_build_object('id', r.id, 'title', r.title, 'description', r.description, 'type', r.type, 'url', r.url, 'fileName', r."fileName") ORDER BY r.title)
      FROM "Resource" r WHERE r."visibleToParticipants"
    ), '[]'::json),
    'announcement', (
      SELECT json_build_object('id', a.id, 'subject', a.subject, 'body', a.body, 'linkUrl', a."linkUrl", 'linkLabel', a."linkLabel")
      FROM "Announcement" a
      WHERE a."showOnHome" AND a."homeUntil" > NOW() AND a.audience IN ('PARTICIPANTS', 'EVERYONE')
        AND (a.scope = 'ALL_USERS' OR a."cohortId" IS NULL OR a."cohortId" = person."cohortId")
      ORDER BY a."sentAt" DESC LIMIT 1
    ),
    'wrapUp', json_build_object(
      'submitted', EXISTS (SELECT 1 FROM "ParticipantWrapUp" w WHERE w."participantId" = person_id AND w."cohortId" = person."cohortId")
    ),
    'profileFields', public.participant_profile_fields(person_id),
    'profileCompletion', public.profile_completion_for(person_id),
    'lastCheckIn', (
      SELECT json_build_object('response', c.response, 'sundayMisses', c."sundayMisses", 'meetingMisses', c."meetingMisses", 'createdAt', c."createdAt")
      FROM "ParticipantCheckIn" c WHERE c."participantId" = person_id
      ORDER BY c."createdAt" DESC LIMIT 1
    )
  );
END;
$$;

-- ── Participant: save their profile ──────────────────────────────────────────

-- Saves the built-in details and the answers to requested fields that apply to them.
CREATE OR REPLACE FUNCTION public.save_participant_profile(
  p_token TEXT,
  p_email TEXT,
  p_gender TEXT,
  p_age_range TEXT,
  p_occupation TEXT,
  p_date_of_birth DATE,
  p_answers JSONB
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  person_id UUID := public.app_participant_id(p_token);
  cleaned_email TEXT := NULLIF(lower(trim(COALESCE(p_email, ''))), '');
  entry RECORD;
BEGIN
  IF person_id IS NULL THEN
    RAISE EXCEPTION 'SESSION_EXPIRED';
  END IF;
  IF cleaned_email IS NOT NULL AND cleaned_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'INVALID_EMAIL';
  END IF;
  IF p_date_of_birth IS NOT NULL AND (p_date_of_birth > CURRENT_DATE OR p_date_of_birth < DATE '1900-01-01') THEN
    RAISE EXCEPTION 'INVALID_DATE_OF_BIRTH';
  END IF;

  UPDATE "Participant"
  SET email = cleaned_email,
      gender = NULLIF(trim(COALESCE(p_gender, '')), ''),
      "ageRange" = NULLIF(trim(COALESCE(p_age_range, '')), ''),
      occupation = NULLIF(trim(COALESCE(p_occupation, '')), ''),
      "dateOfBirth" = p_date_of_birth,
      "updatedAt" = NOW()
  WHERE id = person_id;

  FOR entry IN SELECT key, value FROM jsonb_each_text(COALESCE(p_answers, '{}'::jsonb)) LOOP
    IF EXISTS (
      SELECT 1 FROM "ProfileField" f
      WHERE f.id::text = entry.key AND public.profile_field_applies(f, person_id)
    ) THEN
      INSERT INTO "ProfileFieldAnswer" ("fieldId", "participantId", value, "updatedAt")
      VALUES (entry.key::uuid, person_id, NULLIF(trim(COALESCE(entry.value, '')), ''), NOW())
      ON CONFLICT ("fieldId", "participantId") DO UPDATE SET value = EXCLUDED.value, "updatedAt" = NOW();
    END IF;
  END LOOP;

  RETURN public.profile_completion_for(person_id);
END;
$$;

-- ── Staff: completion across a cohort, and answers per field ─────────────────

CREATE OR REPLACE FUNCTION public.cohort_profile_completion(p_cohort_id UUID)
RETURNS JSON
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT COALESCE(json_agg(json_build_object('participantId', p.id, 'completion', public.profile_completion_for(p.id))), '[]'::json)
  FROM "Participant" p WHERE p."cohortId" = p_cohort_id;
$$;

-- For each requested field: how many it applies to right now and how many answered.
CREATE OR REPLACE FUNCTION public.profile_field_summary()
RETURNS JSON
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT COALESCE(json_agg(json_build_object(
    'fieldId', f.id,
    'applies', (SELECT count(*) FROM "Participant" p WHERE p.status = 'ACTIVE' AND public.profile_field_applies(f, p.id)),
    'answered', (
      SELECT count(*) FROM "ProfileFieldAnswer" a JOIN "Participant" p ON p.id = a."participantId"
      WHERE a."fieldId" = f.id AND NULLIF(trim(COALESCE(a.value, '')), '') IS NOT NULL AND p.status = 'ACTIVE'
    )
  )), '[]'::json)
  FROM "ProfileField" f;
$$;

-- A participant's completion and the requested fields that apply, with answers
-- (participant profile and support cards).
CREATE OR REPLACE FUNCTION public.participant_profile_overview(p_participant_id UUID)
RETURNS JSON
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT json_build_object(
    'completion', public.profile_completion_for(p_participant_id),
    'fields', public.participant_profile_fields(p_participant_id)
  );
$$;

REVOKE ALL ON FUNCTION public.profile_field_applies("ProfileField", UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.participant_profile_fields(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.profile_completion_for(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_participant_profile(TEXT, TEXT, TEXT, TEXT, TEXT, DATE, JSONB) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cohort_profile_completion(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.profile_field_summary() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.participant_profile_overview(UUID) TO anon, authenticated;
