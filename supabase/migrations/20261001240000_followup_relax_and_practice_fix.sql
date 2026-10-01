-- 1. Practice mode could not be switched off from Settings: "UPDATE requires a WHERE
--    clause". The API role runs with pg-safeupdate, which refuses an UPDATE with no
--    WHERE, and two of my practice functions had one. Both now say WHERE TRUE.
-- 2. Staged relaxation of the follow-up rules, so someone is not left unassigned just
--    because no same-gender support has room. Tried in order, only when the strict
--    rules (same gender, seen in the last week, under the limit) found nobody:
--      a) whoever added them, any gender, if active and under the limit  (switch: followup_relax_adder, default on)
--      b) any active support, any gender, under the limit, fewest open    (followup_relax_any_gender, default on)
--      c) ignore the limit: same gender first, fewest open                (followup_relax_over_limit, default OFF)
--    Applies to automatic assignment and to reassignment of people who did not move.
--    People with no gender on file are still held for an admin, as before.
--
-- Rollback: restore run_followup_assignment / run_followup_reassignment from their
-- earlier migrations; drop followup_relax_on.

CREATE OR REPLACE FUNCTION public.practice_set_on(p_on BOOLEAN)
 RETURNS VOID
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_c UUID;
BEGIN
  IF NOT public.app_is_admin() THEN
    RAISE EXCEPTION 'Only admins can switch Practice';
  END IF;
  v_c := public.practice_prepare();
  UPDATE public."Cohort" SET "practiceOn" = COALESCE(p_on, FALSE), "updatedAt" = NOW() WHERE id = v_c;
  IF NOT COALESCE(p_on, FALSE) THEN
    UPDATE public."PracticePeer"
       SET status = CASE WHEN status = 'PENDING' THEN 'CANCELLED' ELSE 'ENDED' END, "endedAt" = NOW(), "respondedAt" = COALESCE("respondedAt", NOW())
     WHERE status IN ('ACTIVE', 'PENDING');
    UPDATE public."PracticeMember" SET "inParticipantView" = FALSE WHERE TRUE;
  END IF;
  PERFORM public.practice_sync_members(v_c);
END;
$function$;

DO $fix$
DECLARE
  v_def TEXT;
  v_new TEXT;
BEGIN
  SELECT pg_get_functiondef('public.practice_build(text)'::regprocedure) INTO v_def;
  v_new := replace(v_def, 'UPDATE public."PracticeMember" SET "inParticipantView" = FALSE;', 'UPDATE public."PracticeMember" SET "inParticipantView" = FALSE WHERE TRUE;');
  IF v_new <> v_def THEN
    EXECUTE v_new;
  END IF;
END
$fix$;

CREATE OR REPLACE FUNCTION public.followup_relax_on(p_key TEXT, p_default BOOLEAN)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT COALESCE((SELECT (value = to_jsonb(true)) FROM "AppSetting" WHERE "settingKey" = p_key), p_default);
$function$;

DO $patch$
DECLARE
  v_def TEXT;
  v_new TEXT;
BEGIN
  -- Automatic assignment
  SELECT pg_get_functiondef('public.run_followup_assignment(boolean)'::regprocedure) INTO v_def;
  IF position('followup_relax_adder' IN v_def) = 0 THEN
    v_new := replace(v_def, E'  v_names JSONB;\nBEGIN', E'  v_names JSONB;\n  v_relaxed_adder INT := 0;\n  v_relaxed_any INT := 0;\n  v_relaxed_over INT := 0;\nBEGIN');
    IF v_new = v_def THEN RAISE EXCEPTION 'run_followup_assignment: declare anchor not found'; END IF;
    v_def := v_new;
    v_new := replace(v_def,
      E'    IF v_target IS NULL THEN\n      v_stuck_no_gender := v_stuck_no_gender + 1;\n      CONTINUE;\n    END IF;',
      E'    -- Relaxed steps, only when the strict rules found nobody (see Settings, Follow-up auto-assignment).\n'
      || E'    IF v_target IS NULL AND rec."registeredById" IS NOT NULL AND public.followup_relax_on(''followup_relax_adder'', TRUE) THEN\n'
      || E'      SELECT u.id INTO v_target FROM "User" u\n'
      || E'      WHERE u.id = rec."registeredById" AND u.role IN (''SUPPORT'', ''ADMIN'') AND u."isActive" IS NOT FALSE AND u."isTest" IS NOT TRUE\n'
      || E'        AND NOT public.followup_owner_is_quiet(u.id)\n'
      || E'        AND COALESCE((v_load->>(COALESCE(rec."cohortId"::text, '''') || ''|'' || u.id::text))::int, 0) < v_max;\n'
      || E'      IF v_target IS NOT NULL THEN v_relaxed_adder := v_relaxed_adder + 1; END IF;\n'
      || E'    END IF;\n'
      || E'    IF v_target IS NULL AND public.followup_relax_on(''followup_relax_any_gender'', TRUE) THEN\n'
      || E'      SELECT u.id INTO v_target FROM "User" u\n'
      || E'      WHERE u.role IN (''SUPPORT'', ''ADMIN'') AND u."isActive" IS NOT FALSE AND u."isTest" IS NOT TRUE\n'
      || E'        AND NOT public.followup_owner_is_quiet(u.id)\n'
      || E'        AND COALESCE((v_load->>(COALESCE(rec."cohortId"::text, '''') || ''|'' || u.id::text))::int, 0) < v_max\n'
      || E'      ORDER BY COALESCE((v_load->>(COALESCE(rec."cohortId"::text, '''') || ''|'' || u.id::text))::int, 0) ASC, u.name ASC\n'
      || E'      LIMIT 1;\n'
      || E'      IF v_target IS NOT NULL THEN v_relaxed_any := v_relaxed_any + 1; END IF;\n'
      || E'    END IF;\n'
      || E'    IF v_target IS NULL AND public.followup_relax_on(''followup_relax_over_limit'', FALSE) THEN\n'
      || E'      SELECT u.id INTO v_target FROM "User" u\n'
      || E'      WHERE u.role IN (''SUPPORT'', ''ADMIN'') AND u."isActive" IS NOT FALSE AND u."isTest" IS NOT TRUE\n'
      || E'        AND NOT public.followup_owner_is_quiet(u.id)\n'
      || E'      ORDER BY (u.gender = rec.gender) DESC, COALESCE((v_load->>(COALESCE(rec."cohortId"::text, '''') || ''|'' || u.id::text))::int, 0) ASC, u.name ASC\n'
      || E'      LIMIT 1;\n'
      || E'      IF v_target IS NOT NULL THEN v_relaxed_over := v_relaxed_over + 1; END IF;\n'
      || E'    END IF;\n\n'
      || E'    IF v_target IS NULL THEN\n      v_stuck_no_gender := v_stuck_no_gender + 1;\n      CONTINUE;\n    END IF;');
    IF v_new = v_def THEN RAISE EXCEPTION 'run_followup_assignment: stuck anchor not found'; END IF;
    v_def := v_new;
    v_new := replace(v_def, E'    ''stuckInvalidPhone'', v_stuck_invalid_phone,\n    ''batches'', v_batches',
      E'    ''stuckInvalidPhone'', v_stuck_invalid_phone,\n    ''relaxedAdder'', v_relaxed_adder,\n    ''relaxedAnyGender'', v_relaxed_any,\n    ''relaxedOverLimit'', v_relaxed_over,\n    ''batches'', v_batches');
    IF v_new = v_def THEN RAISE EXCEPTION 'run_followup_assignment: return anchor not found'; END IF;
    EXECUTE v_new;
  END IF;

  -- Reassignment of people who did not move
  SELECT pg_get_functiondef('public.run_followup_reassignment()'::regprocedure) INTO v_def;
  IF position('followup_relax_adder' IN v_def) = 0 THEN
    v_new := replace(v_def,
      E'        IF v_target IS NULL THEN\n          v_stuck := v_stuck + 1;\n          CONTINUE;\n        END IF;',
      E'        -- Relaxed steps, only when no same-gender receiver was found.\n'
      || E'        IF v_target IS NULL AND public.followup_relax_on(''followup_relax_adder'', TRUE) THEN\n'
      || E'          SELECT u.id INTO v_target FROM "User" u\n'
      || E'          WHERE u.id = (SELECT x."registeredById" FROM "FollowUpContact" x WHERE x.id = c.id)\n'
      || E'            AND u.role = ''SUPPORT'' AND u."isActive" IS NOT FALSE AND u."isTest" IS NOT TRUE\n'
      || E'            AND u.id <> k."ownerId" AND u.id = ANY(v_active)\n'
      || E'            AND NOT public.followup_owner_handed_on_recently(u.id) AND NOT public.followup_support_inactive(u.id)\n'
      || E'            AND COALESCE((v_load->>(COALESCE(c."cohortId"::text, '''') || ''|'' || u.id::text))::int, 0) < v_max;\n'
      || E'        END IF;\n'
      || E'        IF v_target IS NULL AND public.followup_relax_on(''followup_relax_any_gender'', TRUE) THEN\n'
      || E'          SELECT u.id INTO v_target FROM "User" u\n'
      || E'          WHERE u.role = ''SUPPORT'' AND u."isActive" IS NOT FALSE AND u."isTest" IS NOT TRUE\n'
      || E'            AND u.id <> k."ownerId" AND u.id = ANY(v_active)\n'
      || E'            AND NOT public.followup_owner_handed_on_recently(u.id) AND NOT public.followup_support_inactive(u.id)\n'
      || E'            AND COALESCE((v_load->>(COALESCE(c."cohortId"::text, '''') || ''|'' || u.id::text))::int, 0) < v_max\n'
      || E'          ORDER BY COALESCE((v_load->>(COALESCE(c."cohortId"::text, '''') || ''|'' || u.id::text))::int, 0) ASC, u.name ASC\n'
      || E'          LIMIT 1;\n'
      || E'        END IF;\n'
      || E'        IF v_target IS NULL AND public.followup_relax_on(''followup_relax_over_limit'', FALSE) THEN\n'
      || E'          SELECT u.id INTO v_target FROM "User" u\n'
      || E'          WHERE u.role = ''SUPPORT'' AND u."isActive" IS NOT FALSE AND u."isTest" IS NOT TRUE\n'
      || E'            AND u.id <> k."ownerId" AND u.id = ANY(v_active)\n'
      || E'            AND NOT public.followup_owner_handed_on_recently(u.id) AND NOT public.followup_support_inactive(u.id)\n'
      || E'          ORDER BY (u.gender = c.gender) DESC, COALESCE((v_load->>(COALESCE(c."cohortId"::text, '''') || ''|'' || u.id::text))::int, 0) ASC, u.name ASC\n'
      || E'          LIMIT 1;\n'
      || E'        END IF;\n\n'
      || E'        IF v_target IS NULL THEN\n          v_stuck := v_stuck + 1;\n          CONTINUE;\n        END IF;');
    IF v_new = v_def THEN RAISE EXCEPTION 'run_followup_reassignment: anchor not found'; END IF;
    EXECUTE v_new;
  END IF;
END
$patch$;

REVOKE ALL ON FUNCTION public.followup_relax_on(TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
