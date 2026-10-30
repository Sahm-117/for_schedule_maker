# Public sites

Small static pages for people outside FOF Ops (for example the church digital team). Each folder is one site, with
no build step: `index.html` plus its images. They are hosted free on Cloudflare Pages and redeploy on every push to
`main` that changes that folder.

| Folder | What it is | Cloudflare Pages project |
|---|---|---|
| `how-the-api-works/` | Visual guide to the FOF API for church apps | `fof-how-the-api-works` |

## Connecting a new site (once, in the Cloudflare dashboard)

1. Workers & Pages → Create → Pages → **Connect to Git**, and pick this repository.
2. Production branch: `main`. Framework preset: **None**. Build command: leave empty. Root directory (under
   Advanced): `sites/<folder>`. Build output directory: `.` (it is read from inside the root directory, so
   `sites/<folder>` here would become `sites/<folder>/sites/<folder>` and the build fails).
3. Build watch paths: leave empty. (The site then also redeploys on app pushes; there is no build step, so that costs
   nothing.)
4. Save and deploy. The site is at `https://<project>.pages.dev`.

Only made-up people in examples, never real names, numbers or photos: these pages are public.
