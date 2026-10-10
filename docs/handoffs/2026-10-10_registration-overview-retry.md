# Registration overview: retry a dropped request

## Summary
- The registration cards (Dashboard, Follow-ups > Overview) showed "Couldn't check who has signed in" after a request died in transit (reported on a phone on mobile data).
  The two database calls were fine when run as an admin session, so the cause was on the way there, not in the data.
- `RegistrationOverviewCards.tsx`: each of the two calls (participants, who has signed in) is retried once after 1.5 s, only when the error looks like a
  dropped connection (load failed / failed to fetch / network / timeout / aborted). Real errors (expired session, no permission) show the message straight away.
  Only the call that failed is repeated. Retry timers are cleared when a newer load starts or the cards go away.
- The message and its "Try again" button are unchanged and still replace the cards when a load fails: numbers are never mixed from an old people list and a new contact list.
  (A first version kept stale numbers on screen; code review rejected it for exactly that mixing and removed the retry button's reach.)

## Live changes
None. Frontend only.

## How it was tested
`npm run build`, lint and type check (no new errors). NOT exercised in a browser or against a dropped connection; the original failure was not reproduced here.

## Open items
- If the message keeps appearing on a good connection, read the Supabase API logs for that time; the cause may not be a dropped request.
- `GroupEngineWizard.tsx` has the same "couldn't check who has signed in" pattern and was not changed.
