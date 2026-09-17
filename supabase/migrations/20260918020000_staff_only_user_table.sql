-- "User" on its own, because it is the one table whose lockdown touches login.
--
-- What is open right now, with nothing but the key that ships in the browser
-- bundle: SELECT on 18 columns including every staff member's email, phone and
-- role, UPDATE on 14 of them, and DELETE on the table. Verified against
-- production -- an anonymous DELETE returns 204, an anonymous SELECT returns
-- rows. Column grants from 20260917250000 keep password_hash and role out of
-- reach, but nothing stops a stranger reading the staff list or deleting it.
--
-- Held back from the batches because authApi.getMe() reads this table directly
-- when a session is restored, so getting this wrong locks everyone out rather
-- than merely breaking a page.
--
-- Checked before writing this:
--   login itself never reads the table -- sign_in is SECURITY DEFINER
--   useAuth writes the session token to localStorage before anything reads
--     "User", so the header is always there by the time it matters
--   clearAuthToken removes accessToken, refreshToken and sessionToken together
--
-- One deliberate behaviour change: a browser holding a stale accessToken but no
-- live session now fails getMe() and lands on the login screen, where today it
-- would quietly keep working off cached data. That is the right answer for an
-- expired session, and it is the only user-visible difference.
--
-- Embedded reads (owner:User!..., author:User!... and friends) are subject to
-- this policy too, so they resolve for a signed-in caller and return null for
-- everyone else -- which is the intent.

ALTER POLICY "Allow all operations" ON public."User"
  USING (public.app_is_staff()) WITH CHECK (public.app_is_staff());
