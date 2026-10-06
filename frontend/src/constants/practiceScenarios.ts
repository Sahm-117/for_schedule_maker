import type { PracticeRole } from '../types';

export type PracticeSeat = PracticeRole | 'PARTICIPANT';

export interface PracticeScenario {
  key: string;
  title: string;
  hint: string;
  /** Where to go to do it. */
  to?: string;
  /** Ticks by itself when the person opens `to` (steps the data can't see). */
  visit?: boolean;
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
  { key: 'sup-onboarding', title: 'Check how your participants are getting on', hint: 'Open Onboard and look at each person’s steps.', to: '/support/onboarding', visit: true },
  { key: 'sup-attendance', title: 'Start class attendance and mark everyone', hint: 'Open Attendance, start the register and mark each person.', to: '/support/attendance' },
  { key: 'sup-post', title: 'Post a message in the group discussion', hint: 'Say something to your group.', to: '/support/participants' },
  { key: 'sup-pin', title: 'Pin a message to the top', hint: 'Pin one of the posts so everyone sees it first.', to: '/support/participants' },
];

export const PRACTICE_SCENARIOS: Record<PracticeSeat, PracticeScenario[]> = {
  SUPPORT: [
    ...SUPPORT_BASE,
    { key: 'sup-hub', title: 'Open My Hub and find the hub meeting', hint: 'See who leads your hub and when it meets.', to: '/support/my-hub', visit: true },
  ],
  HUB_LEAD: [
    { key: 'hl-hub', title: 'Open My Hub and find your supports', hint: 'You lead the hub. See everyone and their roles.', to: '/support/my-hub', visit: true },
    { key: 'hl-group', title: 'Open a support’s group and read how the discussion is going', hint: 'Tap a support in My Hub, then look at Discussion this week.', to: '/support/my-hub' },
    { key: 'hl-people', title: 'Check a support’s profile and their participants', hint: 'On the group page, scroll to The support and Participants.', to: '/support/my-hub' },
    { key: 'hl-attendance', title: 'Take hub attendance', hint: 'In the Hub meeting tab, mark each support.', to: '/support/my-hub?tab=meeting' },
    { key: 'hl-meeting', title: 'Run the hub meeting through to Submit', hint: 'Go step by step: Attendance, Prayer, Recap, Announcements, Notes, Submit.', to: '/support/my-hub?tab=meeting' },
    { key: 'hl-leads', title: 'Find the Hub Leads meeting', hint: 'Open the Hub Leads tab in My Hub.', to: '/support/my-hub?tab=leads', visit: true },
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
    { key: 'rc-prompt', title: 'Read out the discussion prompt', hint: 'Open the Review and Recap step and tap the prompt once you have read it out.', to: '/support/my-hub?tab=meeting' },
  ],
  PRAYER_LEAD: [
    ...SUPPORT_BASE,
    { key: 'pr-focus', title: 'Open the Prayer step and pick someone to pray for', hint: 'In the Hub meeting tab, open step 2 and choose a person.', to: '/support/my-hub?tab=meeting' },
    { key: 'pr-done', title: 'Finish the prayer step', hint: 'Move through the list and tap Finish prayer.', to: '/support/my-hub?tab=meeting' },
  ],
  PARTICIPANT: [
    { key: 'pt-signin', title: 'Sign in and choose your own password', hint: 'Use your phone number and the code you were given.' },
    { key: 'pt-guide', title: 'Read the Intro Class guide', hint: 'Open it from your home page.', to: '/me', visit: true },
    { key: 'pt-profile', title: 'Complete your profile', hint: 'Fill in your details.', to: '/me/profile' },
    { key: 'pt-intro', title: 'Post your introduction to your group', hint: 'In your group discussion, say hello.', to: '/me/group' },
    { key: 'pt-ready', title: 'Confirm you are ready', hint: 'Tell your support you are set for the first class.', to: '/me?ready=1' },
    { key: 'pt-class', title: 'Open this week’s class and see the attendance countdown', hint: 'Find this week’s class on your home page.', to: '/me/week/1', visit: true },
    { key: 'pt-reflect', title: 'Write this week’s reflection', hint: 'Save a short reflection and one thing you will do.', to: '/me/week/1?reflect=1' },
    { key: 'pt-discuss', title: 'Post and like something in the group discussion', hint: 'Take part in the conversation.', to: '/me/group' },
  ],
};

// Walkthrough steps: what each person does while paired with someone in the
// opposite seat. Keys are by seat (peer-<SEAT>-<n>) so each person's ticks show
// on their partner's list.
const HUB_JOB_STEP: Partial<Record<PracticeSeat, PracticeScenario>> = {
  ASSISTANT: { key: 'peer-ASSISTANT-2', title: 'Take hub attendance for the hub', hint: 'In the Hub meeting tab, mark each support.', to: '/support/my-hub?tab=meeting' },
  RECAP_LEAD: { key: 'peer-RECAP_LEAD-2', title: 'Open the Review and Recap step and read it out', hint: 'In the Hub meeting tab, open step 3.', to: '/support/my-hub?tab=meeting', visit: true },
  PRAYER_LEAD: { key: 'peer-PRAYER_LEAD-2', title: 'Open the Prayer step and pick someone to pray for', hint: 'In the Hub meeting tab, open step 2.', to: '/support/my-hub?tab=meeting' },
  SUPPORT: { key: 'peer-SUPPORT-hub', title: 'Open My Hub and read the message', hint: 'It arrives in My Hub, Messages.', to: '/support/my-hub' },
};

export const peerSteps = (role: PracticeSeat, other: PracticeSeat): PracticeScenario[] => {
  if (role === 'PARTICIPANT') {
    return [
      { key: 'peer-PARTICIPANT-1', title: 'Open this week and read it', hint: 'From Home, open the current week.', to: '/me/week/1', visit: true },
      { key: 'peer-PARTICIPANT-2', title: 'Post in your group discussion', hint: 'Say something your support can reply to.', to: '/me/group' },
      { key: 'peer-PARTICIPANT-3', title: 'Find the message your support pinned', hint: 'Pinned messages sit at the top of the discussion.', to: '/me/group', visit: true },
    ];
  }
  if (other === 'PARTICIPANT') {
    return [
      { key: 'peer-SUPPORT-1', title: 'Read your participant’s post and reply', hint: 'Open the group discussion in My Group.', to: '/support/participants' },
      { key: 'peer-SUPPORT-2', title: 'Pin a message for your group', hint: 'Pin one post so it sits at the top.', to: '/support/participants' },
      { key: 'peer-SUPPORT-3', title: 'Mark them present in attendance', hint: 'Start the register and mark your participant.', to: '/support/attendance' },
    ];
  }
  if (role === 'HUB_LEAD') {
    const partnerJob = HUB_JOB_STEP[other];
    return [
      { key: 'peer-HUB_LEAD-1', title: 'Send a message to your hub', hint: 'Use the Message tab in My Hub.', to: '/support/my-hub?tab=message' },
      { key: 'peer-HUB_LEAD-2', title: partnerJob ? 'Open the hub meeting and watch your partner’s step arrive' : 'Open the hub meeting', hint: 'In the Hub meeting tab.', to: '/support/my-hub?tab=meeting', visit: true },
      { key: 'peer-HUB_LEAD-3', title: 'Run the meeting through to Submit', hint: 'Attendance, Prayer, Recap, Announcements, Notes, Submit.', to: '/support/my-hub?tab=meeting' },
    ];
  }
  const own = HUB_JOB_STEP[role];
  const first: PracticeScenario = { key: `peer-${role}-1`, title: 'Open My Hub and find your Hub Lead', hint: 'You and your partner are in the same hub.', to: '/support/my-hub', visit: true };
  return own && own.key !== `peer-${role}-1` ? [first, own] : [first];
};
