# FOF 10 Readiness Badge: "I'm fully ready" graphic

## Summary
- Participant Home, Get ready card: a dashed **"A gift waits at the end"** row while steps are open; once the participant confirms they are ready it becomes **"Your gift is ready"**, which opens a sheet with a graphic: their photo (initials if none, with a link to add one), their name, a green tick, "I'M FULLY READY for FOF 10 class" and "I just completed all my onboarding steps." Download and Share (the phone's own share sheet).
- "FOF 10" comes from the cohort's name ("Cohort 10" becomes "FOF 10").
- The venue map notification (`/me?map=1`) now opens the map on the participant Home.
- The birthday graphic's drawing helpers are now exported and shared (`utils/birthdayGraphic.ts`), used by `utils/readyGraphic.ts`.

## Live changes
- None. Frontend only. FLOW_MAP rule 60.

## How it was tested
- Browser (local app, mocked backend, participant): locked gift row with 3 of 4 steps done; gift button after ready; the sheet drew the graphic with a (drawn stand-in) photo; Download saved `ready-<name>.png`; with no photo the "Add your photo" note showed; no console errors.
- NOT tested: the real share sheet on a phone, a real photo, a real login.

## Open items
- The gift lives in the Get ready card, which disappears after first attendance; nobody can open it after that. If it should stay, it needs its own place (for example Profile).
- Not counted anywhere (no likes/downloads tracking), unlike the scripture posts.

## Update: badge wording and availability
- Renamed from "gift" to **FOF N Readiness Badge** (N from the cohort name). Earned only when every Get ready step is ticked and readiness is confirmed, and shown as its own card on Home, so it stays after the Get ready card disappears at first attendance (tested). The graphic carries "FOF 10 READINESS BADGE" under the name.
