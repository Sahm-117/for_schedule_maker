# Hub, Profile Pictures, Per-User Themes, Faith-Project Review

Date: 2026-06-22
Branch: `main`
Latest commit: `7e3c211 Add Hub, profile pictures, per-user themes, and faith-project review flow`
Production status: pushed to `origin/main` (committed as `Sahm-117 <tisnotaname@gmail.com>`)
Build: clean `npm run build` from `frontend/` (518 modules, no errors); `tsc --noEmit` clean
Edge functions deployed to project `vnmeeqvwqaeczjlvzoul`: `notify-faith-project-review`, `notify-faith-project-submitted`, `notify-hub`

## What Was Done

### CSV import + cohorts (early session)
- Fixed 9 unparseable rows in participant CSV import — rewrote `parseRegistrationCsv` to a single-pass RFC 4180 character-stream parser (`parseCsvRows`) that handles embedded newlines inside quoted fields. Later hardened with unterminated-quote recovery so a stray quote no longer collapses the whole file into one row.
- Fixed `departments` NOT NULL violation in `createMany` (`departments: r.departments ?? []`).
- Cohort creation: auto-calculate end date from start date × week count (default 10 weeks → Sunday).

### Faith-project admin review flow
- New `NEEDS_REFINEMENT` status (added to `FaithProjectStatus` union + Postgres usage).
- Admin "Review" modal (replaces Edit): Approve / Needs-Refinement with required reason, review-history accordion (JSONB append-only `reviewHistory` column), notifications to support (in-app + push).
- Support side: shows review history + inline latest note; **approved projects are locked read-only** (support can no longer silently un-approve by saving).

### Follow-ups
- New `NEXT_COHORT` ("Will join next cohort") value on `FollowUpRegistrationStatus` + `FollowUpStatus` enums.
- Cohort creation prompts to move next-cohort follow-up contacts into the new cohort.
- Renamed follow-up "Owner" → "Follow-up rep" across UI (Groups still use "Support") to separate the two flows.
- Fixed Overview vs Contacts count mismatch: `computeOwnerBreakdown.stillOpen` now sums active buckets (excludes archived) instead of subtracting.

### Hub (support forum) — biggest new surface
- 3 new tables: `HubTopic`, `HubComment`, `HubReply`. Topics have Open/Closed tabs (closed = archived tab, read-only).
- Threaded comments + replies, @mentions with portal dropdown, author/admin delete, edit own comments/replies, author-or-admin close.
- Realtime updates (Supabase channels) so new topics/comments/replies appear without reload.
- `HubPage.tsx` (~900 lines) is the whole feature.

### Profile pictures + per-user theme
- `avatarUrl` column; client-side canvas compression to 128×128 JPEG (free-tier friendly); shared `Avatar.tsx` (photo or initials, falls back to initials on load error).
- Per-user accent colour: `themeColor` column, swatch palette + native colour picker, collapsed Edit pattern matching the notification-settings row.
- Theme applied at runtime via **RGB-channel CSS variables** so Tailwind opacity modifiers work and pastel tints re-theme too.

### Notification feed
- In-app `Notification` table + `NotificationBell` + edge-function inserts. All notification types route through `notify-*` edge functions (service role) for both in-app feed rows AND Web Push.

### Code review (xhigh) + fixes
- Ran 10-angle multi-agent review on the full diff; found and fixed 15 issues.

## Files Changed

New: `frontend/src/components/Avatar.tsx`, `frontend/src/components/NotificationBell.tsx`, `frontend/src/pages/HubPage.tsx`, `frontend/src/utils/reconcile.ts`, `frontend/src/utils/theme.ts`, `supabase/functions/_shared/notifications.ts`, `supabase/functions/notify-faith-project-review/`, `notify-faith-project-submitted/`, `notify-hub/`, migrations `20260622024448_notifications`, `..120000_faith_project_review_history`, `..140000_user_avatar`, `..150000_hub`, `..160000_user_theme_color`.

Modified: `frontend/src/App.tsx`, `components/AppShell.tsx`, `context/AppDataContext.tsx`, `hooks/useAuth.tsx`, `index.css`, `tailwind.config.js`, `pages/{AdminFaithProjectsPage,AdminFollowUpsPage,AdminParticipantsPage,AdminGroupsPage,AdminAttendancePage,CohortsPage,SupportHomePage,SupportParticipantsPage,SupportProfilePage}.tsx`, `components/followups/{FollowUpContactsTable,FollowUpDashboard}.tsx`, `services/{api,supabase-api}.ts`, `types/index.ts`, `utils/{contactImport,followUps}.ts`, `supabase/functions/{notify-followup-*,send-announcement}/index.ts`.

## Key Decisions & Patterns

- **Theme via RGB channels**: `--color-primary-rgb: 255 145 77` + `primary: 'rgb(var(--color-primary-rgb) / <alpha-value>)'` in tailwind config. This is REQUIRED — `var(--color-primary)` holding a hex makes Tailwind emit ZERO rules for `bg-primary/10`, `text-primary/80`, etc. `applyTheme` in `utils/theme.ts` is the single source of truth; derived tints (`-soft/-50/-100/-200`) computed from the same hex so logged-out (index.css defaults) and logged-in match.
- **Notifications always go through edge functions** (service role) so both the in-app row and Web Push happen server-side, never client-side table inserts (which skip push and depend on permissive RLS). `notify-hub` accepts client-resolved recipients (audience depends on parsing post text) with role-aware deep-link paths.
- **Realtime**: refetch authoritative counts + `reconcileById` to avoid flicker, rather than fragile +1/-1 math (DELETE payloads only carry the PK under default replica identity). Ignore self-authored echoes to avoid double-counting.
- **Confirmation modals**: use the shared `ConfirmationModal`, never `window.confirm`.
- **@mentions**: match against the known user list (longest-name-first) for both highlight and notify, not a greedy regex — handles multi-word names, punctuation, substring collisions.
- Mobile bottom nav: short `mobileLabel` (Schedule/Group) vs full sidebar label (My Schedule/My Group); capped at 5 items.

## Backend / Handoff Notes

- DB connection: pooler `aws-1-eu-west-2`, password in ROOT `.env.local` (`SUPABASE_DB_PASSWORD`), run `pg` from `frontend/`. Project ref `vnmeeqvwqaeczjlvzoul`.
- `Notification.type` column is plain `text` (no CHECK/enum) — adding new types like `HUB` is safe.
- All 5 new migrations applied directly to production via pg; migration files committed for record.
- Test credentials in root `.env.test.local` (gitignored). Backend is PRODUCTION — create isolated `[TEST]`-prefixed data and delete after; clean up `Notification` rows.
- One deliberate non-fix from the review: nothing outstanding — all 15 findings resolved, `notify-hub` closed the last (Hub push) item.
- `.sessions/` is NOT yet in `.gitignore` (prior sessions were committed; left as-is).
