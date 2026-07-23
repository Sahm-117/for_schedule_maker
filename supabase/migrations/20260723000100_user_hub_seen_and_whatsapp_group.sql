-- Per-account "last seen Hub" timestamp, for an unread-dot on the Hub nav item.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "hubLastSeenAt" TIMESTAMPTZ;

-- Per-support-user WhatsApp group invite URL, configured in Support Profile,
-- used to open the group chat from the Group Prayers tab.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "whatsappGroupUrl" TEXT;
