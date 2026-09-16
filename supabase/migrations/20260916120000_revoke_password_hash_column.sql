-- Final lock: stop the public API roles from reading the password column at all.
--
-- APPLY ONLY AFTER the frontend that selects explicit user columns is deployed.
-- Until then the live app still does `select('*')` on "User", which Postgres
-- refuses once this privilege is revoked.
--
-- Verification (password_hash must be absent / return an error):
--   GET /rest/v1/User?select=password_hash&limit=1  → 401/403
--   GET /rest/v1/User?select=id,name&limit=1        → 200

REVOKE SELECT (password_hash) ON "User" FROM anon;
REVOKE SELECT (password_hash) ON "User" FROM authenticated;
