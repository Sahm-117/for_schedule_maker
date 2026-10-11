-- Telegram copy of every in-app notification. A person connects from their profile (one-time code -> bot "Start"); after that every row
-- written to "Notification" (staff) or "ParticipantNotification" (participants) is also sent to their Telegram chat. The app stays the
-- source of truth: Telegram is a backup for people whose phone did not show the push.
--
-- Born locked like every other table (rule 11): clients only reach it through the p_token RPCs below; the two edge functions
-- (telegram-webhook, telegram-send) use the service role. Two link tables with ONE foreign key each, and a code table with none,
-- so no table gives User and Participant a second route between them (rule 55).
--
-- Additive and idempotent.

CREATE TABLE IF NOT EXISTS "TelegramLink" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL UNIQUE REFERENCES "User"(id) ON DELETE CASCADE,
  "chatId" BIGINT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  "blockedAt" TIMESTAMPTZ,
  "linkedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "ParticipantTelegramLink" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "participantId" UUID NOT NULL UNIQUE REFERENCES "Participant"(id) ON DELETE CASCADE,
  "chatId" BIGINT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  "blockedAt" TIMESTAMPTZ,
  "linkedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One-time connect codes. No foreign keys on purpose (ownerId points at a User or a Participant depending on ownerKind).
CREATE TABLE IF NOT EXISTS "TelegramLinkCode" (
  code TEXT PRIMARY KEY,
  "ownerKind" TEXT NOT NULL CHECK ("ownerKind" IN ('USER', 'PARTICIPANT')),
  "ownerId" UUID NOT NULL,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "TelegramLinkCode_owner_idx" ON "TelegramLinkCode" ("ownerKind", "ownerId");
CREATE INDEX IF NOT EXISTS "TelegramLink_chat_idx" ON "TelegramLink" ("chatId");
CREATE INDEX IF NOT EXISTS "ParticipantTelegramLink_chat_idx" ON "ParticipantTelegramLink" ("chatId");

ALTER TABLE "TelegramLink" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ParticipantTelegramLink" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TelegramLinkCode" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "TelegramLink", "ParticipantTelegramLink", "TelegramLinkCode" FROM anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------
-- Who is asking: the active staff member or the active participant behind a session token.
-- ---------------------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.telegram_owner(p_token TEXT)
RETURNS TABLE (kind TEXT, owner_id UUID)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  u "User" := public.app_staff(p_token);
  pid UUID;
BEGIN
  IF u.id IS NOT NULL THEN
    kind := 'USER'; owner_id := u.id; RETURN NEXT; RETURN;
  END IF;
  pid := public.app_participant_id(p_token);
  IF pid IS NOT NULL THEN
    kind := 'PARTICIPANT'; owner_id := pid; RETURN NEXT;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------------------------------------------------------
-- App-facing RPCs (staff and participants share them).
-- ---------------------------------------------------------------------------------------------------------------------------
-- eligible is false for test accounts and Practice participants: they never get Telegram messages (rule 14), so the app hides the card.
CREATE OR REPLACE FUNCTION public.telegram_status(p_token TEXT)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  o RECORD;
  l RECORD;
  v_eligible BOOLEAN;
BEGIN
  SELECT * INTO o FROM public.telegram_owner(p_token);
  IF o.owner_id IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  IF o.kind = 'USER' THEN
    SELECT t.enabled, t."blockedAt" INTO l FROM "TelegramLink" t WHERE t."userId" = o.owner_id;
    SELECT u."isTest" IS NOT TRUE INTO v_eligible FROM "User" u WHERE u.id = o.owner_id;
  ELSE
    SELECT t.enabled, t."blockedAt" INTO l FROM "ParticipantTelegramLink" t WHERE t."participantId" = o.owner_id;
    SELECT p."isTest" IS NOT TRUE AND NOT public.prayer_is_practice(p."cohortId") INTO v_eligible FROM "Participant" p WHERE p.id = o.owner_id;
  END IF;
  RETURN json_build_object('connected', l.enabled IS NOT NULL, 'enabled', COALESCE(l.enabled, FALSE), 'blocked', l."blockedAt" IS NOT NULL,
                           'eligible', COALESCE(v_eligible, FALSE));
END;
$$;

CREATE OR REPLACE FUNCTION public.telegram_connect_code(p_token TEXT)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  o RECORD;
  v_code TEXT := replace(gen_random_uuid()::text, '-', '');
BEGIN
  SELECT * INTO o FROM public.telegram_owner(p_token);
  IF o.owner_id IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  DELETE FROM "TelegramLinkCode" WHERE "expiresAt" < NOW() OR ("ownerKind" = o.kind AND "ownerId" = o.owner_id);
  INSERT INTO "TelegramLinkCode" (code, "ownerKind", "ownerId", "expiresAt") VALUES (v_code, o.kind, o.owner_id, NOW() + INTERVAL '15 minutes');
  RETURN v_code;
END;
$$;

-- Turning it on while the bot is blocked would show "on" but deliver nothing, so refuse: they press Start in Telegram instead.
CREATE OR REPLACE FUNCTION public.telegram_set_enabled(p_token TEXT, p_enabled BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  o RECORD;
BEGIN
  SELECT * INTO o FROM public.telegram_owner(p_token);
  IF o.owner_id IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  IF o.kind = 'USER' THEN
    UPDATE "TelegramLink" SET enabled = p_enabled WHERE "userId" = o.owner_id AND (NOT p_enabled OR "blockedAt" IS NULL);
  ELSE
    UPDATE "ParticipantTelegramLink" SET enabled = p_enabled WHERE "participantId" = o.owner_id AND (NOT p_enabled OR "blockedAt" IS NULL);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.telegram_disconnect(p_token TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  o RECORD;
BEGIN
  SELECT * INTO o FROM public.telegram_owner(p_token);
  IF o.owner_id IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  DELETE FROM "TelegramLinkCode" WHERE "ownerKind" = o.kind AND "ownerId" = o.owner_id;
  IF o.kind = 'USER' THEN
    DELETE FROM "TelegramLink" WHERE "userId" = o.owner_id;
  ELSE
    DELETE FROM "ParticipantTelegramLink" WHERE "participantId" = o.owner_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.telegram_owner(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.telegram_status(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.telegram_connect_code(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.telegram_set_enabled(TEXT, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.telegram_disconnect(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.telegram_status(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.telegram_connect_code(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.telegram_set_enabled(TEXT, BOOLEAN) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.telegram_disconnect(TEXT) TO anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------
-- Bot-facing functions: service role only (the telegram-webhook edge function).
-- ---------------------------------------------------------------------------------------------------------------------------
-- The bot got "/start <code>": turn the code into a link. Returns 'OK' or 'INVALID'.
CREATE OR REPLACE FUNCTION public.telegram_link_chat(p_code TEXT, p_chat_id BIGINT)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  c "TelegramLinkCode";
BEGIN
  DELETE FROM "TelegramLinkCode" WHERE code = p_code AND "expiresAt" >= NOW() RETURNING * INTO c;
  IF c.code IS NULL THEN RETURN 'INVALID'; END IF;
  -- One chat belongs to one person: whoever pressed Start last takes it, so one person's messages never reach another's chat.
  DELETE FROM "TelegramLink" WHERE "chatId" = p_chat_id AND NOT (c."ownerKind" = 'USER' AND "userId" = c."ownerId");
  DELETE FROM "ParticipantTelegramLink" WHERE "chatId" = p_chat_id AND NOT (c."ownerKind" = 'PARTICIPANT' AND "participantId" = c."ownerId");
  IF c."ownerKind" = 'USER' THEN
    INSERT INTO "TelegramLink" ("userId", "chatId") VALUES (c."ownerId", p_chat_id)
    ON CONFLICT ("userId") DO UPDATE SET "chatId" = EXCLUDED."chatId", enabled = TRUE, "blockedAt" = NULL, "linkedAt" = NOW();
  ELSE
    INSERT INTO "ParticipantTelegramLink" ("participantId", "chatId") VALUES (c."ownerId", p_chat_id)
    ON CONFLICT ("participantId") DO UPDATE SET "chatId" = EXCLUDED."chatId", enabled = TRUE, "blockedAt" = NULL, "linkedAt" = NOW();
  END IF;
  RETURN 'OK';
END;
$$;

-- /start (on), /stop (off) from a chat that is already linked, or the person blocking the bot (off + blocked). Returns how many links changed.
CREATE OR REPLACE FUNCTION public.telegram_set_chat_enabled(p_chat_id BIGINT, p_enabled BOOLEAN, p_blocked BOOLEAN DEFAULT FALSE)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  a INTEGER;
  b INTEGER;
BEGIN
  UPDATE "TelegramLink" SET enabled = p_enabled, "blockedAt" = CASE WHEN p_blocked THEN NOW() ELSE NULL END WHERE "chatId" = p_chat_id;
  GET DIAGNOSTICS a = ROW_COUNT;
  UPDATE "ParticipantTelegramLink" SET enabled = p_enabled, "blockedAt" = CASE WHEN p_blocked THEN NOW() ELSE NULL END WHERE "chatId" = p_chat_id;
  GET DIAGNOSTICS b = ROW_COUNT;
  RETURN a + b;
END;
$$;

REVOKE ALL ON FUNCTION public.telegram_link_chat(TEXT, BIGINT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.telegram_set_chat_enabled(BIGINT, BOOLEAN, BOOLEAN) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------
-- Sending: one trigger per bell table, so everything that writes a bell row (edge functions, triggers, cron jobs) reaches Telegram.
-- ---------------------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.invoke_telegram_send(p_kind TEXT, p_owner UUID, p_title TEXT, p_body TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
  v_url TEXT;
  v_key TEXT;
BEGIN
  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'project_url';
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'push_reminders_service_key';
  IF v_url IS NULL OR v_key IS NULL THEN RETURN; END IF;
  PERFORM net.http_post(
    url := v_url || '/functions/v1/telegram-send',
    headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', v_key, 'Authorization', 'Bearer ' || v_key),
    body := jsonb_build_object('kind', p_kind, 'ownerId', p_owner, 'title', p_title, 'body', p_body),
    timeout_milliseconds := 15000);
END;
$$;

-- A failure here must never stop the notification itself from being saved.
CREATE OR REPLACE FUNCTION public.telegram_after_notification()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "TelegramLink" l JOIN "User" u ON u.id = l."userId"
             WHERE l."userId" = NEW."userId" AND l.enabled AND u."isTest" IS NOT TRUE) THEN
    PERFORM public.invoke_telegram_send('USER', NEW."userId", NEW.title, NEW.body);
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

-- Participants in the Practice cohort (or flagged test) never get Telegram messages: practice never mixes with live (rule 14).
CREATE OR REPLACE FUNCTION public.telegram_after_participant_notification()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "ParticipantTelegramLink" l
    JOIN "Participant" p ON p.id = l."participantId"
    WHERE l."participantId" = NEW."participantId" AND l.enabled
      AND p."isTest" IS NOT TRUE
      AND NOT public.prayer_is_practice(p."cohortId")
  ) THEN
    PERFORM public.invoke_telegram_send('PARTICIPANT', NEW."participantId", NEW.title, NEW.body);
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.invoke_telegram_send(TEXT, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.telegram_after_notification() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.telegram_after_participant_notification() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS telegram_after_notification ON "Notification";
CREATE TRIGGER telegram_after_notification AFTER INSERT ON "Notification"
  FOR EACH ROW EXECUTE FUNCTION public.telegram_after_notification();

DROP TRIGGER IF EXISTS telegram_after_participant_notification ON "ParticipantNotification";
CREATE TRIGGER telegram_after_participant_notification AFTER INSERT ON "ParticipantNotification"
  FOR EACH ROW EXECUTE FUNCTION public.telegram_after_participant_notification();
