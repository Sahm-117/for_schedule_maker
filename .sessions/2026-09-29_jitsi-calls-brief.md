# Jitsi calls: brief (parked, not started)

Captured 2026-09-29. The user wants it parked for now.

## Decisions from the user
- **Free only.** Use public meet.jit.si. No JaaS (8x8) paid tiers and no paid self-hosted server.
- **Open outside the app.** Tapping Join should take people out of the PWA, into the phone's browser or the Jitsi Meet app. It must not open inside the installed app's own browser view.

## Plan when resumed
- Add a third call option, `JITSI`, beside WhatsApp and Google Meet, for groups and hubs. `"Group"."callPlatform"` has a CHECK constraint (`Group_callPlatform_check`, 20260915000000_support_v2_tables.sql) allowing only WHATSAPP and GOOGLE_MEET. It needs a migration, and the hub call platform storage needs checking too. The participant RPCs pass callPlatform/callLink straight through.
- Choosing Jitsi generates the link automatically: one private room per group or hub with a hard-to-guess name (e.g. `https://meet.jit.si/FOF-<cohort>-<group>-<random>`), saved as callLink, so nobody pastes links.
- Join opens it externally. Current code opens call links from GroupCallCard, SupportMyHubPage, ParticipantHomePage, ParticipantGroupPage and SupportHomePage. Make sure each uses an external open (target `_blank` with noopener, or `window.open`) that leaves the standalone PWA, and check it on iPhone and Android home-screen installs.
- A note for supports and hub leads: "Join first and sign in (Google, GitHub or Facebook) to start the call". meet.jit.si makes the first moderator sign in; others wait in a lobby until then. Participants never sign in.
- Update the app guide's call and meeting questions.
- Mock-up screenshots and an explainer before building, as usual.

## Known limits of free meet.jit.si (as of mid-2026; re-check jitsi.org before building)
- Embedding meet.jit.si inside another site or app is limited to about 5 minutes, which is why calls must open outside the app.
- A moderator sign-in is needed to start each meeting.
- On phones it suggests the free Jitsi Meet app; the browser works too.
- There's no uptime guarantee.
