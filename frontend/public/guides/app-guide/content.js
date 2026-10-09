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
        "Before the cohort starts, look at the five numbers: **Signed up**, **Needs login** (login not sent yet), **Login shared** (have their login, not signed in yet), **Logged in** and **Not signed up yet** (they need to be contacted to register).",
        "Signed up shows how far you are to the sign-up target. Logged in shows how many of those signed up are in the app. Signed up and Not signed up yet together make up everyone on the follow-up list.",
        "Tap any of them to open that list on Follow-ups."
       ],
       "result": "They're the same five numbers as Follow-ups → Overview, so the two pages always agree."
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
     "id": "planner",
     "title": "Planner",
     "where": "Sidebar → Programme → Planner",
     "summary": "See when each cohort runs through the year, how many weeks its classes take, and what church events get in the way.",
     "tasks": [
      {
       "id": "planner-read",
       "popular": true,
       "q": "How do I read the Planner?",
       "keywords": [
        "planner",
        "year",
        "timeline",
        "weeks",
        "cohort dates",
        "overview"
       ],
       "steps": [
        "Open **Planner**. The card at the top says what is happening **Right now** and what is **Next up**.",
        "The year view shows each cohort as a bar: grey is rest, yellow is mobilisation, orange is classes and green is the spare week. The number on each piece is its number of weeks.",
        "Hover over a piece (or tap it on a phone) to see its exact weeks and dates, for example \"Classes 3–5 of 10 (3 weeks)\".",
        "Scroll down for one card per cohort, with every week as a small square. The classes are numbered 1 to 10."
       ],
       "result": "You can see at a glance when each cohort starts and ends, and how long its classes run.",
       "tips": [
        "Use the arrows next to the year to look at another year. Three cohorts a year is the aim, and the page tells you how many start.",
        "Red shading down the page is a time when FOF stops. Blue dots are public holidays, shown for information only."
       ]
      },
      {
       "id": "planner-gap",
       "q": "What does a broken bar mean?",
       "keywords": [
        "gap",
        "paused",
        "push back",
        "clash",
        "church event",
        "extension",
        "moved"
       ],
       "steps": [
        "When a church event that stops FOF lands on a class Sunday, a red **!** appears on that class and a red box appears at the top of the page.",
        "Tap it to see **What moves**, then tap **Push back** to move that class and every later one a week.",
        "The bar then breaks: a dashed red gap shows the paused week with the event's name, and the classes carry on after it.",
        "Striped weeks at the end are weeks added past the usual end. The cohort's card says where it now ends."
       ],
       "result": "The classes, reminders and the participant app all update by themselves.",
       "tips": [
        "The first push-back uses the cohort's spare week, so the end date does not change. A second one moves the end date.",
        "The last change appears under **Recent changes**, where you can **Undo** it."
       ]
      },
      {
       "id": "planner-start",
       "q": "How do I add a cohort or change when it starts?",
       "keywords": [
        "add cohort",
        "start date",
        "first class",
        "plan cohort",
        "move cohort"
       ],
       "steps": [
        "Tap **Add cohort** to plan the next cohort that is not created yet, or tap **Dates** on any cohort's card.",
        "Pick the **First class** date. It must be a Sunday.",
        "Check the rest, mobilisation, classes and spare week dates that it makes, then tap **Save start date**."
       ],
       "result": "Later planned cohorts follow on automatically.",
       "tips": [
        "Planned cohorts are only kept on the Planner. Create the real cohort on the **Cohorts** page when it is time.",
        "A cohort that has already started can't be moved this way. Use **Edit each class date…** to move the classes still to come."
       ]
      },
      {
       "id": "planner-events",
       "q": "How do I add a church event?",
       "keywords": [
        "church event",
        "anniversary",
        "stops fof",
        "holiday",
        "test cohort",
        "practice"
       ],
       "steps": [
        "Tap **Add event**, then type the name and pick the dates.",
        "Switch on **Stops FOF** if no class can hold on those Sundays. Leave it off if FOF still runs.",
        "Save. The page warns you straight away if it falls on a class."
       ],
       "result": "The event shows on the timeline, and the Planner flags any class it lands on.",
       "tips": [
        "The Practice and demo cohorts are hidden. Open the ⋮ menu and choose **Show test cohorts** if you want to see them.",
        "The ⋮ menu also has **Refresh public holidays**."
       ]
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
       "id": "participants-retaking",
       "q": "What does the Retaking or Shared number tag mean?",
       "keywords": [
        "retaking",
        "retake",
        "shared number",
        "same number",
        "previous cohort",
        "did not graduate",
        "repeat"
       ],
       "steps": [
        "Tap the tag next to their name to see why they're flagged.",
        "**Retaking** means another cohort has a record on the same phone number with the same first name.",
        "**Shared number** means the number matches but the name doesn't, so it may be a family phone or a typo. Tap **Same person** or **Different person**.",
        "For someone the app can't find (for example a cohort from before the app), tap **⋮** → **Mark as retaking** and give the reason."
       ],
       "result": "The tag shows who is retaking FOF, and tapping it always says why.",
       "tips": [
        "Their old record stays with the old cohort, so every count stays with its own cohort.",
        "Supports can answer too, from the participant's card."
       ]
      },
      {
       "id": "participants-test",
       "q": "How do I mark a participant as a test, so they aren't counted?",
       "keywords": [
        "test participant",
        "mark as test",
        "demo login",
        "not counted",
        "ignore"
       ],
       "steps": [
        "On **Participants**, tap **⋮** on their row.",
        "Tap **Mark as test**."
       ],
       "result": "They get a **Test · not counted** tag. They can still sign in and use the app, but they're left out of the numbers on Participants, Groups, Allocation, the Dashboard and the Supports page. Auto-distribute skips them.",
       "tips": [
        "Use it for demo or trial logins.",
        "To undo, tap **⋮** → **Unmark as test**."
       ]
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
     "summary": "See each participant's saved Faith Project, its edit history and their testimonies.",
     "shot": "admin-faith-projects.jpg",
     "tasks": [
      {
       "id": "faith-projects-approve",
       "q": "How do I read a participant's Faith Project and see how it changed?",
       "keywords": [
        "faith project",
        "edit history",
        "category",
        "opted out"
       ],
       "steps": [
        "Open Faith projects and tap **Open** next to the person.",
        "Read what they saved. Open **Edit history** to see every version, newest first.",
        "Pick a **Category** if you want one (optional)."
       ],
       "result": "There is no review step: participants save and edit their own project, and their support is told each time. A tag shows if someone has opted out of corporate prayers."
      },
      {
       "id": "faith-projects-settings",
       "q": "How do I set when corporate prayers start, or change the categories?",
       "keywords": [
        "faith project settings",
        "categories",
        "corporate prayer",
        "start week",
        "pop-up"
       ],
       "steps": [
        "Tap the gear icon (**Faith Project settings**) at the top of the page.",
        "Under **Corporate prayers**, choose the week it starts in and how many days before it the pop-up begins, then **Save**.",
        "Add or archive categories if you need to."
       ],
       "result": "A few days before that week's class day, every participant gets a pop-up they must answer: **I'm fine with this** or **Opt out**. From that day, saved projects are prayed for unless the person opted out.",
       "tips": [
        "The **Write-it-by date** is only a soft date. Projects can still be saved after it."
       ]
      }
     ]
    },
    {
     "id": "onboarding",
     "title": "Onboarding",
     "where": "Sidebar → People & groups → Participants → Onboarding tab",
     "summary": "Track how far along each group is in onboarding its participants.",
     "shot": "admin-onboarding.jpg",
     "tasks": [
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
       "result": "Tapping a number filters the contact list below to match.",
       "tips": [
        "The cards follow the cohort picked at the top. Test contacts are never counted."
       ]
      },
      {
       "id": "follow-ups-search",
       "q": "How do I find a contact by name, number or email?",
       "keywords": [
        "search",
        "find contact",
        "name",
        "number",
        "email",
        "all supports"
       ],
       "steps": [
        "On the **Contacts** tab, type in the search box under the filters.",
        "Matches come from every cohort, not just the one you've picked, so you don't need to change the cohort filter."
       ],
       "result": "The line under the box says how many match. Clear the box to go back to the full list.",
       "tips": [
        "Numbers work with 3 or more digits, typed as 0803… or +234 803….",
        "Use **All Supports** to see one support's contacts, or **Unassigned** for the ones nobody has yet."
       ]
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
       "result": "While anyone in the current cohort is waiting to be assigned, admins get one reminder every 2 hours (not one per person). Test contacts, closed ones and wrong numbers are never counted."
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
       "shot": "admin-follow-ups-assign-now-confirm.jpg",
       "tips": [
        "The number in the confirmation covers every cohort, so it can be higher than the cards, which follow the cohort you've picked. Test contacts are never counted or assigned."
       ]
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
       "result": "\"No same gender to follow up\" means every support of their gender is already full. \"Gender not known\" means their gender isn't on file, so the system can't match them to a same-gender support — add it on their contact card to unblock them.",
       "tips": [
        "The big number on the **Waiting to be assigned** card counts everyone with nobody assigned. The lines under it say why. Tap any of them to list those people."
       ]
      },
      {
       "id": "follow-ups-status-dropdown",
       "q": "How do I update someone's follow-up stage?",
       "keywords": [
        "status dropdown",
        "registration status",
        "still open",
        "closed",
        "login shared",
        "confirmed access",
        "issue with login"
       ],
       "steps": [
        "Open the contact's status dropdown.",
        "Choose from three groups: **Still open** (To contact, Messaged, no reply yet, Needs reminder, Replied, Call back later, Registered, Login shared, Issue with login), **Moved to next cohort**, or **Closed** (Logged in, Wrong number, Not interested, No response)."
       ],
       "result": "Only **Logged in** completes a follow-up — it's set by itself when the person signs in and chooses their password. **Login shared** keeps them open until then, and **Issue with login** alerts the admin and IT team.",
       "shot": "admin-follow-ups-contacts.jpg",
       "tips": [
        "**Attended** isn't in this list. It's set from the **From prior cohort** tag (see \"Someone from a prior cohort already attended\")."
       ]
      },
      {
       "id": "follow-ups-prior-cohort-attended",
       "q": "Someone from a prior cohort already attended. How do I record that?",
       "keywords": [
        "from prior cohort",
        "attended",
        "prior cohort",
        "previous cohort",
        "already attended"
       ],
       "steps": [
        "On the **Contacts** tab, find them. They have a grey **From prior cohort** tag.",
        "Tap the tag and pick the cohort they attended."
       ],
       "result": "They're marked **Attended** and filed under that cohort, so they leave the current list and are never auto-assigned. You'll find them when you pick that cohort at the top.",
       "tips": [
        "Picked the wrong cohort? Tap **Attended [cohort]** and choose another, or **Undo**.",
        "Only admins can do this. Supports just see the tag."
       ]
      },
      {
       "id": "follow-ups-form-questions",
       "q": "Where do I see questions people asked on the sign-up form?",
       "keywords": [
        "question",
        "concerns",
        "sign up form",
        "asked a question",
        "questions to answer"
       ],
       "steps": [
        "On **Contacts**, tap **Questions to answer** to see who still needs an answer.",
        "Tap **Asked a question** on a contact to read it.",
        "Once someone has answered them, tap **Mark as answered**."
       ],
       "result": "Every real question from the form's \"Any other questions or concerns?\" shows on the contact. Answers like None, Nil or No are left out.",
       "tips": [
        "The support sees the same question on their follow-up card and can mark it answered too.",
        "It also shows on the participant's profile."
       ]
      },
      {
       "id": "follow-ups-test-contacts",
       "q": "How do I mark a contact as a test, so it isn't counted?",
       "keywords": [
        "test contact",
        "mark as test",
        "demo",
        "ignore",
        "not counted"
       ],
       "steps": [
        "On the **Contacts** tab, tap **⋮** on the contact.",
        "Tap **Mark as test**."
       ],
       "result": "They get a **Test · ignored** tag. They stay in the list, but they're never auto-assigned and aren't counted in the cards, Overview, alerts or exports. Supports never see them.",
       "tips": [
        "To undo, tap **⋮** → **Unmark as test**."
       ]
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
       "shot": "admin-follow-ups-message-bank.jpg",
       "tips": [
        "If the contact has an email, **Send email** in their **⋮** menu (or tapping their email under the **i**) sends the same template by email.",
        "The message window shows who it is going to and their number. If someone has no working number it says so and blocks copying, so a message never lands in the wrong chat. Tap **Add a working number** to fix it."
       ]
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
        "Each issue shows who it is about and what is wrong; switch to **Closed** to see resolved ones."
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
     "id": "surveys",
     "title": "Surveys",
     "where": "Sidebar → Engagement → Surveys",
     "summary": "Build surveys, choose who answers, and read the results with an optional AI summary.",
     "tasks": [
      {
       "id": "surveys-new",
       "popular": true,
       "q": "How do I create a survey?",
       "keywords": [
        "survey",
        "questions",
        "form",
        "ask"
       ],
       "steps": [
        "Open **Surveys** and tap **New survey**.",
        "Name it, then choose **Who answers it** (participants, supports or everyone) and whether it belongs to this cohort or all cohorts.",
        "For supports, you can narrow it to one hub or one tag. For participants, to one group.",
        "Add questions: text, text area, number, rating (with labels for both ends and your own scale) or image or file (5 MB each).",
        "Set when it opens and closes, and tick the notification if people should be alerted when it opens.",
        "Tap **Publish survey**, or **Save draft** to finish later."
       ],
       "result": "It appears as a card on the Home screen of everyone it is for, until they answer or it closes.",
       "tips": [
        "Turn on **Anonymous** to see who answered but never which answers are theirs. It cannot be changed once people have answered.",
        "Each person answers once. Submitting is final."
       ]
      },
      {
       "id": "surveys-wrapup",
       "q": "How do I change the Your cohort is wrapping up card?",
       "keywords": [
        "wrapping up",
        "wrap-up",
        "end of cohort",
        "department",
        "referral"
       ],
       "steps": [
        "Open **Surveys** and tap **Edit** on **Wrapping up**.",
        "Change the heading, the line under it and the button text.",
        "Under **When it appears**, choose weeks before the cohort ends or a fixed date.",
        "Edit the questions if you need to, then tap **Save**."
       ],
       "result": "Participants see your wording when the survey opens. Department and referral answers still go to the follow-up list.",
       "tips": [
        "Switch **Show this on participants Home** off to hide it."
       ]
      },
      {
       "id": "surveys-results",
       "q": "How do I see the results?",
       "keywords": [
        "results",
        "export",
        "csv",
        "pdf",
        "ai summary"
       ],
       "steps": [
        "Open **Surveys** and tap **Results** on a survey.",
        "**Summary** shows each question. **All answers** lists every response. **Who answered** shows who is still to do it.",
        "Tap **Summarise** for an AI summary of the main themes.",
        "Use **Export CSV** or **Export PDF** to download."
       ],
       "result": "You have the answers in the app and as a file.",
       "tips": [
        "An anonymous survey shows its answers once five or more people have answered."
       ]
      },
      {
       "id": "surveys-builtin",
       "q": "What are the built-in surveys?",
       "keywords": [
        "mid",
        "end",
        "wrapping up",
        "feedback",
        "built-in"
       ],
       "steps": [
        "**Wrapping up** appears near the end of each cohort.",
        "**Mid-cohort feedback** and **End-of-cohort feedback** are anonymous and start switched off.",
        "Tap **Edit** on one to change its Home card, its questions, and when it appears (weeks after the start, weeks before the end, or fixed dates). Turn on **Show this on participants Home** to start using it."
       ],
       "result": "The surveys follow each cohort own dates, so you set them up once.",
       "tips": [
        "The always-open anonymous feedback on the Feedback page is separate and keeps working as before."
       ]
      }
     ]
    },
    {
     "id": "birthdays",
     "title": "Birthdays",
     "where": "Sidebar → Engagement → Birthdays",
     "summary": "See whose birthday is coming next, for supports and participants.",
     "tasks": [
      {
       "id": "birthdays-view",
       "popular": true,
       "q": "How do I see upcoming birthdays?",
       "keywords": [
        "birthday",
        "birthdays",
        "celebrate",
        "countdown"
       ],
       "steps": [
        "Open **Birthdays**.",
        "Use the **Supports** and **Participants** tabs, and the cohort box to look at one cohort or all of them.",
        "Type a name in the search box, or pick a month, to narrow the list.",
        "Each person shows \"Birthday is on the 19th\" and how many days away it is, nearest first."
       ],
       "result": "You can see who is celebrating this week, in the next 30 days and later.",
       "tips": [
        "People who have not given their birthday are not listed. The count of those is shown at the bottom.",
        "Supports add their birthday in their profile. Participants add their date of birth in their profile."
       ]
      },
      {
       "id": "birthdays-alerts",
       "q": "Will I be told when a birthday is coming?",
       "keywords": [
        "birthday alert",
        "notification",
        "reminder"
       ],
       "steps": [
        "Every admin gets a notification **2 days** before a birthday, and another **1 day** before.",
        "The alerts arrive in the morning. Tap one to open the Birthdays page."
       ],
       "result": "You hear about each birthday twice, never more.",
       "tips": [
        "Alerts cover supports and participants in a running cohort."
       ]
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
       "id": "users-export-supports",
       "q": "How do I export all supports to paste on WhatsApp?",
       "keywords": [
        "export supports",
        "list of supports",
        "whatsapp",
        "phone numbers",
        "notifications off",
        "home screen"
       ],
       "steps": [
        "Open **Users** and tap **⋮** beside **Add User**.",
        "Tap **Export supports**.",
        "Tap **Copy all**, or **WhatsApp** to open WhatsApp with it ready to send."
       ],
       "result": "A numbered list of every active support with their name and phone number. An asterisk after a name means their notifications are off, or the app isn't on their Home Screen.",
       "tips": [
        "The asterisk goes by whether they have notifications saved on any device. On an iPhone, notifications only work once the app is on the Home Screen, so it catches both.",
        "Test accounts and deactivated supports are left out."
       ]
      },
      {
       "id": "users-row-menu",
       "q": "How do I reset someone's password, change their role, mark them as test, or remove them?",
       "keywords": [
        "reset password",
        "change role",
        "deactivate",
        "delete user",
        "mark as test",
        "test account"
       ],
       "steps": [
        "Tap the **≡** icon on their row.",
        "Choose **Manage** (edit their details), **Change role**, **Mark as test**, **Reset password**, **Deactivate** (blocks login, keeps their records) or **Permanent delete** (cannot be undone)."
       ],
       "result": "Reset password gives them a new temporary one to share; Deactivate is the safer option if you just need to stop someone logging in.",
       "shot": "admin-users-row-menu.jpg",
       "tips": [
        "**Mark as test** is for demo or trial accounts. They work normally but are never picked for follow-up assignment or counted as spare places. They get a **Test** tag, and they are left out of the lists where you pick a support. Where you really need one (assigning follow-ups, or a group's support), tick **Show test supports** under the list."
       ]
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
       "id": "announcements-popup",
       "q": "How do I send an announcement as a popup?",
       "keywords": [
        "popup",
        "pop up",
        "must read",
        "acknowledge",
        "got it",
        "announcement"
       ],
       "steps": [
        "Open **Announcements** and write your message as usual.",
        "Switch on **Show as a popup**. Add a link or a video button if you want one.",
        "Send it. Each person sees it on their screen until they tap **Got it** (or the button).",
        "In the history, tap the purple **Popup** chip to see how many have tapped Got it and who is still waiting."
       ],
       "result": "People can't dismiss it without reading it, and you can see who has.",
       "tips": [
        "Use popups sparingly. Only one popup shows at a time, and the app holds back the optional ones (weekly question, Get the app) so nobody is buried.",
        "A popup stops showing after 14 days, or on the \"Show until\" date if you also pinned it to Home."
       ]
      },
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
      },
      {
       "id": "website-hero-photo",
       "q": "How do I change the hero photo and how dark it is?",
       "keywords": [
        "hero",
        "photo",
        "darkness",
        "overlay",
        "phone",
        "mobile",
        "picture"
       ],
       "steps": [
        "Open **Website → Photos**. Upload a wide photo under **Hero (computer)** and, if you like, a tall photo under **Hero (phone)**. Phones use the wide one until you add a phone photo.",
        "Open **Website → Hero**. Drag **Photo darkness** until the headline is easy to read. The preview shows the effect.",
        "Tap **Save** on the Hero tab (photos upload straight away)."
       ],
       "result": "The public page shows your photo, with the darkness you chose, as soon as you save.",
       "tips": [
        "A higher percentage means a darker photo. Around 70% suits most photos."
       ]
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
        "can't get in",
        "can't log in",
        "can't sign in"
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
        "Below that are quick buttons such as **Mark attendance**, **My Hub**, **My Tasks**, **Resources** and **Classes**.",
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
      },
      {
       "id": "home-answer-survey",
       "q": "How do I answer a survey?",
       "keywords": [
        "survey",
        "questions",
        "wrapping up",
        "feedback"
       ],
       "steps": [
        "When there is a survey for you, a card appears at the top of **Home**.",
        "Tap its button to open it.",
        "Answer the questions. Rating questions use the numbers shown, and you can add a photo or file where asked.",
        "Tap **Submit**."
       ],
       "result": "Your answers are sent and the card disappears from Home.",
       "tips": [
        "You can answer each survey once, so check your answers before you submit.",
        "If the survey says it is anonymous, nobody can see which answers are yours."
       ]
      }
     ]
    },
    {
     "id": "practice",
     "title": "Practice before the cohort starts",
     "where": "Home → Practice (later: More → Practice), or the cohort name at the top right",
     "summary": "Rehearse the app as a participant, a support or a hub role before the real cohort begins, in a safe practice group.",
     "tasks": [
      {
       "id": "practice-start",
       "popular": true,
       "q": "How do I start practising?",
       "keywords": [
        "practice",
        "practise",
        "test",
        "rehearse",
        "try the app",
        "test mode"
       ],
       "steps": [
        "On **Home**, tap **Practice**. You can also pick the Practice cohort from the cohort name at the top right.",
        "The app switches to the Practice cohort and a pop-up asks **Who do you want to practice as?**",
        "Tap one card (nothing is chosen for you). Each card says what you will do and shows **Your group** so you know where you will land.",
        "Tap **Start as …** at the bottom."
       ],
       "result": "You are placed in your own practice group and the practice checklist opens.",
       "tips": [
        "Every support gets their own practice group, so what you do never mixes with another support.",
        "Once the real cohort starts, **Practice** moves from the Home shortcuts to **More**."
       ]
      },
      {
       "id": "practice-change-role",
       "q": "How do I practise as a different role?",
       "keywords": [
        "change role",
        "switch role",
        "another role"
       ],
       "steps": [
        "Open the practice banner at the top of the pop-up.",
        "Tap **Change role**.",
        "Pick another card and tap **Start as …**."
       ],
       "result": "The checklist now follows the new role."
      },
      {
       "id": "practice-peer",
       "q": "How do I practise with another support?",
       "keywords": [
        "peer",
        "partner",
        "together",
        "pair"
       ],
       "steps": [
        "Agree who will act as the participant and who will be the support.",
        "The one acting as the participant picks the participant role; the other practises their own support role in the same group.",
        "Swap roles and go again."
       ],
       "result": "Each of you sees what the other does, just like a real group.",
       "tips": [
        "Practice participants in your group see what you do as their support, so treat it like the real thing."
       ]
      },
      {
       "id": "practice-return",
       "q": "How do I get back to my real cohort?",
       "keywords": [
        "test mode",
        "return",
        "exit practice",
        "real cohort"
       ],
       "steps": [
        "While practising, a bar at the top says **Test mode**.",
        "Tap it to return to your real cohort."
       ],
       "result": "You are back on your real cohort and nothing from Practice appears there."
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
        "whatsapp number",
        "add someone",
        "new person"
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
        "search",
        "clear search"
       ],
       "steps": [
        "Open **Mobilisation** and scroll to **Signed up on the form**.",
        "Tap the search box. It moves up to the top of the screen so you can see the names under it.",
        "Type a name or number. The list narrows as you type.",
        "Tap the **X** in the box to clear it and search again.",
        "Tap the **filter** icon beside the box to show only certain stages, for example **Login not shared yet** or **Logged in**. Tap the **X** that appears next to it to clear the filters.",
        "Tap the small green **WhatsApp** badge beside a support's name to message them about that person, for example to ask if they need help.",
        "Tap the refresh button to fetch the newest sign-ups."
       ],
       "result": "You see when each person signed up, who is following them up, and how far they are: **Login not shared yet**, **Login shared**, **Issue with login** or **Logged in**. Check here before asking the back office.",
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
       "id": "s-fu-app-videos",
       "q": "How do I get my participants to install the app and turn on alerts?",
       "keywords": [
        "install",
        "video",
        "alerts",
        "notifications",
        "not installed",
        "no alerts",
        "template"
       ],
       "steps": [
        "On **Home**, the **Get them on the app** card lists your participants who have signed in but have not installed the app, or have alerts off. Tap **Send video** next to a name. WhatsApp opens with the message and the install videos ready.",
        "After you tap **Send video**, a **Sent** tag shows the day and their row moves below people you have not messaged. The tag records when you opened the message; it does not confirm WhatsApp delivery.",
        "Home re-checks when you return to the app and every two minutes while it is visible. Once they have installed the app and enabled alerts, their name leaves the card and you get a one-time notification in your bell.",
        "For anyone you follow up, open the contact, tap **Message** and pick a template: **After login shared: install the app and turn on alerts**, **Signed in, but the app is not on the Home Screen**, or **App installed, but alerts are off**. There is also **After login shared: no response**.",
        "The messages include the Android and iPhone videos, so they can watch the one for their phone."
       ],
       "result": "People who install the app and allow notifications get their class and group reminders.",
       "tips": [
        "The card and the daily reminder stop when the cohort starts, and a name drops off as soon as they finish."
       ]
      },
      {
       "id": "s-my-followups",
       "popular": true,
       "q": "Where are the people I need to follow up?",
       "keywords": [
        "follow-ups",
        "assigned to me",
        "my contacts",
        "who to call",
        "email",
        "i button",
        "three dots",
        "my list",
        "follow up list",
        "who do i follow up"
       ],
       "steps": [
        "Open **Mobilisation** and tap the **Follow-ups** tab. The number shows how many you have.",
        "**Open** shows the people you're still working on. **Closed** shows the ones you've finished.",
        "Turn on **Show past cohorts** to see people from earlier cohorts too."
       ],
       "result": "Each person has a card with their number and buttons to message or call them. Tap the **i** next to their name to see their number and email, and the **⋮** at the top right of the card for more: **Copy number**, **Send message**, **Send email** and **Edit contact**.",
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
        "copy text",
        "email",
        "send email"
       ],
       "steps": [
        "On the person's card, tap **Templates**.",
        "Pick a message, for example **First message** or **Registration link message**.",
        "Their name and the details fill in by themselves. Check the preview.",
        "Tap **Open WhatsApp** to send it, or **Copy text** to paste it somewhere else."
       ],
       "result": "WhatsApp opens with the message ready to send, and the app notes that you've contacted them.",
       "tips": [
        "You can also tap **WhatsApp** or **Call** on the card to reach them without a template.",
        "No WhatsApp? Tap **⋮** on their card, then **Send email** (or tap their email under the **i**). Pick a template the same way and tap **Open email**. Your email app opens with the message ready to send. Once they've registered, Send email opens their login details instead.",
        "The message window shows who it is going to and their number. If someone has no working number it says so and blocks copying, so a message never lands in the wrong chat. Tap **Add a working number** to fix it."
       ],
       "shot": "support-follow-up-templates.jpg"
      },
      {
       "id": "s-form-question",
       "q": "Someone asked a question on the sign-up form. Where do I see it?",
       "keywords": [
        "question",
        "asked",
        "concern",
        "sign up form",
        "mark as answered"
       ],
       "steps": [
        "Open **Mobilisation** → **Follow-ups**.",
        "Their card shows **They asked on the sign-up form** with their words.",
        "Answer them when you reach out, then tap **Mark as answered**."
       ],
       "result": "The box turns grey and shows when it was answered.",
       "tips": [
        "Tapped it by mistake? Tap **Not answered yet**.",
        "If they fill the form again with a new question, it shows up as unanswered again."
       ]
      },
      {
       "id": "s-email-contact",
       "popular": true,
       "q": "Their number doesn't work. How do I reach them by email?",
       "keywords": [
        "email",
        "wrong number",
        "not reachable",
        "not on whatsapp",
        "can't reach",
        "copy email",
        "send email",
        "email login"
       ],
       "steps": [
        "On their card, tap the **i** next to their name. Their number and email show.",
        "Tap the email to write to them, or tap **Copy** to paste it somewhere else.",
        "Or tap **⋮** at the top right of the card, then **Send email**."
       ],
       "result": "Before they register, you pick a ready-made message, check the preview and tap **Open email**. Once they've registered, your email app opens straight away with their login details: it says you couldn't reach them by phone, introduces you, and gives their username and first-time password. Either way, check it and tap send.",
       "tips": [
        "If they've already set their own password, there's no login to send, so you pick a message instead.",
        "If there's no email, they didn't give one on the form. Let the admin know.",
        "Don't see the **i**? Close the app completely and open it again to get the latest version."
       ],
       "shot": "support-follow-ups.jpg"
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
        "Once someone is registered, the box only offers the next steps: **Login shared**, **Logged in**, **Issue with login** and **Will join next cohort**.",
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
        "send login",
        "confirmed access",
        "issue with login",
        "can't log in",
        "email",
        "send by email"
       ],
       "steps": [
        "Open their card. Once they're **Registered**, a **Their login details** box appears.",
        "Tap it to see the details. Tap **Send in WhatsApp**, **Send by email** or **Copy message**.",
        "Once you've sent them, set **Where do they stand?** to **Login shared**.",
        "If you forget, the app asks. An hour after you made someone's login, if they're still at Registered, a box opens whenever you enter the app: **Did you send this login?** Tap **Yes, I sent it** to mark them Login shared, or **Not yet** and it asks again tomorrow. The box stays until you answer.",
        "If they can't get in, choose **Issue with login**. A box asks **What's the problem?** Describe it (for example, the code isn't working or they changed phone) and tap **Submit**. The admins and your hub's IT Support are told, with what you wrote, and the login details box stays on the card so you can send a new code."
       ],
       "result": "When they sign in and set their password, the card closes by itself as **Logged in** and you get a notification. Your job for this person is done.",
       "shot": "support-follow-ups.jpg",
       "tips": [
        "When IT Support mark the problem sorted, you get a notification. If the person has signed in by then, the card closes as **Logged in**. If not, it goes back to **Login shared**.",
        "Couldn't reach them by phone? **Send by email** opens your email app with a message that says you couldn't get through, introduces you, and gives their login. It only shows if they gave an email."
       ]
      },
      {
       "id": "s-edit-contact",
       "q": "How do I fix a follow-up person's name or number?",
       "keywords": [
        "edit contact",
        "wrong name",
        "change number",
        "three dots",
        "⋮"
       ],
       "steps": [
        "On their card, tap **⋮** at the top right.",
        "Tap **Edit contact**.",
        "Correct the details and tap **Save**."
       ],
       "shot": "support-follow-up-menu.jpg"
      }
     ]
    },
    {
     "id": "it-issues",
     "title": "IT issues (for IT Support)",
     "where": "More → Mobilisation → IT issues",
     "summary": "If you are IT Support for a hub, this tab lists the people in your hub who can't get into the app, with what their support wrote.",
     "tasks": [
      {
       "id": "s-it-see-issues",
       "q": "Where do I see login problems I need to sort?",
       "keywords": [
        "it support",
        "it issues",
        "login issue",
        "can't log in",
        "login problem"
       ],
       "steps": [
        "Open **Mobilisation** and tap the **IT issues** tab. It only shows if you are IT Support for a hub. The number shows how many are open.",
        "**Open** lists the problems still waiting. **Resolved** lists the ones already sorted.",
        "Each card shows the person, their number, who reported it and when, and what the support wrote."
       ],
       "result": "You see every login problem for the supports in your hub, newest first.",
       "tips": [
        "You also get an alert on the bell when a support in your hub reports a new one. Tapping it opens this tab."
       ]
      },
      {
       "id": "s-it-reach",
       "q": "How do I reach the person or their support?",
       "keywords": [
        "whatsapp",
        "call",
        "contact support",
        "reach"
       ],
       "steps": [
        "On the card, tap **WhatsApp** or **Call** to reach the person.",
        "Under **Support**, tap the green **WhatsApp** button to message the support who is following them up."
       ],
       "result": "WhatsApp or your phone opens straight away."
      },
      {
       "id": "s-it-new-code",
       "q": "How do I send them a new login code?",
       "keywords": [
        "new code",
        "login code",
        "reset",
        "password",
        "login details"
       ],
       "steps": [
        "On the card, tap **Their login details**.",
        "Issue a new code, then send it to them on WhatsApp from there.",
        "A new code signs them out of the app until they use it."
       ],
       "result": "They can sign in with the new code and choose their own password."
      },
      {
       "id": "s-it-resolve",
       "q": "How do I mark a login problem as sorted?",
       "keywords": [
        "resolve",
        "resolved",
        "sorted",
        "done",
        "fixed"
       ],
       "steps": [
        "On the card, tap **Mark resolved**.",
        "Add a short note on what fixed it if you like.",
        "Tap **Mark resolved** again to save."
       ],
       "result": "If they have signed in, they move to **Logged in** and their follow-up closes. If not yet, they go back to **Login shared** until they sign in. Either way their support gets a notification.",
       "tips": [
        "When they choose their password later, the card closes by itself as **Logged in**."
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
       "q": "How do I see a participant's faith project?",
       "keywords": [
        "faith project",
        "edit history",
        "saved",
        "category"
       ],
       "steps": [
        "On **My Group**, tap the **Faith project** tag on the person's card.",
        "Read what they saved. Open **Edit history** to see every version, newest first.",
        "Pick a **Faith project category** if you like (optional)."
       ],
       "result": "Participants save and edit their own project; there is no review step. You get a notification each time they save or change it.",
       "tips": [
        "The tag says **Not started** or **Written**.",
        "If someone opts out of corporate prayers, their project is not shown in prayer lists."
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
     "summary": "See which of your participants are ready, and start the group introductions.",
     "shot": "support-onboard.jpg",
     "tasks": [
      {
       "id": "s-onboard-steps",
       "popular": true,
       "q": "How do I see how my group is getting on with onboarding?",
       "keywords": [
        "onboard",
        "onboarding",
        "intro",
        "introductions",
        "guide",
        "profile",
        "ready",
        "progress"
       ],
       "steps": [
        "Open **More** → **Onboard**. The bar at the top shows how many of your group are ready.",
        "Tap **Start introductions** to post your own introduction first. Your group can't introduce themselves until you have.",
        "Under **People**, each person shows four steps: **Intro** (they posted their introduction), **Guide** (they read the intro guide), **Profile** (their profile is complete) and **Ready** (they confirmed they are ready)."
       ],
       "result": "A person shows **Onboarded** when all four steps are done.",
       "tips": [
        "The steps tick by themselves as people use the app. You don't mark anything.",
        "Tap the phone number under a name to copy it if you want to reach someone who is behind."
       ],
       "shot": "support-onboard.jpg"
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
        "hub lead message",
        "hub messages",
        "messages from hub lead"
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
     "title": "Classes & participant questions",
     "where": "Home → Classes",
     "summary": "Each class's manual before it and recap after, plus questions participants have asked.",
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
        "On Home, tap **Classes**.",
        "The top card is the next class. Tap **Open the manual** for the class booklet, or **Read the recap** once it's out.",
        "Scroll down to **Other weeks**. A week with a lock opens when its manual arrives."
       ],
       "result": "**Recap out** means it's ready to read. \"Manual arrives…\" and \"Recap arrives…\" tell you when each will appear.",
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
        "Open **Classes**. A week with new questions shows a number, for example \"1 new\".",
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
        "profile",
        "change photo",
        "update photo",
        "profile picture"
       ],
       "steps": [
        "Open **More** → **Profile**.",
        "Tap **Add a profile photo** (or the camera on your picture) and choose a photo.",
        "Pick your **Gender** and **Age range**. They save straight away.",
        "Optional: pick the day and month of your **Birthday** so admins can celebrate you. Only the day and month are saved; tap × to remove it.",
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
        "Or tap **Message…** to open WhatsApp with a greeting already typed. It goes to your hub's IT Support person, or to the FOF team if your hub doesn't have one."
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
      },
      {
       "id": "home-answer-survey",
       "q": "How do I answer a survey?",
       "keywords": [
        "survey",
        "questions",
        "wrapping up",
        "feedback"
       ],
       "steps": [
        "When there is a survey for you, a card appears at the top of **Home**.",
        "Tap its button to open it.",
        "Answer the questions. Rating questions use the numbers shown, and you can add a photo or file where asked.",
        "Tap **Submit**."
       ],
       "result": "Your answers are sent and the card disappears from Home.",
       "tips": [
        "You can answer each survey once, so check your answers before you submit.",
        "If the survey says it is anonymous, nobody can see which answers are yours."
       ]
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
        "write notes",
        "class notes"
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
     "summary": "Write what you're believing God for, save it, edit it any time, and share testimonies.",
     "shot": "participant-faith-project.jpg",
     "tasks": [
      {
       "id": "p-write-fp",
       "popular": true,
       "q": "How do I write and save my faith project?",
       "keywords": [
        "faith project",
        "write",
        "save",
        "edit",
        "believing god"
       ],
       "steps": [
        "Tap **F. Project** in the bottom bar.",
        "Tap **Write your faith project** and write it. Be specific: who, what, and by when.",
        "Tap **Save**."
       ],
       "result": "It is saved straight away. You can change it any time: tap the pencil next to your project, edit the text and tap **Save**.",
       "tips": [
        "Not sure how to start? Tap **Explore the guide** for a short illustrated guide.",
        "If a date to write it by is shown, try to save it before then. You can still save it after."
       ],
       "shot": "participant-faith-project.jpg"
      },
      {
       "id": "p-fp-status",
       "q": "Can I see what I wrote before?",
       "keywords": [
        "edit history",
        "versions",
        "earlier",
        "changed"
       ],
       "steps": [
        "Open **F. Project**.",
        "Tap **Edit history** to see every version you saved, newest first."
       ],
       "result": "Your support and the programme team can see the same history."
      },
      {
       "id": "p-fp-prayers",
       "q": "What is the corporate prayers pop-up, and can I opt out?",
       "keywords": [
        "corporate prayers",
        "opt out",
        "pop-up",
        "pray for my project"
       ],
       "steps": [
        "A few days before corporate prayers start, a pop-up asks about it. Tap **I'm fine with this** or **Opt out**.",
        "To change your mind later, open **F. Project** and tap the small **Prayer on** (or **Prayer off**) chip at the top right. Pick **Include my faith project** or **Opt out**."
       ],
       "result": "Everyone is included unless they opt out. When you are included, your photo and project are shown to everyone in your cohort who prays together. If you opt out, they are not.",
       "tips": [
        "The pop-up can't be closed until you answer it."
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
       "q": "My project is saved but it isn't going well. What can I do?",
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
        "You can change your corporate prayers choice at any time with the small **Prayer on** chip at the top right of **F. Project**."
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
       "result": "Congratulations on completing FOF. Your support team has your details and will follow up.",
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
        "Or tap **Message…** to open WhatsApp with a greeting already typed. It goes to the IT Support person for your support's hub, or to the FOF team if there isn't one."
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
