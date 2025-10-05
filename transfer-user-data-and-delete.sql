-- Transfer user data to Admin user and enable safe deletion
-- This will move all records from the user to be deleted to the Admin user

-- 1. Show current state
SELECT 'BEFORE TRANSFER:' as info;
SELECT u.name, u.email,
    (SELECT COUNT(*) FROM "PendingChange" WHERE "userId" = u.id) as pending_changes,
    (SELECT COUNT(*) FROM "Activity" WHERE "userId" = u.id) as activities,
    (SELECT COUNT(*) FROM "RejectedChange" WHERE "userId" = u.id) as rejected_changes
FROM "User" u
ORDER BY u."createdAt";

-- 2. Get the Admin user ID and user to delete ID
DO $$
DECLARE
    admin_user_id UUID;
    user_to_delete_id UUID;
BEGIN
    -- Get Admin user ID
    SELECT id INTO admin_user_id FROM "User" WHERE email = 'admin@fof.com';

    -- Get user to delete ID
    SELECT id INTO user_to_delete_id FROM "User" WHERE email = 'irojaholamide@gmail.com';

    IF admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Admin user not found with email admin@fof.com';
    END IF;

    IF user_to_delete_id IS NULL THEN
        RAISE EXCEPTION 'User to delete not found with email irojaholamide@gmail.com';
    END IF;

    -- Transfer PendingChange records
    UPDATE "PendingChange"
    SET "userId" = admin_user_id
    WHERE "userId" = user_to_delete_id;

    -- Transfer Activity records
    UPDATE "Activity"
    SET "userId" = admin_user_id
    WHERE "userId" = user_to_delete_id;

    -- Transfer RejectedChange records
    UPDATE "RejectedChange"
    SET "userId" = admin_user_id
    WHERE "userId" = user_to_delete_id;

    RAISE NOTICE 'Successfully transferred all records from user % to admin user %', user_to_delete_id, admin_user_id;
END $$;

-- 3. Verify transfer
SELECT 'AFTER TRANSFER:' as info;
SELECT u.name, u.email,
    (SELECT COUNT(*) FROM "PendingChange" WHERE "userId" = u.id) as pending_changes,
    (SELECT COUNT(*) FROM "Activity" WHERE "userId" = u.id) as activities,
    (SELECT COUNT(*) FROM "RejectedChange" WHERE "userId" = u.id) as rejected_changes
FROM "User" u
ORDER BY u."createdAt";

-- 4. Now the user can be safely deleted
DELETE FROM "User" WHERE email = 'irojaholamide@gmail.com';

-- 5. Final verification
SELECT 'AFTER DELETION:' as info;
SELECT name, email, role FROM "User" ORDER BY "createdAt";

SELECT 'User successfully deleted! All their data has been transferred to Admin user.' as final_status;