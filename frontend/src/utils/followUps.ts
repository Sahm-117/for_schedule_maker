import type {
  User,
  FollowUpContact,
  FollowUpMessageStatus,
  FollowUpReplyStatus,
  FollowUpCallStatus,
  FollowUpRegistrationStatus,
  FollowUpNextAction,
  FollowUpStatus,
  IssueStatus,
} from '../types';

type StatusMeta = { label: string; tone: string; description?: string };

const pill = (tone: string) => tone;

export const MESSAGE_STATUS_META: Record<FollowUpMessageStatus, StatusMeta> = {
  NOT_SENT: { label: 'Not Sent', tone: pill('bg-slate-100 text-slate-600') },
  SENT: { label: 'Sent', tone: pill('bg-emerald-100/80 text-emerald-700') },
};

export const REPLY_STATUS_META: Record<FollowUpReplyStatus, StatusMeta> = {
  NO_REPLY: { label: 'No Reply', tone: 'bg-slate-100 text-slate-600' },
  REPLIED: { label: 'Replied', tone: 'bg-emerald-100/80 text-emerald-700' },
  NEEDS_REMINDER: { label: 'Needs Reminder', tone: 'bg-amber-100/80 text-amber-700' },
  INCORRECT_NUMBER: { label: 'Wrong Number', tone: 'bg-rose-100/80 text-rose-700' },
};

export const CALL_STATUS_META: Record<FollowUpCallStatus, StatusMeta> = {
  NOT_CALLED: { label: 'Not Called', tone: 'bg-slate-100 text-slate-600' },
  CALLED: { label: 'Called', tone: 'bg-emerald-100/80 text-emerald-700' },
  MISSED_CALL: { label: 'Missed Call', tone: 'bg-rose-100/80 text-rose-700' },
  CALL_BACK_LATER: { label: 'Call Back Later', tone: 'bg-amber-100/80 text-amber-700' },
  NOT_APPLICABLE: { label: 'Not Applicable', tone: 'bg-neutral-100 text-neutral-600' },
  INCORRECT_NUMBER: { label: 'Wrong Number', tone: 'bg-rose-100/80 text-rose-700' },
};

export const REGISTRATION_STATUS_META: Record<FollowUpRegistrationStatus, StatusMeta> = {
  NOT_REGISTERED: { label: 'Not Registered', tone: 'bg-slate-100 text-slate-600' },
  NOT_INTERESTED: { label: 'Not Interested', tone: 'bg-rose-100/80 text-rose-700' },
  NOT_A_GOOD_TIME: { label: 'Not a Good Time', tone: 'bg-rose-100/80 text-rose-700' },
  NOT_A_TCN_MEMBER: { label: 'Not a TCN Member', tone: 'bg-rose-100/80 text-rose-700' },
  PENDING_CONFIRMATION: { label: 'Pending Confirmation', tone: 'bg-amber-100/80 text-amber-700' },
  REGISTERED: { label: 'Registered', tone: 'bg-emerald-100/80 text-emerald-700' },
  STILL_THINKING: { label: 'Still Thinking', tone: 'bg-violet-100/80 text-violet-700' },
  NO_RESPONSE: { label: 'No Response', tone: 'bg-neutral-100 text-neutral-600' },
  NEXT_COHORT: { label: 'Will Join Next Cohort', tone: 'bg-sky-100/80 text-sky-700' },
  LOGIN_SHARED: { label: 'Login Shared', tone: 'bg-sky-100/80 text-sky-700' },
  LOGIN_ISSUE: { label: 'Login Issue', tone: 'bg-orange-100/80 text-orange-700' },
  ACCESS_CONFIRMED: { label: 'Access Confirmed', tone: 'bg-emerald-100/80 text-emerald-700' },
  ATTENDED: { label: 'Attended', tone: 'bg-teal-100/80 text-teal-700' },
};

export const NEXT_ACTION_META: Record<FollowUpNextAction, StatusMeta> = {
  SEND_MESSAGE: { label: 'Send Message', tone: 'bg-sky-100/80 text-sky-700' },
  SEND_REMINDER: { label: 'Send Reminder', tone: 'bg-amber-100/80 text-amber-700' },
  CALL: { label: 'Call', tone: 'bg-violet-100/80 text-violet-700' },
  CLOSE: { label: 'Close', tone: 'bg-slate-100 text-slate-600' },
};

export const ISSUE_STATUS_META: Record<IssueStatus, StatusMeta> = {
  OPEN: { label: 'Open', tone: 'bg-amber-100/80 text-amber-700' },
  RESOLVED: { label: 'Resolved', tone: 'bg-emerald-100/80 text-emerald-700' },
};

export const FOLLOW_UP_STATUS_META: Record<FollowUpStatus, StatusMeta> = {
  TO_CONTACT: { label: 'To contact', description: 'Not contacted yet — send them a message or give them a call.', tone: 'bg-slate-100 text-slate-600' },
  WAITING: { label: 'Waiting', description: 'Message sent, waiting for a reply.', tone: 'bg-amber-100/80 text-amber-700' },
  NEEDS_REMINDER: { label: 'Needs reminder', description: 'They did not reply — send a gentle reminder.', tone: 'bg-amber-100/80 text-amber-700' },
  REPLIED: { label: 'Replied', description: 'They replied. Still working on getting them registered.', tone: 'bg-emerald-100/80 text-emerald-700' },
  CALL_BACK_LATER: { label: 'Call back later', description: 'They asked you to call another time.', tone: 'bg-violet-100/80 text-violet-700' },
  REGISTERED: { label: 'Registered', description: 'They signed up. Still to hand them their app login.', tone: 'bg-emerald-100/80 text-emerald-700' },
  LOGIN_SHARED: { label: 'Login shared', description: 'Login sent. Waiting for them to sign in.', tone: 'bg-sky-100/80 text-sky-700' },
  LOGIN_ISSUE: { label: 'Issue with login', description: 'They cannot get into the app. The admin and IT team are told.', tone: 'bg-orange-100/80 text-orange-700' },
  ACCESS_CONFIRMED: { label: 'Participant confirmed access', description: 'They signed in to the app. All done.', tone: 'bg-emerald-100/80 text-emerald-700' },
  WRONG_NUMBER: { label: 'Wrong number', description: 'The number does not work.', tone: 'bg-rose-100/80 text-rose-700' },
  NOT_INTERESTED: { label: 'Not interested', description: 'They said no, not available, or not a TCN member.', tone: 'bg-rose-100/80 text-rose-700' },
  NO_RESPONSE: { label: 'No response', description: 'They did not reply after multiple follow-ups.', tone: 'bg-neutral-100 text-neutral-600' },
  NEXT_COHORT: { label: 'Will join next cohort', description: 'They are interested but will join the next cohort.', tone: 'bg-sky-100/80 text-sky-700' },
  ATTENDED: { label: 'Attended', description: 'From a prior cohort and already attended one. Filed under that cohort.', tone: 'bg-teal-100/80 text-teal-700' },
};

export const statusOptions = <T extends string>(meta: Record<T, StatusMeta>) =>
  (Object.keys(meta) as T[]).map((value) => ({ value, label: meta[value].label }));

// Dropdown order and headings, so supports can see which statuses still count as
// open (see isClosedContact) and which close the follow-up.
const FOLLOW_UP_STATUS_GROUPS: Array<{ group: string; statuses: FollowUpStatus[] }> = [
  { group: 'Still open', statuses: ['TO_CONTACT', 'WAITING', 'NEEDS_REMINDER', 'REPLIED', 'CALL_BACK_LATER', 'REGISTERED', 'LOGIN_SHARED', 'LOGIN_ISSUE'] },
  { group: 'Moved to next cohort', statuses: ['NEXT_COHORT'] },
  { group: 'Closed', statuses: ['ACCESS_CONFIRMED', 'WRONG_NUMBER', 'NOT_INTERESTED', 'NO_RESPONSE'] },
];

export const followUpStatusOptions = FOLLOW_UP_STATUS_GROUPS.flatMap(({ group, statuses }) =>
  statuses.map((value) => ({
    value,
    label: FOLLOW_UP_STATUS_META[value].label,
    meta: FOLLOW_UP_STATUS_META[value].description,
    group,
  }))
);

/** Where a signed-up contact can be, from registering to getting into the app. */
export const AFTER_SIGN_UP_STATUSES: FollowUpStatus[] = ['REGISTERED', 'LOGIN_SHARED', 'LOGIN_ISSUE', 'ACCESS_CONFIRMED'];

// Once someone has signed up, a support only moves them forward: their login,
// whether it worked, or the next cohort. Admins keep the full list.
const SUPPORT_AFTER_SIGN_UP_OPTIONS: FollowUpStatus[] = ['LOGIN_SHARED', 'ACCESS_CONFIRMED', 'LOGIN_ISSUE', 'NEXT_COHORT'];

/**
 * The support's "Where do they stand?" options. Before sign-up it is the usual
 * list, without the two steps that only make sense once a login exists; after
 * sign-up only the steps forward, with Registered kept while it is the current
 * value so the select can show it.
 */
export const supportStatusOptions = (current: FollowUpStatus) => {
  if (!AFTER_SIGN_UP_STATUSES.includes(current)) {
    return followUpStatusOptions.filter((option) => option.value !== 'LOGIN_ISSUE' && option.value !== 'ACCESS_CONFIRMED');
  }
  const values: FollowUpStatus[] = current === 'REGISTERED' ? ['REGISTERED', ...SUPPORT_AFTER_SIGN_UP_OPTIONS] : SUPPORT_AFTER_SIGN_UP_OPTIONS;
  return values.map((value) => ({ value, label: FOLLOW_UP_STATUS_META[value].label, meta: FOLLOW_UP_STATUS_META[value].description }));
};

/**
 * Follow-ups that were finished and filed away before the participant app
 * existed. They sit at REGISTERED with no login to hand over, because there was
 * no app to let anyone into. Counting them as "login to share" would park the
 * whole historical backlog on the dashboard as work that nobody will ever do,
 * so they are read as finished. Nothing about them is changed or rewritten.
 */
export const isPreAppRegistered = (c: FollowUpContact): boolean =>
  !!c.archivedAt && c.registrationStatus === 'REGISTERED';

/**
 * Login shared used to close a follow-up. Past cohorts' ones were left filed
 * away when it stopped closing (20260928180000_followup_access_confirmed.sql),
 * so, like isPreAppRegistered, they are read as finished rather than as work
 * still to do.
 */
export const isFiledLoginShared = (c: FollowUpContact): boolean =>
  !!c.archivedAt && c.registrationStatus === 'LOGIN_SHARED';

export const computeFollowUpStatus = (c: FollowUpContact): FollowUpStatus => {
  if (c.registrationStatus === 'ACCESS_CONFIRMED') return 'ACCESS_CONFIRMED';
  if (c.registrationStatus === 'ATTENDED') return 'ATTENDED';
  if (c.registrationStatus === 'LOGIN_ISSUE') return 'LOGIN_ISSUE';
  if (c.registrationStatus === 'LOGIN_SHARED') return 'LOGIN_SHARED';
  if (c.registrationStatus === 'REGISTERED') return 'REGISTERED';
  if (c.registrationStatus === 'NEXT_COHORT') return 'NEXT_COHORT';
  if (c.registrationStatus === 'NOT_INTERESTED' || c.registrationStatus === 'NOT_A_GOOD_TIME' || c.registrationStatus === 'NOT_A_TCN_MEMBER') return 'NOT_INTERESTED';
  if (c.registrationStatus === 'NO_RESPONSE') return 'NO_RESPONSE';
  if (c.replyStatus === 'INCORRECT_NUMBER' || c.callStatus === 'INCORRECT_NUMBER') return 'WRONG_NUMBER';
  if (c.callStatus === 'CALL_BACK_LATER') return 'CALL_BACK_LATER';
  if (c.replyStatus === 'NEEDS_REMINDER') return 'NEEDS_REMINDER';
  if (c.replyStatus === 'REPLIED') return 'REPLIED';
  if (c.messageStatus === 'SENT') return 'WAITING';
  return 'TO_CONTACT';
};

/**
 * Registering is not the end of a follow-up, and neither is sending the login —
 * the prospect still has to get into the app. Only 'ACCESS_CONFIRMED' closes a
 * successful one (set by hand, or automatically when they choose a password).
 */
export const isClosedContact = (c: FollowUpContact): boolean => {
  const status = computeFollowUpStatus(c);
  return status === 'ACCESS_CONFIRMED' || status === 'ATTENDED' || status === 'WRONG_NUMBER' || status === 'NOT_INTERESTED' || status === 'NO_RESPONSE';
};

/** Unassigned and still open, i.e. what run_followup_assignment would hand out. */
export const isWaitingForAssignment = (c: FollowUpContact): boolean =>
  !c.ownerId && !c.isTest && !c.archivedAt && !isClosedContact(c) && c.registrationStatus !== 'NEXT_COHORT';

/**
 * Open (not closed, not archived) follow-ups each support holds in the given
 * cohort — what the load ring counts. Past cohorts' contacts don't add to the load.
 */
export const openLoadByOwner = (contacts: FollowUpContact[], cohortId: string | null | undefined): Map<string, number> => {
  const map = new Map<string, number>();
  if (!cohortId) return map;
  for (const c of contacts) {
    if (!c.ownerId || c.isTest || c.archivedAt || isClosedContact(c) || !contactInCohortScope(c, cohortId, cohortId)) continue;
    map.set(c.ownerId, (map.get(c.ownerId) ?? 0) + 1);
  }
  return map;
};

export interface UnassignedFollowUpTag {
  label: string;
  tone: string;
}

/**
 * Why an unassigned contact is still waiting, for the Contacts page tag only.
 * Mirrors the eligibility check inside run_followup_assignment (supabase/
 * migrations/20260928160000_followup_auto_assignment.sql) -- same gender,
 * same-cohort open load under the limit -- but isn't itself authoritative:
 * the actual assignment only runs 2 hours after they were added, or via
 * "Assign now", server-side.
 */
export const unassignedFollowUpTag = (
  contact: FollowUpContact,
  owners: User[],
  ownerLoad: Map<string, number> | undefined,
  maxLoad: number | undefined,
): UnassignedFollowUpTag | null => {
  // Attended people were filed away, and test contacts are never handed out,
  // so neither is waiting for anyone.
  if (contact.ownerId || contact.isTest || contact.registrationStatus === 'ATTENDED') return null;
  if (contact.gender !== 'Male' && contact.gender !== 'Female') {
    return { label: 'Gender not known', tone: 'bg-neutral-100 text-neutral-600' };
  }
  const limit = maxLoad ?? Infinity;
  // Test accounts never get auto-assigned, so they don't count as room.
  const hasRoom = owners.some((o) => !o.isTest && o.gender === contact.gender && (ownerLoad?.get(o.id) ?? 0) < limit);
  if (!hasRoom) return { label: 'No same gender to follow up', tone: 'bg-orange-100/80 text-orange-700' };
  return { label: 'Waiting to be assigned', tone: 'bg-amber-100/80 text-amber-700' };
};

export interface GenderCapacityOutlook {
  gender: 'Male' | 'Female';
  waiting: number;
  spare: number;
  shortfall: number;
  /** Smallest new limit that would make spare cover waiting (null if raising the limit alone can never work, e.g. no same-gender supports at all). */
  limitNeeded: number | null;
  /** How many more same-gender supports (at the current limit) would close the gap. */
  supportsNeeded: number;
}

/**
 * Waiting same-gender contacts vs spare same-gender capacity, for the
 * Contacts page's capacity outlook cards.
 */
export const genderCapacityOutlook = (
  gender: 'Male' | 'Female',
  waitingContacts: FollowUpContact[],
  owners: User[],
  ownerLoad: Map<string, number> | undefined,
  maxLoad: number,
): GenderCapacityOutlook => {
  const waiting = waitingContacts.filter((c) => !c.ownerId && !c.isTest && c.gender === gender).length;
  const sameGenderOwners = owners.filter((o) => !o.isTest && o.gender === gender);
  const loads = sameGenderOwners.map((o) => ownerLoad?.get(o.id) ?? 0);
  const spare = loads.reduce((sum, load) => sum + Math.max(0, maxLoad - load), 0);
  const shortfall = Math.max(0, waiting - spare);

  let limitNeeded: number | null = null;
  if (shortfall > 0 && sameGenderOwners.length > 0) {
    for (let n = maxLoad + 1; n <= maxLoad + 200; n++) {
      const spareAtN = loads.reduce((sum, load) => sum + Math.max(0, n - load), 0);
      if (spareAtN >= waiting) { limitNeeded = n; break; }
    }
  }
  const supportsNeeded = shortfall > 0 ? Math.ceil(shortfall / maxLoad) : 0;

  return { gender, waiting, spare, shortfall, limitNeeded, supportsNeeded };
};

export const isClosedRegistrationStatus = (status: FollowUpRegistrationStatus): boolean =>
  status === 'ACCESS_CONFIRMED' || status === 'ATTENDED' || status === 'NOT_INTERESTED' || status === 'NOT_A_TCN_MEMBER' || status === 'NOT_A_GOOD_TIME' || status === 'NO_RESPONSE';

/**
 * Whether a contact belongs to `cohortId` for filtering purposes. Contacts
 * with no cohort at all (cohortId null) are treated as belonging to whichever
 * cohort is currently active, so they always surface alongside it instead of
 * being orphaned behind a past-cohort filter.
 */
export const contactInCohortScope = (
  contact: FollowUpContact,
  cohortId: string,
  activeCohortId?: string | null,
): boolean => {
  if (contact.cohortId === cohortId) return true;
  if (!contact.cohortId && !!cohortId && cohortId === activeCohortId) return true;
  return false;
};

export interface FollowUpMetrics {
  toContact: number;
  waiting: number;
  needsReminder: number;
  replied: number;
  callBackLater: number;
  registered: number;
  /** Has their login: shared, having trouble, or confirmed in the app. */
  loginShared: number;
  /** Signed in to the app, so the follow-up is done. */
  accessConfirmed: number;
  wrongNumber: number;
  notInterested: number;
  total: number;
  contacted: number;
  notContacted: number;
  noResponse: number;
  closed: number;
}

export const computeFollowUpMetrics = (contacts: FollowUpContact[]): FollowUpMetrics => {
  const m: FollowUpMetrics = { toContact: 0, waiting: 0, needsReminder: 0, replied: 0, callBackLater: 0, registered: 0, loginShared: 0, accessConfirmed: 0, wrongNumber: 0, notInterested: 0, total: 0, contacted: 0, notContacted: 0, noResponse: 0, closed: 0 };
  for (const c of contacts) {
    m.total++;
    const status = computeFollowUpStatus(c);
    if (status === 'TO_CONTACT') { m.toContact++; m.notContacted++; }
    else if (status === 'WAITING') { m.waiting++; m.noResponse++; }
    else if (status === 'NEEDS_REMINDER') { m.needsReminder++; m.noResponse++; }
    else if (status === 'REPLIED') { m.replied++; m.contacted++; }
    else if (status === 'CALL_BACK_LATER') { m.callBackLater++; m.contacted++; }
    else if (status === 'REGISTERED') {
      m.contacted++;
      if (isPreAppRegistered(c)) { m.loginShared++; m.closed++; } else { m.registered++; }
    }
    else if (status === 'LOGIN_SHARED' || status === 'LOGIN_ISSUE') {
      m.loginShared++; m.contacted++;
      if (isFiledLoginShared(c)) m.closed++;
    }
    else if (status === 'ACCESS_CONFIRMED') { m.loginShared++; m.accessConfirmed++; m.contacted++; m.closed++; }
    else if (status === 'ATTENDED') { m.contacted++; m.closed++; }
    else if (status === 'WRONG_NUMBER') { m.wrongNumber++; m.contacted++; m.closed++; }
    else if (status === 'NOT_INTERESTED') { m.notInterested++; m.contacted++; m.closed++; }
    else if (status === 'NO_RESPONSE') { m.closed++; }
    else if (status === 'NEXT_COHORT') { /* parked — not counted as closed or active */ }
  }
  return m;
};

export interface OwnerBreakdownRow {
  ownerId: string | null;
  ownerName: string;
  assigned: number;
  toContact: number;
  waiting: number;
  needsReminder: number;
  replied: number;
  callBackLater: number;
  registered: number;
  /** Has their login: shared, having trouble, or confirmed in the app. */
  loginShared: number;
  /** Signed in to the app, so the follow-up is done. */
  accessConfirmed: number;
  /** Login sent (or not working) and still open, waiting for them to get in. */
  awaitingAccess: number;
  /** Signed up but still waiting for their app login. */
  loginToShare: number;
  /** Everyone who signed up, whether or not they have their login yet. */
  signedUp: number;
  nextCohort: number;
  wrongNumber: number;
  notInterested: number;
  noResponse: number;
  uncontacted: number;
  contacted: number;
  stillOpen: number;
  notAGoodTime: number;
  notATcnMember: number;
  /** Closed without registering. Its reasons are listed biggest first. */
  stopped: number;
  stoppedReasons: Array<{ label: string; value: number }>;
}

export const computeOwnerBreakdown = (contacts: FollowUpContact[]): OwnerBreakdownRow[] => {
  const map = new Map<string, OwnerBreakdownRow>();
  const reasonsByOwner = new Map<string, string[]>();
  for (const c of contacts) {
    const key = c.ownerId || 'unassigned';
    let row = map.get(key);
    if (!row) {
      row = {
        ownerId: c.ownerId || null,
        ownerName: c.ownerName || (c.ownerId ? 'Unknown' : 'Unassigned'),
        assigned: 0, toContact: 0, waiting: 0, needsReminder: 0, replied: 0, callBackLater: 0, registered: 0, loginShared: 0, accessConfirmed: 0, awaitingAccess: 0, loginToShare: 0, signedUp: 0, nextCohort: 0, wrongNumber: 0, notInterested: 0, noResponse: 0,
        uncontacted: 0, contacted: 0, stillOpen: 0, notAGoodTime: 0, notATcnMember: 0,
        stopped: 0, stoppedReasons: [],
      };
      map.set(key, row);
    }
    // A wrong number isn't a real contact, so it doesn't add to the support's
    // total; it still shows under Dropped so it's clear what happened.
    // Attended people came from a prior cohort and were only filed away, so
    // they aren't follow-up work for the support either.
    if (computeFollowUpStatus(c) !== 'WRONG_NUMBER' && computeFollowUpStatus(c) !== 'ATTENDED') row.assigned++;
    const reason = stoppedReason(c);
    if (reason) reasonsByOwner.set(key, [...(reasonsByOwner.get(key) ?? []), reason]);
    if (c.registrationStatus === 'NOT_A_GOOD_TIME') row.notAGoodTime++;
    if (c.registrationStatus === 'NOT_A_TCN_MEMBER') row.notATcnMember++;
    const status = computeFollowUpStatus(c);
    switch (status) {
      case 'TO_CONTACT': row.toContact++; break;
      case 'WAITING': row.waiting++; break;
      case 'NEEDS_REMINDER': row.needsReminder++; break;
      case 'REPLIED': row.replied++; break;
      case 'CALL_BACK_LATER': row.callBackLater++; break;
      case 'REGISTERED': if (isPreAppRegistered(c)) row.loginShared++; else row.registered++; break;
      case 'LOGIN_SHARED':
      case 'LOGIN_ISSUE':
        row.loginShared++;
        if (!c.archivedAt) row.awaitingAccess++;
        break;
      case 'ACCESS_CONFIRMED': row.loginShared++; row.accessConfirmed++; break;
      case 'WRONG_NUMBER': row.wrongNumber++; break;
      case 'NOT_INTERESTED': row.notInterested++; break;
      case 'NO_RESPONSE': row.noResponse++; break;
      case 'NEXT_COHORT': row.nextCohort++; break;
      case 'ATTENDED': break;
    }
  }
  for (const [key, row] of map) {
    row.stopped = row.wrongNumber + row.notInterested + row.noResponse;
    row.stoppedReasons = countReasons(reasonsByOwner.get(key) ?? []);
    row.uncontacted = row.toContact;
    row.contacted = row.replied + row.callBackLater + row.registered + row.loginShared + row.wrongNumber + row.notInterested;
    // stillOpen = active (non-archived, non-closed) contacts only
    row.stillOpen = row.toContact + row.waiting + row.needsReminder + row.replied + row.callBackLater;
    // Signed up, but nobody has handed them their app login yet.
    row.loginToShare = row.registered;
    row.signedUp = row.registered + row.loginShared;
  }
  // Busiest first: chasing still to do, plus logins still to hand over or
  // waiting for them to get in.
  return Array.from(map.values()).sort((a, b) => (b.stillOpen + b.loginToShare + b.awaitingAccess) - (a.stillOpen + a.loginToShare + a.awaitingAccess));
};

/**
 * Who brought each prospect in, as opposed to who is chasing them. A support
 * records someone under "Met someone" and that writes `registeredById` — it says
 * nothing about whether the person has registered. The back office needs this to
 * see how many people each support is actually meeting.
 *
 * Prospects who arrived on their own (the registration form, an import) have no
 * introducer and are left out entirely rather than bundled under "Unassigned":
 * nobody met them, so counting them against anyone would be wrong.
 */
export interface IntroducerRow {
  supportId: string;
  supportName: string;
  /** People this support recorded having met. */
  met: number;
  /** How many of them went on to sign up. */
  signedUp: number;
  /** How many of them have their app login. */
  loginShared: number;
  /** Still being worked — neither signed up nor written off. */
  stillOpen: number;
}

export const computeIntroducerBreakdown = (contacts: FollowUpContact[]): IntroducerRow[] => {
  const map = new Map<string, IntroducerRow>();
  for (const c of contacts) {
    if (!c.registeredById) continue;
    let row = map.get(c.registeredById);
    if (!row) {
      row = { supportId: c.registeredById, supportName: c.registeredByName || 'Unknown', met: 0, signedUp: 0, loginShared: 0, stillOpen: 0 };
      map.set(c.registeredById, row);
    }
    row.met++;
    const status = computeFollowUpStatus(c);
    if (AFTER_SIGN_UP_STATUSES.includes(status)) row.signedUp++;
    if (status === 'LOGIN_SHARED' || status === 'LOGIN_ISSUE' || status === 'ACCESS_CONFIRMED' || isPreAppRegistered(c)) row.loginShared++;
    if (FOLLOW_UP_STAGE[status] === 'open') row.stillOpen++;
  }
  return Array.from(map.values()).sort((a, b) => b.met - a.met || a.supportName.localeCompare(b.supportName));
};

export const buildStatusPatch = (status: FollowUpStatus, subReason?: string): Record<string, unknown> => {
  const now = new Date().toISOString();
  const base = { archivedAt: null, messageStatus: 'NOT_SENT', replyStatus: 'NO_REPLY', callStatus: 'NOT_CALLED', registrationStatus: 'NOT_REGISTERED', nextAction: 'SEND_MESSAGE' as string } as Record<string, unknown>;

  switch (status) {
    case 'TO_CONTACT':
      break;
    case 'WAITING':
      base.messageStatus = 'SENT';
      base.replyStatus = 'NO_REPLY';
      base.nextAction = 'SEND_REMINDER';
      break;
    case 'NEEDS_REMINDER':
      base.messageStatus = 'SENT';
      base.replyStatus = 'NEEDS_REMINDER';
      base.nextAction = 'SEND_REMINDER';
      break;
    case 'REPLIED':
      base.messageStatus = 'SENT';
      base.replyStatus = 'REPLIED';
      base.nextAction = 'SEND_MESSAGE';
      break;
    case 'CALL_BACK_LATER':
      base.callStatus = 'CALL_BACK_LATER';
      base.nextAction = 'CALL';
      break;
    case 'REGISTERED':
      // Signing up does not end the follow-up: their app login is still owed,
      // so the contact stays active until they get into the app (ACCESS_CONFIRMED).
      base.replyStatus = 'REPLIED';
      base.registrationStatus = 'REGISTERED';
      base.nextAction = 'SEND_MESSAGE';
      break;
    case 'LOGIN_SHARED':
      // Login sent, but it stays open until they actually sign in.
      base.replyStatus = 'REPLIED';
      base.registrationStatus = 'LOGIN_SHARED';
      base.nextAction = 'SEND_MESSAGE';
      break;
    case 'LOGIN_ISSUE':
      base.replyStatus = 'REPLIED';
      base.registrationStatus = 'LOGIN_ISSUE';
      base.nextAction = 'SEND_MESSAGE';
      break;
    case 'ACCESS_CONFIRMED':
      // The same close columns the ParticipantAccount trigger in
      // 20260928180000_followup_access_confirmed.sql sets when they choose a password.
      base.replyStatus = 'REPLIED';
      base.registrationStatus = 'ACCESS_CONFIRMED';
      base.nextAction = 'CLOSE';
      base.archivedAt = now;
      break;
    case 'WRONG_NUMBER':
      base.replyStatus = 'INCORRECT_NUMBER';
      base.callStatus = 'INCORRECT_NUMBER';
      base.nextAction = 'CLOSE';
      base.archivedAt = now;
      break;
    case 'NOT_INTERESTED':
      base.replyStatus = 'REPLIED';
      base.registrationStatus = subReason || 'NOT_INTERESTED';
      base.nextAction = 'CLOSE';
      base.archivedAt = now;
      break;
    case 'NO_RESPONSE':
      base.registrationStatus = 'NO_RESPONSE';
      base.nextAction = 'CLOSE';
      base.archivedAt = now;
      break;
    case 'NEXT_COHORT':
      base.registrationStatus = 'NEXT_COHORT';
      base.nextAction = 'CLOSE';
      // not archived — parked for next cohort
      break;
  }
  return base;
};

export const formatTemplateDate = (value?: string | null): string => {
  if (!value) return '';
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
};

export const fillTemplate = (
  body: string,
  contact: FollowUpContact,
  registrationLink: string,
  senderName?: string | null
): string =>
  body
    .replaceAll('{{first_name}}', contact.fullName.trim().split(/\s+/)[0] || 'there')
    .replaceAll('{{full_name}}', contact.fullName.trim())
    .replaceAll('{{registration_link}}', registrationLink || '')
    .replaceAll('{{user.name}}', senderName?.trim() || '')
    .replaceAll('{{venue}}', contact.cohortVenue?.trim() || '')
    .replaceAll('{{start date}}', formatTemplateDate(contact.cohortStartDate));

export const buildTemplatePlaceholderSummary = (user?: User | null): string[] => [
  '{{first_name}}',
  '{{full_name}}',
  '{{registration_link}}',
  '{{user.name}}',
  '{{venue}}',
  '{{start date}}',
].map((token) => {
  if (token === '{{user.name}}' && user?.name) return `${token} = ${user.name}`;
  return token;
});

export const todayISO = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const isOverdue = (contact: FollowUpContact): boolean =>
  !!contact.dueDate && !contact.archivedAt && contact.dueDate < todayISO();

// ── Overview funnel ──────────────────────────────────────────────────────────
// `computeFollowUpMetrics` counts one contact under several headings on purpose
// (Registered is also Closed; a NEXT_COHORT contact lands in neither), which is
// fine for a single number but never reconciles as a set — Contacted + Not
// contacted + No response falls short of the total. The funnel puts every
// contact in exactly one bucket, so the Overview always adds up.

export type FollowUpStage = 'open' | 'registered' | 'loginShared' | 'done' | 'nextCohort' | 'stopped';

export const FOLLOW_UP_STAGE: Record<FollowUpStatus, FollowUpStage> = {
  TO_CONTACT: 'open',
  WAITING: 'open',
  NEEDS_REMINDER: 'open',
  REPLIED: 'open',
  CALL_BACK_LATER: 'open',
  REGISTERED: 'registered',
  LOGIN_SHARED: 'loginShared',
  LOGIN_ISSUE: 'loginShared',
  ACCESS_CONFIRMED: 'done',
  ATTENDED: 'done',
  NEXT_COHORT: 'nextCohort',
  WRONG_NUMBER: 'stopped',
  NOT_INTERESTED: 'stopped',
  NO_RESPONSE: 'stopped',
};

/**
 * Why a contact stopped, at the grain people actually ask about. The derived
 * status folds "not a good time" and "not a TCN member" into NOT_INTERESTED, so
 * the reason comes off the registration status instead.
 */
export const stoppedReason = (c: FollowUpContact): string | null => {
  switch (computeFollowUpStatus(c)) {
    case 'WRONG_NUMBER': return 'Wrong number';
    case 'NO_RESPONSE': return 'No response';
    case 'NOT_INTERESTED':
      return c.registrationStatus === 'NOT_A_GOOD_TIME' ? 'Not a good time'
        : c.registrationStatus === 'NOT_A_TCN_MEMBER' ? 'Not a TCN member'
          : 'Not interested';
    default: return null;
  }
};

const countReasons = (reasons: string[]): Array<{ label: string; value: number }> => {
  const map = new Map<string, number>();
  for (const reason of reasons) map.set(reason, (map.get(reason) ?? 0) + 1);
  return Array.from(map, ([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
};

export interface FollowUpFunnel {
  total: number;
  open: number;
  /** Signed up, but their app login has not been handed over yet. */
  registered: number;
  /** Login sent (or not working), waiting for them to get into the app. */
  loginShared: number;
  /** Signed up and in the app — the follow-up is finished. */
  done: number;
  /** Everyone who signed up, wherever they are on the way into the app. */
  signedUp: number;
  nextCohort: number;
  stopped: number;
  /** Everyone who signed up, as a share of every contact. Null when there are none. */
  conversion: number | null;
  /** One entry per status, in funnel order, zeros dropped. Always sums to total. */
  buckets: Array<{ status: FollowUpStatus; label: string; value: number; stage: FollowUpStage }>;
  stoppedReasons: Array<{ label: string; value: number }>;
}

const FUNNEL_ORDER: FollowUpStatus[] = [
  'TO_CONTACT', 'WAITING', 'NEEDS_REMINDER', 'REPLIED', 'CALL_BACK_LATER',
  'REGISTERED', 'LOGIN_SHARED', 'LOGIN_ISSUE', 'ACCESS_CONFIRMED', 'ATTENDED', 'NEXT_COHORT', 'WRONG_NUMBER', 'NOT_INTERESTED', 'NO_RESPONSE',
];

export const computeFollowUpFunnel = (contacts: FollowUpContact[]): FollowUpFunnel => {
  const counts = new Map<FollowUpStatus, number>();
  const reasons: string[] = [];
  const stageTotals: Record<FollowUpStage, number> = { open: 0, registered: 0, loginShared: 0, done: 0, nextCohort: 0, stopped: 0 };

  for (const c of contacts) {
    // The ranked list names what each prospect IS. A pre-app one is registered;
    // saying "login shared" would claim a handover that never happened. Only the
    // tiles and the per-rep columns treat them as finished work.
    const status = computeFollowUpStatus(c);
    counts.set(status, (counts.get(status) ?? 0) + 1);
    stageTotals[isPreAppRegistered(c) || isFiledLoginShared(c) ? 'done' : FOLLOW_UP_STAGE[status]]++;
    const reason = stoppedReason(c);
    if (reason) reasons.push(reason);
  }

  return {
    total: contacts.length,
    open: stageTotals.open,
    registered: stageTotals.registered,
    loginShared: stageTotals.loginShared,
    done: stageTotals.done,
    signedUp: stageTotals.registered + stageTotals.loginShared + stageTotals.done,
    nextCohort: stageTotals.nextCohort,
    stopped: stageTotals.stopped,
    conversion: contacts.length ? (stageTotals.registered + stageTotals.loginShared + stageTotals.done) / contacts.length : null,
    buckets: FUNNEL_ORDER
      .map((status) => ({ status, label: FOLLOW_UP_STATUS_META[status].label, value: counts.get(status) ?? 0, stage: FOLLOW_UP_STAGE[status] }))
      .filter((b) => b.value > 0),
    stoppedReasons: countReasons(reasons),
  };
};
