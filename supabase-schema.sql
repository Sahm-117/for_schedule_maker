-- FOF Schedule Editor Database Schema for Supabase
-- Copy and paste this into Supabase SQL Editor

-- Create custom types (enums)
CREATE TYPE "Role" AS ENUM ('ADMIN', 'SUPPORT');
CREATE TYPE "Period" AS ENUM ('MORNING', 'AFTERNOON', 'EVENING');
CREATE TYPE "ChangeType" AS ENUM ('ADD', 'EDIT', 'DELETE');

-- Users table
CREATE TABLE "User" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role "Role" DEFAULT 'SUPPORT',
    "createdAt" TIMESTAMP DEFAULT NOW(),
    "updatedAt" TIMESTAMP DEFAULT NOW()
);

-- Weeks table
CREATE TABLE "Week" (
    id SERIAL PRIMARY KEY,
    "weekNumber" INTEGER UNIQUE NOT NULL
);

-- Days table
CREATE TABLE "Day" (
    id SERIAL PRIMARY KEY,
    "weekId" INTEGER NOT NULL REFERENCES "Week"(id) ON DELETE CASCADE,
    "dayName" TEXT NOT NULL,
    UNIQUE("weekId", "dayName")
);

-- Activities table
CREATE TABLE "Activity" (
    id SERIAL PRIMARY KEY,
    "dayId" INTEGER NOT NULL REFERENCES "Day"(id) ON DELETE CASCADE,
    time TEXT NOT NULL,
    description TEXT NOT NULL,
    period "Period" NOT NULL,
    "orderIndex" INTEGER NOT NULL
);

-- Labels table (admin-managed)
CREATE TABLE "Label" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    "createdAt" TIMESTAMP DEFAULT NOW(),
    "updatedAt" TIMESTAMP DEFAULT NOW()
);

-- Case-insensitive uniqueness on label name
CREATE UNIQUE INDEX idx_label_name_lower_unique ON "Label"(lower(name));

-- Activity <-> Label join table
CREATE TABLE "ActivityLabel" (
    "activityId" INTEGER NOT NULL REFERENCES "Activity"(id) ON DELETE CASCADE,
    "labelId" UUID NOT NULL REFERENCES "Label"(id) ON DELETE CASCADE,
    PRIMARY KEY ("activityId", "labelId")
);

CREATE INDEX idx_activitylabel_activity ON "ActivityLabel"("activityId");
CREATE INDEX idx_activitylabel_label ON "ActivityLabel"("labelId");

-- Pending changes table
CREATE TABLE "PendingChange" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "weekId" INTEGER NOT NULL,
    "changeType" "ChangeType" NOT NULL,
    "changeData" JSONB NOT NULL,
    "userId" UUID NOT NULL REFERENCES "User"(id),
    "createdAt" TIMESTAMP DEFAULT NOW()
);

-- Rejected changes table
CREATE TABLE "RejectedChange" (
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

-- Create indexes for better performance
CREATE INDEX idx_activity_day_order ON "Activity"("dayId", "orderIndex");

-- Insert default admin user (password: admin123)
INSERT INTO "User" (email, name, password_hash, role) VALUES
('admin@fof.com', 'Admin User', '$2b$10$8K1p/a9DLyfoaYJ8c7F1sO5.JxUn9UyO8LqFWF/iQ5.rHYnGb6DSa', 'ADMIN');

-- Insert sample week
INSERT INTO "Week" ("weekNumber") VALUES (1);

-- Insert days for week 1
INSERT INTO "Day" ("weekId", "dayName") VALUES
(1, 'Monday'),
(1, 'Tuesday'),
(1, 'Wednesday'),
(1, 'Thursday'),
(1, 'Friday'),
(1, 'Saturday'),
(1, 'Sunday');

-- Enable Row Level Security (RLS) for security
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Week" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Day" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Activity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Label" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ActivityLabel" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PendingChange" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RejectedChange" ENABLE ROW LEVEL SECURITY;

-- Create policies (allow all for now - you can tighten security later)
CREATE POLICY "Allow all operations" ON "User" FOR ALL USING (true);
CREATE POLICY "Allow all operations" ON "Week" FOR ALL USING (true);
CREATE POLICY "Allow all operations" ON "Day" FOR ALL USING (true);
CREATE POLICY "Allow all operations" ON "Activity" FOR ALL USING (true);
CREATE POLICY "Allow all operations" ON "Label" FOR ALL USING (true);
CREATE POLICY "Allow all operations" ON "ActivityLabel" FOR ALL USING (true);
CREATE POLICY "Allow all operations" ON "PendingChange" FOR ALL USING (true);
CREATE POLICY "Allow all operations" ON "RejectedChange" FOR ALL USING (true);
