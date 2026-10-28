# PostHog data warehouse: a read-only role over anonymised views

Date: 2026-10-28.

## Live changes
- Migration `20261028100000_posthog_reader_analytics_views.sql` applied live: schema `analytics` (views `cohorts`, `weeks`, `participants`, `class_attendance`, `group_meeting_attendance`, `hub_meetings`, function `pid`), role `posthog_reader`.
- `ALTER ROLE posthog_reader LOGIN PASSWORD ...` run live with a generated password (not in the repo; handed to the owner once, to paste into PostHog). Rotate by running `ALTER ROLE posthog_reader PASSWORD '...'` and updating PostHog.
- `GRANT posthog_reader TO postgres WITH SET TRUE` run live, only so the role could be tested with `SET ROLE`. Harmless; can be revoked.
- No edge function, no app code.

## Why
Syncing `public` into PostHog would copy password hashes, session tokens, phone numbers, emails, dates of birth and teens' guardian numbers to a third party. The views hold counts-level data only, with a salted-hash pseudonym per participant, for Cohort 10 onwards (not Practice, not archived, no test accounts).

## Tested
- As `posthog_reader` (via `SET ROLE`): the six views return rows (87 participants, 169 class marks, 17 meeting marks, 11 hub meetings, 10 weeks); `User`, `Participant` and `AppSession` in `public` are denied; creating a table is blocked.
- Not tested: a real login through the Supabase pooler (this sandbox cannot reach the database port) and PostHog's sync itself.

## Open items
- The role can still run the same `public` SECURITY DEFINER functions the public `anon` key can (95 of the 322 anon can); each needs a valid session token or only returns what anon already gets. Not narrower, not wider than the public key.
- Set up in PostHog: Data warehouse > Postgres source; pooler host for this project (`aws-1-eu-west-2.pooler.supabase.com`), port 5432, database `postgres`, user `posthog_reader.<project-ref>`, schema `analytics`; leave CDC and SSH tunnel off.
- Teens appear as `is_teen` with gender and age range, under pseudonyms. Remove `gender` / `age_range` from `analytics.participants` if that is too much.
