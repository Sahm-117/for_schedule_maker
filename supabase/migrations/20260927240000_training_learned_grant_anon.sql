-- submit_training_learned was granted to `authenticated` only, but staff calls come
-- in as `anon` with the app session token (like every other staff RPC), so every
-- support got "permission denied". The function checks app_is_staff() itself.
GRANT EXECUTE ON FUNCTION public.submit_training_learned(uuid, text, text) TO anon;
