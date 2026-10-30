# Security measures written up in the primer

Date: 2026-10-30. Handover primer section "Security" (`sites/project-primer/index.html`). No code or database
changes.

## What is in place (checked live on 30 Oct)
- **Signing in:**
  - passwords are bcrypt hashes, and the hash columns aren't readable through the data API;
  - session tokens are stored only as SHA-256 hashes, with a 90-day sliding expiry (`app_session`);
  - participants sign in by phone with a password or a one-time code;
  - the primer is behind a shared password.
- **Who sees what:**
  - all 156 public tables have row-level security on, and no policy is open to visitors who aren't signed in;
  - all 467 SECURITY DEFINER functions set a search path;
  - roles plus the custom permission grid;
  - teen details need their own API permission.
- **Server functions:**
  - most check the app token;
  - `telegram-webhook` checks its secret header, and `public-api` checks its hashed key (scopes, a per-key rate
    limit, request log);
  - `send-announcement` is admin-only (rule 122).
- **Secrets and backups:**
  - secrets live in the Supabase vault, GitHub secrets and Bitwarden, never in the repo;
  - nightly backups are AES-256 encrypted, kept 90 days, with an automatic restore check;
  - HTTPS with HSTS;
  - PostHog replays mask inputs.

## Open items
- The same check found a few hardening items. They are deliberately not described here, because this repository
  and the primer's source are public. The owner has the list; ask them before working on security.

## Gotchas
- The primer's password only protects the hosted page; its HTML is readable in this public repository. Never put
  anything in `sites/` that would help someone attack the platform.
