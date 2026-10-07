# Session: FOF V2 — Participant layer + Support redesign (standalone prototype)

**Date:** 2026-09-13
**Branch:** main (no repo commits — all work is a design prototype)
**Deliverable:** `/Users/olamide/Downloads/FOF IKD Ops Standalone.html` (~862 KB, self-contained, double-click to open)
**Backup of original:** `/Users/olamide/Downloads/FOF IKD Ops Standalone.BACKUP.html`

## What Was Done

Extended the FOF IKD Ops V2 design prototype to add a **participant app** and rework the
**support app**. No production code was touched.

### Decisions locked this session
- **12-week cohort** (supersedes 10 in synthesis docs, 8 in PRD v1). Production is still 10 — unresolved.
- **Participants get accounts**, created by ops, not self-registered.
- **Auth rebuild is in scope** and is a prerequisite, not a follow-up.
- **Lead → participant flow:** mobilisation registers a *lead* → back office assigns → support follows
  up → marked *Enrolled* → account created → support copies credentials to send.
- **Recap audience tag decides delivery** — no release gate. Tagged "supports" stays with team;
  tagged "participants" reaches them immediately.
- **No emoji anywhere in the app** (replaced all with inline SVG).

### Support app
- Mobilisation module replaces Participants nav: **Register a lead** + **Follow-ups** (back-office
  assigned only), message templates with Copy + Send in WhatsApp, credentials accordion
  (single prefilled message, Copy / Send in WhatsApp).
- My Group → three tabs: **Participants / Group meetings / Sunday class**.
- Meeting Mode (5 steps, freely clickable) lives under Group meetings, not My Schedule.
- Sunday class attendance is a separate module from group-meeting attendance.
- Onboarding renamed **Onboard**, split into *My participants* / *Onboard a support*.
- Faith project: two trails — participant-facing coaching trail, and a back-office review trail the
  participant never sees. Only support can send back for changes. Always editable.
- Removed: Report tab, remind-all, per-participant reminder, Reset. Added: group-call edit pencil.
- Home: Today card in schedule style + collapsed weekly checklist.
- Desktop cards capped at 760px left-aligned (`formMax` binding).

### Participant app (new)
- Nav: **Home | My Group | Journey | Project | More**. No Schedule at all.
- Self-signup replaced with **Set your password** (first-login, eye toggles on both fields).
- Recap → reflection → goal loop: recap opens in-app, three questions, Q2 becomes the week's goal,
  shown on Home with Mark as done, editable all week.
- Inspirational Scriptures: daily slider, released 2pm, backwards-only navigation.
- Journey redesigned: gradient hero (weeks in / reflections / goals kept), callback card quoting an
  earlier week, timeline with spine + ticks + locked future weeks, expandable per week.
- Faith Project mirrors support side: draft / save / submit, status chip, feedback accordion with
  red unread dot.

## Files Changed
- `/Users/olamide/Downloads/FOF IKD Ops Standalone.html` (rewritten, v11)
- Working copies in session scratchpad: `tpl.html` (decoded canvas), `FOF-V*.html` (built bundles)
- **No changes to `frontend/` or any repo source.**

## Key Decisions & Patterns
- The standalone file is the Claude Design canvas **bundled**: the `.dc.html` source sits
  JSON-encoded inside a `<script type="__bundler/template">` block, with `/` escaped as `/`
  so `</script>` can't terminate it early. Edit by decoding → editing → re-encoding with
  `json.dumps(tpl).replace('/','\\u002F')`.
- Canvas dialect: `<x-dc>`, `<sc-if value="{{ x }}">`, `<sc-for list="{{ y }}" as="i">`,
  `sc-camel-on-click`. Markup and a `DCLogic` state class are wired by binding name.
- **Always validate before rebuilding:** sc-if/div/section/button tag balance + `node --check` on the
  extracted script. Unbalanced tags silently break rendering.
- Verify in Chromium via Playwright — the bundle self-unpacks, so only a real browser proves it works.
- Mobile is a **manual toggle** ("Mobile view" button), not responsive breakpoints.

## Backend / Handoff Notes
- Live app audited at https://for-schedule-maker.vercel.app — **10 weeks**, this design is **12**.
  The running cohort config has to change before any of this ships.
- **Auth confirmed weak in production:** `localStorage` holds
  `"password_hash":"hashed_<plaintext>"`. Not a hash. This is why the participant layer (private
  reflections, anonymous feedback) cannot ship before the auth rebuild.
- Live app already has: Follow-ups CRM (mature, don't rebuild), Issues tab
  ("Put messy questions here"), coordinator onboarding templates, guided walkthrough,
  per-user accent themes. Port these rather than redesigning.

## Pending Tasks
- **Staged recap release** — if leadership ever wants to control *when* participants see a recap
  rather than publishing on tag, revisit at implementation time. (Promised reminder.)
- **10 vs 12 week mismatch** between production and this design.
- Home quick-links still show stale **My Tasks** and **Follow-ups** tiles.
- **"Next Group Meeting: Not set"** should read Friday 7:00 PM.
- Participant "Finish FOF" reachable only from a Home card, not nav (by design, unconfirmed).

## Errors Hit & Fixes
- **DesignSync `get_file` truncates at 256 KiB.** Editing the canvas from a truncated read would have
  destroyed the binding layer. Fixed by having the user export the full file.
- **Destructive edit, recovered:** a block-extraction regex swept most of the document. Restored from
  the Downloads copy and redid edits as surgical single-occurrence string replaces with assertions.
- A `replace_all` corrupted an unrelated line (`const me=MEM[4])`). Avoid `replace_all` in this file.
- An over-eager replace truncated `max-width: 320px` → `max-width: 100px`, leaving a narrow card.
- `context-saver` hook cannot find this session's transcript: it lives under `CLAUDE_CONFIG_DIR=
  ~/.claude-sam`, and the hook falls back to the globally-newest transcript, saving the wrong session
  (`2026-09-13_session-lookup-artifact-fof-ikd-ops-v2.md` is unrelated). This file was written by hand.
