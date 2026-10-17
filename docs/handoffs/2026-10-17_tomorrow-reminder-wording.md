# Tomorrow reminder wording (2026-10-17)

- The "1 day before" reminders read "Hub meeting reminder: tomorrow away". They now read "…: tomorrow" (hub meeting, group meeting, Hub Leads meeting, FOF reminder). Other timings still say "30 mins away", "1 hour away" and so on.
- For the hub, group and Hub Leads meeting reminders the body also says the day: "Hub 1 meets tomorrow at 20:00. Join: …". Other timings are unchanged.
- Edge function `push-reminders` deployed as **v52** (v51 before). Built from the live v51 source plus only this wording change, so the undeployed roles-and-permissions change (birthday alert recipients) is still NOT live. The repo copy contains both; a later deploy of the repo copy ships the roles change too.
- Checked with the function's dry run on the live project (no errors); the notification text itself was not seen on a phone.
- No migrations, no frontend change.
