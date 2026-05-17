# Product Requirements Document — FOF IKD Ops

**Version:** 1.0  
**Date:** May 2026  
**Product Manager:** Olamide Iroja  
**Status:** Live (Production)

---

## 1. Overview

**FOF IKD Ops** is a Progressive Web App (PWA) that manages the weekly programme schedules for the Foundation of Faith (FOF) discipleship programme at The Covenant Nation (TCN) Ikorodu. It replaces ad-hoc WhatsApp coordination and manual spreadsheets with a structured, role-based tool that the entire support team can access from any device.

---

## 2. Problem Statement

FOF is an 8-week discipleship programme running weekly, typically across one church season. The programme involves dozens of daily activities (talks, sessions, team movements, service assignments) spread across multiple days each week. Coordination failures — wrong times, missing assignments, last-minute changes not communicated — directly impact programme quality and participant experience.

Before FOF IKD Ops:
- Programme schedules were maintained in a shared spreadsheet and circulated via WhatsApp
- Last-minute changes required an admin to update the sheet, screenshot it, and broadcast to the team
- Support team members had no way to check the live schedule from their phones without scrolling through a chat history
- There was no audit trail for who changed what, or when

---

## 3. Goals

| Goal | Metric |
|---|---|
| Single source of truth for programme schedule | All schedule views draw from the same database |
| Role-based change workflow | Only admins can publish changes; preparers submit pending changes |
| Push notifications for schedule changes | Support team receives alerts without checking the app |
| Offline access to schedule | App loads from cache when offline (PWA) |
| Zero server management | No backend infra to maintain (Supabase + Vercel) |

---

## 4. Users & Roles

### 4.1 Admin
**Who:** Programme director / lead coordinator  
**Access:** Full read/write. Can create/edit/delete weeks, days, and activities. Approves or rejects pending changes submitted by preparers. Manages users, announcements, and the Resource Hub.

### 4.2 SOP Preparer
**Who:** Programme support officers who draft the schedule  
**Access:** Can view the full schedule and submit edits as "pending changes." Cannot publish directly — all edits go to admin for approval. Receives push notifications.

### 4.3 Support
**Who:** Volunteers, ushers, logistics team  
**Access:** Read-only. Can view the live schedule, receive push notifications, and install the app as a PWA. Cannot submit changes.

---

## 5. Features

### 5.1 Weekly Programme Schedule (Core)
- Schedules are organized by **Week → Day → Activity**
- Each activity has: title, time, description, assigned labels/groups
- Days can be named (e.g., "Day 1 — Monday") with a date
- Weeks can be created, published, or archived by an admin
- The schedule view is filterable by label (e.g., filter to see only "Tech Team" activities)

### 5.2 Pending Change Workflow
- SOP Preparers tap "Edit" on any activity → opens a change proposal form
- Changes are saved as `PendingChange` records, not applied immediately
- Admin sees a badge count and a pending changes panel
- Admin can approve (applies the change) or reject (with optional note)
- Rejected changes go to `RejectedChange` and are visible to the preparer

### 5.3 Push Notifications
- Users can opt-in to browser push notifications
- Triggered when: a new week is published, a change is approved, an announcement is posted
- Uses Web Push (VAPID keys) stored in Supabase, delivered via the service worker

### 5.4 Telegram Daily Digest
- A daily digest of the next day's activities is sent to a configured Telegram channel
- Configured via `TelegramDigestLog` table and a cron trigger
- Useful for teams that primarily communicate via Telegram

### 5.5 Resource Hub
- A panel of links and files relevant to the programme (training docs, templates, contacts)
- Admins can add/remove resources
- New resources show a pulsing badge on the card and a full-width notice banner on the dashboard
- Badge clears when a user opens the Resource Hub

### 5.6 Announcements
- Admins can post announcements visible to all logged-in users
- Announcements appear as a banner or card on the dashboard

### 5.7 User Management (Admin)
- Admin can create, edit, or deactivate users
- Roles: ADMIN, SOP_PREPARER, SUPPORT
- Authentication is custom (email/phone + password lookup against User table)

### 5.8 PWA / Offline
- Installable on iOS and Android from the browser ("Add to Home Screen")
- Service worker precaches all static assets via Workbox
- Offline: the schedule last loaded is available without network
- Update banner appears when a new version is deployed → "Refresh" forces the new SW to activate

---

## 6. Technical Architecture

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite 7, Tailwind CSS |
| PWA | vite-plugin-pwa v1.3.0, Workbox (injectManifest) |
| Database | Supabase (PostgreSQL) |
| Auth | Custom — anon Supabase key, User table lookup |
| Hosting | Vercel (frontend), Supabase (database + storage) |
| Notifications | Web Push / VAPID + Supabase PushSubscription table |
| Keep-alive | cron-job.org pings Supabase REST API daily |

### Key Constraint: Custom Auth
The app does **not** use Supabase Auth sessions. Login queries the `User` table directly using the anon Supabase key. This means all database requests run under the PostgreSQL `anon` role. Supabase RLS policies using `TO authenticated` will block all access — all policies must be open (`USING (true)`) or use the anon role explicitly.

---

## 7. Data Model (Simplified)

```
Week
  └── Day[]
        └── Activity[]
              └── ActivityLabel[]
                    └── Label

User
  └── UserLabel[]  (which label groups they belong to)

PendingChange     (submitted by SOP_PREPARER, references Activity)
RejectedChange    (admin rejection with note)
PushSubscription  (Web Push endpoint per user-device)
AppSetting        (key-value store for app config)
Announcement      (admin posts)
TelegramDigestLog (digest send history)
ActivityTeam      (activity-to-team join)
Team
notification_settings
```

---

## 8. Non-Functional Requirements

| Requirement | Target |
|---|---|
| Mobile-first | Fully usable on a 375px screen |
| PWA installability | Passes Lighthouse PWA audit |
| Load time | < 2s on 4G for first meaningful paint |
| Offline | Core schedule readable offline |
| Database uptime | Supabase free tier + cron keep-alive (no 7-day inactivity pause) |

---

## 9. Out of Scope (Current Version)

- Real-time collaborative editing (no live cursors / conflict resolution)
- Supabase Auth (magic link, OAuth) — custom auth is intentional for simplicity
- Native mobile apps (iOS App Store / Google Play) — PWA covers the use case
- Multi-church / multi-programme support
- Automated change approval rules

---

## 10. Known Limitations

- **Password security:** Passwords are stored and compared in plaintext in the User table. A future version should hash passwords server-side (e.g., via a Supabase Edge Function).
- **Auth tokens are mock:** `accessToken = mock_token_${userId}` — there is no JWT validation. Any string in localStorage grants access until the browser is cleared.
- **RLS is open:** Because all requests use the anon role, RLS policies are `USING (true)`. Row-level security is not enforced in the database — access control is UI-only.
- **No password reset flow:** Users must contact an admin to reset passwords.

---

## 11. Roadmap Considerations

| Priority | Item |
|---|---|
| High | Hash passwords via Edge Function |
| High | Proper auth (Supabase Auth or custom JWT with server-side validation) |
| Medium | Activity conflict detection (same time slot, same group) |
| Medium | Export schedule to PDF |
| Low | Multi-language support |
| Low | Programme analytics (attendance tracking) |

---

## 12. Success Criteria

- Support team no longer uses WhatsApp screenshots as the schedule source of truth
- Admin can publish a schedule update and the entire team sees it within 60 seconds (push notification)
- SOP Preparers can propose changes on mobile without needing laptop access
- Zero server maintenance incidents (Supabase + Vercel managed infra)
