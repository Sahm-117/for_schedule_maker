-- Add STAFF ("Team member") as a fourth role value. Kept in its own file: a new enum value cannot be used in the
-- transaction that adds it, so everything that uses it is in 20261013090100_roles_and_permissions.sql.
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'STAFF';
