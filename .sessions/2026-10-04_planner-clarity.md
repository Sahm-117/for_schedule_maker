# Planner gaps and clash clarity

User found thin gap markers, striped spare weeks and the blinking clash/push-back popup confusing. Explained that gaps are unscheduled Sundays, extension stripes indicated dates beyond the usual cycle end, and the warning indicates a still-scheduled class overlapping a blocking church event.

Changes: restored pale full-week gap blocks while marking only Sunday red (including period-boundary clipping); spare blocks remain solid teal; extension stripes apply only to classes and use accurate legend wording. Quarter warns with a static Clash label; Year keeps a compact static ! with explanatory text. Gap summaries no longer invent a church-event explanation when none is recorded. Popup states preview-only, names the conflict, lists Current/Proposed dates and uses Keep current dates / Apply new dates. Async preview responses are ignored after closing/replacing the clash.

Validation: frontend production build, focused lint (pre-existing mixed-export refresh rule disabled only for YearTimeline/PlannerBits), git diff whitespace check. ADMIN browser against local frontend/deployed backend with browser-only event and preview scenarios checked pale gap width vs Sunday edge, solid spare, no animation, current/proposed table, 320/390/1280 widths, zero console/runtime errors, and no apply request on cancel. Independent review caught and fixed period-edge Sunday clipping. All isolated QA records removed; no real schedule dates changed.

Publishing from codex/planner-sunday-clashes to Sahm-117/for_schedule_maker main under standing batch-push instruction, author Sam <tisnotaname@gmail.com>.
