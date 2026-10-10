-- Files in the public "resources" bucket whose names carry a timestamp are never overwritten
-- (every upload makes a new name), so they can be cached for a year. They were stored with a
-- 1-hour (or "no-cache") lifetime, which made every phone refetch them each hour. Changing the
-- stored cacheControl changes only the Cache-Control header the storage service sends.
-- Profile photos are named <id>-<timestamp>.jpg too. The 13 oldest avatars (avatars/<user id>.jpg, no
-- timestamp) keep the short lifetime, which the name test below leaves alone.
-- Idempotent. Rollback: set cacheControl back to 'max-age=3600' (the 7 manuals were 'no-cache').
UPDATE storage.objects
SET metadata = jsonb_set(metadata, '{cacheControl}', '"max-age=31536000"')
WHERE bucket_id = 'resources'
  AND name ~ '[0-9]{10,}'
  AND metadata->>'cacheControl' IN ('max-age=3600', 'no-cache');
