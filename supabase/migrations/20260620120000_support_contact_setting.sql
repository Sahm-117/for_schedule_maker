-- Seed the support contact used by the floating "Need Support" button.
-- Stored as { name, phone } so admins can change who help routes to from the
-- admin Settings page without a deploy. Idempotent: keeps any value an admin
-- has already set.

INSERT INTO "AppSetting" ("settingKey", value)
VALUES ('support_contact', '{"name":"Adetutu","phone":"2348184742850"}'::jsonb)
ON CONFLICT ("settingKey") DO NOTHING;
