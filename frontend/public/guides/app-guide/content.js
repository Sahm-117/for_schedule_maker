// FOF Ops app guide content. Edit the text here; screenshots live in shots/.
// Shape: roles.<admin|support|participant>.sections[] -> { id, title, where, summary, shot, tasks[] -> { id, q, keywords, steps, result, tips, shot } }
window.GUIDE_CONTENT = {
 "roles": {
  "admin": {
   "sections": [
    {
     "id": "getting-started",
     "title": "Getting started",
     "where": "First thing you see after logging in",
     "summary": "A quick tour of the sidebar, the cohort picker, alerts and where to get help.",
     "shot": "admin-sidebar-nav.jpg",
     "tasks": [
      {
       "id": "getting-started-login",
       "q": "How do I log in?",
       "keywords": [
        "sign in",
        "login",
        "password",
        "email"
       ],
       "steps": [
        "Go to the FOF Ops web address and you'll land on the sign-in screen.",
        "Type your email (or phone number) in the first box.",
        "Type your password in the second box.",
        "Tap **Sign in**."
       ],
       "result": "You land on the Dashboard. If this is your very first time in, you'll be asked to swap the temporary password you were given for one only you know.",
       "tips": [
        "If sign-in fails, double-check your email and password first.",
        "Still stuck? Tap **Refresh** at the top of the screen to update the app, then try again."
       ],
       "shot": "admin-login-screen.jpg"
      },
      {
       "id": "getting-started-first-login-password",
       "q": "I was given a temporary password — what do I do with it?",
       "keywords": [
        "temporary password",
        "first login",
        "change password"
       ],
       "steps": [
        "Sign in with the temporary password you were given.",
        "A box pops up asking you to choose your own password.",
        "Type the temporary password again if asked, then your new password twice.",
        "Save it."
       ],
       "result": "From now on you sign in with your own password, not the temporary one."
      },
      {
       "id": "getting-started-sidebar",
       "q": "What are all the sections in the menu on the left?",
       "keywords": [
        "sidebar",
        "menu",
        "navigation"
       ],
       "steps": [
        "The left-hand menu is grouped: **Overview** (Dashboard), **Programme** (Schedule), **People & groups** (Participants, Groups, Supports, Hubs, Cohorts), **Engagement** (Follow-ups, Feedback, Community) and **Administration** (Users, Announcements, Resources, Website, Settings).",
        "Tap a group's name to collapse or expand it.",
        "Some pages have extra tabs across the top once you're inside them — for example Schedule also has Approvals, Rota and Activity overview."
       ],
       "result": "You can jump straight to any part of the back office."
      },
      {
       "id": "getting-started-cohort-picker",
       "q": "How do I switch to a different cohort?",
       "keywords": [
        "cohort picker",
        "switch cohort",
        "change cohort"
       ],
       "steps": [
        "Tap the cohort name and dates in the top-right corner (e.g. \"Cohort 10\").",
        "Pick the cohort you want from the list."
       ],
       "result": "Every page — Participants, Groups, Schedule and so on — now shows that cohort's data instead.",
       "shot": "admin-cohort-switcher-open.jpg"
      },
      {
       "id": "getting-started-notifications",
       "q": "What does the bell icon do?",
       "keywords": [
        "notifications",
        "bell",
        "alerts"
       ],
       "steps": [
        "Tap the bell in the top bar.",
        "A panel drops down with your recent alerts, split into announcements and activity.",
        "Tap **Mark all read** to clear the badge, or tap a single alert to open what it's about."
       ],
       "result": "Unread alerts show as a number badge on the bell; opening one marks it read and takes you to the right screen.",
       "shot": "admin-notification-bell-open.jpg"
      },
      {
       "id": "getting-started-help",
       "q": "Where do I go if I'm stuck or need help?",
       "keywords": [
        "help",
        "support",
        "question mark",
        "whatsapp"
       ],
       "steps": [
        "Tap the round **?** button (bottom-right on most screens, or in the top bar on desktop).",
        "Choose **Open the app guide** to search this guide, or **Message [name]** to open WhatsApp with the support contact set up in Settings."
       ],
       "result": "Either the guide opens in a full-screen window, or WhatsApp opens with a message already started.",
       "shot": "admin-help-sheet.jpg"
      },
      {
       "id": "getting-started-app-guide",
       "q": "How do I search this guide?",
       "keywords": [
        "app guide",
        "search",
        "how do i"
       ],
       "steps": [
        "Tap the **?** button, then **Open the app guide**.",
        "Type your question in the \"How can I…?\" box at the top, e.g. \"assign follow-up\".",
        "Tap a result to jump straight to the answer."
       ],
       "result": "You get step-by-step instructions with a picture, without leaving the app.",
       "shot": "admin-app-guide-open.jpg"
      },
      {
       "id": "getting-started-profile-menu",
       "q": "How do I log out or see my own profile?",
       "keywords": [
        "log out",
        "logout",
        "my profile",
        "account"
       ],
       "steps": [
        "Tap your name and photo in the top-left of the header, or use **Logout** at the bottom of the sidebar.",
        "Choose **View profile** or **Log out**."
       ],
       "result": "Logging out returns you to the sign-in screen.",
       "shot": "admin-profile-menu.jpg"
      }
     ]
    },
    {
     "id": "dashboard",
     "title": "Dashboard",
     "where": "Sidebar → Overview → Dashboard",
     "summary": "A one-screen health check for the active cohort — what's ready, what needs attention, and today's schedule.",
     "shot": "admin-dashboard-overview.jpg",
     "tasks": [
      {
       "id": "dashboard-read-health",
       "q": "How do I tell if the cohort is doing okay?",
       "keywords": [
        "health",
        "on track",
        "needs attention",
        "overview"
       ],
       "steps": [
        "Open the Dashboard.",
        "Each tile (Participants, Supports, etc.) shows a colour bar: green is on track, amber is \"keep an eye on\", red is \"needs attention\".",
        "Tap a tile to jump to the full list behind that number."
       ],
       "result": "You get an instant sense of where to focus, without opening every page."
      },
      {
       "id": "dashboard-ready-checklist",
       "q": "How do I know if a new cohort is ready to start?",
       "keywords": [
        "ready to start",
        "checklist",
        "before class starts"
       ],
       "steps": [
        "Look at the **Ready to start?** card.",
        "Each line ticks off once it's done: weeks set up, schedule published, participants added, groups created, every group has a support, everyone placed in a group.",
        "Tap any unticked line to go straight to that page and fix it."
       ],
       "result": "Once every line is ticked, the cohort is ready for its first Sunday."
      },
      {
       "id": "dashboard-registration-funnel",
       "q": "How do I see how sign-ups are going?",
       "keywords": [
        "registration funnel",
        "sign ups",
        "contacts",
        "target"
       ],
       "steps": [
        "Look at the row of four numbers: Contacts, Contacted, Replied, Registered.",
        "Each one shows what share of the one before it reached that stage.",
        "Tap any of the four to open Follow-ups for the details."
       ],
       "result": "Shows how many interested people are moving through to full registration, against the sign-up target set on Follow-ups."
      },
      {
       "id": "dashboard-operations",
       "q": "Where do I see what's happening today?",
       "keywords": [
        "today's schedule",
        "operations",
        "pending approvals"
       ],
       "steps": [
        "Scroll to the **Operations** row.",
        "\"Today's schedule\" shows the next few activities and who's ticked them off.",
        "\"Schedule approvals\" shows how many change requests are waiting for you."
       ],
       "result": "Tap **Open** on any card to go straight to that page."
      },
      {
       "id": "dashboard-refresh",
       "q": "The numbers look out of date — how do I refresh?",
       "keywords": [
        "refresh",
        "reload",
        "out of date"
       ],
       "steps": [
        "Tap **↻ Refresh** at the top of the sidebar."
       ],
       "result": "The app reloads its data (and updates itself if a newer version is available)."
      }
     ]
    },
    {
     "id": "schedule",
     "title": "Schedule",
     "where": "Sidebar → Programme → Schedule",
     "summary": "Build the week-by-week programme: what happens, at what time, and who it's assigned to.",
     "shot": "admin-schedule-week.jpg",
     "tasks": [
      {
       "id": "schedule-add-activity",
       "q": "How do I add something to the schedule?",
       "keywords": [
        "add activity",
        "new activity",
        "schedule item"
       ],
       "steps": [
        "Open Schedule and pick the week using the week selector at the top.",
        "Tap **Add Activity** under the day you want (or the day's \"Add the first activity\" button if it's empty).",
        "Enter the time and a description.",
        "Tick which support tags this activity should be assigned to.",
        "Save."
       ],
       "result": "The activity appears on that day. Anyone tagged with a matching label sees it on their own schedule once it's published.",
       "shot": "admin-schedule-add-activity-modal.jpg"
      },
      {
       "id": "schedule-publish",
       "q": "How do I let supports see the schedule?",
       "keywords": [
        "publish schedule",
        "draft",
        "unpublish"
       ],
       "steps": [
        "Open Schedule.",
        "Tap the **Draft** / **Published** pill near the top-right.",
        "Confirm **Publish**."
       ],
       "result": "Every support immediately sees the activities tagged to them for this cohort. Tapping it again unpublishes and hides them straight away.",
       "tips": [
        "Make sure the week is finished before you publish — supports see the change immediately."
       ]
      },
      {
       "id": "schedule-filter",
       "q": "How do I see only one support's activities, or one type of activity?",
       "keywords": [
        "filter schedule",
        "activity tags",
        "by support"
       ],
       "steps": [
        "Use the **All activity tags** and **All support users** dropdowns above the week.",
        "Pick a tag or a person to narrow the view."
       ],
       "result": "Only matching activities stay visible; everything else is hidden until you clear the filter."
      }
     ]
    },
    {
     "id": "approvals",
     "title": "Approvals",
     "where": "Sidebar → Programme → Schedule → Approvals tab",
     "summary": "Schedule changes a support requests need an admin's yes before they go live.",
     "shot": "admin-approvals.jpg",
     "tasks": [
      {
       "id": "approvals-review",
       "q": "How do I approve or reject a schedule change someone asked for?",
       "keywords": [
        "approve",
        "reject",
        "pending change",
        "schedule request"
       ],
       "steps": [
        "Open the **Approvals** tab (next to Schedule).",
        "Each row shows who asked for what change and to which week/day.",
        "Tap **Approve** to apply it, or **Reject** to dismiss it."
       ],
       "result": "Approving updates the live schedule immediately; rejecting leaves the schedule as it was and tells the requester.",
       "tips": [
        "A number badge on the Approvals tab shows how many are waiting."
       ]
      }
     ]
    },
    {
     "id": "rota",
     "title": "Rota",
     "where": "Sidebar → Programme → Schedule → Rota tab",
     "summary": "Assign each weekly duty (like opening prayer or refreshments) to a support person, week by week.",
     "shot": "admin-rota-grid.jpg",
     "tasks": [
      {
       "id": "rota-assign-duty",
       "q": "How do I put someone on duty for a week?",
       "keywords": [
        "assign duty",
        "rota",
        "weekly duty"
       ],
       "steps": [
        "Open the **Rota** tab.",
        "Find the duty row and the week column, then pick the support from that cell.",
        "Repeat for as many cells as you need — nothing saves yet.",
        "When ready, tap **Review & apply** at the bottom, check the list of changes, then confirm."
       ],
       "result": "The support's reminders for that duty start going out. Nothing is written until you review and apply.",
       "tips": [
        "Tap **Discard** instead to drop all unsaved changes.",
        "\"Unmatched\" activities (duties with no matching schedule entry) show in a panel below the grid — tap through to fix them on Schedule."
       ]
      }
     ]
    },
    {
     "id": "activity-overview",
     "title": "Activity overview",
     "where": "Sidebar → Programme → Schedule → Activity overview tab",
     "summary": "A read-only, filterable view of every activity across the whole week — handy for a bird's-eye check.",
     "shot": "admin-activity-overview.jpg",
     "tasks": [
      {
       "id": "activity-overview-filter",
       "q": "How do I see everything happening this week at a glance?",
       "keywords": [
        "activity overview",
        "whole week",
        "filter by day"
       ],
       "steps": [
        "Open the **Activity overview** tab.",
        "Use **All days**, **All activity tags** or **All support users** to narrow what's shown.",
        "Tap **Reset filters** to see everything again."
       ],
       "result": "A quick way to sanity-check the whole week's plan without clicking into each day."
      }
     ]
    },
    {
     "id": "participants",
     "title": "Participants",
     "where": "Sidebar → People & groups → Participants",
     "summary": "The full list of people taking the course this cohort — add them, import them, check who's flagged, and open anyone's profile.",
     "shot": "admin-participants-list.jpg",
     "tasks": [
      {
       "id": "participants-add",
       "q": "How do I add a new participant?",
       "keywords": [
        "add participant",
        "new participant"
       ],
       "steps": [
        "Open Participants.",
        "Tap **+ Add**.",
        "Fill in their details and save."
       ],
       "result": "They appear in the list, unassigned to a group until you place them.",
       "shot": "admin-participants-add-modal.jpg"
      },
      {
       "id": "participants-import",
       "q": "How do I add lots of participants at once?",
       "keywords": [
        "import participants",
        "bulk add",
        "paste list",
        "csv"
       ],
       "steps": [
        "Open Participants, tap the **⋮** menu, then **Import participants**.",
        "Either paste a list of names/numbers, or upload a CSV file.",
        "Check the preview — any rows that can't be read are skipped and shown to you.",
        "Tap **Import**."
       ],
       "result": "Everyone in the preview is added to the active cohort.",
       "shot": "admin-participants-import-modal.jpg"
      },
      {
       "id": "participants-export",
       "q": "How do I get a list of participants for WhatsApp?",
       "keywords": [
        "export",
        "whatsapp list",
        "copy names"
       ],
       "steps": [
        "Open Participants, tap **⋮**, then **Export for WhatsApp**.",
        "Copy the text that appears."
       ],
       "result": "A ready-to-paste list of names and numbers, matching whatever filters you had applied.",
       "shot": "admin-participants-overflow-menu.jpg"
      },
      {
       "id": "participants-request-info",
       "q": "How do I ask participants to fill in missing details?",
       "keywords": [
        "request information",
        "incomplete profile"
       ],
       "steps": [
        "Open Participants, tap **⋮**, then **Request information**."
       ],
       "result": "Sends a prompt asking participants with gaps in their profile to fill them in."
      },
      {
       "id": "participants-filters",
       "q": "How do I find participants with a concern, or with an incomplete profile?",
       "keywords": [
        "concerns",
        "flagged",
        "incomplete profiles",
        "filter participants"
       ],
       "steps": [
        "Use the **Concerns (n)** pill to show only flagged participants.",
        "Use **Incomplete profiles (n)** to show anyone under 100% profile completion.",
        "Use the group and support dropdowns to narrow to one group, or tick **Show archived** to include people no longer active."
       ],
       "result": "The list narrows to match; tap a pill again to clear it."
      },
      {
       "id": "participants-open-profile",
       "q": "How do I see one participant's full record?",
       "keywords": [
        "participant profile",
        "open participant",
        "view participant"
       ],
       "steps": [
        "Tap a participant's name in the list."
       ],
       "result": "Opens their profile: attendance, group, health status, notes, flagged concerns and their Faith Project."
      },
      {
       "id": "participants-flag-concern",
       "q": "How do I flag a concern about a participant?",
       "keywords": [
        "flag concern",
        "raise a concern"
       ],
       "steps": [
        "Open the participant's profile.",
        "Tap **Flag a concern**, describe it, and save."
       ],
       "result": "It shows as an open concern on their profile until an admin clears it."
      }
     ]
    },
    {
     "id": "attendance",
     "title": "Attendance",
     "where": "Sidebar → People & groups → Participants → Attendance tab",
     "summary": "Mark who came to Sunday class each week, and send the attendance report.",
     "shot": "admin-attendance.jpg",
     "tasks": [
      {
       "id": "attendance-mark",
       "q": "How do I mark today's attendance?",
       "keywords": [
        "mark attendance",
        "present",
        "absent"
       ],
       "steps": [
        "Open the Attendance tab and pick the week.",
        "Against each participant, choose Present, Late, Left Early, Absent or Excused."
       ],
       "result": "The status bar at the top updates to show how many are still unmarked."
      },
      {
       "id": "attendance-excuse-lateness",
       "q": "How do I excuse someone who was marked late?",
       "keywords": [
        "excuse lateness",
        "late excused"
       ],
       "steps": [
        "Find the participant marked Late.",
        "Tap **Excuse**, type a short note, and save."
       ],
       "result": "Their lateness no longer counts against them, and the note is kept for admins only."
      },
      {
       "id": "attendance-send-report",
       "q": "How do I send the attendance report for the week?",
       "keywords": [
        "send report",
        "finalise attendance",
        "finalize"
       ],
       "steps": [
        "Mark everyone present, so the header changes to \"Attendance taken\".",
        "Tap **Send report**."
       ],
       "result": "The week is finalised and the report goes out. Tap **Reopen** afterwards if you need to fix a mistake.",
       "tips": [
        "Turn on **Auto-finalise at noon** and it sends itself every Sunday without you doing this step."
       ]
      },
      {
       "id": "attendance-who-can-mark",
       "q": "How do I let a support mark training attendance too?",
       "keywords": [
        "who can mark",
        "training markers"
       ],
       "steps": [
        "Open the **⋮** menu on Attendance.",
        "Choose **Who can mark trainings**.",
        "Tick the supports who should be able to."
       ],
       "result": "Those supports can now mark training attendance from their own screen."
      }
     ]
    },
    {
     "id": "faith-projects",
     "title": "Faith projects",
     "where": "Sidebar → People & groups → Participants → Faith projects tab",
     "summary": "Review each group's Faith Project idea and testimony, and message the support about it.",
     "shot": "admin-faith-projects.jpg",
     "tasks": [
      {
       "id": "faith-projects-approve",
       "q": "How do I approve a group's Faith Project?",
       "keywords": [
        "approve faith project",
        "needs refinement"
       ],
       "steps": [
        "Open Faith projects and pick the group.",
        "Read what they submitted.",
        "Tap **Approve**, or **Needs Refinement** if it needs more work."
       ],
       "result": "The group's support sees the decision on their side."
      },
      {
       "id": "faith-projects-settings",
       "q": "How do I change the Faith Project categories or the corporate-prayer setting?",
       "keywords": [
        "faith project settings",
        "categories",
        "corporate prayer"
       ],
       "steps": [
        "Tap the gear icon (**Faith Project settings**) at the top of the page.",
        "Add, rename or remove categories, and toggle corporate-prayer opt-in.",
        "Save."
       ],
       "result": "New submissions use the updated categories and settings."
      }
     ]
    },
    {
     "id": "onboarding",
     "title": "Onboarding",
     "where": "Sidebar → People & groups → Participants → Onboarding tab",
     "summary": "Track how far along each group is in onboarding its participants, manage the message templates supports use, and set who can help onboard other supports.",
     "shot": "admin-onboarding.jpg",
     "tasks": [
      {
       "id": "onboarding-coordinators",
       "q": "How do I make someone a coordinator who can onboard other supports?",
       "keywords": [
        "coordinator",
        "onboard supports"
       ],
       "steps": [
        "Open Onboarding.",
        "Find the coordinator section, pick a support from the dropdown, and tap to add them."
       ],
       "result": "They can now send onboarding prompts to other support users."
      },
      {
       "id": "onboarding-templates",
       "q": "How do I change the message a support sends when onboarding a participant?",
       "keywords": [
        "message template",
        "onboarding message"
       ],
       "steps": [
        "Open Onboarding, switch to the template type you want to edit.",
        "Edit the wording (you can use {{full_name}} to personalise it).",
        "Save."
       ],
       "result": "Supports see the updated wording the next time they open onboarding for a participant."
      },
      {
       "id": "onboarding-progress",
       "q": "How do I see which groups still aren't fully onboarded?",
       "keywords": [
        "onboarding progress",
        "not onboarded"
       ],
       "steps": [
        "Open Onboarding and look at the progress bar and the group-by-group list."
       ],
       "result": "Shows the percentage of participants in fully onboarded groups, and which groups are behind."
      }
     ]
    },
    {
     "id": "groups",
     "title": "Groups",
     "where": "Sidebar → People & groups → Groups",
     "summary": "The small groups participants are split into, each led by a support. Build new groups by hand or let the engine do it, and see who's assigned where.",
     "shot": "admin-groups-list.jpg",
     "tasks": [
      {
       "id": "groups-new-chooser",
       "q": "How do I create a new group?",
       "keywords": [
        "new group",
        "create group"
       ],
       "steps": [
        "Open Groups.",
        "Tap **+ New Group**.",
        "Choose **Build with engine** (groups everyone at once by your rules) or **Create manually** (one group at a time)."
       ],
       "result": "Either opens the matching flow below.",
       "shot": "admin-groups-new-chooser.jpg"
      },
      {
       "id": "groups-build-with-engine",
       "q": "How do I build all the groups automatically?",
       "keywords": [
        "build with engine",
        "auto build groups",
        "group builder"
       ],
       "steps": [
        "From **+ New Group**, choose **Build with engine**.",
        "**Step 1 – People**: review who's ready to be grouped; optionally switch on \"Also use supports who missed pre-cohort training\" (drafts show a **Missed training** tag on those supports).",
        "**Step 2 – Rules**: set group size (smallest/aim/largest), gender mix, age spread, and the support's gender/age preference, and how strictly each should be followed.",
        "Tap **Save rules & build** to see a draft.",
        "**Step 3 – Draft**: review the proposed groups; tap **Rebuild** to try again with tweaked rules, or **Back** to change rules.",
        "**Step 4 – Create**: tap **Create [n] groups** to save them for real."
       ],
       "result": "Nothing is written to the cohort until step 4 — you can rebuild the draft as many times as you like first.",
       "shot": "admin-groups-engine-step1-people.jpg"
      },
      {
       "id": "groups-engine-rules",
       "q": "How strict can I make the group-building rules?",
       "keywords": [
        "group size",
        "gender mix",
        "age mix",
        "engine rules"
       ],
       "steps": [
        "On the engine's **Rules** step, set smallest/aim/largest group size, the women/men mix, whether ages are kept close or mixed, and whether a one-gender group needs a support of that gender.",
        "Each rule has a strength — how hard the engine tries to follow it versus other rules — pick that per rule."
       ],
       "result": "Tapping **Save rules & build** builds a draft using these rules; you can go back and adjust before creating anything.",
       "shot": "admin-groups-engine-step2-rules.jpg"
      },
      {
       "id": "groups-create-manually",
       "q": "How do I create one group by hand?",
       "keywords": [
        "create manually",
        "one group"
       ],
       "steps": [
        "From **+ New Group**, choose **Create manually**.",
        "Name the group and choose its support.",
        "Save."
       ],
       "result": "An empty group is created — add participants to it from Allocation or from their profile.",
       "shot": "admin-groups-manual-create-modal.jpg"
      },
      {
       "id": "groups-overflow",
       "q": "How do I export the group list for WhatsApp or see archived groups?",
       "keywords": [
        "export groups",
        "archived groups"
       ],
       "steps": [
        "Tap the **⋮** menu on Groups.",
        "Choose **Export for WhatsApp**, or **Show archived groups**."
       ],
       "result": "Export copies a ready-to-paste list; the archived toggle reveals groups no longer in use.",
       "shot": "admin-groups-overflow-menu.jpg"
      },
      {
       "id": "groups-filters",
       "q": "How do I find a group with no support assigned?",
       "keywords": [
        "no support assigned",
        "jump to group"
       ],
       "steps": [
        "Use the support dropdown and pick **No support assigned (n)**.",
        "Or use **Jump to group** to go straight to one."
       ],
       "result": "Only matching groups show; assign a support from the card to clear it from that list."
      }
     ]
    },
    {
     "id": "allocation",
     "title": "Allocation",
     "where": "Sidebar → People & groups → Groups → Allocate participants",
     "summary": "Move unassigned participants into existing groups, one at a time or all at once.",
     "shot": "admin-allocation.jpg",
     "tasks": [
      {
       "id": "allocation-move-one",
       "q": "How do I put one person into a group?",
       "keywords": [
        "move participant",
        "assign to group"
       ],
       "steps": [
        "Open **Allocate participants** (from Groups, or the Ready to start? checklist).",
        "On a phone: tap **Move** next to the person and pick their group.",
        "On a computer: tap to select them, then drag onto a group — or select several and use **Move selected**."
       ],
       "result": "They move into that group immediately."
      },
      {
       "id": "allocation-auto-distribute",
       "q": "How do I spread everyone left over evenly across the groups?",
       "keywords": [
        "auto-distribute",
        "spread evenly"
       ],
       "steps": [
        "Tap **Auto-distribute evenly**.",
        "Check the proposed split, then confirm **Distribute**."
       ],
       "result": "Every unassigned participant is spread across the existing groups as evenly as possible."
      }
     ]
    },
    {
     "id": "group-meetings",
     "title": "Group meetings",
     "where": "Sidebar → People & groups → Groups → Group meetings tab",
     "summary": "See and mark whether each group held its weekly meeting.",
     "shot": "admin-group-meetings.jpg",
     "tasks": [
      {
       "id": "group-meetings-mark",
       "q": "How do I check or mark a group's weekly meeting?",
       "keywords": [
        "group meeting attendance",
        "mark meeting"
       ],
       "steps": [
        "Open Group meetings.",
        "Find the group's row and the week's column.",
        "Tap the cell to open that meeting's attendance."
       ],
       "result": "Shows who attended that group's meeting for the week, as recorded by the support."
      }
     ]
    },
    {
     "id": "supports",
     "title": "Supports",
     "where": "Sidebar → People & groups → Supports",
     "summary": "Everyone leading a group or serving the programme — how they're doing, their profile, and their workload.",
     "shot": "admin-supports-list.jpg",
     "tasks": [
      {
       "id": "supports-how-judged",
       "q": "How are supports judged as on track, keep an eye on, or needs attention?",
       "keywords": [
        "how supports are judged",
        "rules",
        "supports rules"
       ],
       "steps": [
        "Open Supports.",
        "Tap the small **ⓘ** next to \"How supports are judged\"."
       ],
       "result": "Shows the current rules: how many unrecorded weeks trigger \"keep an eye on\" or \"needs attention\", and the onboarding deadline. Tap **Change rules** to edit them in Settings.",
       "shot": "admin-supports-rules-popover.jpg"
      },
      {
       "id": "supports-view-profile",
       "q": "How do I see or edit a support's profile?",
       "keywords": [
        "support profile",
        "edit gender",
        "age range",
        "birthday",
        "photo",
        "phone number"
       ],
       "steps": [
        "Tap a support's name or photo.",
        "As an admin you can: add or change their photo, set gender and age range, set their birthday (day + month, optional), and add/edit their phone number.",
        "Changes save as you make them — there's no separate Save button."
       ],
       "result": "Their card and filters elsewhere update to match. You also see **Last active** here.",
       "shot": "admin-supports-profile-modal.jpg"
      },
      {
       "id": "supports-follow-up-load",
       "q": "What do the \"Over limit\" and \"At limit\" tags on a support mean?",
       "keywords": [
        "over limit",
        "at limit",
        "follow-up load"
       ],
       "steps": [
        "Look at the small pill under a support's name in the Supports list."
       ],
       "result": "\"At limit\" means they have exactly the maximum number of open follow-ups set in Settings; \"Over limit\" means they've gone past it. New follow-ups won't be auto-assigned to them until it drops."
      },
      {
       "id": "supports-trainings-tab",
       "q": "How do I record a pre-cohort training or get-together?",
       "keywords": [
        "trainings",
        "get-togethers",
        "mark training attendance"
       ],
       "steps": [
        "Switch to the **Trainings & get-togethers** tab.",
        "Tap **New session**, give it a title and date, and save.",
        "Open the session and mark each support Present, Late, Excused etc."
       ],
       "result": "Attendance feeds into whether a support has met the minimum trainings needed to be given a group.",
       "shot": "admin-supports-trainings-tab.jpg"
      },
      {
       "id": "supports-filters",
       "q": "How do I find supports in one hub, or with notes on them?",
       "keywords": [
        "filter supports",
        "by hub",
        "with notes"
       ],
       "steps": [
        "Use the **All hubs**, **All supports**, **All profiles**, or **All roles** dropdowns above the list."
       ],
       "result": "The list narrows to match your filter."
      },
      {
       "id": "supports-export",
       "q": "How do I export the supports list for WhatsApp?",
       "keywords": [
        "export supports"
       ],
       "steps": [
        "Tap **⋮** on Supports, then **Export for WhatsApp**."
       ],
       "result": "Copies a ready-to-paste list matching your current filters."
      }
     ]
    },
    {
     "id": "hubs",
     "title": "Hubs",
     "where": "Sidebar → People & groups → Hubs",
     "summary": "Hubs group supports together (not participants) for prayer, recap and tech support, each with its own roles.",
     "shot": "admin-hubs-list.jpg",
     "tasks": [
      {
       "id": "hubs-create",
       "q": "How do I create a new hub?",
       "keywords": [
        "new hub",
        "create hub"
       ],
       "steps": [
        "Open Hubs.",
        "Tap **+ New Hub**.",
        "Name it and save."
       ],
       "result": "An empty hub appears, ready to have members added.",
       "shot": "admin-hubs-new-hub-modal.jpg"
      },
      {
       "id": "hubs-manage-members",
       "q": "How do I add or remove someone from a hub?",
       "keywords": [
        "manage members",
        "add to hub",
        "remove from hub"
       ],
       "steps": [
        "Tap the **⋮** menu on a hub card.",
        "Choose **Manage members**.",
        "Tick or untick supports."
       ],
       "result": "The hub's member list and count update immediately.",
       "shot": "admin-hubs-manage-members.jpg"
      },
      {
       "id": "hubs-roles",
       "q": "How do I set a hub's Lead, Assistant Lead, Prayer Lead, Recap Lead or IT Support?",
       "keywords": [
        "hub roles",
        "hub lead",
        "assistant lead",
        "prayer lead",
        "recap lead",
        "it support"
       ],
       "steps": [
        "Tap **⋮** on a hub card, then **Hub roles**.",
        "Pick who holds each role: Hub Lead, Assistant Hub Lead, Prayer Lead(s), Recap Lead(s).",
        "IT Support can be picked from any hub's supports, even if they belong to a different hub — their card then shows \"Member of [their real hub]\" so it's clear they're just helping here.",
        "Save."
       ],
       "result": "Role pills appear next to each person's name on the hub card, and their duties/reminders follow the role.",
       "shot": "admin-hubs-roles-modal.jpg"
      },
      {
       "id": "hubs-recap-filter",
       "q": "How do I see which hubs are behind on marking their recap?",
       "keywords": [
        "recap behind",
        "recap attendance"
       ],
       "steps": [
        "Use the dropdown next to the search box.",
        "Choose **Recap behind** or **Recap all marked**."
       ],
       "result": "Only hubs matching that state are shown; a pill on each card also shows how many recaps are marked out of the total."
      },
      {
       "id": "hubs-delete",
       "q": "How do I delete a hub?",
       "keywords": [
        "delete hub"
       ],
       "steps": [
        "Tap **⋮** on the hub, then **Delete hub**.",
        "Confirm."
       ],
       "result": "The hub is removed. This does not delete the supports in it — only the hub grouping.",
       "shot": "admin-hubs-card-menu.jpg"
      }
     ]
    },
    {
     "id": "cohorts",
     "title": "Cohorts",
     "where": "Sidebar → People & groups → Cohorts",
     "summary": "Create new cohorts, manage their weeks, and archive old ones.",
     "shot": "admin-cohorts-page.jpg",
     "tasks": [
      {
       "id": "cohorts-new",
       "q": "How do I start a new cohort?",
       "keywords": [
        "new cohort",
        "create cohort"
       ],
       "steps": [
        "Open Cohorts and tap **New Cohort**.",
        "This copies the current active cohort's setup into a new one — give it a name, description, venue, start date and number of weeks (the end date fills in automatically).",
        "Save."
       ],
       "result": "A new, independent cohort is created with its own weeks, ready to switch to from the cohort picker.",
       "shot": "admin-cohorts-new-modal.jpg"
      },
      {
       "id": "cohorts-week-actions",
       "q": "How do I add, remove, duplicate or edit a week?",
       "keywords": [
        "add week",
        "remove week",
        "duplicate week",
        "send recap now",
        "send manual now"
       ],
       "steps": [
        "Find the week in the cohort table and tap its **⋮** menu.",
        "Choose **Duplicate Week [n]**, edit its details, remove it, or use **Send recap now** / **Send manual now** to push that week's messages out immediately instead of waiting for the scheduled time."
       ],
       "result": "The change applies straight away; \"Send now\" options deliver to participants/supports right then.",
       "shot": "admin-cohorts-week-menu.jpg"
      },
      {
       "id": "cohorts-archive",
       "q": "How do I archive an old cohort?",
       "keywords": [
        "archive cohort",
        "show archived"
       ],
       "steps": [
        "Find the cohort in the list and use its archive toggle.",
        "Tick **Show Archived** to bring hidden ones back into view."
       ],
       "result": "Archived cohorts are hidden from the main list and the cohort picker by default, but their data is kept."
      }
     ]
    },
    {
     "id": "follow-ups",
     "title": "Follow-ups",
     "where": "Sidebar → Engagement → Follow-ups",
     "summary": "Track everyone interested in joining, message them, and get them assigned to a support until they have their app login.",
     "shot": "admin-follow-ups-overview.jpg",
     "tasks": [
      {
       "id": "follow-ups-capacity-cards",
       "q": "How do I see how many people are waiting to be followed up with?",
       "keywords": [
        "waiting",
        "capacity",
        "spare places"
       ],
       "steps": [
        "Open Follow-ups (it opens on the **Overview** tab, or switch to **Contacts**).",
        "The cards at the top show, per gender, how many are waiting versus how many spare places supports have, and which supports are at their limit."
       ],
       "result": "Tapping a number filters the contact list below to match."
      },
      {
       "id": "follow-ups-add-contact",
       "q": "How do I add someone interested in joining?",
       "keywords": [
        "add contact",
        "new interested person"
       ],
       "steps": [
        "Tap **Add Contact**.",
        "Fill in their name, phone and any details you have.",
        "Save."
       ],
       "result": "They appear on the Contacts tab, unassigned until picked up by a support.",
       "shot": "admin-follow-ups-add-contact-modal.jpg"
      },
      {
       "id": "follow-ups-gear-settings",
       "q": "How do I turn on automatic assignment of follow-ups?",
       "keywords": [
        "assign automatically",
        "auto assign",
        "gear icon",
        "assignment settings"
       ],
       "steps": [
        "Tap the gear icon next to **Add Contact**.",
        "Switch on **Assign automatically**.",
        "A confirmation explains: anyone who's waited 2 hours or more goes to a same-gender support with room, and that support gets the usual alert. Confirm **Turn on**."
       ],
       "result": "From then on, the app checks every ~10 minutes and hands out anyone who's been waiting 2+ hours — same gender only, favouring whoever added them if they have room, otherwise the same-gender support with the fewest open follow-ups.",
       "tips": [
        "Turning it off again needs no confirmation — only turning it on does, since it can hand out everyone already waiting."
       ],
       "shot": "admin-follow-ups-gear-settings.jpg"
      },
      {
       "id": "follow-ups-admin-alerts",
       "q": "How do I get alerted when someone's stuck waiting?",
       "keywords": [
        "alert admins",
        "stuck",
        "reminder"
       ],
       "steps": [
        "Tap the gear icon.",
        "Switch on **Alert admins when someone's stuck**."
       ],
       "result": "While anyone is waiting unassigned, admins get one reminder every 2 hours (not one per person)."
      },
      {
       "id": "follow-ups-assign-now",
       "q": "How do I assign everyone waiting right away, without waiting 2 hours?",
       "keywords": [
        "assign follow-ups now",
        "assign immediately"
       ],
       "steps": [
        "Tap the **⋮** menu, then **Assign follow-ups now**.",
        "A confirmation shows how many people are waiting and what will happen.",
        "Confirm **Assign now**."
       ],
       "result": "Each waiting person goes to a same-gender support with room, and that support gets the usual new-follow-up alert. Anyone with no matching same-gender support, or no gender on file, stays waiting and is called out separately.",
       "shot": "admin-follow-ups-assign-now-confirm.jpg"
      },
      {
       "id": "follow-ups-gender-tags",
       "q": "What do \"No same gender to follow up\" and \"Gender not known\" mean?",
       "keywords": [
        "no same gender",
        "gender not known",
        "stuck tags"
       ],
       "steps": [
        "Look at the small tag next to a waiting contact's name."
       ],
       "result": "\"No same gender to follow up\" means every support of their gender is already full. \"Gender not known\" means their gender isn't on file, so the system can't match them to a same-gender support — add it on their contact card to unblock them."
      },
      {
       "id": "follow-ups-status-dropdown",
       "q": "How do I update someone's follow-up stage?",
       "keywords": [
        "status dropdown",
        "registration status",
        "still open",
        "closed",
        "login shared"
       ],
       "steps": [
        "Open the contact's status dropdown.",
        "Choose from three groups: **Still open** (To contact, Waiting, Needs reminder, Replied, Call back later, Registered), **Moved to next cohort**, or **Closed** (Login shared, Wrong number, Not interested, No response)."
       ],
       "result": "Only setting the status to **Login shared** actually closes/completes the follow-up — every other \"open\" status keeps them active on your list.",
       "shot": "admin-follow-ups-contacts.jpg"
      },
      {
       "id": "follow-ups-import-export",
       "q": "How do I import or export a list of contacts?",
       "keywords": [
        "import contacts",
        "export contacts"
       ],
       "steps": [
        "On the **Contacts** tab, tap **⋮**.",
        "Choose **Import contacts** (paste or CSV) or **Export contacts**."
       ],
       "result": "Import adds new contacts to the list; export gives you a copyable/downloadable list matching your filters."
      },
      {
       "id": "follow-ups-message-bank",
       "q": "How do I send a ready-made message to a contact?",
       "keywords": [
        "message bank",
        "templates",
        "send message"
       ],
       "steps": [
        "From a contact's row, tap **Message**.",
        "Pick a template from the Message Bank, or edit the registration link.",
        "Send via WhatsApp."
       ],
       "result": "The message opens in WhatsApp with the template text and the current registration link filled in.",
       "shot": "admin-follow-ups-message-bank.jpg"
      },
      {
       "id": "follow-ups-issues",
       "q": "Where do I see problems reported during follow-up (e.g. wrong link, technical issue)?",
       "keywords": [
        "issues tab",
        "report a problem"
       ],
       "steps": [
        "Switch to the **Issues** tab.",
        "Open an issue to see details; tap **Show closed** to include resolved ones."
       ],
       "result": "Lets you track and resolve problems raised while following people up.",
       "shot": "admin-follow-ups-issues.jpg"
      },
      {
       "id": "follow-ups-registration-link",
       "q": "How do I get the registration link to share?",
       "keywords": [
        "registration link",
        "copy link"
       ],
       "steps": [
        "Tap **Copy** next to the registration link banner, or **Open** to view it."
       ],
       "result": "The link is copied to your clipboard, ready to paste into a message."
      }
     ]
    },
    {
     "id": "feedback",
     "title": "Feedback",
     "where": "Sidebar → Engagement → Feedback",
     "summary": "What participants send in from their app: general feedback, after-class notes, and questions asked during Class Manual.",
     "shot": "admin-feedback-general.jpg",
     "tasks": [
      {
       "id": "feedback-tabs",
       "q": "Where do I see general feedback versus after-class feedback?",
       "keywords": [
        "general feedback",
        "after class feedback"
       ],
       "steps": [
        "Open Feedback.",
        "Switch between the **General** and **After class** tabs."
       ],
       "result": "General shows free-form feedback; After class shows responses collected right after each Sunday session."
      },
      {
       "id": "feedback-manual-questions",
       "q": "How do I answer a question someone asked during Class Manual?",
       "keywords": [
        "manual questions",
        "reply to question",
        "mark in class"
       ],
       "steps": [
        "Switch to the **Manual questions** tab.",
        "Tap **Reply** on a question and type your answer, or tap **Mark in class** if it was already answered live."
       ],
       "result": "Your reply is sent back to whoever asked; marking \"in class\" records it as handled without sending a written reply.",
       "shot": "admin-feedback-manual-questions.jpg"
      }
     ]
    },
    {
     "id": "community",
     "title": "Community",
     "where": "Sidebar → Engagement → Community",
     "summary": "A shared discussion board for supports and participants, plus a people directory.",
     "shot": "admin-community.jpg",
     "tasks": [
      {
       "id": "community-new-topic",
       "q": "How do I start a new discussion topic?",
       "keywords": [
        "new topic",
        "post"
       ],
       "steps": [
        "Open Community.",
        "Tap **New topic**.",
        "Write your post and share it."
       ],
       "result": "It appears at the top of the Discussion tab for everyone to see, like and comment on.",
       "shot": "admin-community-new-topic-modal.jpg"
      },
      {
       "id": "community-open-closed",
       "q": "How do I see closed or older topics?",
       "keywords": [
        "open topics",
        "closed topics"
       ],
       "steps": [
        "Use the **Open** / **Closed** toggle above the topic list."
       ],
       "result": "Switches between currently open discussions and ones that have been closed."
      },
      {
       "id": "community-people-tab",
       "q": "Where do I see who's part of the community?",
       "keywords": [
        "people tab",
        "directory"
       ],
       "steps": [
        "Switch to the **People** tab."
       ],
       "result": "Shows a directory of community members."
      }
     ]
    },
    {
     "id": "users",
     "title": "Users",
     "where": "Sidebar → Administration → Users",
     "summary": "Every admin and support account: create them, change their role, reset passwords, or deactivate/delete them.",
     "shot": "admin-users-list.jpg",
     "tasks": [
      {
       "id": "users-add",
       "q": "How do I create a new admin or support account?",
       "keywords": [
        "add user",
        "new account",
        "create support"
       ],
       "steps": [
        "Open Users, tap **Add User**.",
        "Enter their name, email/phone and choose their role (Admin or Support).",
        "If Support, optionally tick which labels/tags they should have.",
        "Save."
       ],
       "result": "They're created with a temporary password to share with them — they'll be asked to change it on first login.",
       "shot": "admin-users-add-modal.jpg"
      },
      {
       "id": "users-row-menu",
       "q": "How do I reset someone's password, change their role, or remove them?",
       "keywords": [
        "reset password",
        "change role",
        "deactivate",
        "delete user"
       ],
       "steps": [
        "Tap the **≡** icon on their row.",
        "Choose **Manage** (edit their details), **Change role**, **Reset password**, **Deactivate** (blocks login, keeps their records) or **Permanent delete** (cannot be undone)."
       ],
       "result": "Reset password gives them a new temporary one to share; Deactivate is the safer option if you just need to stop someone logging in.",
       "shot": "admin-users-row-menu.jpg"
      },
      {
       "id": "users-filters",
       "q": "How do I find supports who haven't set up notifications on their phone?",
       "keywords": [
        "no alerts",
        "filter by role"
       ],
       "steps": [
        "Use the **All roles** dropdown to narrow by Admin/Support.",
        "Use **All alerts** and choose **No alerts (n)** to see who's missing notifications.",
        "Tap the copy button to get a ready-made WhatsApp message reminding them."
       ],
       "result": "Helps you chase up supports who might be missing important reminders."
      }
     ]
    },
    {
     "id": "announcements",
     "title": "Announcements",
     "where": "Sidebar → Administration → Announcements",
     "summary": "Send a message to supports, participants, or both — to everyone, or narrowed to one hub, group, tag or person.",
     "shot": "admin-announcements-list.jpg",
     "tasks": [
      {
       "id": "announcements-send",
       "q": "How do I send an announcement?",
       "keywords": [
        "add announcement",
        "send message",
        "audience"
       ],
       "steps": [
        "Tap **Add Announcement**.",
        "Choose the audience: Supports, Participants, or Supports and participants.",
        "Optionally narrow it further — to one group or hub, one support tag/hub role, or a single named person (picking a person overrides every other narrowing option).",
        "Write your message and send."
       ],
       "result": "It's delivered to whoever matches your audience, and appears in Announcements → History.",
       "shot": "admin-announcements-add-modal.jpg"
      }
     ]
    },
    {
     "id": "resources",
     "title": "Resources",
     "where": "Sidebar → Administration → Resources",
     "summary": "Share links and files with the support team, and choose which ones participants can also see.",
     "shot": "admin-resources-list.jpg",
     "tasks": [
      {
       "id": "resources-add",
       "q": "How do I add a link or file for the team?",
       "keywords": [
        "add resource",
        "upload file",
        "add link"
       ],
       "steps": [
        "Open Resources, tap **Add**.",
        "Choose **Link** or **File**.",
        "Fill in the details, optionally tick to notify users (choose active cohort only, or everyone), and save."
       ],
       "result": "It appears in the resources list for the support team.",
       "shot": "admin-resources-add-modal.jpg"
      },
      {
       "id": "resources-show-participants",
       "q": "How do I let participants see a resource too?",
       "keywords": [
        "show to participants",
        "team only"
       ],
       "steps": [
        "Tap the **Team only · show to participants** pill on a resource."
       ],
       "result": "It flips to \"Shown to participants\" and appears in their app too. Tap again to hide it from participants."
      },
      {
       "id": "resources-download-delete",
       "q": "How do I download or delete a resource?",
       "keywords": [
        "download",
        "delete resource"
       ],
       "steps": [
        "Use the download icon to save a file, or the delete icon to remove it."
       ],
       "result": "Deleting removes it for everyone who could see it."
      }
     ]
    },
    {
     "id": "scriptures",
     "title": "Scriptures",
     "where": "Sidebar → Administration → Resources → Scriptures tab",
     "summary": "The daily inspirational scripture shown on the participant Home screen.",
     "shot": "admin-scriptures.jpg",
     "tasks": [
      {
       "id": "scriptures-toggle",
       "q": "How do I turn the daily scripture on or off?",
       "keywords": [
        "show scriptures",
        "enable scriptures"
       ],
       "steps": [
        "Open Scriptures.",
        "Use the **Show Scriptures to participants** switch."
       ]
      },
      {
       "id": "scriptures-manage",
       "q": "How do I add, replace or reorder scriptures?",
       "keywords": [
        "add scripture",
        "replace",
        "reorder",
        "remove scripture"
       ],
       "steps": [
        "Tap a card to **Replace** its text, or use the remove icon to delete it.",
        "Drag cards to change the order they're posted in.",
        "Set the start day so the first post goes out at 2:00pm on that day of the FOF week, with one more posted each day after."
       ],
       "result": "Participants see one new scripture per day from the start day you set."
      }
     ]
    },
    {
     "id": "website",
     "title": "Website",
     "where": "Sidebar → Administration → Website",
     "summary": "Edit the wording on the public FOF homepage — hero text, about section, curriculum, FAQ and more.",
     "shot": "admin-website-hero-tab.jpg",
     "tasks": [
      {
       "id": "website-edit-section",
       "q": "How do I change the wording on the public website?",
       "keywords": [
        "edit website",
        "homepage text",
        "hero",
        "about"
       ],
       "steps": [
        "Open Website and pick a tab: Hero, About, Curriculum, Photos, How it works, Journey, FAQ, or Closing & footer.",
        "Edit the text fields directly. Use **+ Add line/fact**, the up/down arrows, or **Remove** to change lists.",
        "Tap **Save** when done, or **Cancel** to discard."
       ],
       "result": "The public homepage updates with your changes.",
       "tips": [
        "Use **Reset to default** on any section to put the original wording back."
       ]
      },
      {
       "id": "website-faq",
       "q": "How do I add or edit an FAQ question?",
       "keywords": [
        "faq",
        "good questions"
       ],
       "steps": [
        "Switch to the **FAQ** tab.",
        "Edit an existing question/answer, or add a new one.",
        "Save."
       ],
       "result": "The public FAQ accordion updates to match.",
       "shot": "admin-website-faq-tab.jpg"
      }
     ]
    },
    {
     "id": "settings",
     "title": "Settings",
     "where": "Sidebar → Administration → Settings",
     "summary": "Programme-wide rules, timings, the support contact, church departments, AI help, and your own notification preferences.",
     "shot": "admin-settings-overview.jpg",
     "tasks": [
      {
       "id": "settings-support-contact",
       "q": "How do I change who the **?** button messages on WhatsApp?",
       "keywords": [
        "support contact",
        "need support button",
        "whatsapp contact"
       ],
       "steps": [
        "Open Settings, find **Support contact**, tap **Edit**.",
        "Enter the name and WhatsApp number.",
        "Save."
       ],
       "result": "The floating **?** button across the app now opens WhatsApp with this person.",
       "shot": "admin-settings-support-contact-edit.jpg"
      },
      {
       "id": "settings-programme-rules",
       "q": "How do I change what counts as \"needs attention\" for participants or supports?",
       "keywords": [
        "programme rules",
        "completion percentage",
        "needs attention rules"
       ],
       "steps": [
        "Open Settings, find **Programme rules**, tap **Edit**.",
        "Adjust things like: Sunday attendance % to complete FOF, cohort success target, Sunday/meeting misses before \"Needs attention\", unrecorded weeks before a support is flagged, days to onboard a group, minimum trainings to get a group, and the max follow-ups per support.",
        "Save."
       ],
       "result": "The Dashboard, Participants and Supports pages immediately judge everyone by the new rules.",
       "shot": "admin-settings-programme-rules-edit.jpg"
      },
      {
       "id": "settings-timings",
       "q": "How do I change when recaps or feedback prompts go out?",
       "keywords": [
        "timings",
        "recap time",
        "feedback time",
        "class start time"
       ],
       "steps": [
        "Open Settings, find **Timings**, tap **Edit**.",
        "Set the day and time for support/participant recaps, the class manual, after-class feedback, the department question week, and class start time.",
        "Save."
       ],
       "result": "Future messages go out at the new day/time."
      },
      {
       "id": "settings-ai-help",
       "q": "How do I turn AI help on or off?",
       "keywords": [
        "ai help",
        "openrouter"
       ],
       "steps": [
        "Open Settings, find **AI help**.",
        "Use the switch to turn it on or off."
       ],
       "result": "When on, participants who opt in get end-of-FOF AI summaries, and admins get AI-assisted recap drafts and feedback themes (limited to about 50 requests a day on the free plan)."
      },
      {
       "id": "settings-church-departments",
       "q": "How do I add or remove a church department from the dropdown?",
       "keywords": [
        "church departments",
        "add department"
       ],
       "steps": [
        "Open Settings, find **Church departments**, tap **Edit**.",
        "Type a name (and optional short description) under \"Add a department\", then **Add to list**.",
        "Remove any you no longer need.",
        "Save."
       ],
       "result": "The dropdown participants pick from updates. Removing one doesn't change participants who already chose it."
      },
      {
       "id": "settings-follow-up-auto-assign",
       "q": "Where else can I turn on follow-up auto-assignment?",
       "keywords": [
        "follow-up auto-assignment settings"
       ],
       "steps": [
        "Open Settings and find **Follow-up auto-assignment** — it's the same panel as the gear icon on the Follow-ups page."
       ],
       "result": "Changing it here has exactly the same effect as changing it from Follow-ups."
      },
      {
       "id": "settings-my-notifications",
       "q": "How do I turn on notifications on my own phone?",
       "keywords": [
        "enable notifications",
        "reminder preferences",
        "just for you"
       ],
       "steps": [
        "Open Settings, scroll to **Just for you**.",
        "Tap **Enable on this device**."
       ],
       "result": "This device starts receiving push alerts. This is personal — it doesn't affect anyone else."
      }
     ]
    },
    {
     "id": "troubleshooting",
     "title": "Troubleshooting & FAQ",
     "where": "Any screen — tap the **?** button if you can't find something here",
     "summary": "Common questions and quick fixes.",
     "shot": "admin-help-sheet.jpg",
     "tasks": [
      {
       "id": "troubleshooting-forgot-password",
       "q": "I forgot my password — what do I do?",
       "keywords": [
        "forgot password",
        "reset my password"
       ],
       "steps": [
        "Ask another admin to open Users, find your account, tap **≡** → **Reset password**, and pass you the new temporary password.",
        "Sign in with it and set your own password when asked."
       ],
       "result": "There is no self-service \"forgot password\" link — only an admin can reset a password from the Users page."
      },
      {
       "id": "troubleshooting-app-not-updating",
       "q": "The app looks out of date or something feels broken — what do I try first?",
       "keywords": [
        "app not updating",
        "stuck",
        "blank screen",
        "refresh"
       ],
       "steps": [
        "Tap **↻ Refresh** at the top of the sidebar.",
        "If that doesn't help, close and reopen the app, or reinstall it and sign in again."
       ],
       "result": "This forces the app to fetch the newest version and clears most stuck states."
      },
      {
       "id": "troubleshooting-wrong-cohort-data",
       "q": "Why can't I see a participant, group or activity I know exists?",
       "keywords": [
        "can't find",
        "missing data",
        "wrong cohort"
       ],
       "steps": [
        "Check the cohort picker in the top-right — you're probably looking at a different cohort.",
        "Switch to the correct cohort and check again."
       ],
       "result": "Every page (Participants, Groups, Schedule, etc.) only shows data for the cohort currently selected."
      },
      {
       "id": "troubleshooting-sign-in-fails",
       "q": "Why does sign-in keep failing even though I'm sure the password is right?",
       "keywords": [
        "can't sign in",
        "login fails"
       ],
       "steps": [
        "Double-check you're using email (or phone) exactly as it was set up.",
        "Tap **Refresh** to update the app, or reinstall it, then try again with your email."
       ],
       "result": "Most sign-in problems are solved by updating the app first."
      },
      {
       "id": "troubleshooting-get-help",
       "q": "I'm still stuck — who do I ask?",
       "keywords": [
        "contact support",
        "ask for help"
       ],
       "steps": [
        "Tap the **?** button on any screen.",
        "Choose **Message [contact name]** to open WhatsApp with them directly."
       ],
       "result": "Goes straight to a real person for anything this guide doesn't cover."
      }
     ]
    }
   ]
  },
  "support": {
   "sections": [
    {
     "id": "getting-started",
     "title": "Getting started",
     "where": "First thing you see after logging in",
     "summary": "How to sign in, find your way around the menus, switch cohort, and see your alerts.",
     "shot": "support-home.jpg",
     "tasks": [
      {
       "id": "s-login",
       "popular": true,
       "q": "How do I log in?",
       "keywords": [
        "sign in",
        "login",
        "password",
        "email",
        "can't get in"
       ],
       "steps": [
        "Open the FOF Ops web address on your phone or computer.",
        "Type your email (or phone number) in the first box.",
        "Type your password in the second box. Tap the eye to check what you typed.",
        "Tap **Sign in**."
       ],
       "result": "You land on your **Home** page. The very first time, you'll be asked to change the temporary password you were given to one only you know.",
       "tips": [
        "If it says Caps Lock is on, turn it off. Passwords care about capital letters.",
        "Forgot your password? Message the FOF admin team to reset it for you."
       ],
       "shot": "support-login.jpg"
      },
      {
       "id": "s-find-pages",
       "q": "Where do I find all the pages?",
       "keywords": [
        "menu",
        "navigation",
        "more",
        "bottom bar",
        "sidebar",
        "where is"
       ],
       "steps": [
        "On a phone, use the bar at the bottom: **Home**, **Schedule**, **Group** and **My Hub**.",
        "Tap **More** at the far right of that bar to see the rest: Mobilisation, Attendance, Onboard, Community, Resources and Profile.",
        "You can also tap the three lines at the top left to open the full menu.",
        "On a computer, every page is listed in the menu down the left side."
       ],
       "result": "The page opens straight away. The button for the page you're on is coloured orange.",
       "tips": [
        "You only see the pages that fit your job. For example, **My Group** only shows if you have a participant group, and **My Hub** only shows if you are in a hub.",
        "A small dot on a menu item means there's something new there."
       ],
       "shot": "support-more-menu.jpg"
      },
      {
       "id": "s-switch-cohort",
       "q": "How do I switch to a different cohort?",
       "keywords": [
        "cohort",
        "change cohort",
        "active cohort",
        "switch"
       ],
       "steps": [
        "Tap the three lines at the top left to open the menu.",
        "Under **Active cohort**, tap the cohort name.",
        "Pick the cohort you want."
       ],
       "result": "Every page now shows that cohort's people, schedule and numbers.",
       "shot": "support-menu-drawer.jpg"
      },
      {
       "id": "s-notifications",
       "q": "Where do I see my alerts and notifications?",
       "keywords": [
        "bell",
        "alerts",
        "notifications",
        "new follow-up",
        "mark all read"
       ],
       "steps": [
        "Tap the bell at the top right. The number on it tells you how many are new.",
        "Switch between **Announcements** and **Activity** at the top of the list.",
        "Tap an alert to jump to the page it's about.",
        "Tap **Mark all read** to clear the number."
       ],
       "result": "You see things like new follow-up people given to you, new hub jobs, and messages from the team.",
       "tips": [
        "Turn on phone notifications in **Profile** so you get these even when the app is closed."
       ],
       "shot": "support-notifications.jpg"
      },
      {
       "id": "s-profile-menu",
       "q": "How do I log out?",
       "keywords": [
        "logout",
        "sign out",
        "log out",
        "profile menu"
       ],
       "steps": [
        "Tap your photo or initials at the top of the screen.",
        "Tap **Log out**."
       ],
       "result": "You're signed out and taken back to the sign-in screen.",
       "tips": [
        "You can also find **Logout** at the bottom of the menu you open with the three lines."
       ],
       "shot": "support-profile-menu.jpg"
      },
      {
       "id": "s-refresh",
       "q": "The app looks old or something isn't showing. What do I do?",
       "keywords": [
        "refresh",
        "update",
        "not loading",
        "stuck",
        "old version"
       ],
       "steps": [
        "Open the menu with the three lines at the top left.",
        "Tap **Refresh** under the FOF Ops name.",
        "If that doesn't help, close the app completely and open it again."
       ],
       "result": "The app loads the newest version and the latest information."
      },
      {
       "id": "s-tour",
       "q": "Can the app show me around a page?",
       "keywords": [
        "tour",
        "walkthrough",
        "show me",
        "help on this page"
       ],
       "steps": [
        "Look for the small **?** in a circle next to the page title.",
        "Tap it to start a short tour of that page.",
        "Tap **Next** to move through it, or **Skip tour** to stop."
       ],
       "result": "The tour highlights each part of the page and explains what it's for.",
       "tips": [
        "An orange dot on the **?** means you haven't seen that page's tour yet."
       ],
       "shot": "support-page-tour.jpg"
      }
     ]
    },
    {
     "id": "home",
     "title": "Home",
     "where": "Bottom bar → Home",
     "summary": "Your day at a glance: this week, what's due today, your checklist, your group or hub, and the latest news.",
     "shot": "support-home-with-group.jpg",
     "tasks": [
      {
       "id": "s-home-overview",
       "q": "What does my Home page show?",
       "keywords": [
        "home",
        "dashboard",
        "overview",
        "programme progress",
        "week"
       ],
       "steps": [
        "**Programme progress** shows which week the cohort is on. Tap **Open schedule** to see the whole week.",
        "The small tiles show today's activities, your next group meeting, how many faith projects your group has drafted, and next week's class topic.",
        "Below that are quick buttons such as **Mark attendance**, **My Hub**, **My Tasks**, **Resources** and **Recap**.",
        "Scroll down for **Today**, your **Weekly checklist** and **Recent announcements**."
       ],
       "result": "You can see what needs doing without opening any other page."
      },
      {
       "id": "s-finish-profile",
       "popular": true,
       "q": "Why does Home ask me to finish my profile?",
       "keywords": [
        "finish profile",
        "profile incomplete",
        "gender",
        "age range",
        "phone",
        "photo"
       ],
       "steps": [
        "Tap **Finish profile** on the orange card at the top of Home.",
        "Add your photo, gender, age range and phone number.",
        "Each one saves as soon as you pick it."
       ],
       "result": "The card goes away when your profile is complete.",
       "tips": [
        "New sign-ups are matched to supports by gender and age. Until your profile is complete, nobody can be given to you for follow-up."
       ],
       "shot": "support-home.jpg"
      },
      {
       "id": "s-weekly-checklist",
       "q": "How do I tick off my weekly checklist?",
       "keywords": [
        "checklist",
        "duties",
        "tasks",
        "tick",
        "done",
        "my tasks"
       ],
       "steps": [
        "Scroll down Home to **Weekly checklist**, or open **Schedule** and tap the **Checklist** tab.",
        "Tap an item to tick it off. Tap it again to untick it.",
        "Tap **Show completed** to see the items you've already done."
       ],
       "result": "The count (for example \"2 of 4 done this week\") goes up as you tick things off. It starts fresh every week.",
       "shot": "support-home-checklist.jpg"
      },
      {
       "id": "s-meeting-live",
       "q": "Home says my meeting is on now. What do I tap?",
       "keywords": [
        "meeting on now",
        "join",
        "live",
        "call"
       ],
       "steps": [
        "Tap **Join** on the banner to open the call link.",
        "Or tap **Open** to go to the meeting page and run it from there."
       ],
       "result": "The banner shows only while the meeting is happening."
      },
      {
       "id": "s-unfinished-meeting",
       "q": "Home says I have an unfinished meeting. What should I do?",
       "keywords": [
        "unfinished meeting",
        "finish report",
        "discard",
        "test meeting"
       ],
       "steps": [
        "If it was a real meeting, tap **Finish report** and complete the steps.",
        "If you only opened it to try things out, tap **Discard, it was a test**, then **Yes, discard**."
       ],
       "result": "Finishing sends the meeting report. Discarding clears the attendance and prayer choice for that week.",
       "tips": [
        "Tap **Keep it** if you're not sure. Nothing is lost."
       ]
      },
      {
       "id": "s-asked-help",
       "q": "Home says a participant \"Asked for help\". What do I do?",
       "keywords": [
        "asked for help",
        "i need help",
        "struggling",
        "participant needs help"
       ],
       "steps": [
        "Tap **Open my group** on the card.",
        "Reach out to that person on WhatsApp or by phone.",
        "On their card, tap **I have reached out**."
       ],
       "result": "The alert clears once you've told the app you've reached out."
      }
     ]
    },
    {
     "id": "class-check-in",
     "title": "Class check-in",
     "where": "Pops up after each Sunday class",
     "summary": "After each class, a short box asks if anything happened that the team should know about.",
     "shot": "support-class-checkin.jpg",
     "tasks": [
      {
       "id": "s-class-flag",
       "q": "What is the \"Anything from today's class to flag?\" box?",
       "keywords": [
        "class feedback",
        "flag",
        "week class",
        "popup",
        "anything to flag"
       ],
       "steps": [
        "If something happened (someone was upset, a problem with the venue, a question you couldn't answer), type what happened and who with.",
        "Tap **Send**.",
        "If all went well, tap **None**.",
        "Tap **Not now** to answer later."
       ],
       "result": "What you send goes to the programme team. **None** tells them all was fine, so the box won't ask again that week.",
       "tips": [
        "**Not now** hides it only until you next open the app."
       ]
      }
     ]
    },
    {
     "id": "schedule",
     "title": "My Schedule",
     "where": "Bottom bar → Schedule",
     "summary": "This week's plan, the people you need to follow up after missing class, and your weekly duties.",
     "shot": "support-schedule.jpg",
     "tasks": [
      {
       "id": "s-see-schedule",
       "q": "How do I see what's planned this week?",
       "keywords": [
        "schedule",
        "this week",
        "today",
        "tomorrow",
        "activities",
        "plan"
       ],
       "steps": [
        "Tap **Schedule** in the bottom bar.",
        "Use the week box to pick a week.",
        "Use the next box to choose **Today**, **Tomorrow** or the **Full week**."
       ],
       "result": "You see every activity with its time. If it says \"Schedule not published yet\", the coordinator hasn't finished that week's plan.",
       "tips": [
        "When an activity is finished, tap **Mark done** on it. You can only do this on the day."
       ]
      },
      {
       "id": "s-schedule-pdf",
       "q": "How do I download the week's schedule?",
       "keywords": [
        "pdf",
        "download",
        "print",
        "share schedule"
       ],
       "steps": [
        "Open **Schedule**.",
        "Tap **PDF** next to the week and day boxes."
       ],
       "result": "A PDF of the week downloads to your phone or computer, ready to share or print."
      },
      {
       "id": "s-absence-followup",
       "popular": true,
       "q": "How do I follow up someone who missed class?",
       "keywords": [
        "absent",
        "missed class",
        "attendance follow-up",
        "why absent",
        "mark done",
        "reopen"
       ],
       "steps": [
        "Open **Schedule**. **Attendance follow-ups** lists everyone in your group who was marked Absent.",
        "Contact the person and find out why they missed class.",
        "Type the reason in **Why were they absent?**",
        "Tap **Mark done**."
       ],
       "result": "The follow-up is ticked off and the reason is saved for the team. The count at the top (for example \"1 of 2 done\") goes up.",
       "tips": [
        "Made a mistake? Tap **Reopen** to undo it."
       ],
       "shot": "support-schedule.jpg"
      },
      {
       "id": "s-edit-duties",
       "q": "Can I change my list of weekly duties?",
       "keywords": [
        "edit list",
        "duties",
        "add duty",
        "remove duty",
        "checklist"
       ],
       "steps": [
        "Open **Schedule** and tap the **Checklist** tab.",
        "Tap **Edit list**.",
        "Tap **Remove** next to a duty to take it off, or type a new one and tap **Add**."
       ],
       "result": "Your checklist now has the duties you need.",
       "shot": "support-schedule-checklist.jpg"
      }
     ]
    },
    {
     "id": "mobilisation",
     "title": "Mobilisation: bringing people in",
     "where": "More → Mobilisation → Registration",
     "summary": "Save the details of people you invite, share the registration link, and check who has already signed up.",
     "shot": "support-mobilisation.jpg",
     "tasks": [
      {
       "id": "s-save-prospect",
       "popular": true,
       "q": "How do I save someone I've invited?",
       "keywords": [
        "save details",
        "prospect",
        "invite",
        "add person",
        "new contact",
        "whatsapp number"
       ],
       "steps": [
        "Open **Mobilisation**. Make sure the **Registration** tab is selected.",
        "Under **Save someone's details**, type their **Full name**.",
        "Type their **WhatsApp number**.",
        "Tap **Save details**."
       ],
       "result": "They're added to **People you added** and are waiting for the team to give them to someone for follow-up. They still need to fill in the registration form themselves.",
       "tips": [
        "If the number is already in the system, the app tells you, so the same person isn't saved twice.",
        "**Prospects** shows how many people you've saved who haven't registered yet."
       ],
       "shot": "support-mobilisation.jpg"
      },
      {
       "id": "s-share-link",
       "q": "How do I share the registration link?",
       "keywords": [
        "registration link",
        "form link",
        "copy link",
        "share",
        "sign up form"
       ],
       "steps": [
        "Open **Mobilisation**.",
        "Next to **Registration link**, tap the copy icon (two squares) to copy it.",
        "Paste it into WhatsApp or a text message.",
        "To look at the form yourself, tap the open icon (the arrow in a box)."
       ],
       "result": "The person can register straight from the link."
      },
      {
       "id": "s-check-signed-up",
       "popular": true,
       "q": "How do I check if someone has already signed up?",
       "keywords": [
        "signed up",
        "registered",
        "form",
        "check",
        "sign-ups",
        "search"
       ],
       "steps": [
        "Open **Mobilisation** and scroll to **Signed up on the form**.",
        "Type a name or number in the search box.",
        "Tap the refresh button to fetch the newest sign-ups."
       ],
       "result": "You see when each person signed up and who is following them up. Check here before asking the back office.",
       "shot": "support-mobilisation-signups.jpg"
      },
      {
       "id": "s-people-added",
       "q": "Where do I see the people I've added?",
       "keywords": [
        "people you added",
        "my prospects",
        "waiting to be assigned"
       ],
       "steps": [
        "Open **Mobilisation** and scroll to the bottom, to **People you added**."
       ],
       "result": "Each person shows their status. For example, **Waiting to be assigned** means the team hasn't given them to anyone for follow-up yet.",
       "shot": "support-mobilisation-people-added.jpg"
      },
      {
       "id": "s-mob-issues",
       "q": "How do I report a problem, or download my contacts?",
       "keywords": [
        "issues",
        "export contacts",
        "problem",
        "wrong link",
        "download"
       ],
       "steps": [
        "Open **Mobilisation**.",
        "Tap the three dots next to the tabs.",
        "Tap **Issues** to see and resolve problems you've reported, or **Export contacts** to download your list."
       ],
       "shot": "support-mobilisation-menu.jpg"
      }
     ]
    },
    {
     "id": "follow-ups",
     "title": "Follow-ups",
     "where": "More → Mobilisation → Follow-ups",
     "summary": "The people the team has given you to contact, and where each one stands.",
     "shot": "support-follow-ups.jpg",
     "tasks": [
      {
       "id": "s-my-followups",
       "popular": true,
       "q": "Where are the people I need to follow up?",
       "keywords": [
        "follow-ups",
        "assigned to me",
        "my contacts",
        "who to call"
       ],
       "steps": [
        "Open **Mobilisation** and tap the **Follow-ups** tab. The number shows how many you have.",
        "**Open** shows the people you're still working on. **Closed** shows the ones you've finished.",
        "Turn on **Show past cohorts** to see people from earlier cohorts too."
       ],
       "result": "Each person has a card with their number and buttons to message or call them.",
       "tips": [
        "When the team gives you someone new, you also get an alert on the bell."
       ],
       "shot": "support-follow-ups.jpg"
      },
      {
       "id": "s-message-template",
       "popular": true,
       "q": "How do I send someone a ready-made message?",
       "keywords": [
        "template",
        "message",
        "whatsapp",
        "first message",
        "reminder",
        "copy text"
       ],
       "steps": [
        "On the person's card, tap **Templates**.",
        "Pick a message, for example **First message** or **Registration link message**.",
        "Their name and the details fill in by themselves. Check the preview.",
        "Tap **Open WhatsApp** to send it, or **Copy text** to paste it somewhere else."
       ],
       "result": "WhatsApp opens with the message ready to send, and the app notes that you've contacted them.",
       "tips": [
        "You can also tap **WhatsApp** or **Call** on the card to reach them without a template."
       ],
       "shot": "support-follow-up-templates.jpg"
      },
      {
       "id": "s-update-stage",
       "popular": true,
       "q": "How do I update where someone stands?",
       "keywords": [
        "status",
        "stage",
        "where do they stand",
        "replied",
        "waiting",
        "registered",
        "not interested"
       ],
       "steps": [
        "On the person's card, tap the box under **Where do they stand?**",
        "Pick what's happened, for example **Waiting**, **Replied**, **Call back later** or **Registered**.",
        "If they're not interested, pick **Not interested**, choose the reason, and tap **Save**."
       ],
       "result": "The card updates straight away. If this closes or reopens them, a message appears with **Undo** in case you tapped the wrong thing.",
       "tips": [
        "**Registered** doesn't close the follow-up. They still need their app login.",
        "Use **Will join next cohort** for people who want to come later.",
        "**Wrong number**, **Not interested** and **No response** close the card."
       ]
      },
      {
       "id": "s-share-login",
       "q": "Someone has registered. How do I give them their app login?",
       "keywords": [
        "login details",
        "login shared",
        "username",
        "password",
        "registered",
        "send login"
       ],
       "steps": [
        "Open their card. Once they're **Registered**, a **Their login details** box appears.",
        "Tap it to see the details and send them.",
        "Once you've sent them, set **Where do they stand?** to **Login shared**."
       ],
       "result": "**Login shared** closes the follow-up. Your job for this person is done.",
       "shot": "support-follow-ups.jpg"
      },
      {
       "id": "s-edit-contact",
       "q": "How do I fix a follow-up person's name or number?",
       "keywords": [
        "edit contact",
        "wrong name",
        "change number",
        "pencil"
       ],
       "steps": [
        "On their card, tap the pencil at the top right.",
        "Correct the details.",
        "Save."
       ]
      }
     ]
    },
    {
     "id": "my-group",
     "title": "My Group",
     "where": "Bottom bar → Group",
     "summary": "The participants in your small group: their faith projects, alerts, testimonies and your weekly group meetings.",
     "shot": "support-my-group.jpg",
     "tasks": [
      {
       "id": "s-see-group",
       "q": "How do I see the people in my group?",
       "keywords": [
        "my group",
        "participants",
        "members",
        "people"
       ],
       "steps": [
        "Tap **Group** in the bottom bar.",
        "Make sure **People** is selected at the top."
       ],
       "result": "You see each person with their faith project status and any alerts. A **New testimony** tag means they've shared a story you haven't seen yet.",
       "tips": [
        "If you look after more than one group, pick the group at the top.",
        "If it says you don't have a participant group, your job this cohort is in your hub. Tap **Open My Hub**."
       ],
       "shot": "support-my-group.jpg"
      },
      {
       "id": "s-view-participant",
       "q": "How do I see a participant's full details?",
       "keywords": [
        "view profile",
        "participant details",
        "registration details",
        "add note"
       ],
       "steps": [
        "On **My Group**, tap the three dots on the person's card.",
        "Tap **View**."
       ],
       "result": "Their full profile opens: registration answers, notes and testimonies. You can tap **Add note** here too."
      },
      {
       "id": "s-flag-concern",
       "q": "How do I raise a concern about a participant?",
       "keywords": [
        "flag concern",
        "worried",
        "attendance",
        "wellbeing",
        "struggling",
        "clear flag"
       ],
       "steps": [
        "On **My Group**, tap the three dots on the person's card.",
        "Tap **Flag concern**.",
        "Pick the reason: Attendance, Engagement, Emotional wellbeing, Spiritual struggle or Other.",
        "Add a short note and tap **Flag concern**."
       ],
       "result": "The operations team is told, and the card shows **Attention flagged**.",
       "tips": [
        "When it's sorted, open the same menu and tap **Clear flag**."
       ]
      },
      {
       "id": "s-faith-project-review",
       "popular": true,
       "q": "How do I review a participant's faith project?",
       "keywords": [
        "faith project",
        "review",
        "send back",
        "back office",
        "approve",
        "draft"
       ],
       "steps": [
        "On **My Group**, tap the **Faith project** tag on the person's card.",
        "Read what they wrote. You can also help them write or improve it.",
        "Pick a **Faith project category**.",
        "Tap **Send back for work** if it needs changes, or **Send to back office** if it's ready."
       ],
       "result": "**Send to back office** passes it to the programme team, who approve it. **Send back for work** returns it to the participant to change.",
       "tips": [
        "The statuses are: **Not started**, **Sent back for work**, **With you to review**, **With the back office** and **Approved**.",
        "Under **Comments** there are two conversations. The participant sees the one **With participant**. The one **With back office** is private to you and the team."
       ],
       "shot": "support-faith-project-sheet.jpg"
      },
      {
       "id": "s-reflected",
       "q": "What does the \"Reflected\" tag mean?",
       "keywords": [
        "reflected",
        "reflection",
        "wrote reflection"
       ],
       "steps": [
        "Look for the **Reflected** tag on a person's card."
       ],
       "result": "It means they wrote their reflection for the week. You never see what they wrote. It's private to them."
      }
     ]
    },
    {
     "id": "group-meetings",
     "title": "Group meetings",
     "where": "Bottom bar → Group → Meetings",
     "summary": "Set your weekly group call and record each week's meeting.",
     "shot": "support-group-meetings.jpg",
     "tasks": [
      {
       "id": "s-set-call",
       "popular": true,
       "q": "How do I set my group's meeting time and call link?",
       "keywords": [
        "meeting time",
        "call link",
        "zoom",
        "google meet",
        "schedule meeting",
        "group call"
       ],
       "steps": [
        "Open **Group** and tap the **Meetings** tab.",
        "Tap the pencil on the meeting card.",
        "Choose the day and time, and paste the call link.",
        "Save."
       ],
       "result": "Your group sees the time and a **Join** button on their Home and My Group pages.",
       "shot": "support-group-meetings.jpg"
      },
      {
       "id": "s-run-meeting",
       "q": "How do I record this week's group meeting?",
       "keywords": [
        "record meeting",
        "meeting mode",
        "prayer focus",
        "submit meeting",
        "who joined"
       ],
       "steps": [
        "Open **Group** → **Meetings** and choose the week.",
        "Mark who joined.",
        "Pick the person you prayed for this week.",
        "Add notes on how it went and anything that needs attention.",
        "Submit the meeting."
       ],
       "result": "It shows as **Submitted**, with a summary like \"2 of 3 joined\", and the team is told.",
       "tips": [
        "Participants can follow along live on their phones. They see who is being prayed for, then the recap.",
        "Tap **Record another week** to record a different week."
       ]
      }
     ]
    },
    {
     "id": "onboard",
     "title": "Onboard",
     "where": "More → Onboard",
     "summary": "Welcome each new participant step by step, with ready-made messages.",
     "shot": "support-onboard.jpg",
     "tasks": [
      {
       "id": "s-onboard-steps",
       "q": "How do I track onboarding my group?",
       "keywords": [
        "onboard",
        "onboarding",
        "talked to",
        "added to group",
        "introduced",
        "knows venue",
        "group set up"
       ],
       "steps": [
        "Open **More** → **Onboard**.",
        "Tap **Group set up** once your WhatsApp group is ready.",
        "For each person, tick the steps as you do them: **Talked to**, **Added to group**, **Introduced**, **Knows venue**."
       ],
       "result": "The steps at the top show how far along your group is. Each person shows **Complete** when all four are ticked.",
       "tips": [
        "You can do the steps in any order."
       ],
       "shot": "support-onboard.jpg"
      },
      {
       "id": "s-onboard-message",
       "q": "How do I send a welcome message to a new participant?",
       "keywords": [
        "welcome message",
        "intro dm",
        "venue directions",
        "template",
        "onboarding message"
       ],
       "steps": [
        "On **Onboard**, tap the person's name.",
        "Pick a message, for example **Day 1 — Intro DM** or **Day 3 — Venue directions**.",
        "Tap **Open WhatsApp** to send it. You can also **Copy text**, **Copy number** or **Download image**."
       ],
       "result": "WhatsApp opens with the message ready to send.",
       "shot": "support-onboard-message.jpg"
      }
     ]
    },
    {
     "id": "attendance",
     "title": "Attendance",
     "where": "More → Attendance",
     "summary": "Mark who came to the Sunday class.",
     "shot": "support-attendance.jpg",
     "tasks": [
      {
       "id": "s-mark-attendance",
       "popular": true,
       "q": "How do I mark attendance for Sunday class?",
       "keywords": [
        "attendance",
        "register",
        "present",
        "absent",
        "late",
        "mark",
        "sunday"
       ],
       "steps": [
        "Open **More** → **Attendance**, or tap **Mark attendance** on Home.",
        "Check the week at the top is right.",
        "Tap **Start attendance** if the register hasn't opened yet.",
        "For each person, tap **Present**, **Absent**, **Late**, **Left early** or **Excused**.",
        "Type in the search box to find someone quickly."
       ],
       "result": "The counts at the top update as you go. Once everyone is marked, it says **Attendance taken**. The report then goes to the admin team, either automatically at noon on Sunday or when an admin sends it.",
       "tips": [
        "The register is only open for a short time, and a countdown shows how long is left.",
        "Once the report is sent, the register locks. You can still change **Absent** to **Late** or **Left early**. For anything else, ask an admin.",
        "Everyone marked Absent appears on your **Schedule** under Attendance follow-ups."
       ],
       "shot": "support-attendance.jpg"
      },
      {
       "id": "s-attendance-all-weeks",
       "q": "How do I see attendance for every week?",
       "keywords": [
        "all weeks",
        "attendance history",
        "summary"
       ],
       "steps": [
        "Open **Attendance**.",
        "In the week box, pick **All weeks**."
       ],
       "result": "You see a summary of every week together."
      }
     ]
    },
    {
     "id": "my-hub",
     "title": "My Hub",
     "where": "Bottom bar → My Hub",
     "summary": "Your hub of fellow supports: the hub call, messages from the lead, the prayer list and your hub attendance.",
     "shot": "support-my-hub.jpg",
     "tasks": [
      {
       "id": "s-hub-overview",
       "q": "What's on My Hub?",
       "keywords": [
        "hub",
        "my hub",
        "fellow supports",
        "hub call",
        "join the call"
       ],
       "steps": [
        "Tap **My Hub** in the bottom bar.",
        "Tap **Join the call** to join the hub meeting.",
        "**Fellow supports** lists everyone in your hub and their job. Tap a job tag to see what that job involves.",
        "Tap the rows below to open **Your messages**, **Prayer list**, **My attendance** and **Meeting time & link**."
       ],
       "shot": "support-my-hub.jpg"
      },
      {
       "id": "s-hub-roles",
       "q": "What does my hub job involve?",
       "keywords": [
        "role",
        "hub lead",
        "assistant hub lead",
        "recap lead",
        "prayer lead",
        "it support",
        "role guide"
       ],
       "steps": [
        "Open **My Hub** and tap **Role guide**.",
        "Tap your job to read what it involves."
       ],
       "result": "**Hub Lead** runs the hub and sends announcements. **Assistant Hub Lead** helps with the jobs the lead allows. **Recap Lead** does the review and recap part of the meeting. **Prayer Lead** leads the prayer part. **IT Support** helps more than one hub.",
       "shot": "support-hub-role-guide.jpg"
      },
      {
       "id": "s-hub-messages",
       "q": "How do I read and acknowledge messages from my hub lead?",
       "keywords": [
        "messages",
        "got it",
        "acknowledge",
        "hub lead message"
       ],
       "steps": [
        "Open **My Hub** and tap **Your messages**.",
        "Read each message and tap **Got it**."
       ],
       "result": "Your hub lead can see that you've read it.",
       "tips": [
        "Hub leads see how many people have acknowledged each message, and who hasn't yet."
       ],
       "shot": "support-hub-your-messages.jpg"
      },
      {
       "id": "s-hub-message-send",
       "q": "I'm the hub lead. How do I message my hub?",
       "keywords": [
        "message hub",
        "send to hub",
        "announcement",
        "hub lead"
       ],
       "steps": [
        "Open **My Hub** and tap the **Message** tab.",
        "Type a **Subject** and your **Message**.",
        "Tap **Send to hub**."
       ],
       "result": "Everyone in your hub gets it and is asked to tap **Got it**.",
       "tips": [
        "To change or delete a message you sent, tap the three dots on it under **Your messages**."
       ],
       "shot": "support-hub-message.jpg"
      },
      {
       "id": "s-hub-meeting",
       "q": "How do I run the hub meeting?",
       "keywords": [
        "hub meeting",
        "attendance",
        "prayer",
        "recap",
        "announcements",
        "submit"
       ],
       "steps": [
        "Open **My Hub** and tap the **Meeting** tab. Check the week.",
        "Work through the steps in order: **Attendance**, **Prayer**, **Review & Recap**, **Announcements**, **Notes**.",
        "Under **Who's here?**, set each person to Present, Late, Absent or Excused.",
        "Tap **Submit** at the end."
       ],
       "result": "The week is saved as **Submitted**. The lead can **Reopen** it if something needs fixing.",
       "tips": [
        "Prayer Leads only see the Prayer step, and Recap Leads only see Review & Recap.",
        "When the Prayer Lead picks who to pray for, everyone's screen shows \"Now praying for…\"."
       ],
       "shot": "support-hub-meeting.jpg"
      },
      {
       "id": "s-hub-meeting-time",
       "q": "How do I change the hub meeting time or link?",
       "keywords": [
        "meeting time",
        "hub link",
        "change time",
        "call link"
       ],
       "steps": [
        "Open **My Hub** and tap **Meeting time & link**.",
        "Tap the pencil and change the day, time or link.",
        "Save."
       ],
       "tips": [
        "Only the hub lead, or an assistant the lead has allowed, can change this."
       ],
       "shot": "support-hub-meeting-time-link.jpg"
      },
      {
       "id": "s-hub-prayer-attendance",
       "q": "Where do I see the hub prayer list and my attendance?",
       "keywords": [
        "prayer list",
        "my attendance",
        "hub attendance",
        "excused"
       ],
       "steps": [
        "Open **My Hub**.",
        "Tap **Prayer list** to see what the hub is praying about.",
        "Tap **My attendance** to see how you were marked at each hub meeting."
       ],
       "shot": "support-hub-my-attendance.jpg"
      },
      {
       "id": "s-hub-notes",
       "q": "I'm the hub lead. How do I keep private notes about a hub member?",
       "keywords": [
        "notes",
        "private notes",
        "hub member notes"
       ],
       "steps": [
        "Open **My Hub** and tap the **Notes** tab.",
        "Pick the hub member.",
        "Write your note and tap **Add note**."
       ],
       "result": "Only you and the admins can see these notes.",
       "shot": "support-hub-notes.jpg"
      },
      {
       "id": "s-hub-permissions",
       "q": "I'm the hub lead. How do I let my assistant help?",
       "keywords": [
        "assistant permissions",
        "assistant hub lead",
        "allow",
        "permissions"
       ],
       "steps": [
        "Open **My Hub** and tap **Assistant permissions**.",
        "Switch on what your assistant can do: **Meeting time & link**, **Attendance & hub meeting**, **Message the hub**.",
        "Tap **Save**."
       ],
       "shot": "support-hub-assistant-permissions.jpg"
      }
     ]
    },
    {
     "id": "recaps",
     "title": "Recaps & participant questions",
     "where": "Home → Recap",
     "summary": "What each class covered, to take to your group, plus questions participants have asked.",
     "shot": "support-recaps.jpg",
     "tasks": [
      {
       "id": "s-read-recap",
       "q": "Where do I find the class recap to share with my group?",
       "keywords": [
        "recap",
        "manual",
        "class summary",
        "lesson",
        "what was taught"
       ],
       "steps": [
        "On Home, tap **Recap**.",
        "The top card is this week. Tap **Read the recap**, or **Open the manual** for the class booklet.",
        "Scroll down to **Other weeks** for earlier classes."
       ],
       "result": "**Recap out** means it's ready to read. \"Recap arrives…\" tells you when it will appear.",
       "shot": "support-recaps.jpg"
      },
      {
       "id": "s-answer-question",
       "q": "How do I answer a question a participant asked?",
       "keywords": [
        "question",
        "answer",
        "reply",
        "participant question",
        "to be answered in class"
       ],
       "steps": [
        "Open **Recap**. A week with new questions shows a number, for example \"1 new\".",
        "Open that week and find the question.",
        "Tap **Reply**, type your answer and tap **Send reply**.",
        "Or tap **To be answered in class** if it will be covered on Sunday."
       ],
       "result": "The participant sees your reply, or the note that it will be answered in class, on their week page."
      }
     ]
    },
    {
     "id": "community",
     "title": "Community",
     "where": "More → Community",
     "summary": "A shared space for supports to post, encourage one another and discuss.",
     "shot": "support-community.jpg",
     "tasks": [
      {
       "id": "s-new-topic",
       "q": "How do I start a new post in Community?",
       "keywords": [
        "new topic",
        "post",
        "community",
        "discussion",
        "mention"
       ],
       "steps": [
        "Open **More** → **Community**.",
        "Tap **New topic**.",
        "Add a title and write your message. Type @ and a name to mention someone.",
        "Tap **Post topic**."
       ],
       "result": "Your post appears for everyone. Anyone you mentioned gets an alert.",
       "shot": "support-community-new-topic.jpg"
      },
      {
       "id": "s-comment",
       "q": "How do I like or comment on a post?",
       "keywords": [
        "like",
        "comment",
        "reply",
        "thumbs up"
       ],
       "steps": [
        "Tap a post to open it.",
        "Tap the thumbs-up to like it.",
        "Type in the comment box at the bottom and tap **Comment**."
       ],
       "tips": [
        "You can edit or delete your own comments. The person who started a topic can **Close topic** when it's finished."
       ],
       "shot": "support-community-topic.jpg"
      },
      {
       "id": "s-people-directory",
       "q": "How do I find another support's phone number?",
       "keywords": [
        "people",
        "directory",
        "phone",
        "call",
        "contact support"
       ],
       "steps": [
        "Open **Community** and tap **People**.",
        "Find the person and tap the call or WhatsApp icon."
       ]
      }
     ]
    },
    {
     "id": "resources",
     "title": "Resources & announcements",
     "where": "More → Resources · Home → Recent announcements",
     "summary": "Guides, files and links for the team, and news from the programme team.",
     "shot": "support-resources.jpg",
     "tasks": [
      {
       "id": "s-resources",
       "q": "Where are the guides and files for supports?",
       "keywords": [
        "resources",
        "files",
        "guides",
        "documents",
        "faith project guide",
        "download"
       ],
       "steps": [
        "Open **More** → **Resources**.",
        "Tap any item to open it."
       ],
       "result": "Files open in the app. Links open in a new tab.",
       "shot": "support-resources.jpg"
      },
      {
       "id": "s-announcements",
       "q": "Where do I read announcements?",
       "keywords": [
        "announcements",
        "news",
        "updates",
        "view all"
       ],
       "steps": [
        "On Home, scroll to **Recent announcements** and tap **View all**."
       ],
       "result": "You see every announcement for your cohort, plus ones sent to everyone, newest first.",
       "shot": "support-announcements.jpg"
      }
     ]
    },
    {
     "id": "profile",
     "title": "Your profile",
     "where": "More → Profile",
     "summary": "Your photo, your details, the app's colour and your reminders.",
     "shot": "support-profile.jpg",
     "tasks": [
      {
       "id": "s-profile-details",
       "q": "How do I add my photo and details?",
       "keywords": [
        "photo",
        "picture",
        "gender",
        "age range",
        "phone",
        "profile"
       ],
       "steps": [
        "Open **More** → **Profile**.",
        "Tap **Add a profile photo** (or the camera on your picture) and choose a photo.",
        "Pick your **Gender** and **Age range**. They save straight away.",
        "Tap **Add number**, type your WhatsApp number (like 08012345678) and save."
       ],
       "result": "The bar at the top fills up as your profile gets closer to complete.",
       "shot": "support-profile.jpg"
      },
      {
       "id": "s-reminders",
       "q": "How do I get reminders on my phone?",
       "keywords": [
        "reminders",
        "notifications",
        "push",
        "alerts",
        "enable"
       ],
       "steps": [
        "Open **Profile** and scroll to **Reminders**.",
        "Tap **Enable on this device** and allow notifications when your phone asks.",
        "Choose when you want to be reminded before your activities. You can pick more than one."
       ],
       "tips": [
        "On iPhone, first add the app to your Home Screen (Share → Add to Home Screen). Notifications only work from there."
       ],
       "shot": "support-profile-colour-reminders.jpg"
      },
      {
       "id": "s-accent",
       "q": "Can I change the app's colour?",
       "keywords": [
        "colour",
        "color",
        "accent",
        "theme"
       ],
       "steps": [
        "Open **Profile** and scroll to **Accent colour**.",
        "Tap a colour.",
        "Tap **Save**."
       ],
       "result": "The buttons and highlights change to that colour, but only for you."
      }
     ]
    },
    {
     "id": "help",
     "title": "Getting help",
     "where": "The orange ? button on every screen",
     "summary": "Open this guide or message the FOF team on WhatsApp.",
     "shot": "support-help-menu.jpg",
     "tasks": [
      {
       "id": "s-get-help",
       "q": "How do I get help from a person?",
       "keywords": [
        "help",
        "whatsapp",
        "contact admin",
        "support contact",
        "stuck"
       ],
       "steps": [
        "Tap the orange **?** button at the bottom right (on a computer it's at the top).",
        "Tap **Open the app guide** to search for an answer here.",
        "Or tap **Message…** to open WhatsApp to the FOF team with a greeting already typed."
       ],
       "shot": "support-help-menu.jpg"
      }
     ]
    }
   ]
  },
  "participant": {
   "sections": [
    {
     "id": "getting-started",
     "title": "Getting started",
     "where": "First thing you see after logging in",
     "summary": "How to sign in, set your own password and find your way around the app.",
     "shot": "participant-home.jpg",
     "tasks": [
      {
       "id": "p-login",
       "popular": true,
       "q": "How do I log in?",
       "keywords": [
        "sign in",
        "login",
        "phone number",
        "username",
        "password",
        "can't get in"
       ],
       "steps": [
        "Open the FOF Ops link your support sent you.",
        "In the first box, type your phone number, for example 08012345678. Your phone number is your username.",
        "Type your password in the second box. Tap the eye to check what you typed.",
        "Tap **Sign in**."
       ],
       "result": "You land on your **Home** page.",
       "tips": [
        "Forgot your password? Message your support. They can reset it for you, but they can never see it.",
        "If it says Caps Lock is on, turn it off. Passwords care about capital letters."
       ],
       "shot": "participant-login.jpg"
      },
      {
       "id": "p-first-password",
       "q": "It's my first time in. Why am I asked for a new password?",
       "keywords": [
        "first login",
        "new password",
        "temporary password",
        "welcome",
        "save and continue"
       ],
       "steps": [
        "Type a new password of at least 8 characters in **New password**.",
        "Type it again in **Confirm password**.",
        "Tap **Save and continue**."
       ],
       "result": "Your password is now one only you know. Next, the app takes you to your profile so you can add your details, then shows you a short welcome tour."
      },
      {
       "id": "p-find-pages",
       "q": "Where do I find all the pages?",
       "keywords": [
        "menu",
        "navigation",
        "more",
        "bottom bar",
        "where is"
       ],
       "steps": [
        "Use the bar at the bottom: **Home**, **My Group**, **Journey** and **F. Project** (your faith project).",
        "Tap **More** for **People**, **Resources**, **Feedback**, **Profile** and **Sign out**."
       ],
       "result": "The page opens straight away. The button for the page you're on is coloured orange.",
       "tips": [
        "A green dot on **My Group** means your group meeting is on right now.",
        "A red dot on **F. Project** means your support has replied to you."
       ],
       "shot": "participant-more-menu.jpg"
      },
      {
       "id": "p-notifications",
       "q": "Where do I see my notifications?",
       "keywords": [
        "bell",
        "alerts",
        "notifications",
        "messages",
        "mark all read"
       ],
       "steps": [
        "Tap the bell at the top right. The number shows how many are new.",
        "Switch between **Announcements** and **Activity** at the top.",
        "Tap **Mark all read** to clear the number."
       ],
       "result": "You see reminders about class, new class manuals, and messages from the FOF team.",
       "shot": "participant-notifications.jpg"
      },
      {
       "id": "p-tour",
       "q": "Can the app show me around a page?",
       "keywords": [
        "tour",
        "walkthrough",
        "show me",
        "help"
       ],
       "steps": [
        "Tap the small **?** in a circle next to the page title.",
        "Tap **Next** to move through the tour, or **Skip tour** to stop."
       ],
       "result": "The tour highlights each part of the page and explains it.",
       "shot": "participant-page-tour.jpg"
      },
      {
       "id": "p-logout",
       "q": "How do I log out?",
       "keywords": [
        "logout",
        "sign out",
        "log out"
       ],
       "steps": [
        "Tap **More** in the bottom bar.",
        "Tap **Sign out**."
       ],
       "tips": [
        "You can also tap your photo at the top and choose **Log out**."
       ]
      }
     ]
    },
    {
     "id": "home",
     "title": "Home",
     "where": "Bottom bar → Home",
     "summary": "Your week at a glance: this week's class, your next session, your group call and your faith project.",
     "shot": "participant-home.jpg",
     "tasks": [
      {
       "id": "p-home-overview",
       "q": "What does my Home page show?",
       "keywords": [
        "home",
        "overview",
        "programme progress",
        "this week",
        "next session"
       ],
       "steps": [
        "**Programme progress** shows which week you're on, for example \"Week 5, 5 of 10\".",
        "The tiles show this week's class, your next Sunday session, your group call time and how your faith project is going.",
        "Scroll down for **This week's manual**, scriptures for the day, and **This week** (what's expected of you)."
       ],
       "shot": "participant-home-lower.jpg"
      },
      {
       "id": "p-join-call",
       "popular": true,
       "q": "How do I join my group call?",
       "keywords": [
        "join call",
        "group call",
        "meeting",
        "zoom",
        "google meet",
        "link"
       ],
       "steps": [
        "On Home, tap **Join call**.",
        "When the meeting is on, a banner at the top says \"Your group meeting is on now\". Tap **Join** on it."
       ],
       "result": "The call opens in a new window.",
       "tips": [
        "If **Join call** is grey, your support hasn't added the call link yet. The **Group call** tile shows the day and time once it's set."
       ],
       "shot": "participant-home.jpg"
      },
      {
       "id": "p-message-support",
       "popular": true,
       "q": "How do I message my support?",
       "keywords": [
        "message support",
        "whatsapp",
        "contact support",
        "my support",
        "help"
       ],
       "steps": [
        "On Home, tap **Message support**."
       ],
       "result": "WhatsApp opens with your support.",
       "tips": [
        "You'll also find your support under **More** → **People**, and on **My Group**."
       ]
      },
      {
       "id": "p-goal-done",
       "q": "How do I mark this week's goal as done?",
       "keywords": [
        "goal",
        "i did it",
        "done",
        "weekly goal"
       ],
       "steps": [
        "Once you've written your reflection, your goal for the week shows on Home.",
        "When you've done it, tap **I did it**."
       ],
       "result": "It changes to **Done ✓** and shows as **Goal kept** on your Journey.",
       "tips": [
        "Tap it again if you tapped it by mistake. Tap **Edit** to change your goal."
       ]
      },
      {
       "id": "p-wrapping-banner",
       "q": "Home says my cohort is wrapping up. What do I do?",
       "keywords": [
        "wrapping up",
        "continue",
        "end of programme",
        "finish"
       ],
       "steps": [
        "Tap **Continue** on the \"Your cohort is wrapping up\" card."
       ],
       "result": "It opens **Wrapping up**. See the \"Wrapping up\" topic in this guide."
      }
     ]
    },
    {
     "id": "this-week",
     "title": "Each week's class",
     "where": "Journey → tap a week",
     "summary": "The class recap, the manual, your reflection, your private notes and your questions, all in one place for each week.",
     "shot": "participant-week.jpg",
     "tasks": [
      {
       "id": "p-open-week",
       "q": "How do I open a week's class?",
       "keywords": [
        "week",
        "class",
        "lesson",
        "recap",
        "open week"
       ],
       "steps": [
        "Tap **Journey** in the bottom bar.",
        "Tap the week you want.",
        "Or, on Home, tap **See more** under **This week**."
       ],
       "result": "You see the week's topic, a short recap and a question to think about.",
       "shot": "participant-week.jpg"
      },
      {
       "id": "p-open-manual",
       "popular": true,
       "q": "How do I read the class manual?",
       "keywords": [
        "manual",
        "booklet",
        "pdf",
        "class notes",
        "open the manual",
        "read"
       ],
       "steps": [
        "Open the week, or find **This week's manual** on Home.",
        "Tap **Open the manual**.",
        "Swipe through the pages, or tap the page numbers at the top.",
        "Prefer a normal document? Tap **Open the PDF instead**."
       ],
       "shot": "participant-manual-reader.jpg"
      },
      {
       "id": "p-recap-status",
       "q": "Why does my week say \"Recap coming soon\"?",
       "keywords": [
        "recap coming soon",
        "no recap",
        "recap out",
        "when recap"
       ],
       "steps": [
        "Look at the small label at the top of the week."
       ],
       "result": "**Recap out** means you can read it now. **Recap coming soon** means it's on its way. You'll get a notification as soon as it's out.",
       "shot": "participant-week-recap-soon.jpg"
      },
      {
       "id": "p-reflection",
       "popular": true,
       "q": "How do I write my weekly reflection?",
       "keywords": [
        "reflection",
        "what stood out",
        "goal",
        "write reflection",
        "3 questions"
       ],
       "steps": [
        "Open the week and tap **Your reflection**.",
        "Answer **What stood out to you?**",
        "Answer **What is one thing you will do this week because of it?** This becomes your goal.",
        "If you like, answer **How will you know you did it?**",
        "Tap **Save reflection**."
       ],
       "result": "Your goal appears on Home so you can tick it off when it's done.",
       "tips": [
        "Your reflection is private. Your support can see that you reflected, but never what you wrote.",
        "You can change it for a week after you first save it. After that it's locked."
       ],
       "shot": "participant-week-reflection.jpg"
      },
      {
       "id": "p-notes",
       "q": "Can I keep my own notes for a week?",
       "keywords": [
        "notes",
        "my notes",
        "private notes",
        "write notes"
       ],
       "steps": [
        "Open the week and tap **My notes**.",
        "Type your notes."
       ],
       "result": "They save by themselves as you type. Only you can see them.",
       "shot": "participant-week-notes-question.jpg"
      },
      {
       "id": "p-ask-question",
       "q": "How do I ask a question about the class?",
       "keywords": [
        "ask a question",
        "question",
        "don't understand",
        "ask"
       ],
       "steps": [
        "Open the week and tap **Ask a question**.",
        "Type your question.",
        "Tap **Send question**."
       ],
       "result": "Your question shows below the box. When it's answered, you'll see **Reply: …**, or **To be answered in class** if it will be covered on Sunday."
      }
     ]
    },
    {
     "id": "journey",
     "title": "My Journey",
     "where": "Bottom bar → Journey",
     "summary": "Your whole FOF journey week by week, your goals, and your attendance.",
     "shot": "participant-journey.jpg",
     "tasks": [
      {
       "id": "p-journey-overview",
       "q": "What does My Journey show?",
       "keywords": [
        "journey",
        "progress",
        "weeks",
        "reflections",
        "goals kept"
       ],
       "steps": [
        "Tap **Journey** in the bottom bar.",
        "The orange card shows how far you are, and how many reflections you've written and goals you've kept.",
        "Scroll to **Week by week** to see every week."
       ],
       "result": "Each week has a label: **This week**, **Goal kept**, **Not this time**, **No reflection** or **Locked** (not reached yet).",
       "tips": [
        "Tap a week you've reflected on to read what you wrote."
       ],
       "shot": "participant-journey-weeks.jpg"
      },
      {
       "id": "p-attendance",
       "popular": true,
       "q": "How do I see my attendance?",
       "keywords": [
        "attendance",
        "absent",
        "present",
        "missed",
        "sunday class",
        "group meeting"
       ],
       "steps": [
        "Open **Journey**.",
        "Tap the **Attendance** tab."
       ],
       "result": "For each week you see how you were marked for **Sunday class** and for your **Group meeting**.",
       "tips": [
        "Late only counts as attended once it has been excused.",
        "Think something's wrong? Message your support."
       ],
       "shot": "participant-journey-attendance.jpg"
      },
      {
       "id": "p-end-summary",
       "q": "What is the end-of-FOF summary?",
       "keywords": [
        "summary",
        "end of fof",
        "ai summary",
        "week 10"
       ],
       "steps": [
        "Scroll to the bottom of **Journey**.",
        "In the last week, tick the box to say you understand, then tap **Turn on AI summary**.",
        "Tap **Write my summary**."
       ],
       "result": "You get a summary of your journey built from your own reflections. It's something to help you look back, not a score.",
       "tips": [
        "It unlocks in the final week of the programme.",
        "Your reflections are sent to an outside AI service to write it, and only if you turn it on. Nobody on the FOF team reads your reflections or your summary. You can **Turn off and delete** it at any time."
       ]
      }
     ]
    },
    {
     "id": "my-group",
     "title": "My Group",
     "where": "Bottom bar → My Group",
     "summary": "Your small group: your support, the other members and your weekly meeting.",
     "shot": "participant-group.jpg",
     "tasks": [
      {
       "id": "p-group-overview",
       "q": "Where do I see my group and when we meet?",
       "keywords": [
        "my group",
        "members",
        "meeting time",
        "next meeting",
        "support"
       ],
       "steps": [
        "Tap **My Group** in the bottom bar.",
        "**Next meeting** shows the day and time.",
        "**Group members** shows your support and the others in your group."
       ],
       "result": "Each meeting follows the same order: **Prayer**, then **Recap**, then **Questions**.",
       "tips": [
        "If it says you're not in a group yet, the team is still putting groups together. You'll see it here once you're added.",
        "Other members' phone numbers are never shown."
       ],
       "shot": "participant-group.jpg"
      },
      {
       "id": "p-live-meeting",
       "q": "What do I see during the group meeting?",
       "keywords": [
        "live meeting",
        "now praying for",
        "on now",
        "follow along"
       ],
       "steps": [
        "When the meeting starts, **My Group** shows **On now**. Tap **Join** to open the call.",
        "Keep the page open to follow along."
       ],
       "result": "You'll see who is being prayed for, then this week's recap. When the meeting ends, you're asked to write your reflection."
      },
      {
       "id": "p-contact-support-group",
       "q": "How do I contact my support from My Group?",
       "keywords": [
        "contact support",
        "whatsapp",
        "need help"
       ],
       "steps": [
        "On **My Group**, tap **Contact** next to your support, or use the **Need help?** card."
       ],
       "result": "WhatsApp opens with your support."
      }
     ]
    },
    {
     "id": "faith-project",
     "title": "Faith Project",
     "where": "Bottom bar → F. Project",
     "summary": "Write what you're believing God for, send it to your support, and share testimonies.",
     "shot": "participant-faith-project.jpg",
     "tasks": [
      {
       "id": "p-write-fp",
       "popular": true,
       "q": "How do I write and send my faith project?",
       "keywords": [
        "faith project",
        "write",
        "submit",
        "save draft",
        "believing god"
       ],
       "steps": [
        "Tap **F. Project** in the bottom bar.",
        "Under **What are you believing God for?**, write your project. Be specific: who, what, and by when.",
        "Tap **Save draft** to finish later.",
        "When it's ready, tap **Submit for review**."
       ],
       "result": "It goes to your support to read. While they have it, it shows **With your support** and you can't change it.",
       "tips": [
        "Not sure how to start? Tap **Explore the guide** for a short illustrated guide.",
        "If a date to submit by is shown, try to send it before then. You can still send it after."
       ],
       "shot": "participant-faith-project.jpg"
      },
      {
       "id": "p-fp-status",
       "q": "What do the faith project labels mean?",
       "keywords": [
        "status",
        "changes requested",
        "with your support",
        "approved",
        "programme team"
       ],
       "steps": [
        "Look at the label at the top of your faith project."
       ],
       "result": "**Start your project**: not sent yet. **With your support**: your support is reading it. **Changes requested**: your support asked you to change something, so you can edit it again. **With programme team**: it's with the FOF team. **Approved**: all done."
      },
      {
       "id": "p-fp-feedback",
       "q": "Where do I see my support's comments on my project?",
       "keywords": [
        "support feedback",
        "comments",
        "reply",
        "new reply"
       ],
       "steps": [
        "Open **F. Project**.",
        "Tap **Support feedback**. It says **New reply** when there's something new."
       ],
       "tips": [
        "Notes between your support and the programme team are not shown here."
       ]
      },
      {
       "id": "p-fp-guide",
       "q": "Is there a guide to help me write my faith project?",
       "keywords": [
        "guide",
        "smart",
        "explore the guide",
        "help writing"
       ],
       "steps": [
        "Open **F. Project** and tap **Explore the guide**.",
        "Tap a chapter, or use the page numbers at the top."
       ],
       "shot": "participant-faith-guide.jpg"
      },
      {
       "id": "p-fp-going",
       "q": "My project is approved but it isn't going well. What can I do?",
       "keywords": [
        "not going well",
        "struggling",
        "help",
        "reach out",
        "prayers"
       ],
       "steps": [
        "Open **F. Project** and tap **Is it going well?**",
        "Pick a reason and add a note if you like.",
        "Tap **Ask my support to reach out**, or **Just save it**."
       ],
       "result": "Your support is told and will keep an eye out.",
       "tips": [
        "Once approved, you can also switch on **Include in the general prayers** so the church team prays for your project each week."
       ]
      },
      {
       "id": "p-testimony",
       "q": "How do I share a testimony?",
       "keywords": [
        "testimony",
        "share",
        "what god has done",
        "new testimony"
       ],
       "steps": [
        "Open **F. Project** and tap the **Testimonies** tab.",
        "Tap **New testimony**.",
        "Add a title if you like, and write what happened.",
        "Choose who can see it: **Just my support**, **My group** or **Everyone in my cohort**.",
        "Tap **Save**."
       ],
       "result": "\"Just my support\" is shared straight away. Group and cohort testimonies are checked first and show **Waiting for approval** until then.",
       "tips": [
        "You can edit or delete your own testimonies at any time."
       ],
       "shot": "participant-testimony-new.jpg"
      }
     ]
    },
    {
     "id": "class-feedback",
     "title": "Rating each class",
     "where": "Pops up after each Sunday class",
     "summary": "After each class, a short box asks how it was.",
     "shot": "participant-class-rating.jpg",
     "tasks": [
      {
       "id": "p-rate-class",
       "q": "What is the \"How was this week's class?\" box?",
       "keywords": [
        "rate class",
        "rating",
        "how was class",
        "feedback popup"
       ],
       "steps": [
        "Tap a number from 1 (not good) to 5 (great).",
        "Add a comment if you like.",
        "Tick **Show my name with this** only if you want your name on it.",
        "Tap **Send**, or **Not now** to answer later."
       ],
       "result": "Your rating helps the team improve the classes. If you leave the box unticked, it's anonymous."
      }
     ]
    },
    {
     "id": "people",
     "title": "People & Resources",
     "where": "More → People · More → Resources",
     "summary": "Meet your support, your group and your cohort, and find class materials.",
     "shot": "participant-people.jpg",
     "tasks": [
      {
       "id": "p-people",
       "q": "How do I see who else is in my cohort?",
       "keywords": [
        "people",
        "cohort",
        "members",
        "supports",
        "who"
       ],
       "steps": [
        "Tap **More** → **People**."
       ],
       "result": "You see your support at the top, then your group, everyone in your cohort, and the support team.",
       "tips": [
        "Other participants' phone numbers are never shown."
       ],
       "shot": "participant-people.jpg"
      },
      {
       "id": "p-resources",
       "q": "Where do I find the class materials?",
       "keywords": [
        "resources",
        "class materials",
        "recap document",
        "files",
        "guides"
       ],
       "steps": [
        "Tap **More** → **Resources**.",
        "**Class materials** has a recap for each week that's out. **General guides** has anything else the FOF team has shared.",
        "Tap an item to open it."
       ],
       "shot": "participant-resources.jpg"
      }
     ]
    },
    {
     "id": "profile",
     "title": "Your profile",
     "where": "More → Profile",
     "summary": "Your photo, your details, your reminders and your password.",
     "shot": "participant-profile.jpg",
     "tasks": [
      {
       "id": "p-photo",
       "q": "How do I change my photo or details?",
       "keywords": [
        "photo",
        "picture",
        "edit profile",
        "email",
        "date of birth",
        "occupation"
       ],
       "steps": [
        "Tap **More** → **Profile**.",
        "Tap **Change photo** and choose a picture.",
        "To change your details, tap **Edit profile info**, make your changes and tap **Save**."
       ],
       "result": "Your photo updates straight away.",
       "tips": [
        "Your phone number is your username. If it needs to change, ask your support."
       ],
       "shot": "participant-profile-edit.jpg"
      },
      {
       "id": "p-reminders",
       "q": "How do I choose my reminders?",
       "keywords": [
        "reminders",
        "notifications",
        "group call reminder",
        "recap reminder"
       ],
       "steps": [
        "Open **Profile** and tap **Reminders**.",
        "Sunday class reminders are always on.",
        "Switch **Group call** reminders on or off, and pick **1 day before**, **1 hour before** or **30 mins before** (you can pick more than one).",
        "Switch **Weekly recap** on to hear when each recap is out."
       ],
       "tips": [
        "On iPhone, notifications only work after you add the app to your Home Screen (Share → Add to Home Screen)."
       ]
      },
      {
       "id": "p-password",
       "popular": true,
       "q": "How do I change my password?",
       "keywords": [
        "password",
        "change password",
        "new password"
       ],
       "steps": [
        "Open **Profile** and tap **Password**.",
        "Type your **Current password**.",
        "Type your new password (at least 8 characters).",
        "Tap **Change password**."
       ],
       "tips": [
        "Forgot your current password? Message your support to reset it."
       ],
       "shot": "participant-profile-password.jpg"
      },
      {
       "id": "p-privacy",
       "q": "Who can see what I write?",
       "keywords": [
        "privacy",
        "private",
        "who sees",
        "reflection private"
       ],
       "steps": [
        "Scroll to the bottom of **Profile**."
       ],
       "result": "Your weekly reflections and notes are private to you. Your attendance and faith project can be seen by your support and the programme team. Anything you send on the **Feedback** page is anonymous."
      }
     ]
    },
    {
     "id": "feedback",
     "title": "Feedback",
     "where": "More → Feedback",
     "summary": "Tell the team, anonymously, how the programme is going for you.",
     "shot": "participant-feedback.jpg",
     "tasks": [
      {
       "id": "p-feedback",
       "q": "How do I give feedback about the programme?",
       "keywords": [
        "feedback",
        "anonymous",
        "suggestion",
        "complaint"
       ],
       "steps": [
        "Tap **More** → **Feedback**.",
        "Choose **Not great**, **Okay** or **Great**.",
        "If you like, fill in **What's working well?** and **What needs attention?**",
        "Tap **Submit anonymously**."
       ],
       "result": "Your answer is sent without your name, so be honest.",
       "shot": "participant-feedback.jpg"
      }
     ]
    },
    {
     "id": "wrapping-up",
     "title": "Wrapping up",
     "where": "Home → Your cohort is wrapping up → Continue",
     "summary": "At the end of FOF, tell us which church department you'd like to join.",
     "shot": "participant-wrapping-up.jpg",
     "tasks": [
      {
       "id": "p-wrap-up",
       "q": "How do I finish the programme and pick a department?",
       "keywords": [
        "wrapping up",
        "department",
        "referral",
        "complete",
        "join department"
       ],
       "steps": [
        "On Home, tap **Continue** on the wrapping-up card.",
        "Choose a department.",
        "Tap **Yes, refer me** or **Not right now**.",
        "Add anything else you'd like to say, then tap **Submit**."
       ],
       "result": "🎉 Congratulations on completing FOF. Your support team has your details and will follow up.",
       "shot": "participant-wrapping-up.jpg"
      }
     ]
    },
    {
     "id": "help",
     "title": "Getting help",
     "where": "The orange ? button on every screen",
     "summary": "Open this guide or message the FOF team on WhatsApp.",
     "shot": "participant-help-menu.jpg",
     "tasks": [
      {
       "id": "p-get-help",
       "q": "How do I get help?",
       "keywords": [
        "help",
        "stuck",
        "whatsapp",
        "guide",
        "contact"
       ],
       "steps": [
        "Tap the orange **?** button at the bottom right.",
        "Tap **Open the app guide** to search for an answer here.",
        "Or tap **Message…** to open WhatsApp to the FOF team."
       ],
       "tips": [
        "For anything about your group, your faith project or your password, your own support is the best person to ask. Tap **Message support** on Home."
       ],
       "shot": "participant-help-menu.jpg"
      }
     ]
    }
   ]
  }
 }
};
