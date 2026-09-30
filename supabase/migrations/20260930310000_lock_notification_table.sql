-- Close the Notification table to the public key. Apply only AFTER the app version that
-- uses my_notifications / mark_notification_read / mark_all_notifications_read is live.
-- Server functions (service role) and the database's own functions still write to it.
DROP POLICY IF EXISTS "Allow all operations" ON "Notification";
REVOKE ALL ON "Notification" FROM anon, authenticated;
