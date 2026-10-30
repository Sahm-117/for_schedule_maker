# Church app access gets its own menu item; handover primer site

Date: 2026-10-30. FLOW_MAP rule 118 (path updated).

## What changed
- **Church app access is its own admin module** under Administration in the menu (after Roles), at `/church-apps`,
  shown to full admins only (`realAdminOnly`, like Roles). It is no longer a card on Settings.
  - The path is guarded like Roles: `CHURCH_APPS_PATH` in `utils/permissions.ts` `canOpenPath` lets only full admins
    in (others get the no-access page), and the page only asks for the key list when a full admin is signed in.
  - `/settings/api-access` redirects to `/church-apps`, so old links keep working.
  - A non-full admin who opens the page is sent to `/` (was `/settings`).
  - Settings is back to exactly what it was before the card (the card, its `Link` import and the `useAuth` call were
    only there for it).
  - New `key` icon in `AppShell.tsx`. Docs updated: `docs/api/README.md`, FLOW_MAP rule 118, the "How the API works"
    site.
- **New public site `sites/project-primer/`**: a visual handover primer and walkthrough for whoever picks up FOF Ops
  (audiences, architecture diagram, a person's journey, repo map, accounts, what runs on its own, the three change
  routes, rules that bite, never-dos, a first-week checklist saved in the viewer's browser, Claude Code habits,
  glossary). No secrets, keys, project refs or people's names; it points to `HANDOVER.md` for specifics.
- `sites/README.md` lists the new site.

## Live changes
- None to the database or edge functions. Frontend only (Vercel on push).

## Tested
- `npm run build` passes; eslint clean on the changed files (one existing warning in `AppShell.tsx`, untouched).
- Playwright against the local frontend and the live backend, signed in as the existing test admin through a
  temporary session (deleted afterwards), desktop and phone:
  - Church app access shows under Administration and opens the page;
  - `/settings/api-access` lands on `/church-apps`;
  - Settings has no Church app access card;
  - phone menu shows the item and opens the page;
  - no console errors.
- Primer site checked in Chromium at 1280px (light and dark) and 390px: no horizontal page scroll, no overlaps, no
  console errors.

## Code review (before push)
- Fixed: the moved path had lost its route guard (it was under `/settings` before); the list request ran before
  the redirect; the primer hard-coded the rule count; missing font preconnect; the primer no longer says the browser
  key is public.
- Left as is: the two admin nav lists in `AppShell.tsx` are still kept by hand (existing pattern, not this change).

## Open items
- The primer is public. If it should be team-only, put the Pages project behind Cloudflare Access (free for small
  teams).
- The primer site needs its own Cloudflare Pages project (same settings as the API site, root
  `sites/project-primer`, output `.`). Only someone with the Cloudflare login can create it.

## Gotchas
- Testing with a hand-made session: the app's `accessToken` must be `mock_token_<userId>`. Anything else makes the
  app sign out, which deletes the session row.
