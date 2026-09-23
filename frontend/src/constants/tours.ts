import type { User } from '../types';

// Welcome modal + per-page product tours. All wording lives here.
// A step's `target` is a CSS selector, usually `[data-wt="..."]` on the page.
// If the element isn't on screen the step shows as a centred card, unless it is
// `optional`, in which case it is skipped (e.g. a list that is still empty).

export type TourAudience = 'support' | 'admin' | 'participant';

export interface TourStep {
  target?: string;
  title: string;
  body: string;
  optional?: boolean;
}

export interface WelcomeTile {
  /** SVG path (24x24, stroke). */
  icon: string;
  title: string;
  body: string;
}

export interface WelcomeContent {
  title: string;
  subtitle: string;
  tiles: WelcomeTile[];
  homePath: string;
  homeTour: string;
}

/** Bump the version to show the Welcome again after a future big release. */
export const WELCOME_KEY = 'welcome:v2';
export const pageTourKey = (pageId: string) => `page:${pageId}`;

export const tourAudienceFor = (role: User['role']): TourAudience =>
  role === 'PARTICIPANT' ? 'participant' : role === 'SUPPORT' ? 'support' : 'admin';

const wt = (name: string) => `[data-wt="${name}"]`;

const ICON = {
  group: 'M17 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-3A3.5 3.5 0 0 0 7 18.5V20m5-9a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8 9v-1a3 3 0 0 0-2.2-2.9M16.5 5.2a3 3 0 0 1 0 5.6',
  megaphone: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM19 8v6m3-3h-6',
  swap: 'M7 16V4m0 0L3 8m4-4 4 4m6 0v12m0 0 4-4m-4 4-4-4',
  chat: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  pulse: 'M3 12h4l3-8 4 16 3-8h4',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z',
  sliders: 'M4 21v-7m0-4V3m8 18v-9m0-4V3m8 18v-5m0-4V3M1 14h6m2-6h6m2 8h6',
  phone: 'M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm4 17h2',
  path: 'M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11',
  pen: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z',
  heart: 'M12 21s-7-4.35-7-10a4 4 0 0 1 7-2.65A4 4 0 0 1 19 11c0 5.65-7 10-7 10Z',
};

export const WELCOME: Record<TourAudience, WelcomeContent> = {
  support: {
    title: 'Welcome to V2',
    subtitle: 'Everything for your group, now in one place.',
    tiles: [
      { icon: ICON.group, title: 'My Group and Meeting Mode', body: 'Run your weekly meeting step by step, take attendance and flag concerns.' },
      { icon: ICON.megaphone, title: 'Mobilisation', body: 'Register people you meet and follow up the ones assigned to you.' },
      { icon: ICON.chat, title: 'Community', body: 'Share questions, ideas and updates with the whole team.' },
    ],
    homePath: '/support',
    homeTour: 'support:home',
  },
  admin: {
    title: 'Welcome to V2',
    subtitle: 'See how the cohort is really doing, and what needs you today.',
    tiles: [
      { icon: ICON.pulse, title: 'Cohort Health', body: 'Vital signs, trends and a list of what needs your attention.' },
      { icon: ICON.shield, title: 'Supports', body: 'Every support’s weekly records and onboarding in one view.' },
      { icon: ICON.sliders, title: 'Programme Rules', body: 'Set the agreed rules once in Settings. The app judges by them.' },
      { icon: ICON.phone, title: 'Participant App', body: 'Participants now sign in to follow their journey and reflect.' },
    ],
    homePath: '/dashboard',
    homeTour: 'admin:dashboard',
  },
  participant: {
    title: 'Welcome to Foundation of Faith',
    subtitle: 'Your space for the programme.',
    tiles: [
      { icon: ICON.path, title: 'Your Journey', body: 'Read each week’s recap and see how far you’ve come.' },
      { icon: ICON.pen, title: 'Private Reflections', body: 'Only you can read them. Your support only sees when you wrote.' },
      { icon: ICON.group, title: 'Your Group', body: 'Meeting times, the call link and your support’s contact.' },
      { icon: ICON.heart, title: 'Faith Project', body: 'The one thing you’re trusting God for, with your support alongside.' },
    ],
    homePath: '/me',
    homeTour: 'participant:home',
  },
};

const HELP_STEP: TourStep = {
  target: '[data-testid="tour-help"]',
  title: 'Help on every page',
  body: 'Tap ? on any page for a quick tour of that page. You can skip a tour at any time.',
};

export const PAGE_TOURS: Record<string, TourStep[]> = {
  // ── Support ───────────────────────────────────────────────────────────────
  'support:home': [
    { target: wt('home-metrics'), title: 'Your week at a glance', body: 'Which week the cohort is on, today’s activities, your next group meeting, faith projects and the next class. Tap any tile to jump in.' },
    { target: wt('home-attendance'), title: 'Mark attendance', body: 'One tap opens the shared Sunday attendance register.' },
    { target: wt('home-quick-links'), title: 'Shortcuts', body: 'Jump straight to your group call, resources, your tasks and Mobilisation.' },
    { target: wt('home-schedule'), title: 'Today’s activities', body: 'Your activities for today. Tap "Mark done" as you finish each one, or open the full week.' },
    { target: wt('home-checklist'), title: 'Weekly checklist', body: 'Tick off this week’s tasks as you go.', optional: true },
    { target: wt('app-nav'), title: 'Find your way around', body: 'Use the menu to move between pages. On your phone, the rest sits under More.' },
    HELP_STEP,
  ],
  'support:mobilisation': [
    { target: wt('mob-tabs'), title: 'Two jobs, one page', body: 'Registration is for signing up people you meet. Follow-ups lists the people assigned to you to contact.' },
    { target: wt('mob-link'), title: 'Share the sign-up link', body: 'Copy the registration link so people can sign themselves up.', optional: true },
    { target: wt('mob-register'), title: 'Register someone', body: 'Fill this in when you meet someone who wants to join the cohort.', optional: true },
    { target: wt('mob-more'), title: 'More options', body: 'Report an issue with a contact, or export your contacts.' },
  ],
  'support:schedule': [
    { target: wt('schedule-tabs'), title: 'Schedule and checklist', body: 'Schedule shows your activities and Checklist holds the tasks you want to remember this week.' },
    { target: wt('schedule-week'), title: 'Pick a week', body: 'Look back at a past week or ahead to the next one.', optional: true },
    { target: wt('schedule-view-modes'), title: 'Today, tomorrow or the full week', body: 'Choose how much of the schedule to see at once.', optional: true },
    { target: wt('activity-mark-done'), title: 'Mark activities done', body: 'Tap "Mark done" when you finish an activity. It saves straight away. Tap again to undo.', optional: true },
  ],
  'support:group': [
    { target: wt('group-tabs'), title: 'Your group workspace', body: 'Participants shows each person. Group meetings walks you through your weekly meeting in Meeting Mode. Attendance has its own place in the menu.' },
    { target: wt('group-call'), title: 'Your group call', body: 'Your group’s meeting link and time. Set or update them here.', optional: true },
    { target: '[data-wt="group-call"] + *', title: 'Each participant', body: 'See how each person is doing and read their faith project. If something is wrong, flag a concern and Operations is told straight away.', optional: true },
  ],
  'support:onboarding': [
    { target: wt('onb-tabs'), title: 'Onboard a support', body: 'As a coordinator, you can also help a new support get started from here.', optional: true },
    { target: wt('onb-steps'), title: 'Onboarding steps', body: 'Track your group’s onboarding. Each step shows how many people have done it.', optional: true },
    { target: wt('onb-people'), title: 'Your people', body: 'Tap a person to open ready-made message templates, then keep their stage up to date.', optional: true },
  ],
  'support:resources': [
    { target: wt('resources-hub'), title: 'Everything in one place', body: 'Links, files and guides shared with the support team. Open anything right here.' },
  ],
  'support:profile': [
    { target: wt('profile-groups'), title: 'Your account', body: 'Tap your photo to change it, and keep your details and group WhatsApp link up to date.' },
    { target: wt('profile-theme'), title: 'Make it yours', body: 'Pick an accent colour for the app.' },
    { target: wt('profile-notifications'), title: 'Reminder alerts', body: 'Choose the reminders you get, so you never miss an activity or group meeting.' },
  ],

  // ── Shared ────────────────────────────────────────────────────────────────
  community: [
    { target: wt('page-action'), title: 'Start a topic', body: 'Ask a question, share an idea or post an update for everyone.' },
    { target: wt('hub-tabs'), title: 'Open and closed', body: 'Open topics are still going. Closed ones are settled, but you can still read them.' },
    { target: wt('hub-topics'), title: 'Join in', body: 'Tap a topic to read the replies and add your own.', optional: true },
  ],

  // ── Admin ─────────────────────────────────────────────────────────────────
  'admin:dashboard': [
    { target: wt('dash-strip'), title: 'Your cohort at a glance', body: 'Which cohort you’re looking at and where it is in the programme.' },
    { target: wt('dash-vitals'), title: 'Vital signs', body: 'The key numbers for the cohort. Before it starts, this shows registrations instead.' },
    { target: wt('dash-attention'), title: 'What needs you', body: 'People, groups and supports that need action, most urgent first. Act on them from here.' },
    { target: wt('dash-trend'), title: 'Trends', body: 'How groups are doing week by week, so you can spot who is slipping.', optional: true },
    { target: wt('dash-ops'), title: 'Today’s operations', body: 'Today’s activities, pending approvals and the latest announcement.' },
    { target: wt('app-nav'), title: 'The back office', body: 'Everything else is grouped in the menu.' },
    HELP_STEP,
  ],
  'admin:participants': [
    { target: wt('page-action'), title: 'Add people', body: '+ Add a participant. The ⋮ menu lets you request profile information, import a list or export for WhatsApp.', optional: true },
    { target: wt('participants-filters'), title: 'Find anyone fast', body: 'Search by name or phone, and filter by group, status or support.', optional: true },
    { target: wt('participants-table'), title: 'Open a profile', body: 'Status tags show who needs attention. Tap a name to open their full profile.', optional: true },
  ],
  'admin:participant-profile': [
    { target: wt('pp-header'), title: 'Their profile', body: 'Their cohort, group and support. Record a check-in, move their journey stage or flag a concern from here.' },
    { target: wt('pp-app'), title: 'Participant app', body: 'Send them their login details and see what they have done in the app.' },
    { target: wt('pp-journey'), title: 'Journey', body: 'Worked out from their records. Manual moves show who made them and when.' },
    { target: wt('pp-concerns'), title: 'Concerns', body: 'Concerns raised about them. Participants never see these.' },
  ],
  'admin:supports': [
    { target: wt('supports-rules'), title: 'How supports are judged', body: 'The rules in one line, with a link to change them. Filter by Needs attention, Keep an eye on or On track.' },
    { target: wt('supports-list'), title: 'Each support', body: 'Their weekly records and onboarding progress at a glance.', optional: true },
  ],
  'admin:groups': [
    { target: wt('page-action'), title: 'Create and allocate', body: 'Create a new group, or use Allocate participants to place people into groups.', optional: true },
    { target: wt('groups-filters'), title: 'Filter groups', body: 'Show one support’s groups, groups with no support yet, or jump straight to a group.', optional: true },
    { target: wt('groups-grid'), title: 'Group cards', body: 'Each card is a group and its support. Open one to edit it.', optional: true },
  ],
  'admin:follow-ups': [
    { target: wt('page-action'), title: 'Add contacts', body: 'Add someone by hand. The ⋮ menu imports or exports contact lists.' },
    { target: wt('fu-link'), title: 'Registration link', body: 'Copy or open the sign-up link you share with interested people.', optional: true },
    { target: wt('fu-tabs'), title: 'Four views', body: 'Overview shows progress, Contacts is the full list, Message Bank holds the WhatsApp templates, and Issues collects problems reported by supports.' },
  ],
  'admin:schedule': [
    { target: wt('sched-week'), title: 'Pick a week', body: 'Choose which week of the programme to look at.' },
    { target: wt('sched-filters'), title: 'Filter by tag or support', body: 'See one activity tag’s or one support’s exact workload.', optional: true },
    { target: wt('sched-view'), title: 'The week’s activities', body: 'Each day’s activities. Edit them here; changes that need approval are marked.', optional: true },
  ],
  'admin:settings': [
    { target: wt('settings-notifications'), title: 'Reminder timings', body: 'When reminders go out to supports and participants.' },
    { target: wt('settings-contact'), title: 'Support contact', body: 'Who the floating "Need Support" button opens a WhatsApp chat with.' },
    { target: wt('settings-rules'), title: 'Programme rules', body: 'How participants and supports are judged. The dashboard and Supports page follow these.' },
    { target: wt('settings-departments'), title: 'Church departments', body: 'The departments participants can be handed on to.' },
    { target: wt('settings-ai'), title: 'AI help', body: 'End-of-FOF summaries (only for participants who opt in), recap drafts and feedback themes.' },
  ],
  'admin:faith-projects': [
    { target: wt('faith-status'), title: 'Filter by status', body: 'Tap a status to see only those projects. Tap it again to clear the filter.', optional: true },
    { target: wt('page-action'), title: 'Export', body: 'Download the faith projects to share or keep.', optional: true },
  ],
  'admin:announcements': [
    { target: wt('page-action'), title: 'Send an update', body: 'Write an announcement for supports, participants or everyone. You can also pin it to their Home for a while.' },
    { target: wt('announcements-history'), title: 'What’s been sent', body: 'Every announcement so far, newest first.' },
  ],
  'admin:resources': [
    { target: wt('resources-hub'), title: 'Share with the team', body: 'Add links and files for supports, and keep them organised.' },
  ],
  'admin:scriptures': [
    { target: wt('page-action'), title: 'Upload scriptures', body: 'Upload the daily images. A number in the file name picks the day; otherwise the next free day is used.' },
    { target: wt('scriptures-grid'), title: 'Every day’s image', body: 'Participants see one a day on their Home from 2:00 PM. Replace or remove any day.', optional: true },
  ],

  // ── Participant ───────────────────────────────────────────────────────────
  'participant:home': [
    { target: wt('ph-progress'), title: 'Your progress', body: 'Which week you’re on, with a shortcut to your group.' },
    { target: wt('ph-call'), title: 'Join your group call', body: 'When your group has a call link, join from here.', optional: true },
    { target: wt('ph-scripture'), title: 'Daily scripture', body: 'A new Inspirational Scripture every day from 2:00 PM.', optional: true },
    { target: wt('ph-week'), title: 'This week', body: 'What this week is about. Tap "See more" for the recap and your reflection.', optional: true },
    { target: wt('app-nav'), title: 'Your menu', body: 'My Group, My Journey and your Faith Project, plus Resources, Feedback and Profile.' },
    HELP_STEP,
  ],
  'participant:week': [
    { target: wt('pw-recap'), title: 'The recap', body: 'What the class covered, with something to think about.', optional: true },
    { target: wt('pw-reflection'), title: 'Your reflection', body: 'Only you can read what you write. Your support just sees when you wrote it.', optional: true },
  ],
  'participant:journey': [
    { target: wt('pj-summary'), title: 'Your journey so far', body: 'A quick count of how far you’ve come.' },
    { target: wt('pj-weeks'), title: 'Read it back', body: 'Tap any week you have reached to read it again.', optional: true },
  ],
  'participant:group': [
    { target: wt('pg-meeting'), title: 'Next meeting', body: 'When your group meets, the call link and a button to add it to your calendar.', optional: true },
    { target: wt('pg-members'), title: 'Group members', body: 'Your support and the people in your group.', optional: true },
    { target: wt('pg-help'), title: 'Need help?', body: 'Message your support if you have a question or can’t make it.', optional: true },
  ],
  'participant:faith': [
    { target: wt('pf-project'), title: 'Your faith project', body: 'One thing you are trusting God for across the programme. Be specific.' },
    { target: wt('pf-thread'), title: 'Feedback from your support', body: 'Your support can reply here to encourage you along the way.', optional: true },
  ],
  'participant:resources': [
    { target: wt('pr-guides'), title: 'General guides', body: 'Guides from the FOF team.' },
    { target: wt('pr-materials'), title: 'Class materials', body: 'Materials for each class.' },
  ],
  'participant:profile': [
    { target: wt('pp-card'), title: 'Your details', body: 'Change your photo and edit your details. Filling in what the team asked for completes your profile.' },
    { target: wt('pp-reminders'), title: 'Reminders', body: 'Choose when you’re reminded about your group meeting.' },
  ],
  'participant:feedback': [
    { target: wt('pfb-form'), title: 'Completely anonymous', body: 'Share how the programme is going. Nobody can see who wrote it.' },
  ],
};
