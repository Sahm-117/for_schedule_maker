# FOF Ops

A Progressive Web App for running the Foundation of Faith (FOF) discipleship programme at The Covenant Nation (TCN) Ikorodu — the weekly schedule, the participants, the support team's day-to-day work, and a participant app of its own.

**Live app:** https://for-schedule-maker.vercel.app
**GitHub:** https://github.com/Sahm-117/for_schedule_maker

---

## What it does

FOF runs in cohorts. Each cohort has its own weeks, participants, and small groups led by a support person. The app is the single source of truth for all of it — installable on any phone, works offline, and pushes notifications when things change.

**Three audiences:**

| Who | What they get |
|---|---|
| **Admin** | The back office: cohorts, participants, groups, hubs, supports, attendance, faith projects and testimonies, follow-ups, feedback, users, announcements, resources, settings |
| **Support** | Their own mobile-first app (`/support`): schedule, group, participants, mobilisation, My Hub, community, resources |
| **Participant** | A separate app (`/me`): home, journey, group, faith project, testimonies, people, resources, feedback, profile |

### Supports and hubs

Supports are grouped into **hubs** per cohort. Each support has a kind for the cohort:

- **Participant support** — leads a small group of participants
- **Hub lead** — leads supports only, no participant group
- **Operational support** — IT/technical help covering two or more hubs, no participant group

On top of that, each hub has named jobs: **Hub Lead** (runs the hub, does announcements), **Assistant Hub Lead** (makes sure the meeting happens and everyone attends; the Hub Lead decides what else they may do), **Recap Lead**, **Prayer Lead** and **IT Support**. Jobs show as labels on names in My Hub, with an introduction the first time someone gets one.

The weekly **hub meeting** (the Sunday recap meeting) has its own walk-through: Attendance → Prayer → Review & Recap → Announcements → Notes → Submit. The prayer step lists the Faith Projects that participants have chosen to include in the general prayers.

### The support app (`/support`)

- **Home** — weekly progress, today's activities with "mark done", a weekly checklist that saves, recent announcements, and a pinned urgent announcement card
- **Mobilisation** — register a lead, then work the follow-up list (statuses, message templates, WhatsApp/call, registration link)
- **My Schedule** — the week's activities, a per-support checklist (ticked items tuck away after a short countdown), and PDF download
- **My Group** — participants, faith projects, notes, concerns; a five-step group meeting flow (attendance → prayer → recap → notes → submit); and Sunday class attendance
- **Onboard** — onboarding steps and message templates (adding a support is coordinator-only)
- **My Hub** — fellow supports and their jobs, the hub meeting walk-through, prayer list, messages from the lead, trainings (leads), and a hub switcher for IT supports on several hubs
- **Community, Resources, Profile** — team discussion and people directory, shared files, and personal settings

Supports without a participant group (hub leads, operational supports) get a Home and empty states that point them to My Hub instead.

### The participant app (`/me`)

Participants sign in with their phone number once their support enrols them. They see the week's class and recap, their attendance, their group and support, their Faith Project (with an opt-in to include it in the general prayers, and a way to ask for help if it isn't going well), testimonies, a notifications bell, and after-class feedback.

### Notable flows

- **Recap documents** — the back office uploads a weekly recap PDF in **Cohorts**; supports read it inside the app (pdf.js viewer that minimises to a pill) rather than leaving for a browser tab.
- **Concerns** — a support flags a participant; operations sees it on **Participants** with a "needs attention" filter and can clear it.
- **Announcements** — sent as push + in-app, and optionally pinned to the support Home screen until a chosen date, with an optional link.
- **Notifications** — the bell splits into *Announcements* and *Activity* tabs.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + TypeScript + Vite 7 + Tailwind CSS |
| PWA | vite-plugin-pwa (Workbox `injectManifest`) |
| Database | Supabase (PostgreSQL) |
| Serverless | Supabase Edge Functions (push + announcements) |
| Hosting | Vercel |
| Push | Web Push (VAPID) |
| Documents | pdf.js (`pdfjs-dist`) for in-app viewing, jsPDF for exports |

---

## Project structure

```
fof_schedule/
├── frontend/                   # React PWA
│   ├── src/
│   │   ├── components/         # Shared UI (AppSelect, AppDateTimePicker,
│   │   │   │                   #   DocumentViewerSheet, NotificationBell, …)
│   │   │   ├── attendance/     # Sunday class panel
│   │   │   ├── followups/      # Follow-up table, modals, message bank
│   │   │   ├── groups/         # Group call card, meeting mode, participant card
│   │   │   └── hubs/           # Hub meeting walk-through, hub job labels
│   │   ├── pages/              # Route-level pages (admin + /support/*)
│   │   ├── hooks/              # useAuth, usePWAInstall, walkthrough, …
│   │   ├── services/           # api.ts → supabase-api.ts (all data access)
│   │   ├── context/            # AppDataContext (cohort, weeks, notifications)
│   │   └── sw.ts               # Service worker (Workbox + push handlers)
│   └── vite.config.ts
├── supabase/
│   ├── migrations/             # SQL migrations, applied in order
│   └── functions/              # Edge functions (notify-*, send-announcement,
│                               #   push-reminders, daily-checks, …)
├── scripts/                    # Maintainer scripts (apply-migration.cjs, …)
└── supabase-schema.sql         # Full schema for a fresh setup
```

---

## Local development

### Prerequisites
- Node.js 18+
- Access to the project's Supabase project (or your own)

### Setup

```bash
git clone https://github.com/Sahm-117/for_schedule_maker.git
cd for_schedule_maker/frontend
npm install
cp .env.example .env.local     # then fill in the values
npm run dev
```

The app runs at `http://localhost:5173` and talks to the hosted Supabase project — there is no local backend to start.

### Environment variables

`frontend/.env.local` (see `frontend/.env.example`):

| Variable | Purpose |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key (safe for the browser) |
| `VITE_VAPID_PUBLIC_KEY` | Web Push public key |
| `VITE_DATA_PROVIDER` | `supabase` (default) |
| `VITE_API_URL` | Only for the unused `backend` provider mode |

A root `.env.local` holds **maintainer-only secrets** used by scripts and migrations — the service-role key, the database password and a Supabase access token. It is gitignored and must never reach the browser bundle or the repo.

### Useful commands

```bash
npm run dev               # dev server
npm run build             # production build (no type-check)
npm run build-with-types  # type-check then build
npm run lint
npm run preview           # serve the built app
```

---

## Database

- **Fresh setup:** run `supabase-schema.sql` in the Supabase SQL editor, then the files in `supabase/migrations/` in filename order.
- **Existing database:** apply only the new migration files, in order. `node scripts/apply-migration.cjs supabase/migrations/<file>.sql` applies one file using the root `.env.local` (set `PG_PATH` to a folder containing the `pg` package if it isn't installed).
- Migrations are additive by convention, so a deployed app keeps working while a new frontend rolls out.

Passwords are stored hashed (`password_hash`), and the browser can't read that column.

---

## Authentication and RLS

The app uses **custom authentication**, not Supabase Auth.

- Signing in calls a `SECURITY DEFINER` function that checks the hashed password and creates a row in `AppSession`
- The session token is kept in `localStorage` and sent on every request as the `x-session-token` header
- Requests still run as the PostgreSQL `anon` role; database helpers (`app_current_user_id()`, `app_is_staff()`, `app_participant_id(token)`) read the header to work out who is asking

**So:** staff tables are locked to signed-in staff by RLS, and participant data is only reachable through token-checked functions. New tables should follow the same staff-only pattern (see the `staff_only_*` migrations) rather than open policies.

---

## PWA and push

- Service worker: `frontend/src/sw.ts` → `dist/sw.js`
- `registerType: 'prompt'` — users get an update banner and tap Refresh
- Push and notification clicks are handled in `sw.ts`; Edge Functions in `supabase/functions/` send them

Generate VAPID keys with `npx web-push generate-vapid-keys`. The public key goes in the frontend env; the private key stays in Supabase/Vercel secrets.

Some in-app notifications (participant flags) are written straight to the `Notification` table and appear in the bell without a push.

---

## Deployment

Every push to `main` deploys to Vercel automatically.

- Root directory: `frontend`
- Build: `npm run build`, output `dist`
- Set `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` and `VITE_VAPID_PUBLIC_KEY` in the Vercel dashboard

### Supabase keep-alive

The free tier pauses after 7 days idle, so a daily cron on [cron-job.org](https://cron-job.org) pings the REST API:

```
https://YOUR_PROJECT_REF.supabase.co/rest/v1/Week?select=id&limit=1&apikey=YOUR_ANON_KEY
```

---

## Brand colours

| Token | Hex | Usage |
|---|---|---|
| `primary` | `#FF914D` | Buttons, badges, key UI |
| `primary-dark` | `#E5822D` | Hover states |

Status chips follow a soft-pill palette: a pastel surface with saturated text (e.g. `bg-emerald-100/80 text-emerald-700`).

---

## Key files

| File | Purpose |
|---|---|
| `src/services/supabase-api.ts` | Every database call. Start here for any data change. |
| `src/services/api.ts` | Thin wrapper that selects the provider |
| `src/context/AppDataContext.tsx` | Active cohort, weeks, notifications, live refresh |
| `src/components/AppShell.tsx` | Navigation for both the back office and the support app |
| `src/components/groups/MeetingModePanel.tsx` | The five-step group meeting flow |
| `src/components/hubs/HubMeetingPanel.tsx` | The six-step hub meeting flow |
| `src/components/hubs/hubJobs.ts` | Hub job names, colours and explanations |
| `src/components/DocumentViewerSheet.tsx` | In-app PDF/image viewer |
| `src/sw.ts` | Service worker: caching, push, notification clicks |

---

## Contributing

1. Branch from `main`
2. Make changes in `frontend/`
3. `npm run build-with-types` and fix anything new
4. Drive the change in a real browser as the role that uses it — not just admin
5. Clean up any test data you create in the shared database
6. Open a pull request describing what changed and why

### Before you change anything

- **No custom backend** — all data goes through `supabase-api.ts`
- **Custom auth** — don't introduce Supabase Auth without handling the anon-role RLS implications
- **Shared database** — local development points at the live Supabase project, so treat writes with care
- **Service worker / manifest** — changes prompt every installed user to update; test the update banner

---

## License

Internal project — TCN Ikorodu / Foundation of Faith programme.
