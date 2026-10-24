# Speed and load optimisations

Date: 2026-10-24. Frontend only: no migrations, no functions.

## Measured
In a mocked browser (dev server), requests on a cold load of the support screens: Home 94 to about 60-75, My Group People 84 to about 60, Schedule 50 to about 40, My Hub to about 40 (run-to-run variation is large; dev mode runs every effect twice). Production build size is unchanged (entry chunk 518 KB raw, 148 KB gzip; most of it is react-dom and `supabase-api.ts`).

## Changed
- **Request sharing and short keeping** (`lib/supabase.ts`, FLOW_MAP rule 103): more read-only functions share one request when they overlap; their answers are kept 3 s; three small reference tables (settings, scripture, project categories) are kept 20 s; all of it is per session and cleared by any write that is not on the harmless list.
- **Start-up** (`AppDataContext`): the resource count, notifications and hub activity start at once, and My Hub loads beside the weeks.
- **Attendance** (support and admin): the page no longer re-draws every second; it ticks every 15 s, every second only in the last minute (`hooks/useDeadlineClock.ts`).
- **Idle prefetch** (`prefetch.ts`): after the first screen, the other bottom-bar screens are downloaded one at a time (not on Data Saver or 2G).
- **Images:** avatars, class thumbnails, person circles and mention pictures are lazy and decoded off the main thread.

## Left alone, on purpose
- The service worker still saves the app for offline on the first visit (about 3.2 MB in the background). Making it lazy would trade offline-first for first-visit speed; say if that is wanted.
- The week list is still fetched with every column and every activity. Trimming it needs care because many screens read those fields.
- Splitting `supabase-api.ts` (about 200 KB raw in the entry chunk) by area would cut the first download but touches every import.

## Tested
Type check (7 known errors), build, and mocked-browser runs of Attendance, Home, People, Schedule, My Hub and Mark done (all pass; the Mark-done "empty note" check now sees no note key, which is intended).
