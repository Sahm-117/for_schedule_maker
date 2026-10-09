-- Teen groups follow the builder's group sizes, and an admin can move a teen to another Teen Support.
--
--   * teen_cap_for(cohort, gender): the most teens one Teen Support holds. The largest group size set for that gender in the
--     cohort's group-builder rules (grouping_rules_<cohort>.genderSizes.<Male|Female>.maxSize) when there is one, else
--     programme_rules.maxTeensPerTeenSupport, else 4. assign_teen_contacts uses it per teen, so a male and a female Teen Support can
--     have different limits. (Only that function changes; everything else in it is the live definition.)
--   * admin_teen_move_targets(participant): who a teen can be moved to: active Teen Supports of the same gender, with how many teens
--     each has and the limit. Admins only.
--   * admin_move_teen(participant, new support, force): admins only. The new support must be a same-gender Teen Support
--     (teen_owner_guard also enforces it); refused when that support is at the limit unless p_force. Records the move in
--     FollowUpReassignmentLog (who moved it, from, to), tells both supports, and the teen group sync puts the teen in the new
--     support's teen group. Safeguarding policy: a teen keeps one support throughout; only an admin moves a teen, by hand, and the
--     move is recorded.
--
-- Rollback: DROP FUNCTION admin_move_teen(uuid, uuid, boolean), admin_teen_move_targets(uuid), teen_cap_for(uuid, text); restore
-- assign_teen_contacts from 20261006180000_teen_assignment.sql (v_max).
-- Idempotent.

CREATE OR REPLACE FUNCTION public.teen_cap_for(p_cohort uuid, p_gender text)
RETURNS int
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
  SELECT COALESCE(
    (SELECT NULLIF((value->'genderSizes'->p_gender->>'maxSize'), '')::int FROM "AppSetting"
      WHERE "settingKey" = 'grouping_rules_' || COALESCE(p_cohort, public.current_programme_cohort_id())::text),
    (SELECT NULLIF((value->>'maxTeensPerTeenSupport'), '')::int FROM "AppSetting" WHERE "settingKey" = 'programme_rules'),
    4
  )
$function$;

CREATE OR REPLACE FUNCTION public.assign_teen_contacts(p_only_contact uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_enabled JSONB;
  v_tag UUID;
  v_max INT;
  v_load JSONB := '{}'::jsonb;      -- "<cohortId|''>|<ownerId>" -> teens held
  v_batches JSONB := '{}'::jsonb;   -- ownerId -> {"count": n, "names": [...]}
  v_stuck JSONB := '[]'::jsonb;
  v_assigned INT := 0;
  rec RECORD;
  v_target UUID;
  v_key TEXT;
  v_batch JSONB;
  v_names JSONB;
BEGIN
  SELECT value INTO v_enabled FROM "AppSetting" WHERE "settingKey" = 'teen_flow_enabled';
  IF v_enabled IS DISTINCT FROM to_jsonb(true) THEN
    RETURN jsonb_build_object('enabled', false, 'assigned', 0, 'batches', '{}'::jsonb, 'stuck', '[]'::jsonb);
  END IF;

  -- One run at a time: the cron, "Assign now" and teen_add_prospect must not each
  -- read the same loads and then all give a support their 4th teen.
  PERFORM pg_advisory_xact_lock(hashtext('assign_teen_contacts'));

  SELECT id INTO v_tag FROM "SupportTag" WHERE "systemKey" = 'TEEN_SUPPORT';
  SELECT COALESCE((value->>'maxTeensPerTeenSupport')::int, 4) INTO v_max
  FROM "AppSetting" WHERE "settingKey" = 'programme_rules';
  IF v_max IS NULL THEN v_max := 4; END IF;

  -- Every teen a support already holds counts, onboarded or not.
  FOR rec IN
    SELECT COALESCE(c."cohortId"::text, '') || '|' || c."ownerId"::text AS k, COUNT(*) AS cnt
    FROM "FollowUpContact" c
    WHERE c."ownerId" IS NOT NULL AND c."isTest" IS NOT TRUE AND c."archivedAt" IS NULL
      AND c."registrationStatus" IN ('TEENAGER', 'TEEN_ONBOARDED')
    GROUP BY 1
  LOOP
    v_load := jsonb_set(v_load, ARRAY[rec.k], to_jsonb(rec.cnt));
  END LOOP;

  FOR rec IN
    SELECT * FROM "FollowUpContact" c
    WHERE c."ownerId" IS NULL AND c."archivedAt" IS NULL AND c."isTest" IS NOT TRUE
      AND c."registrationStatus" = 'TEENAGER'
      AND (p_only_contact IS NULL OR c.id = p_only_contact)
      -- The sweep only looks at the current cohort (or contacts with none yet), so an
      -- old cohort's leftover teen never takes a slot.
      AND (p_only_contact IS NOT NULL OR c."cohortId" IS NULL OR c."cohortId" = public.current_programme_cohort_id())
    ORDER BY c."createdAt" ASC
  LOOP
    IF NOT (public.followup_phone_is_valid(rec.phone) OR public.followup_phone_is_valid(rec."guardianPhone")) THEN
      v_stuck := v_stuck || jsonb_build_array(jsonb_build_object('contactId', rec.id, 'name', rec."fullName", 'reason', 'NO_NUMBER', 'createdAt', rec."createdAt"));
      CONTINUE;
    END IF;
    IF rec.gender IS NULL OR rec.gender NOT IN ('Male', 'Female') THEN
      v_stuck := v_stuck || jsonb_build_array(jsonb_build_object('contactId', rec.id, 'name', rec."fullName", 'reason', 'NO_GENDER', 'createdAt', rec."createdAt"));
      CONTINUE;
    END IF;

    v_target := NULL;

    -- Whoever added them, if they are a same-gender Teen Support with room.
    IF rec."registeredById" IS NOT NULL THEN
      SELECT u.id INTO v_target
      FROM "User" u
      JOIN "SupportTagMember" m ON m."userId" = u.id AND m."tagId" = v_tag
      WHERE u.id = rec."registeredById"
        AND u.role IN ('SUPPORT', 'ADMIN') AND u."isActive" IS NOT FALSE AND u."isTest" IS NOT TRUE
        AND u.gender = rec.gender
        AND (public.teen_quiet_bypass() OR NOT public.followup_owner_is_quiet(u.id))
        AND COALESCE((v_load->>(COALESCE(rec."cohortId"::text, '') || '|' || u.id::text))::int, 0) < public.teen_cap_for(rec."cohortId", rec.gender);
    END IF;

    -- Same gender, fewest teens first, ties by name.
    IF v_target IS NULL THEN
      SELECT u.id INTO v_target
      FROM "User" u
      JOIN "SupportTagMember" m ON m."userId" = u.id AND m."tagId" = v_tag
      WHERE u.role IN ('SUPPORT', 'ADMIN') AND u."isActive" IS NOT FALSE AND u."isTest" IS NOT TRUE
        AND u.gender = rec.gender
        AND (public.teen_quiet_bypass() OR NOT public.followup_owner_is_quiet(u.id))
        AND COALESCE((v_load->>(COALESCE(rec."cohortId"::text, '') || '|' || u.id::text))::int, 0) < public.teen_cap_for(rec."cohortId", rec.gender)
      ORDER BY COALESCE((v_load->>(COALESCE(rec."cohortId"::text, '') || '|' || u.id::text))::int, 0) ASC, u.name ASC
      LIMIT 1;
    END IF;

    IF v_target IS NULL THEN
      v_stuck := v_stuck || jsonb_build_array(jsonb_build_object('contactId', rec.id, 'name', rec."fullName", 'reason', 'NO_SAME_GENDER_ROOM', 'createdAt', rec."createdAt"));
      CONTINUE;
    END IF;

    UPDATE "FollowUpContact"
    SET "ownerId" = v_target, "updatedAt" = now()
    WHERE id = rec.id;

    v_key := COALESCE(rec."cohortId"::text, '') || '|' || v_target::text;
    v_load := jsonb_set(v_load, ARRAY[v_key], to_jsonb(COALESCE((v_load->>v_key)::int, 0) + 1));

    v_batch := COALESCE(v_batches->v_target::text, jsonb_build_object('count', 0, 'names', '[]'::jsonb));
    v_names := COALESCE(v_batch->'names', '[]'::jsonb);
    IF jsonb_array_length(v_names) < 3 THEN v_names := v_names || to_jsonb(rec."fullName"); END IF;
    v_batch := jsonb_set(v_batch, ARRAY['count'], to_jsonb(COALESCE((v_batch->>'count')::int, 0) + 1));
    v_batch := jsonb_set(v_batch, ARRAY['names'], v_names);
    v_batches := jsonb_set(v_batches, ARRAY[v_target::text], v_batch);

    v_assigned := v_assigned + 1;
  END LOOP;

  RETURN jsonb_build_object('enabled', true, 'assigned', v_assigned, 'batches', v_batches, 'stuck', v_stuck);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_teen_move_targets(p_participant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  rec "Participant";
  c "FollowUpContact";
  v_gender TEXT;
BEGIN
  IF NOT public.app_is_admin() THEN RAISE EXCEPTION 'Only admins can move a teen'; END IF;
  SELECT * INTO rec FROM "Participant" WHERE id = p_participant_id;
  IF rec.id IS NULL OR rec."followUpContactId" IS NULL THEN RETURN '[]'::jsonb; END IF;
  SELECT * INTO c FROM "FollowUpContact" WHERE id = rec."followUpContactId";
  v_gender := COALESCE(NULLIF(c.gender, ''), rec.gender);
  IF c.id IS NULL OR v_gender NOT IN ('Male', 'Female') THEN RETURN '[]'::jsonb; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'userId', u.id, 'name', u.name,
      'count', (SELECT count(*) FROM "FollowUpContact" x
                 WHERE x."ownerId" = u.id AND x."isTest" IS NOT TRUE AND x."archivedAt" IS NULL
                   AND x."registrationStatus" IN ('TEENAGER', 'TEEN_ONBOARDED') AND x."cohortId" IS NOT DISTINCT FROM c."cohortId"),
      'cap', public.teen_cap_for(c."cohortId", v_gender),
      'current', u.id = c."ownerId"
    ) ORDER BY u.name)
    FROM "User" u
    JOIN "SupportTagMember" m ON m."userId" = u.id
    JOIN "SupportTag" t ON t.id = m."tagId" AND t."systemKey" = 'TEEN_SUPPORT'
    WHERE u."isActive" IS NOT FALSE AND u."isTest" IS NOT TRUE AND u.gender = v_gender
  ), '[]'::jsonb);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_move_teen(p_participant_id uuid, p_to_support uuid, p_force boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_me UUID := public.app_current_user_id();
  rec "Participant";
  c "FollowUpContact";
  v_gender TEXT;
  v_cap INT;
  v_count INT;
  v_from UUID;
  v_me_name TEXT;
  v_to_name TEXT;
BEGIN
  IF NOT public.app_is_admin() THEN RAISE EXCEPTION 'Only admins can move a teen'; END IF;
  SELECT * INTO rec FROM "Participant" WHERE id = p_participant_id;
  IF rec.id IS NULL OR rec."followUpContactId" IS NULL THEN RAISE EXCEPTION 'That person has no teen record to move'; END IF;
  SELECT * INTO c FROM "FollowUpContact" WHERE id = rec."followUpContactId";
  IF c.id IS NULL OR c."registrationStatus"::text NOT IN ('TEENAGER', 'TEEN_ONBOARDED') THEN RAISE EXCEPTION 'Only teens can be moved here'; END IF;
  v_gender := COALESCE(NULLIF(c.gender, ''), rec.gender);
  IF v_gender NOT IN ('Male', 'Female') THEN RAISE EXCEPTION 'This teen has no gender on file'; END IF;
  IF c."ownerId" IS NOT DISTINCT FROM p_to_support THEN RAISE EXCEPTION 'They are already with that Teen Support'; END IF;

  SELECT u.name INTO v_to_name
  FROM "User" u
  JOIN "SupportTagMember" m ON m."userId" = u.id
  JOIN "SupportTag" t ON t.id = m."tagId" AND t."systemKey" = 'TEEN_SUPPORT'
  WHERE u.id = p_to_support AND u."isActive" IS NOT FALSE AND u.gender = v_gender;
  IF v_to_name IS NULL THEN RAISE EXCEPTION 'A teen can only go to a Teen Support of the same gender'; END IF;

  v_cap := public.teen_cap_for(c."cohortId", v_gender);
  SELECT count(*) INTO v_count FROM "FollowUpContact" x
   WHERE x."ownerId" = p_to_support AND x."isTest" IS NOT TRUE AND x."archivedAt" IS NULL
     AND x."registrationStatus" IN ('TEENAGER', 'TEEN_ONBOARDED') AND x."cohortId" IS NOT DISTINCT FROM c."cohortId";
  IF v_count >= v_cap AND NOT COALESCE(p_force, FALSE) THEN
    RAISE EXCEPTION 'FULL: % already has % teens (limit %)', v_to_name, v_count, v_cap;
  END IF;

  v_from := c."ownerId";
  SELECT name INTO v_me_name FROM "User" WHERE id = v_me;

  UPDATE "FollowUpContact" SET "ownerId" = p_to_support, "ownerAssignedAt" = now(), "updatedAt" = now() WHERE id = c.id;

  INSERT INTO "FollowUpReassignmentLog" ("contactId", "fromUserId", "toUserId", reason)
  VALUES (c.id, v_from, p_to_support, 'Moved by admin ' || COALESCE(v_me_name, 'unknown') || CASE WHEN v_count >= v_cap THEN ' (over the limit)' ELSE '' END);

  IF v_from IS NOT NULL THEN
    INSERT INTO "Notification" ("userId", title, body, path, type)
    VALUES (v_from, 'A teen moved to another Teen Support', rec."fullName" || ' now goes to ' || v_to_name || ' and is off your list.', '/support/mobilisation?tab=follow', 'FOLLOWUP_ASSIGNMENT');
  END IF;
  INSERT INTO "Notification" ("userId", title, body, path, type)
  VALUES (p_to_support, 'A teen was added to your list', rec."fullName" || ' now goes to you as their Teen Support.', '/support/mobilisation?tab=follow', 'FOLLOWUP_ASSIGNMENT');

  RETURN jsonb_build_object('moved', TRUE, 'toName', v_to_name, 'count', v_count + 1, 'cap', v_cap);
END;
$function$;

REVOKE ALL ON FUNCTION public.teen_cap_for(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_teen_move_targets(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_move_teen(uuid, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.teen_cap_for(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_teen_move_targets(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_move_teen(uuid, uuid, boolean) TO anon, authenticated;
