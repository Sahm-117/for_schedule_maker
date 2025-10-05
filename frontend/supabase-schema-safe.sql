-- FOF Schedule Editor Database Schema for Supabase (Safe Version)
-- This version handles existing types and tables

-- Create custom types (enums) - only if they don't exist
DO $$ BEGIN
    CREATE TYPE "Role" AS ENUM ('ADMIN', 'SUPPORT');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "Period" AS ENUM ('MORNING', 'AFTERNOON', 'EVENING');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "ChangeType" AS ENUM ('ADD', 'EDIT', 'DELETE');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Users table
CREATE TABLE IF NOT EXISTS "User" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role "Role" DEFAULT 'SUPPORT',
    "createdAt" TIMESTAMP DEFAULT NOW(),
    "updatedAt" TIMESTAMP DEFAULT NOW()
);

-- Weeks table
CREATE TABLE IF NOT EXISTS "Week" (
    id SERIAL PRIMARY KEY,
    "weekNumber" INTEGER UNIQUE NOT NULL
);

-- Days table
CREATE TABLE IF NOT EXISTS "Day" (
    id SERIAL PRIMARY KEY,
    "weekId" INTEGER NOT NULL REFERENCES "Week"(id) ON DELETE CASCADE,
    "dayName" TEXT NOT NULL,
    UNIQUE("weekId", "dayName")
);

-- Activities table
CREATE TABLE IF NOT EXISTS "Activity" (
    id SERIAL PRIMARY KEY,
    "dayId" INTEGER NOT NULL REFERENCES "Day"(id) ON DELETE CASCADE,
    time TEXT NOT NULL,
    description TEXT NOT NULL,
    period "Period" NOT NULL,
    "orderIndex" INTEGER NOT NULL
);

-- Pending changes table
CREATE TABLE IF NOT EXISTS "PendingChange" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "weekId" INTEGER NOT NULL,
    "changeType" "ChangeType" NOT NULL,
    "changeData" JSONB NOT NULL,
    "userId" UUID NOT NULL REFERENCES "User"(id),
    "createdAt" TIMESTAMP DEFAULT NOW()
);

-- Rejected changes table
CREATE TABLE IF NOT EXISTS "RejectedChange" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "weekId" INTEGER NOT NULL,
    "changeType" "ChangeType" NOT NULL,
    "changeData" JSONB NOT NULL,
    "userId" UUID NOT NULL REFERENCES "User"(id),
    "submittedAt" TIMESTAMP NOT NULL,
    "rejectedBy" TEXT NOT NULL,
    "rejectedAt" TIMESTAMP DEFAULT NOW(),
    "rejectionReason" TEXT NOT NULL,
    "isRead" BOOLEAN DEFAULT FALSE
);

-- Create indexes for better performance (only if they don't exist)
DO $$ BEGIN
    CREATE INDEX idx_activity_day_order ON "Activity"("dayId", "orderIndex");
EXCEPTION
    WHEN duplicate_table THEN null;
END $$;

-- Insert default admin user (password: admin123) - only if doesn't exist
INSERT INTO "User" (email, name, password_hash, role)
SELECT 'admin@fof.com', 'Admin User', '$2b$10$8K1p/a9DLyfoaYJ8c7F1sO5.JxUn9UyO8LqFWF/iQ5.rHYnGb6DSa', 'ADMIN'
WHERE NOT EXISTS (SELECT 1 FROM "User" WHERE email = 'admin@fof.com');

-- Insert sample week - only if doesn't exist
INSERT INTO "Week" ("weekNumber")
SELECT 1
WHERE NOT EXISTS (SELECT 1 FROM "Week" WHERE "weekNumber" = 1);

-- Insert days for week 1 - only if they don't exist
DO $$
DECLARE
    week_id INTEGER;
BEGIN
    SELECT id INTO week_id FROM "Week" WHERE "weekNumber" = 1;

    IF week_id IS NOT NULL THEN
        INSERT INTO "Day" ("weekId", "dayName")
        SELECT week_id, 'Monday'
        WHERE NOT EXISTS (SELECT 1 FROM "Day" WHERE "weekId" = week_id AND "dayName" = 'Monday');

        INSERT INTO "Day" ("weekId", "dayName")
        SELECT week_id, 'Tuesday'
        WHERE NOT EXISTS (SELECT 1 FROM "Day" WHERE "weekId" = week_id AND "dayName" = 'Tuesday');

        INSERT INTO "Day" ("weekId", "dayName")
        SELECT week_id, 'Wednesday'
        WHERE NOT EXISTS (SELECT 1 FROM "Day" WHERE "weekId" = week_id AND "dayName" = 'Wednesday');

        INSERT INTO "Day" ("weekId", "dayName")
        SELECT week_id, 'Thursday'
        WHERE NOT EXISTS (SELECT 1 FROM "Day" WHERE "weekId" = week_id AND "dayName" = 'Thursday');

        INSERT INTO "Day" ("weekId", "dayName")
        SELECT week_id, 'Friday'
        WHERE NOT EXISTS (SELECT 1 FROM "Day" WHERE "weekId" = week_id AND "dayName" = 'Friday');

        INSERT INTO "Day" ("weekId", "dayName")
        SELECT week_id, 'Saturday'
        WHERE NOT EXISTS (SELECT 1 FROM "Day" WHERE "weekId" = week_id AND "dayName" = 'Saturday');

        INSERT INTO "Day" ("weekId", "dayName")
        SELECT week_id, 'Sunday'
        WHERE NOT EXISTS (SELECT 1 FROM "Day" WHERE "weekId" = week_id AND "dayName" = 'Sunday');
    END IF;
END $$;

-- Enable Row Level Security (RLS) for security
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Week" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Day" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Activity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PendingChange" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RejectedChange" ENABLE ROW LEVEL SECURITY;

-- Create policies (allow all for now - you can tighten security later)
DO $$ BEGIN
    CREATE POLICY "Allow all operations" ON "User" FOR ALL USING (true);
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE POLICY "Allow all operations" ON "Week" FOR ALL USING (true);
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE POLICY "Allow all operations" ON "Day" FOR ALL USING (true);
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE POLICY "Allow all operations" ON "Activity" FOR ALL USING (true);
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE POLICY "Allow all operations" ON "PendingChange" FOR ALL USING (true);
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE POLICY "Allow all operations" ON "RejectedChange" FOR ALL USING (true);
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;