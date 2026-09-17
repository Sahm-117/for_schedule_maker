-- Close the ungated create_user / set_user_password signatures.
--
-- The admin-gated overloads shipped in 20260917220000 and the production
-- bundle now sends p_token on every call site, so nothing depends on the old
-- signatures any more. Revoking EXECUTE leaves the functions in place: this is
-- reversible with a GRANT, and drops nothing.
--
-- After this, the only way to create a user or set a password is through the
-- overloads that require an active ADMIN session.

REVOKE EXECUTE ON FUNCTION public.create_user(TEXT, TEXT, TEXT, TEXT, TEXT) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_user_password(UUID, TEXT, BOOLEAN) FROM anon, authenticated, PUBLIC;
