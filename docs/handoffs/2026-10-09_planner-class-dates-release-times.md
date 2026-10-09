# Planner: Class dates sheet shows manual and recap drop times

Frontend only. No migration, no edge function. FLOW_MAP rule 47.

## Summary
Moving a class on the Planner already moves everything that follows its date (manual and recap release, feedback form, programme week,
attendance windows, reminders, daily checks), because all of it reads `Week.classDate`. What was missing was seeing it. The "Edit each class
date" sheet (`ClassDatesSheet.tsx`) now shows, under every class that can still change, when its manual drops (one time for supports and
participants), when the recap reaches supports and when it reaches participants, and "Was: manual ..." for a class you have moved.

## Also found
- The manual goes out before class (database `recap_release_at(date, 'manual')`: the weekday on or before the class Sunday). The frontend helper
  `recapReleaseAt` counts forward, which is right for recaps and wrong for the manual, so `manualReleaseAt` was added and the file's comment fixed.
- The buffer (spare) week is used up by the first special church event (a Stops-FOF event) by design; later events move the end date. Cohort 10 has
  none left after the 18 Oct combined service. Left as is; nothing to fix.
- Not built (discussed): a manual "move classes earlier" action on the Planner (today only automatic, when an event is unticked or deleted), and
  treating a break that covers only weekdays as taking out the whole class week.

## How it was tested
Browser with a mocked backend: the Planner, the Class dates sheet, moving class 4 a week later; the manual shows Thu 5 Nov for the 8 Nov class
(3 days before), recaps Sun and Mon after. Not run against a real admin login.

## Open items
- The sheet reads Settings > Timings, each time it opens; if that setting has not loaded or cannot be read, the sheet shows no drop times (it does not guess).
