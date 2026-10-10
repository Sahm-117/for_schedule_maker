-- A verse that is part of a slot's template cannot be switched off: it would keep showing in that slot anyway (the template shows
-- the verse whether or not it is "active"), so the switch would say one thing and do another. The admin is told which slots use it
-- and asks to update them first. Only the switch-off is guarded; editing the text, title or reference is always allowed.
CREATE OR REPLACE FUNCTION public.upsert_prayer_verse(p_token text, p_id uuid, p_title text, p_prayer text, p_reference text, p_active boolean)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_row public."CorporatePrayerVerse";
  v_title text := NULLIF(btrim(COALESCE(p_title, '')), '');
  v_prayer text := NULLIF(btrim(COALESCE(p_prayer, '')), '');
  v_ref text := NULLIF(btrim(COALESCE(p_reference, '')), '');
  v_slots text;
BEGIN
  PERFORM public.prayer_require_admin(p_token);
  IF v_title IS NULL THEN RAISE EXCEPTION 'TITLE_REQUIRED'; END IF;
  IF length(v_title) > 60 THEN RAISE EXCEPTION 'TITLE_TOO_LONG'; END IF;
  IF v_prayer IS NULL THEN RAISE EXCEPTION 'PRAYER_REQUIRED'; END IF;
  IF v_ref IS NULL THEN RAISE EXCEPTION 'REFERENCE_REQUIRED'; END IF;
  IF length(v_prayer) > 1500 THEN RAISE EXCEPTION 'PRAYER_TOO_LONG'; END IF;
  IF EXISTS (SELECT 1 FROM public."CorporatePrayerVerse" x WHERE lower(btrim(x.title)) = lower(v_title) AND x.id IS DISTINCT FROM p_id) THEN
    RAISE EXCEPTION 'TITLE_TAKEN';
  END IF;
  IF p_id IS NOT NULL AND NOT COALESCE(p_active, TRUE) AND EXISTS (SELECT 1 FROM public."CorporatePrayerVerse" x WHERE x.id = p_id AND x.active) THEN
    SELECT string_agg(COALESCE(sl.name, to_char(sl."timeOfDay", 'HH24:MI')), ', ' ORDER BY sl."timeOfDay") INTO v_slots
    FROM public."CorporatePrayerSlot" sl
    WHERE NOT sl."isTest" AND sl.blocks @> jsonb_build_array(jsonb_build_object('type', 'VERSE', 'verseId', p_id));
    IF v_slots IS NOT NULL THEN RAISE EXCEPTION 'VERSE_IN_SLOT:%', v_slots; END IF;
  END IF;
  IF p_id IS NULL THEN
    INSERT INTO public."CorporatePrayerVerse" (title, prayer, reference, "sortOrder", active)
    VALUES (v_title, v_prayer, v_ref, COALESCE((SELECT max("sortOrder") + 1 FROM public."CorporatePrayerVerse"), 0), COALESCE(p_active, TRUE))
    RETURNING * INTO v_row;
  ELSE
    UPDATE public."CorporatePrayerVerse" SET title = v_title, prayer = v_prayer, reference = v_ref, active = COALESCE(p_active, TRUE), "updatedAt" = now()
    WHERE id = p_id RETURNING * INTO v_row;
    IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  END IF;
  RETURN row_to_json(v_row);
END;
$$;
