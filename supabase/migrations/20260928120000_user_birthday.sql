-- Date of birth becomes Birthday (day and month only): the sign-up form never
-- asked for the year. The column was added earlier today and is still empty.
ALTER TABLE public."User" RENAME COLUMN "dateOfBirth" TO birthday;
ALTER TABLE public."User" ALTER COLUMN birthday TYPE TEXT USING NULL;
ALTER TABLE public."User" ADD CONSTRAINT user_birthday_format
  CHECK (birthday IS NULL OR birthday ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$');
COMMENT ON COLUMN public."User".birthday IS 'MM-DD. Optional; not part of profile completion.';

GRANT SELECT (birthday) ON "User" TO anon, authenticated;
GRANT UPDATE (birthday) ON "User" TO anon, authenticated;
