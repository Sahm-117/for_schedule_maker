-- Delete user with email irojaholamide+2@gmail.com
-- Run this in Supabase SQL Editor

-- First, get the user ID
DO $$
DECLARE
  user_id_to_delete UUID;
  system_user_id UUID := 'a0000000-0000-4000-8000-000000000002';
BEGIN
  -- Get the user ID
  SELECT id INTO user_id_to_delete
  FROM "User"
  WHERE email = 'irojaholamide+2@gmail.com';

  IF user_id_to_delete IS NOT NULL THEN
    -- Update RejectedChange records to point to System user
    UPDATE "RejectedChange"
    SET "userId" = system_user_id
    WHERE "userId" = user_id_to_delete;

    -- Update PendingChange records to point to System user
    UPDATE "PendingChange"
    SET "userId" = system_user_id
    WHERE "userId" = user_id_to_delete;

    -- Now delete the user
    DELETE FROM "User"
    WHERE id = user_id_to_delete;

    RAISE NOTICE 'User deleted successfully';
  ELSE
    RAISE NOTICE 'User not found';
  END IF;
END $$;
