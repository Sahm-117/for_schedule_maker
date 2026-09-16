-- Actually hide the password column from the public API roles.
--
-- The previous migration's column-level REVOKE was a no-op: in Postgres a
-- column-level revoke cannot subtract from an existing table-level grant. The
-- table grant has to be removed and the safe columns granted back explicitly.
--
-- Reads and writes of password material now only happen inside the SECURITY
-- DEFINER functions (login_user, create_user, set_user_password,
-- change_own_password), which run as the owner and are unaffected.

REVOKE SELECT, UPDATE, INSERT ON "User" FROM anon, authenticated;

GRANT SELECT (
  id, email, phone, name, role, "isActive", "deactivatedAt", "isCoordinator",
  "avatarUrl", "themeColor", "hubLastSeenAt", "whatsappGroupUrl",
  "onboardingCompleted", "onboardingReplayCount", "onboardingLastReplayAt",
  "mustChangePassword", "createdAt", "updatedAt"
) ON "User" TO anon, authenticated;

GRANT UPDATE (
  email, phone, name, role, "isActive", "deactivatedAt", "isCoordinator",
  "avatarUrl", "themeColor", "hubLastSeenAt", "whatsappGroupUrl",
  "onboardingCompleted", "onboardingReplayCount", "onboardingLastReplayAt",
  "updatedAt"
) ON "User" TO anon, authenticated;

GRANT INSERT (
  email, phone, name, role, "isActive", "isCoordinator", "avatarUrl",
  "themeColor", "whatsappGroupUrl", "createdAt", "updatedAt"
) ON "User" TO anon, authenticated;

GRANT DELETE ON "User" TO anon, authenticated;
