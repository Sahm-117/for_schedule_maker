# Announcement alerts: subject as the title line

## Summary
Staff phone alerts for an announcement showed "TCN FOF Ops" as the title (the phone already adds "from FOF Ops") and "subject: message" as the body, so the first line was wasted. They now show the subject as the title and the message as the body, as participant alerts already did. The staff bell row changed the same way, which also fixes the Telegram backup copy (it forwards the bell row).

## Live changes
- Edge function `send-announcement` deployed as **v25** (v24 before; repo copy identical to v24). No migration.

## How it was tested
Deploy booted (preflight 200). Not tested: a real announcement send (that would alert real people). First real announcement will show it; check the lock screen.

## Open items
- Existing bell rows already stored keep the old "TCN FOF Ops" title; only new announcements change.
- The "from FOF Ops" line under the title is added by iOS and cannot be removed.
