# Inspirational scripture engagement: tracked and on a PostHog dashboard

Date: 2026-10-29. Frontend only: no migration, no function. FLOW_MAP rule 111 (unchanged: no names or free text in events).

## What changed
- One PostHog event, `scripture_engagement`, with `action` and `day` (and `surface` where it applies):
  - `enlarge`: the post opened full size. Surfaces are `home` (participant Home carousel), `see_all` (the
    See all grid) and `staff_home` (the staff Home carousel).
  - `see_all`: the See all list opened.
  - `like` / `unlike`: the heart.
  - `download`: saved to the device.
  - `share`: the phone's share sheet finished.
  - `copy_link`: no share sheet, so the link was copied instead.
  Code: `ScriptureActions.tsx`, `ScriptureCarousel.tsx`, `participantApp/InspirationCarousel.tsx`.
- PostHog dashboard "Inspirational scriptures" (pinned), id 2279020, with five charts:
  - taps by action per day
  - people per action
  - most engaged posts by day number
  - split by role
  - an enlarge → like → share funnel within a day

## Notes
- The charts fill from the next deploy onward. Earlier likes, downloads and shares are in the database
  (`ScriptureEngagement`, since 13 Oct) and show as totals on each post in the app; enlarging was never stored before.
- Role comes from the person property `role` set when people are identified.

## Tested
- `npm run build`; `tsc` shows no errors in the changed files. The one eslint error in `ScriptureActions.tsx`
  (react-refresh, `useScriptureLikes` export) was already there.
- Not seen live yet: open PostHog → Activity after the deploy and tap a post.
