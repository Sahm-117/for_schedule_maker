# Optional note on "Mark done", and a clearer Android install fallback

Date: 2026-10-24. One live migration; no function deploys.

## Summary

- **Mark done asks "Any notes?"** (optional). Supports tapping Mark done on a schedule activity (Schedule: Up next and activity cards; Home: Today list) get the same popup as admin checklist tasks. Done with an empty box still marks it done; Cancel does nothing. Admins see the notes under each activity in the completion overview drawer. See FLOW_MAP rule 100.
- **Supports already see the Inspirational Scriptures on Home** (rule 45, `SupportScriptures`); nothing to change.
- **Android install fallback.** When the browser has not offered the one-tap Install (Firefox, the browser inside WhatsApp/Facebook/Instagram, Opera, unknown browsers), "Get the app" now says why and shows **Open in Chrome** (Android intent link) and **Copy link**, then the menu steps. In Chrome without the button it shows the menu steps plus a hint that the app may already be installed. `detectAndroidBrowser` in `useAppSetup.ts`. The browser alone decides whether the one-tap prompt exists; it cannot be forced.

## Live changes

- `20261024120000_activity_completion_note.sql`: `ALTER TABLE "SupportActivityCompletion" ADD COLUMN IF NOT EXISTS note TEXT`. Applied with the Management API and the column checked. Rollback: `ALTER TABLE "SupportActivityCompletion" DROP COLUMN note`.

No edge function deployed.

## Open items

- Verified in a mocked browser only (no real support login): Mark done popup (Cancel, with note, empty note) and the install fallback for Firefox, in-app WhatsApp and Chrome user agents.
