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
  LOGIN_SHARED: { label: 'Login Shared', tone: 'bg-emerald-100/80 text-emerald-700' },
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
  LOGIN_SHARED: { label: 'Login shared', description: 'They have their login. All done.', tone: 'bg-emerald-100/80 text-emerald-700' },
  WRONG_NUMBER: { label: 'Wrong number', description: 'The number does not work.', tone: 'bg-rose-100/80 text-rose-700' },
  NOT_INTERESTED: { label: 'Not interested', description: 'They said no, not available, or not a TCN member.', tone: 'bg-rose-100/80 text-rose-700' },
  NO_RESPONSE: { label: 'No response', description: 'They did not reply after multiple follow-ups.', tone: 'bg-neutral-100 text-neutral-600' },
  NEXT_COHORT: { label: 'Will join next cohort', description: 'They are interested but will join the next cohort.', tone: 'bg-sky-100/80 text-sky-700' },
};

export const statusOptions = <T extends string>(meta: Record<T, StatusMeta>) =>
  (Object.keys(meta) as T[]).map((value) => ({ value, label: meta[value].label }));

export const followUpStatusOptions = (Object.keys(FOLLOW_UP_STATUS_META) as FollowUpStatus[]).map((value) => ({
  value,
  label: FOLLOW_UP_STATUS_META[value].label,
  meta: FOLLOW_UP_STATUS_META[value].description,
}));

export const computeFollowUpStatus = (c: FollowUpContact): FollowUpStatus => {
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
 * Registering is not the end of a follow-up — the prospect still needs their app
 * login handed over. Only 'LOGIN_SHARED' closes a successful one.
 */
export const isClosedContact = (c: FollowUpContact): boolean => {
  const status = computeFollowUpStatus(c);
  return status === 'LOGIN_SHARED' || status === 'WRONG_NUMBER' || status === 'NOT_INTERESTED' || status === 'NO_RESPONSE';
};

export const isClosedRegistrationStatus = (status: FollowUpRegistrationStatus): boolean =>
  status === 'LOGIN_SHARED' || status === 'NOT_INTERESTED' || status === 'NOT_A_TCN_MEMBER' || status === 'NOT_A_GOOD_TIME' || status === 'NO_RESPONSE';

export interface FollowUpMetrics {
  toContact: number;
  waiting: number;
  needsReminder: number;
  replied: number;
  callBackLater: number;
  registered: number;
  loginShared: number;
  wrongNumber: number;
  notInterested: number;
  total: number;
  contacted: number;
  notContacted: number;
  noResponse: number;
  closed: number;
}

export const computeFollowUpMetrics = (contacts: FollowUpContact[]): FollowUpMetrics => {
  const m: FollowUpMetrics = { toContact: 0, waiting: 0, needsReminder: 0, replied: 0, callBackLater: 0, registered: 0, loginShared: 0, wrongNumber: 0, notInterested: 0, total: 0, contacted: 0, notContacted: 0, noResponse: 0, closed: 0 };
  for (const c of contacts) {
    m.total++;
    const status = computeFollowUpStatus(c);
    if (status === 'TO_CONTACT') { m.toContact++; m.notContacted++; }
    else if (status === 'WAITING') { m.waiting++; m.noResponse++; }
    else if (status === 'NEEDS_REMINDER') { m.needsReminder++; m.noResponse++; }
    else if (status === 'REPLIED') { m.replied++; m.contacted++; }
    else if (status === 'CALL_BACK_LATER') { m.callBackLater++; m.contacted++; }
    else if (status === 'REGISTERED') { m.registered++; m.contacted++; }
    else if (status === 'LOGIN_SHARED') { m.loginShared++; m.contacted++; m.closed++; }
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
  loginShared: number;
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
        assigned: 0, toContact: 0, waiting: 0, needsReminder: 0, replied: 0, callBackLater: 0, registered: 0, loginShared: 0, loginToShare: 0, signedUp: 0, nextCohort: 0, wrongNumber: 0, notInterested: 0, noResponse: 0,
        uncontacted: 0, contacted: 0, stillOpen: 0, notAGoodTime: 0, notATcnMember: 0,
        stopped: 0, stoppedReasons: [],
      };
      map.set(key, row);
    }
    row.assigned++;
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
      case 'REGISTERED': row.registered++; break;
      case 'LOGIN_SHARED': row.loginShared++; break;
      case 'WRONG_NUMBER': row.wrongNumber++; break;
      case 'NOT_INTERESTED': row.notInterested++; break;
      case 'NO_RESPONSE': row.noResponse++; break;
      case 'NEXT_COHORT': row.nextCohort++; break;
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
  // Busiest first: chasing still to do, plus logins still to hand over.
  return Array.from(map.values()).sort((a, b) => (b.stillOpen + b.loginToShare) - (a.stillOpen + a.loginToShare));
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
    if (status === 'REGISTERED' || status === 'LOGIN_SHARED') row.signedUp++;
    if (status === 'LOGIN_SHARED') row.loginShared++;
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
      // so the contact stays active until the owner marks LOGIN_SHARED.
      base.replyStatus = 'REPLIED';
      base.registrationStatus = 'REGISTERED';
      base.nextAction = 'SEND_MESSAGE';
      break;
    case 'LOGIN_SHARED':
      base.replyStatus = 'REPLIED';
      base.registrationStatus = 'LOGIN_SHARED';
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

export type FollowUpStage = 'open' | 'registered' | 'done' | 'nextCohort' | 'stopped';

export const FOLLOW_UP_STAGE: Record<FollowUpStatus, FollowUpStage> = {
  TO_CONTACT: 'open',
  WAITING: 'open',
  NEEDS_REMINDER: 'open',
  REPLIED: 'open',
  CALL_BACK_LATER: 'open',
  REGISTERED: 'registered',
  LOGIN_SHARED: 'done',
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
  /** Signed up and given their login — the follow-up is finished. */
  done: number;
  /** Everyone who signed up, whichever side of the login handover they are on. */
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
  'REGISTERED', 'LOGIN_SHARED', 'NEXT_COHORT', 'WRONG_NUMBER', 'NOT_INTERESTED', 'NO_RESPONSE',
];

export const computeFollowUpFunnel = (contacts: FollowUpContact[]): FollowUpFunnel => {
  const counts = new Map<FollowUpStatus, number>();
  const reasons: string[] = [];
  const stageTotals: Record<FollowUpStage, number> = { open: 0, registered: 0, done: 0, nextCohort: 0, stopped: 0 };

  for (const c of contacts) {
    const status = computeFollowUpStatus(c);
    counts.set(status, (counts.get(status) ?? 0) + 1);
    stageTotals[FOLLOW_UP_STAGE[status]]++;
    const reason = stoppedReason(c);
    if (reason) reasons.push(reason);
  }

  return {
    total: contacts.length,
    open: stageTotals.open,
    registered: stageTotals.registered,
    done: stageTotals.done,
    signedUp: stageTotals.registered + stageTotals.done,
    nextCohort: stageTotals.nextCohort,
    stopped: stageTotals.stopped,
    conversion: contacts.length ? (stageTotals.registered + stageTotals.done) / contacts.length : null,
    buckets: FUNNEL_ORDER
      .map((status) => ({ status, label: FOLLOW_UP_STATUS_META[status].label, value: counts.get(status) ?? 0, stage: FOLLOW_UP_STAGE[status] }))
      .filter((b) => b.value > 0),
    stoppedReasons: countReasons(reasons),
  };
};
