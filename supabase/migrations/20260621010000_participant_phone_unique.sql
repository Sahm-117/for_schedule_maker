-- Prevent duplicate participant phone numbers (across all cohorts).
--
-- Phones are stored as typed (raw), so the same person could be added twice in
-- different formats (e.g. "08099..." vs "+23499..."). This partial unique index
-- is built on the NORMALISED number — mirroring normalizeToIntlPhone() in
-- frontend/src/utils/phone.ts — so duplicates are blocked regardless of format
-- and regardless of entry path (manual add, paste, CSV import).
--
-- NULL/blank/unparseable phones are excluded (expression yields NULL), so
-- participants without a phone are unaffected. Existing data was verified to
-- contain 0 duplicate normalised phones before this index was created.

CREATE UNIQUE INDEX IF NOT EXISTS uniq_participant_phone_normalized
  ON "Participant" (
    (
      CASE
        WHEN regexp_replace(phone, '\D', '', 'g') ~ '^0[7-9][01][0-9]{8}$'
          THEN '234' || substr(regexp_replace(phone, '\D', '', 'g'), 2)
        WHEN regexp_replace(phone, '\D', '', 'g') ~ '^234[7-9][01][0-9]{8}$'
          THEN regexp_replace(phone, '\D', '', 'g')
        WHEN regexp_replace(phone, '\D', '', 'g') ~ '^[0-9]{10,15}$'
             AND left(regexp_replace(phone, '\D', '', 'g'), 1) <> '0'
          THEN regexp_replace(phone, '\D', '', 'g')
        ELSE NULL
      END
    )
  )
  WHERE phone IS NOT NULL;
