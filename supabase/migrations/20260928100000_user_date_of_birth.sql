-- Optional date of birth on staff/support accounts. Admins fill it in from the
-- support profile window; it does not count towards profile completion.
ALTER TABLE public."User"
  ADD COLUMN IF NOT EXISTS "dateOfBirth" DATE;

-- User is read/written column by column; let the app see and save the new field.
GRANT SELECT ("dateOfBirth") ON "User" TO anon, authenticated;
GRANT UPDATE ("dateOfBirth") ON "User" TO anon, authenticated;
