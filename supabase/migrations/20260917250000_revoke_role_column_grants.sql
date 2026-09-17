-- Take the role column away from the public API roles.
--
-- set_user_role shipped in 20260917240000 and the live bundle now routes every
-- role change through it, so nothing writes this column directly any more.
--
-- UPDATE is the one that mattered: with USING(true) on the table, any holder of
-- the anon key could PATCH an account to ADMIN. INSERT is revoked as hygiene
-- rather than a fix -- password_hash is NOT NULL with no default and is not
-- granted to anon, so a direct insert could never succeed anyway. The column
-- defaults to 'SUPPORT', so the remaining insert grants stay valid.
--
-- Reverts with the matching GRANT ... (role) ON "User" TO anon, authenticated.

REVOKE UPDATE (role) ON "User" FROM anon, authenticated;
REVOKE INSERT (role) ON "User" FROM anon, authenticated;
