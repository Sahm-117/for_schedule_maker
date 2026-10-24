-- "I'm here" and "I can't come today": while the Sunday attendance is open, a participant can tell their support they are
-- in church, or that they cannot come and why. It only sends their support a notification (bell + push) and keeps one row per
-- week; it never marks attendance (that stays with the register). The counter on Home is unchanged.
--
-- Rollback: DROP FUNCTION participant_class_signal(text, text, text), participant_class_signal_mine(text, integer); DROP TABLE "ClassSignal".

CREATE TABLE IF NOT EXISTS public."ClassSignal" (
  "weekId" integer NOT NULL,
  "participantId" uuid NOT NULL REFERENCES public."Participant"(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('HERE', 'CANT')),
  reason text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("weekId", "participantId")
);

REVOKE ALL ON TABLE public."ClassSignal" FROM anon, authenticated;
ALTER TABLE public."ClassSignal" ENABLE ROW LEVEL SECURITY;

-- The open attendance week for a participant, or null. Same test participant_home uses for openWindow, plus "not marked yet".
CREATE OR REPLACE FUNCTION public.class_signal_open_week(p_participant uuid)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $$
  SELECT s."weekId"
  FROM public."Participant" p
  JOIN public."Week" w ON w."cohortId" = p."cohortId"
  JOIN public."AttendanceSession" s ON s."weekId" = w.id
  WHERE p.id = p_participant
    AND s."startedAt" IS NOT NULL AND s."closesAt" > now() AND s."finalizedAt" IS NULL
    AND NOT EXISTS (SELECT 1 FROM public."AttendanceRecord" a WHERE a."weekId" = s."weekId" AND a."participantId" = p_participant)
  ORDER BY s."startedAt" DESC LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.participant_class_signal_mine(p_token text, p_week integer)
RETURNS json
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_pid uuid := public.app_participant_id(p_token);
  r public."ClassSignal";
BEGIN
  IF v_pid IS NULL THEN RETURN json_build_object('status', NULL); END IF;
  SELECT * INTO r FROM public."ClassSignal" WHERE "weekId" = p_week AND "participantId" = v_pid;
  RETURN json_build_object('status', r.status, 'reason', r.reason);
END;
$$;

CREATE OR REPLACE FUNCTION public.participant_class_signal(p_token text, p_status text, p_reason text DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_pid uuid := public.app_participant_id(p_token);
  v_week integer;
  v_old text;
  v_reason text := NULLIF(left(btrim(COALESCE(p_reason, '')), 300), '');
  v_first text;
  v_support uuid;
  v_url text;
  v_key text;
BEGIN
  IF v_pid IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  IF p_status NOT IN ('HERE', 'CANT') THEN RAISE EXCEPTION 'BAD_STATUS'; END IF;
  v_week := public.class_signal_open_week(v_pid);
  IF v_week IS NULL THEN RAISE EXCEPTION 'NOT_OPEN'; END IF;

  SELECT status INTO v_old FROM public."ClassSignal" WHERE "weekId" = v_week AND "participantId" = v_pid;
  INSERT INTO public."ClassSignal" ("weekId", "participantId", status, reason)
  VALUES (v_week, v_pid, p_status, CASE WHEN p_status = 'CANT' THEN v_reason END)
  ON CONFLICT ("weekId", "participantId") DO UPDATE
    SET status = EXCLUDED.status, reason = EXCLUDED.reason, "updatedAt" = now();

  -- Tell the support once per change of answer.
  IF v_old IS DISTINCT FROM p_status THEN
    SELECT COALESCE(NULLIF(split_part(btrim(p."fullName"), ' ', 1), ''), 'A participant') INTO v_first FROM public."Participant" p WHERE p.id = v_pid;
    SELECT g."supportId" INTO v_support
    FROM public."GroupParticipant" gp JOIN public."Group" g ON g.id = gp."groupId"
    JOIN public."Participant" p ON p.id = gp."participantId" AND g."cohortId" = p."cohortId"
    WHERE gp."participantId" = v_pid LIMIT 1;
    IF v_support IS NOT NULL THEN
      SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'project_url';
      SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'push_reminders_service_key';
      IF v_url IS NOT NULL AND v_key IS NOT NULL THEN
        PERFORM net.http_post(
          url := v_url || '/functions/v1/notify-users',
          headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', v_key, 'Authorization', 'Bearer ' || v_key),
          body := jsonb_build_object('userIds', to_jsonb(ARRAY[v_support]),
            'title', CASE WHEN p_status = 'HERE' THEN v_first || ' is at church' ELSE v_first || ' cannot come today' END,
            'body', CASE WHEN p_status = 'HERE' THEN 'They tapped "I''m here" in the app.' ELSE COALESCE('Reason: ' || v_reason, 'They did not give a reason.') END,
            'path', '/support/attendance', 'type', 'ATTENDANCE'),
          timeout_milliseconds := 25000);
      END IF;
    END IF;
  END IF;
  RETURN json_build_object('status', p_status);
END;
$$;

REVOKE ALL ON FUNCTION public.class_signal_open_week(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.participant_class_signal_mine(text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.participant_class_signal(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.participant_class_signal_mine(text, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.participant_class_signal(text, text, text) TO anon, authenticated;
