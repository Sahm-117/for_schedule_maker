# Inspirational posts: Like, Download, Share, with counts for admins

## Summary
- Under the daily Inspirational Scripture (participant Home and support Home) there are three round icon buttons: **Like** (heart, fills when liked, tap again to undo), **Download** (saves the picture) and **Share** (opens the phone's own share sheet with the picture; if the device cannot share, it copies the link). "See all" tiles now open a larger view with the same three buttons, so older posts can be liked and shared too.
- Admin **Scriptures** page: a totals line (likes, downloads, shares) and the same three counts under every post. Likes count people; downloads and shares count every time. Practice and test accounts are not counted.
- A share is counted only when the share sheet completes (cancelling does not count); copying the link is not counted. A double tap within 10 seconds counts once.

- The icons are deliberately quiet: small, pale, no frame or shadow; the heart turns orange only when liked.
- The admin Scriptures page has a **cohort filter** (All cohorts, or one non-practice cohort) next to the totals; the counts and totals follow it. A participant counts for their own cohort, a support for each cohort they are attached to.

## Live changes
- Migration `20261013140000_scripture_engagement.sql` (applied live): table `ScriptureEngagement` (closed to the apps, functions only), functions `scripture_react`, `scripture_my_likes`, `scripture_engagement_summary` (admin only). FLOW_MAP rule 58.
- Migration `20261013150000_scripture_engagement_by_cohort.sql` (applied live): `scripture_engagement_summary` now takes an optional cohort id. The one-argument version from the first migration was dropped in the same file, since two versions side by side would make the call ambiguous.
- No edge function changes.
- Frontend: new `components/ScriptureActions.tsx`; `InspirationCarousel.tsx`, `ScriptureCarousel.tsx`, `AdminScripturesPage.tsx`, `supabase-api.ts`, `api.ts`, `types/index.ts`.

## How it was tested
- Live database, inside a block that was rolled back: a participant liked, unliked and liked again; download, a repeated download and share were logged; the admin summary showed 2 likes (participant and admin), 1 download, 1 share for that post; a participant calling the admin summary, a bad token and a missing day were all refused. The table was empty afterwards.
- Browser (local app, mocked backend): the heart was pressed before and after the tap, Download saved a file named for the day, Share passed the picture to the share sheet, the three calls reached the server with the right day, the See all viewer opened, and the admin page showed totals and per-post counts. No console errors.
- NOT tested: the real share sheet on a phone, real pictures from the live bucket, and a real login on either side.

## Open items
- A re-ordered post keeps its likes (they follow the picture), but a replaced picture keeps the old post's counts, because the post is the same row.
- Admins see counts only, not who liked; that can be added if wanted.
