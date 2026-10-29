# Participant App guide refreshed, guides refresh themselves, old onboarding page removed, chip chevron

Date: 2026-10-29. Frontend only: no migration, no function. FLOW_MAP rules 109 and 113 updated.

## What changed
- **Help → App guide, participant part** (`public/guides/app-guide/content.js`), checked against today's screens.
  - New topic "Getting ready for your first class": the Get ready list, the Readiness Badge, and ticking your intro after class 1.
  - New My Group task "How do I talk with my group?": Discussion, intros, tagging, and reporting through ⋮.
  - Fixed answers:
    - password minimum is 5, not 8
    - the first sign-in order
    - the new Home layout and its class card
    - scriptures open at midnight, not 2 PM
    - Join call opens 10 minutes before
    - "Get help" when not in a group
    - the week labels
    - Journey labels
    - the My Group tabs and the WhatsApp button
    - Faith Project's Edit button and prayer settings
    - Resources now lists manuals
    - the Profile photo and Edit
    - Help is under your photo, not a floating "?"
  - Removed the "red dot on F. Project" tip, because no such dot exists.
- **Participant screenshots retaken** with made-up sample people (585×1266), 21 in all:
  - home, home-lower, journey, journey-weeks, journey-attendance
  - group (Discussion), new group-meeting
  - faith project, resources, people, feedback, more menu, notifications
  - profile, profile-edit, profile-password, help menu
  - week, week-recap-soon, week-reflection, week-notes-question
  - new get-ready
- **Personal data removed:** the old `participant-profile-edit.jpg` showed the owner's real email address in the guide. It is replaced.
- **Kept:** the class-rating, faith-guide, manual-reader, testimonies, testimony-new, wrapping-up, page-tour and login shots. They were checked: sample data only, and still accurate.
- **Guides now refresh themselves** (`sw.ts`). `/guides/` used to be CacheFirst for 60 days in the shared `runtime-assets` cache, so edited guide words and pictures did not reach phones that had opened them before, including the 27 Oct guide edits. Guides are now stale-while-revalidate in their own `guides` cache (300 entries): the saved copy shows at once and the latest is fetched in the background for the next open. No version to bump, and the guide screenshots no longer evict the lazily cached class manuals and PDF tools.
- **Removed** `frontend/src/pages/SupportOnboardingPage.tsx` (owner approved). It was not routed or imported anywhere; `/support/onboarding` redirects to My Group.
- **Participants list:** the Keep an eye on / Needs attention chip has a › chevron so it looks tappable (owner request).

## Tested
- `npm run build`. `tsc` shows only the 7 errors already on `main`.
- Browser (mocked backend):
  - The guide shows the new topic and its picture.
  - The chip shows the chevron and still opens the "why" pop-up.
  - Every screenshot was looked at.
- The service worker change was checked by build only. A phone that already has the old guide shows it once more, then the new copy from the next open.
- /code-review (medium). It caught:
  - the real email in a screenshot
  - four screenshots that no longer matched the text
  - the cache cause; an earlier `?v=` versioning attempt was dropped for the service-worker fix
  - a doubled FLOW_MAP sentence

## Open items
- The admin and support parts of the App guide were not checked in this pass. Look at their screenshots for real personal data too.
- `content.js` is edited as data. Use a load → change → `JSON.stringify(…, null, 1)` round trip, which leaves the file byte-identical apart from the changes.
