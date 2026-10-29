# Church app access: admins manage API keys in the app

Date: 2026-10-29. FLOW_MAP rule 118 (updated).

## What changed
- Migration `20261029150000_api_access_admin.sql` (**applied live**):
  - `ApiClient."createdById"`.
  - `api_admin_check`: a full admin only; Team members and supports are refused.
  - `api_admin_clients`: each app with its use this week, refusals, and teen records viewed in 30 days.
  - `api_admin_create_client`: returns the key once.
  - `api_admin_update_client`: on/off, scopes, name, notes.
  - `api_admin_client_activity`: the last 100 requests.
- New page `/settings/api-access` (`pages/AdminApiAccessPage.tsx`, `services/apiAccess.ts`), linked from a "Church
  app access" card on Settings, for full admins only.
  - The list comes first, and every form opens as an overlay.
  - Scopes are written in plain words. "Teenagers in full" sits apart, in red, with a warning.
  - The key is shown once, with Copy and safe-handling notes.
  - Switching an app off asks first.
  - Recent requests appear with ids hidden.

## Tested
- `npm run build`, `tsc` and eslint clean on the changed files.
- Migration in a rolled-back transaction with temporary admin and support sessions:
  - create, rename, change scopes and switch off all worked;
  - a switched-off key stopped authenticating;
  - a support was refused (`NOT_ALLOWED`) and a bad token gave `SESSION_EXPIRED`;
  - an unknown scope was refused;
  - `createdById` was set;
  - `anon` cannot call `api_admin_check`.
- Playwright, mocked backend, desktop and phone, 10 checks passed, no console errors:
  - the card on Settings;
  - the list, with teen count and request count;
  - Make key disabled until a name and a scope are set;
  - the key shown once;
  - the new app in the list;
  - Switch off asks first;
  - recent requests.
- Not tried with a real admin login.
