# FOF Ops

A Progressive Web App for running the Foundation of Faith (FOF) discipleship programme at The Covenant Nation (TCN) Ikorodu — the weekly schedule, the participants, and the support team's day-to-day work.

**Live app:** https://for-schedule-maker.vercel.app
**GitHub:** https://github.com/Sahm-117/for_schedule_maker

---

## What it does

FOF runs in cohorts. Each cohort has its own weeks, participants, and small groups led by a support person. The app is the single source of truth for all of it — installable on any phone, works offline, and pushes notifications when things change.

**Three roles:**

| Role | What they get |
|---|---|
| **Admin** | The back office: cohorts, participants, groups, attendance, faith projects, follow-ups, rota, users, announcements, resources, settings |
| **SOP Preparer** | Submits schedule edits for admin approval, and views the schedule |
| **Support** | Their own mobile-first app: schedule, group, participants, mobilisation, hub, resources |

### The support app (`/support`)

- **Home** — weekly progress, today's activities with "mark done", a weekly checklist that saves, recent announcements, and a pinned urgent announcement card
- **Mobilisation** — register a lead, then work the follow-up list (statuses, message templates, WhatsApp/call, registration link)
- **My Schedule** — the week's activities, a per-support checklist (ticked items tuck away after a short countdown), PDF download, and cover requests
- **My Group** — participants, faith projects, notes, concerns; a five-step group meeting flow (attendance → prayer → recap → notes → submit); and Sunday class attendance
- **Onboard** — onboarding steps and message templates (adding a support is coordinator-only)
- **Hub, Resources, Profile** — team discussion, shared files, and personal settings

### Notable flows

- **Cover requests** — a support asks for cover; operations assigns a covering support in **Approvals**. During the cover period only, that support sees the away support's group and can mark its attendance.
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
│   │   │   └── groups/         # Group call card, meeting mode, participant card
│   │   ├── pages/              # Route-level pages (admin + /support/*)
│   │   ├── hooks/              # useAuth, usePWAInstall, walkthrough, …
│   │   ├── services/           # api.ts → supabase-api.ts (all data access)
│   │   ├── context/            # AppDataContext (cohort, weeks, notifications)
│   │   └── sw.ts               # Service worker (Workbox + push handlers)
│   └── vite.config.ts
├── supabase/
│   ├── migrations/             # SQL migrations, applied in order
│   └── functions/              # Edge functions (notify-*, send-announcement,
│                               #   push-reminders)
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
- **Existing database:** apply only the new migration files, in order.
- Migrations are additive by convention, so a deployed app keeps working while a new frontend rolls out.

Create the first admin by inserting into `User`:

```sql
INSERT INTO "User" (name, email, role, password)
VALUES ('Your Name', 'you@example.com', 'ADMIN', 'yourpassword');
```

> **Security note:** passwords are still stored as plain text. Do not reuse a password from anywhere else. Replacing this is the first task of the planned auth rebuild.

---

## Authentication and RLS

The app uses **custom authentication**, not Supabase Auth.

- Login queries the `User` table directly using the anon key
- A mock token (`mock_token_${userId}`) is kept in `localStorage`
- Every request runs as the PostgreSQL `anon` role

**So:** RLS policies are `USING (true)` and access control lives in the UI layer, not the database. Anyone adding tables should follow the same pattern (`"Allow all operations"`) or the app will break.

---

## PWA and push

- Service worker: `frontend/src/sw.ts` → `dist/sw.js`
- `registerType: 'prompt'` — users get an update banner and tap Refresh
- Push and notification clicks are handled in `sw.ts`; Edge Functions in `supabase/functions/` send them

Generate VAPID keys with `npx web-push generate-vapid-keys`. The public key goes in the frontend env; the private key stays in Supabase/Vercel secrets.

Some in-app notifications (participant flags, cover requests) are written straight to the `Notification` table and appear in the bell without a push.

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
