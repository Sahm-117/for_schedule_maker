# Shared number: named alerts, sign-up nickname rule, teen weekend call times

Date: 2026-10-22. Follows [One number, several people](2026-10-22_shared-number.md) and [Add someone on this number](2026-10-22_add-on-this-number.md).

## What changed

- **Named alerts on a shared phone (rule 91).** When one phone's push subscription is saved for more than one participant, each alert now starts with that person's first name ("Tolu: Your class starts soon"), gets its own tag so two people's alerts don't replace each other, and its link carries `?for=<participantId>`. Only active people in the same cohort count as sharing (an archived spouse or a retaker's old-cohort row doesn't), the name skips titles ("Mrs Bola Ade" -> "Bola"), and the alert keeps `data.readTitle` so tapping it still marks the bell copy read (`sw.ts`). Lookups are cached for five minutes per function instance, so a reminder run that sends in a loop looks each phone up once. Opening it switches the app to that person (`ParticipantShell` reads `?for=`; if it is already that person it just drops the parameter). The `#fof-tap` hash is kept through the switch and the tap is only marked read after it, as the right person. If the switch is refused (for example a teen signed in on their own number), the app stays put and says the alert was for someone else on the number. The labelling is `sharedPhoneLabeller` in `supabase/functions/_shared/webpush.ts`, used for `ParticipantPushSubscription` sends only. If its lookup fails, alerts go out unlabelled as before.
- **Sign-up form nickname rule (rule 91).** An adult form on a number where a support had added a prospect who has not signed up claims that prospect only when each word of the shorter name is in, or contains, a word of the longer one, titles and accents ignored ("Mrs Ade" for "Bola Ade", "Bola" for "Bola Adeyemi", "Bimbo" for "Abimbola Okafor", "Funmi Ade" for "Fúnmi Adé"), and not when the form's gender (`What's your Gender?`) and the prospect's gender are both known and differ ("Mr Adeyemi" is not "Tolu Adeyemi", F). Two different first names on one surname are two people. Teen forms still need the same name.
- **Teen weekend call times (rule 92).** `AppSetting` `teen_group_meeting_limits` saved live: Saturday and Sunday, earliest start 5 PM, end 9 PM (so the last start is 8 PM, calls are an hour). This is a starting value from the 17 Oct recap ("around 6 or 7 PM"); admins change it in Settings > Group call limits > Teen groups. One current Cohort 10 teen group already had Saturday 3 PM; the limits only judge new or changed slots, so it keeps that slot until someone edits it.
- **Fix: participant Home crash.** `ParticipantHomePage` called `useState` (`tickingIntro`) after its loading/error early returns (from `affa6b1`), so after Home finished loading React threw "Rendered more hooks than during the previous render" and the error boundary took over. Moved the hook above the early returns. Found in the browser check.

- **Add someone is on Profile only.** The picture menu no longer has "Add someone on this number"; it only switches account (plus View profile, Help, Log out). Adding stays on Profile > People on this number. Picture guides for participants and teens were made from the real screens (not in the repo).

## Deployed live

- Edge functions: `push-reminders` v58, `send-announcement` v28, `notify-users` v10, `receive-form-registration` v20 (v57/v27/v9/v19 earlier the same day, replaced after the code review below).
  - `notify-users` was deployed from the live source (downloaded with `supabase functions download --use-api`) plus the new `_shared/webpush.ts`, so the repo's undeployed roles change in `notify-users` is still not live.
  - `receive-form-registration` v20 was deployed from the live v18 tree (repo `_shared/notifications.ts` differs: `moduleViewerIds` is in the repo but not live) plus the nickname/gender rule.
  - Correction to older notes: `push-reminders` and `send-announcement` on live already matched the repo (the birthday change was deployed); only `notify-users` and `receive-form-registration` had drifted.
- No migrations. One `AppSetting` row added (`teen_group_meeting_limits`).

## Checked

- Unit check of the name rule (subset + titles + gender) and of `sharedPhoneLabeller` with esbuild + node.
- All four functions boot (OPTIONS 200). The form-handler secret is not in this environment, so the matching itself was not dry-run against live.
- Browser (local frontend, live backend, throwaway `isTest` participant in Cohort 10): Profile > Add someone on this number (adult, three steps) > "Switch to … now"; picture menu shows Switch account and switches; signing in again shows "Who is using the app now?" with both; opening `/me/week/1?for=<other id>` switched to that person; no console errors after the Home fix.
- Test data deleted afterwards: 2 participants, their logins, sessions, app state, tour, reminder log and in-app notifications, the contact and its form record, and the 8 admin "New person on a shared number" notifications the add created. Admins with push on may have had that alert on their phones for a test name ("Zz Playwright Spouse").

## Open items

- `household_add_person` alerts admins even when the adder is a test account. Worth skipping the admin alert when `isTest` (small migration) if more live testing is planned.
- `notify-users` roles change and `_shared/notifications.ts` `moduleViewerIds` are still repo-only; deploy them together when that work is ready.

## Gotchas

- Playwright in this cloud container cannot reach Supabase directly (the proxy only takes CONNECT, and Chromium sends localhost through it too). Route `*.supabase.co` through Node `fetch` with `NODE_USE_ENV_PROXY=1` and `NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt`, and leave the browser unproxied.
- The participant welcome guide reappears on each full page load in a fresh browser; close it with the "Close guide" button.
