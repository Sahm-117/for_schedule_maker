# Corporate prayers start on the Monday

Date: 2026-10-22.

## What changed

- Corporate prayers now start the **day after** the start week's class (the Monday after a Sunday class), not on the class day. Asked for by the owner for Cohort 10.
- One function, `faith_prayers_start_date`, now adds a day. Everything reads the start from it: the daily slots (`prayer_running`, `notify_prayer_slots`), the "happy to be prayed for?" pop-up (`faith_prayers_prompt_due`, counted back from the start), `participant_home`, `participant_faith` and the admin overview.
- Admin Corporate prayers > Schedule now says "From the day after this week's class (the Monday)…"; the slot editor subtitle matches. FLOW_MAP rule 50 updated.

## Live

- Migration applied: `20261022170000_prayers_start_day_after_class.sql`. No function deploys.
- Cohort 10 (start week 2): first prayer day was Sunday 25 Oct, now **Monday 26 Oct**. With "pop-up 3 days before", the pop-up now starts on Friday 23 Oct instead of Thursday 22 Oct. None of the 82 active participants had answered it yet.

## Checked

- Rolled-back test, then live: `faith_prayers_start_date` = 2026-10-26 (Mon); prompt not due on 22 Oct.
- `npm run build` passes.

## Rollback

Re-create `faith_prayers_start_date` without the `+ 1`.
