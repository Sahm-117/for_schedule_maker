# Intros ticked from group chat (2026-10-17)

One-off data change on the live database; no migration, no code.

- Rule applied: an active participant in a running (non-practice) cohort who has posted or replied in their own group's discussion, and has neither posted an intro nor ticked it, got `ParticipantOnboarding.introTickedAt = now()`. That is the same tick a participant can set for themselves, so Home and the onboarding counts now show their intro as done.
- Result: 7 participants marked (5 had only posted, 2 had only replied). A re-count afterwards found none left. Of 82 active participants, 64 are in a group and 16 have spoken in their group; all 16 now count as introduced.
- It does not run again. A participant who chats later is not marked automatically; an ongoing rule would be a database trigger on new posts and replies, and was not asked for.
- To undo for someone: set their `introTickedAt` back to null.
