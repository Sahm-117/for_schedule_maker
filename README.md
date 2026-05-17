# FOF IKD Ops

A Progressive Web App (PWA) for managing weekly programme schedules for the Foundation of Faith (FOF) discipleship programme at The Covenant Nation (TCN) Ikorodu.

**Live app:** https://for-schedule-maker.vercel.app  
**GitHub:** https://github.com/Sahm-117/for_schedule_maker

---

## What it does

FOF runs an 8-week discipleship programme with daily sessions, team assignments, and activities. This app gives the support team a single source of truth for the schedule — installable on any phone, works offline, and notifies users of changes via push notifications.

**Three roles:**
- **Admin** — full control: create weeks/days/activities, approve changes, manage users, post announcements
- **SOP Preparer** — submit edits for admin approval, view the schedule
- **Support** — read-only view + push notifications

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + TypeScript + Vite 7 + Tailwind CSS |
| PWA | vite-plugin-pwa v1.3.0 (Workbox injectManifest) |
| Database | Supabase (PostgreSQL) |
| Hosting | Vercel |
| Push Notifications | Web Push (VAPID) |

---

## Project Structure

```
fof_schedule/
├── frontend/               # React PWA app
│   ├── src/
│   │   ├── components/     # Reusable UI components
│   │   ├── pages/          # Route-level pages (Login, Dashboard)
│   │   ├── hooks/          # Custom hooks (useAuth, usePWAInstall, etc.)
│   │   ├── services/       # Supabase API layer (supabase-api.ts)
│   │   ├── sw.ts           # Service worker (Workbox + push handlers)
│   │   └── main.tsx        # App entry point
│   ├── public/             # Static assets + icons
│   ├── index.html
│   ├── vite.config.ts      # Vite + PWA config
│   └── tailwind.config.js  # Brand colors
├── supabase/
│   └── migrations/         # SQL migration files (run in Supabase SQL editor)
└── supabase-schema.sql     # Full schema for fresh setup
```

---

## Local Development

### Prerequisites
- Node.js 18+
- A Supabase project ([supabase.com](https://supabase.com))

### Setup

```bash
git clone https://github.com/Sahm-117/for_schedule_maker.git
cd for_schedule_maker/frontend
npm install
```

Create `frontend/.env`:
```
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key_here
VITE_VAPID_PUBLIC_KEY=your_vapid_public_key_here
```

```bash
npm run dev
```

App runs at `http://localhost:5173`.

### Build for production

```bash
npm run build
```

Output is in `frontend/dist/`. Vercel picks this up automatically on push to `main`.

---

## Database Setup

### Fresh install

1. Open your Supabase project → **SQL Editor**
2. Run `supabase-schema.sql` to create all tables
3. Create your first admin user by inserting directly into the `User` table:

```sql
INSERT INTO "User" (name, email, role, password)
VALUES ('Your Name', 'your@email.com', 'ADMIN', 'yourpassword');
```

> **Note:** Passwords are stored as plain text in the current version. Do not reuse passwords from other services.

### Migrations

Migration files live in `supabase/migrations/`. Run them in order via the SQL Editor when upgrading an existing database.

---

## Authentication

This app uses **custom authentication** — it does **not** use Supabase Auth.

- Login queries the `User` table directly using the Supabase anon key
- On success, a mock token (`mock_token_${userId}`) is stored in `localStorage`
- All database requests run under the PostgreSQL `anon` role

**Implication for RLS:** All Supabase RLS policies must use `USING (true)` without `TO authenticated`, because all requests go through the anon role. Access control is enforced in the UI layer, not the database layer.

---

## PWA & Service Worker

The app uses `vite-plugin-pwa` with `injectManifest` strategy:

- **Service worker:** `frontend/src/sw.ts` (compiled to `dist/sw.js`)
- **Precaching:** All static assets are precached by Workbox at build time
- **Update flow:** `registerType: 'prompt'` — users see an update banner and tap "Refresh" to get the new version
- **Push notifications:** Handled in `sw.ts` via the `push` and `notificationclick` event listeners

To generate VAPID keys for push notifications:
```bash
npx web-push generate-vapid-keys
```
Add the public key to `.env` as `VITE_VAPID_PUBLIC_KEY` and store the private key securely in Supabase secrets or environment variables.

---

## Deployment

The app deploys to Vercel automatically on every push to `main`.

**Vercel settings:**
- Root directory: `frontend`
- Build command: `npm run build`
- Output directory: `dist`
- Environment variables: set `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_VAPID_PUBLIC_KEY` in the Vercel dashboard

---

## Supabase Keep-Alive

Supabase free tier pauses databases after 7 days of inactivity. A cron job on [cron-job.org](https://cron-job.org) pings the REST API daily to prevent this:

```
URL: https://YOUR_PROJECT_REF.supabase.co/rest/v1/Week?select=id&limit=1&apikey=YOUR_ANON_KEY
Schedule: 0 0 * * * (daily at midnight)
```

---

## Brand Colors

| Token | Hex | Usage |
|---|---|---|
| `primary` | `#FF914D` | Buttons, badges, key UI |
| `primary-dark` | `#E5822D` | Hover states |

---

## Key Files

| File | Purpose |
|---|---|
| `src/services/supabase-api.ts` | All database calls. Entry point for any data change. |
| `src/pages/Dashboard.tsx` | Main app shell — layout, sidebar, schedule view |
| `src/hooks/useAuth.tsx` | Login/logout state, localStorage token management |
| `src/sw.ts` | Service worker — caching, push, notification click |
| `vite.config.ts` | PWA manifest, plugin config, build settings |
| `supabase-schema.sql` | Full database schema for fresh setup |

---

## Contributing

1. Fork the repo and create a branch from `main`
2. Make your changes in `frontend/`
3. Run `npm run build` and verify no TypeScript errors
4. Test the PWA locally (`npm run preview` after build)
5. Open a pull request — describe what changed and why

### Things to know before making changes

- **No backend** — all data operations go through `supabase-api.ts` using the Supabase JS client
- **Custom auth** — do not integrate Supabase Auth without understanding the anon-role implications for RLS
- **PWA manifest changes** — changing `name` or `short_name` in `vite.config.ts` will prompt installed users to update
- **Service worker** — any change to `sw.ts` triggers a new SW install on next visit; test the update banner flow

---

## License

Internal project — TCN Ikorodu / Foundation of Faith programme.
