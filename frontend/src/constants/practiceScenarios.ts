import type { PracticeRole } from '../types';

export type PracticeSeat = PracticeRole | 'PARTICIPANT';

export interface PracticeScenario {
  key: string;
  title: string;
  hint: string;
  /** Where to go to do it. */
  to?: string;
}

export const PRACTICE_ROLE_LABEL: Record<PracticeSeat, string> = {
  SUPPORT: 'Support',
  HUB_LEAD: 'Hub Lead',
  ASSISTANT: 'Assistant Hub Lead',
  RECAP_LEAD: 'Recap Lead',
  PRAYER_LEAD: 'Prayer Lead',
  PARTICIPANT: 'Participant',
};

// What a support does with their own group. Assistants, Recap and Prayer Leads
// are supports first, so they start with these.
const SUPPORT_BASE: PracticeScenario[] = [
  { key: 'sup-intro', title: 'Post your introduction to your group', hint: 'In My Group, open the discussion and introduce yourself.', to: '/support/participants' },
  { key: 'sup-onboarding', title: 'Check how your participants are getting on', hint: 'Open Onboard and look at each person’s steps.', to: '/support/onboarding' },
  { key: 'sup-attendance', title: 'Start class attendance and mark everyone', hint: 'Open Attendance, start the register and mark each person.', to: '/support/attendance' },
  { key: 'sup-post', title: 'Post a message in the group discussion', hint: 'Say something to your group.', to: '/support/participants' },
  { key: 'sup-pin', title: 'Pin a message to the top', hint: 'Pin one of the posts so everyone sees it first.', to: '/support/participants' },
];

export const PRACTICE_SCENARIOS: Record<PracticeSeat, PracticeScenario[]> = {
  SUPPORT: [
    ...SUPPORT_BASE,
    { key: 'sup-hub', title: 'Open My Hub and find the hub meeting', hint: 'See who leads your hub and when it meets.', to: '/support/my-hub' },
  ],
  HUB_LEAD: [
    { key: 'hl-hub', title: 'Open My Hub and find your supports', hint: 'You lead the hub. See everyone and their roles.', to: '/support/my-hub' },
    { key: 'hl-group', title: 'Open a support’s group and read how the discussion is going', hint: 'Tap a support in My Hub, then look at Discussion this week.', to: '/support/my-hub' },
    { key: 'hl-people', title: 'Check a support’s profile and their participants', hint: 'On the group page, scroll to The support and Participants.', to: '/support/my-hub' },
    { key: 'hl-attendance', title: 'Take hub attendance', hint: 'In the Hub meeting tab, mark each support.', to: '/support/my-hub?tab=meeting' },
    { key: 'hl-meeting', title: 'Run the hub meeting through to Submit', hint: 'Go step by step: Attendance, Prayer, Recap, Announcements, Notes, Submit.', to: '/support/my-hub?tab=meeting' },
    { key: 'hl-leads', title: 'Find the Hub Leads meeting', hint: 'Open the Hub Leads tab in My Hub.', to: '/support/my-hub?tab=leads' },
    { key: 'hl-message', title: 'Send a message to your hub', hint: 'Use the Message tab.', to: '/support/my-hub?tab=message' },
  ],
  ASSISTANT: [
    ...SUPPORT_BASE,
    { key: 'as-attendance', title: 'Help take hub attendance', hint: 'In the Hub meeting tab, mark attendance if your Hub Lead allows it.', to: '/support/my-hub?tab=meeting' },
    { key: 'as-message', title: 'Message the hub', hint: 'Send a reminder to everyone in the hub.', to: '/support/my-hub?tab=message' },
  ],
  RECAP_LEAD: [
    ...SUPPORT_BASE,
    { key: 'rc-recap', title: 'Open the Review and Recap step and read the summary', hint: 'In the Hub meeting tab, open step 3.', to: '/support/my-hub?tab=meeting' },
    { key: 'rc-prompt', title: 'Read out the discussion prompt', hint: 'Lead the hub through the week’s prompt.', to: '/support/my-hub?tab=meeting' },
  ],
  PRAYER_LEAD: [
    ...SUPPORT_BASE,
    { key: 'pr-focus', title: 'Open the Prayer step and pick someone to pray for', hint: 'In the Hub meeting tab, open step 2 and choose a person.', to: '/support/my-hub?tab=meeting' },
    { key: 'pr-done', title: 'Finish the prayer step', hint: 'Move through the list and tap Finish prayer.', to: '/support/my-hub?tab=meeting' },
  ],
  PARTICIPANT: [
    { key: 'pt-signin', title: 'Sign in and choose your own password', hint: 'Use your phone number and the code you were given.' },
    { key: 'pt-guide', title: 'Read the Intro Class guide', hint: 'Open it from your home page.' },
    { key: 'pt-profile', title: 'Complete your profile', hint: 'Fill in your details.' },
    { key: 'pt-intro', title: 'Post your introduction to your group', hint: 'In your group discussion, say hello.' },
    { key: 'pt-ready', title: 'Confirm you are ready', hint: 'Tell your support you are set for the first class.' },
    { key: 'pt-class', title: 'Open this week’s class and see the attendance countdown', hint: 'Find this week’s class on your home page.' },
    { key: 'pt-reflect', title: 'Write this week’s reflection', hint: 'Save a short reflection and one thing you will do.' },
    { key: 'pt-discuss', title: 'Post and like something in the group discussion', hint: 'Take part in the conversation.' },
  ],
};
