# Inspirational posts: all-time counts for participants and supports

Date: 2026-10-24. One live migration; no edge function. FLOW_MAP rule 58.

## Summary
Participants and supports now see how many people liked, downloaded and shared a post, beside the three icons (Home carousel, "See all" viewer, support Home). The numbers are all-time and all-cohort, so they do not reset with a cohort: they are there as social proof. A count of zero shows nothing; 1,500 shows as "1.5k". Liking or unliking moves the heart's number straight away; a saved download or share adds one (a repeat within 10 seconds counts once, as on the server). Admins already had all-time totals with a cohort filter (All cohorts or one cohort); that page is unchanged.

## Live changes
- Migration `20261024130000_scripture_public_counts.sql` (applied live through the Management API): `scripture_public_counts(p_token)`, read-only, any valid participant or staff session, returns `[{dayNumber, likes, downloads, shares}]` for posts with a count. Same rules as the admin totals (likes count people, downloads and shares count every time, practice cohorts and test accounts left out). Rollback line at the top of the file.
- Frontend: `ScriptureActions.tsx` (hook now also loads counts; icons show them), `ScriptureCarousel.tsx`, `InspirationCarousel.tsx`, `supabase-api.ts` (`publicCounts`), `lib/supabase.ts` (listed as a read-only function so it never clears the read cache).

## How it was tested
- Live database: the function exists, is SECURITY DEFINER and STABLE, and refuses a bad token. Its query was run directly (read-only) and returned the live totals per post (13 posts with counts). Not run with a real participant or staff token.
- Browser (local app, mocked backend): three posts, counts shown beside the icons, a post with 1,500 likes shows "1.5k", liking raised the number, unliking lowered it, accessible labels read "Like, 1500 likes", no console errors. Download and Share counting by a real tap was not tried (needs the real picture and a phone share sheet).
- `npm run build`; eslint on the changed files shows only the existing "fast refresh" warning for the hook export.

## Open items
- Not seen with a real login on either side.
- The admin page has a cohort filter, not a date range. A "from / to" date filter on the Scriptures page would be a small follow-up (the table keeps `createdAt`) if wanted.
