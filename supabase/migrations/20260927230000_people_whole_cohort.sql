-- People page: add `cohort`, every other active participant in the participant's
-- cohort (name + photo only, no phone numbers), so pre-start participants who have
-- no group yet can still see who else is joining. Rest of the payload unchanged.
CREATE OR REPLACE FUNCTION public.participant_people(p_token TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  person_id UUID := public.app_participant_id(p_token);
  person "Participant";
  grp "Group";
BEGIN
  IF person_id IS NULL THEN
    RAISE EXCEPTION 'SESSION_EXPIRED';
  END IF;

  SELECT * INTO person FROM "Participant" WHERE id = person_id;
  SELECT g.* INTO grp
  FROM "GroupParticipant" gp
  JOIN "Group" g ON g.id = gp."groupId" AND g."cohortId" = person."cohortId"
  WHERE gp."participantId" = person_id
  LIMIT 1;

  RETURN json_build_object(
    'supports', COALESCE((
      SELECT json_agg(json_build_object(
        'id', u.id,
        'name', u.name,
        'avatarUrl', u."avatarUrl",
        'role', u.role,
        'isMySupport', u.id = grp."supportId"
      ) ORDER BY (u.id = grp."supportId") DESC, u.name)
      FROM "User" u
      WHERE u."isActive"
        AND u.role IN ('SUPPORT', 'ADMIN')
        AND EXISTS (SELECT 1 FROM "UserCohort" uc WHERE uc."userId" = u.id AND uc."cohortId" = person."cohortId")
    ), '[]'::json),
    'groupName', grp.name,
    'members', COALESCE((
      SELECT json_agg(json_build_object('name', m."fullName", 'avatarUrl', m."avatarUrl") ORDER BY m."fullName")
      FROM "GroupParticipant" gp JOIN "Participant" m ON m.id = gp."participantId"
      WHERE gp."groupId" = grp.id AND m.id <> person_id AND m.status = 'ACTIVE'
    ), '[]'::json),
    'cohort', COALESCE((
      SELECT json_agg(json_build_object('name', m."fullName", 'avatarUrl', m."avatarUrl") ORDER BY m."fullName")
      FROM "Participant" m
      WHERE m."cohortId" = person."cohortId" AND m.id <> person_id AND m.status = 'ACTIVE'
    ), '[]'::json)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.participant_people(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.participant_people(TEXT) TO anon, authenticated;
