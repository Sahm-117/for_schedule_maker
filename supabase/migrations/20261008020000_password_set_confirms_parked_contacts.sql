-- A registered adult a support parked as No response (they could not be reached) already has a
-- Participant and a login. If they then choose a password themselves, they have got in, so they
-- are confirmed like anyone else: the contact becomes ACCESS_CONFIRMED and the parked flag is
-- cleared. Before, only REGISTERED, LOGIN_SHARED and LOGIN_ISSUE contacts were promoted, so a
-- parked person who signed in stayed No response. People who never registered have no Participant,
-- so the join leaves them alone. The rest is the live definition unchanged.
CREATE OR REPLACE FUNCTION public.confirm_followup_access_on_password_set()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
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
      AND c."registrationStatus" IN ('REGISTERED', 'LOGIN_SHARED', 'LOGIN_ISSUE', 'NO_RESPONSE')
    LIMIT 1;

    IF NOT FOUND THEN
      RETURN NEW;
    END IF;

    UPDATE public."FollowUpContact"
    SET "registrationStatus" = 'ACCESS_CONFIRMED',
        "noResponseAt" = NULL,
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
