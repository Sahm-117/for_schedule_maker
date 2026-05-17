-- Add SOP_PREPARER as a third role value.
-- Run this in the Supabase SQL Editor before deploying the updated frontend.
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'SOP_PREPARER';
