-- Trainings & get-togethers attendance: marked by the supports an admin
-- picks (AppSetting 'training_markers', a JSON array of user ids) instead of
-- any hub lead. Sunday recap permissions are unchanged. Idempotent.
CREATE OR REPLACE FUNCTION public.mark_support_attendance(p_status text, p_user_id uuid, p_hub_id uuid DEFAULT NULL::uuid, p_week_id integer DEFAULT NULL::integer, p_session_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor_id UUID;
  v_session public."SupportSession";
  v_week public."Week";
  v_hub public."SupportHub";
  v_is_lead_of_any BOOLEAN;
  v_result public."SupportSessionAttendance";
BEGIN
  IF NOT public.app_is_staff() THEN
    RAISE EXCEPTION 'You must be signed in as a support or admin to mark attendance';
  END IF;
  IF p_status NOT IN ('PRESENT', 'LATE', 'ABSENT', 'EXCUSED') THEN
    RAISE EXCEPTION 'Invalid attendance status';
  END IF;
  v_actor_id := public.app_current_user_id();

  IF p_session_id IS NOT NULL THEN
    SELECT * INTO v_session FROM public."SupportSession" WHERE id = p_session_id;
    IF v_session.id IS NULL THEN RAISE EXCEPTION 'Session was not found'; END IF;
  ELSE
    IF p_hub_id IS NULL OR p_week_id IS NULL THEN
      RAISE EXCEPTION 'Provide either a session, or a hub and week';
    END IF;

    SELECT * INTO v_week FROM public."Week" WHERE id = p_week_id;
    IF v_week.id IS NULL THEN RAISE EXCEPTION 'Week was not found'; END IF;

    SELECT * INTO v_hub FROM public."SupportHub" WHERE id = p_hub_id;
    IF v_hub.id IS NULL THEN RAISE EXCEPTION 'Hub was not found'; END IF;
    IF v_hub."cohortId" IS DISTINCT FROM v_week."cohortId" THEN
      RAISE EXCEPTION 'This hub and week are not in the same cohort';
    END IF;

    INSERT INTO public."SupportSession" ("cohortId", type, title, "sessionDate", "weekId", "hubId", "createdById")
    VALUES (v_week."cohortId", 'SUNDAY_RECAP', format('Sunday recap · Week %s', v_week."weekNumber"), CURRENT_DATE, p_week_id, p_hub_id, v_actor_id)
    ON CONFLICT ("hubId", "weekId") DO NOTHING;

    SELECT * INTO v_session FROM public."SupportSession" WHERE "hubId" = p_hub_id AND "weekId" = p_week_id;
  END IF;

  -- First attendance mark for this hub week starts the "meeting is on" live
  -- window (build_hub_view's meetingLive reads this); never reset here —
  -- reopen_hub_meeting/submit_hub_meeting only ever touch submittedAt.
  IF v_session.type = 'SUNDAY_RECAP' AND v_session."hubId" IS NOT NULL THEN
    UPDATE public."SupportSession" SET "startedAt" = COALESCE("startedAt", NOW()) WHERE id = v_session.id;
  END IF;

  -- Permission: recap is the session's own hub's lead or (with ATTENDANCE
  -- permission) its assistant lead; trainings/get-togethers (no fixed hub)
  -- are marked only by the supports an admin picks on the Attendance page
  -- (AppSetting 'training_markers'). Admin can always mark.
  IF NOT public.app_is_admin() THEN
    IF v_session."hubId" IS NOT NULL THEN
      IF NOT public.app_hub_can(v_session."hubId", 'ATTENDANCE') THEN
        RAISE EXCEPTION 'Only this hub''s lead, its assistant lead, or an admin can mark this attendance';
      END IF;
    ELSE
      SELECT EXISTS (
        SELECT 1 FROM public."AppSetting" s
        WHERE s."settingKey" = 'training_markers'
          AND jsonb_typeof(s.value) = 'array'
          AND s.value ? v_actor_id::text
      ) INTO v_is_lead_of_any;
      IF NOT COALESCE(v_is_lead_of_any, FALSE) THEN
        RAISE EXCEPTION 'Only the supports picked to mark trainings, or an admin, can mark this attendance';
      END IF;
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public."User" u WHERE u.id = p_user_id AND u."isActive" IS NOT FALSE
  ) THEN
    RAISE EXCEPTION 'That support was not found';
  END IF;

  INSERT INTO public."SupportSessionAttendance" ("sessionId", "userId", status, "markedById", "markedAt")
  VALUES (v_session.id, p_user_id, p_status, v_actor_id, NOW())
  ON CONFLICT ("sessionId", "userId") DO UPDATE
    SET status = EXCLUDED.status, "markedById" = EXCLUDED."markedById", "markedAt" = EXCLUDED."markedAt"
  RETURNING * INTO v_result;

  RETURN jsonb_build_object(
    'id', v_result.id,
    'sessionId', v_result."sessionId",
    'userId', v_result."userId",
    'status', v_result.status,
    'markedById', v_result."markedById",
    'markedAt', v_result."markedAt"
  );
END;
$function$;
