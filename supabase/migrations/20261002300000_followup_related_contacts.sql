-- Other sign-ups that used the same email as a follow-up contact. Used when a
-- contact has no working WhatsApp number: someone who signed up with the same
-- email (often one person registering two) may know how to reach them.
-- Only the contact's owner and admins can ask, and only sign-ups with a usable
-- number are returned.
CREATE OR REPLACE FUNCTION public.followup_related_contacts(p_token TEXT, p_contact_id UUID)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  staff "User" := public.app_staff(p_token);
  c "FollowUpContact";
  mail TEXT;
BEGIN
  IF staff.id IS NULL THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
  SELECT * INTO c FROM "FollowUpContact" WHERE id = p_contact_id;
  IF c.id IS NULL THEN RAISE EXCEPTION 'CONTACT_NOT_FOUND'; END IF;
  IF staff.role <> 'ADMIN' AND c."ownerId" IS DISTINCT FROM staff.id THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  mail := lower(trim(COALESCE(c.email, '')));
  IF mail = '' THEN RETURN '[]'::JSON; END IF;

  RETURN COALESCE((
    SELECT json_agg(row_to_json(t) ORDER BY t."sameCohort" DESC, t."minutesApart" ASC)
    FROM (
      SELECT
        o.id,
        o."fullName",
        o.phone,
        o.email,
        'EMAIL'::TEXT AS "sharedBy",
        (abs(extract(epoch FROM (o."createdAt" - c."createdAt"))) / 60)::INTEGER AS "minutesApart",
        (SELECT name FROM "Cohort" WHERE id = o."cohortId") AS "cohortName",
        (o."cohortId" IS NOT DISTINCT FROM c."cohortId") AS "sameCohort",
        (SELECT name FROM "User" WHERE id = o."ownerId") AS "ownerName",
        (o."ownerId" IS NOT DISTINCT FROM staff.id) AS mine
      FROM "FollowUpContact" o
      WHERE o.id <> c.id
        AND COALESCE(o."isTest", FALSE) = FALSE
        AND lower(trim(COALESCE(o.email, ''))) = mail
        AND regexp_replace(COALESCE(o.phone, ''), '\D', '', 'g') ~ '^(234|0)?[7-9][01][0-9]{8}$'
      ORDER BY (o."cohortId" IS NOT DISTINCT FROM c."cohortId") DESC, abs(extract(epoch FROM (o."createdAt" - c."createdAt"))) ASC
      LIMIT 5
    ) t
  ), '[]'::JSON);
END;
$$;

GRANT EXECUTE ON FUNCTION public.followup_related_contacts(TEXT, UUID) TO anon, authenticated;
