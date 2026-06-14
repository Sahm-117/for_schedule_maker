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
  NOT_INTERESTED: { label: 'Not Interested', tone: 'bg-rose-100/80 text-rose-700' },
  NOT_A_GOOD_TIME: { label: 'Not a Good Time', tone: 'bg-rose-100/80 text-rose-700' },
  NOT_A_TCN_MEMBER: { label: 'Not a TCN Member', tone: 'bg-rose-100/80 text-rose-700' },
  PENDING_CONFIRMATION: { label: 'Pending Confirmation', tone: 'bg-amber-100/80 text-amber-700' },
  REGISTERED: { label: 'Registered', tone: 'bg-emerald-100/80 text-emerald-700' },
  STILL_THINKING: { label: 'Still Thinking', tone: 'bg-violet-100/80 text-violet-700' },
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
  REGISTERED: { label: 'Registered', description: 'They are registered. All done.', tone: 'bg-emerald-100/80 text-emerald-700' },
  WRONG_NUMBER: { label: 'Wrong number', description: 'The number does not work.', tone: 'bg-rose-100/80 text-rose-700' },
  NOT_INTERESTED: { label: 'Not interested', description: 'They said no, not available, or not a TCN member.', tone: 'bg-rose-100/80 text-rose-700' },
  NO_RESPONSE: { label: 'No response', description: 'They did not reply after multiple follow-ups.', tone: 'bg-neutral-100 text-neutral-600' },
};

export const statusOptions = <T extends string>(meta: Record<T, StatusMeta>) =>
  (Object.keys(meta) as T[]).map((value) => ({ value, label: meta[value].label }));

export const followUpStatusOptions = (Object.keys(FOLLOW_UP_STATUS_META) as FollowUpStatus[]).map((value) => ({
  value,
  label: FOLLOW_UP_STATUS_META[value].label,
  meta: FOLLOW_UP_STATUS_META[value].description,
}));

export const computeFollowUpStatus = (c: FollowUpContact): FollowUpStatus => {
  if (c.registrationStatus === 'REGISTERED') return 'REGISTERED';
  if (c.registrationStatus === 'NOT_INTERESTED' || c.registrationStatus === 'NOT_A_GOOD_TIME' || c.registrationStatus === 'NOT_A_TCN_MEMBER') return 'NOT_INTERESTED';
  if (c.registrationStatus === 'NO_RESPONSE') return 'NO_RESPONSE';
  if (c.replyStatus === 'INCORRECT_NUMBER' || c.callStatus === 'INCORRECT_NUMBER') return 'WRONG_NUMBER';
  if (c.callStatus === 'CALL_BACK_LATER') return 'CALL_BACK_LATER';
  if (c.replyStatus === 'NEEDS_REMINDER') return 'NEEDS_REMINDER';
  if (c.replyStatus === 'REPLIED') return 'REPLIED';
  if (c.messageStatus === 'SENT') return 'WAITING';
  return 'TO_CONTACT';
};

export const isClosedContact = (c: FollowUpContact): boolean => {
  const status = computeFollowUpStatus(c);
  return status === 'REGISTERED' || status === 'WRONG_NUMBER' || status === 'NOT_INTERESTED' || status === 'NO_RESPONSE';
};

export const isClosedRegistrationStatus = (status: FollowUpRegistrationStatus): boolean =>
  status === 'NOT_INTERESTED' || status === 'NOT_A_TCN_MEMBER' || status === 'NOT_A_GOOD_TIME';

export interface FollowUpMetrics {
  toContact: number;
  waiting: number;
  needsReminder: number;
  replied: number;
  callBackLater: number;
  registered: number;
  wrongNumber: number;
  notInterested: number;
  total: number;
  contacted: number;
  notContacted: number;
  noResponse: number;
  closed: number;
}

export const computeFollowUpMetrics = (contacts: FollowUpContact[]): FollowUpMetrics => {
  const m: FollowUpMetrics = { toContact: 0, waiting: 0, needsReminder: 0, replied: 0, callBackLater: 0, registered: 0, wrongNumber: 0, notInterested: 0, total: 0, contacted: 0, notContacted: 0, noResponse: 0, closed: 0 };
  for (const c of contacts) {
    m.total++;
    const status = computeFollowUpStatus(c);
    if (status === 'TO_CONTACT') { m.toContact++; m.notContacted++; }
    else if (status === 'WAITING') { m.waiting++; m.noResponse++; }
    else if (status === 'NEEDS_REMINDER') { m.needsReminder++; m.noResponse++; }
    else if (status === 'REPLIED') { m.replied++; m.contacted++; }
    else if (status === 'CALL_BACK_LATER') { m.callBackLater++; m.contacted++; }
    else if (status === 'REGISTERED') { m.registered++; m.contacted++; m.closed++; }
    else if (status === 'WRONG_NUMBER') { m.wrongNumber++; m.contacted++; m.closed++; }
    else if (status === 'NOT_INTERESTED') { m.notInterested++; m.contacted++; m.closed++; }
    else if (status === 'NO_RESPONSE') { m.closed++; }
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
  wrongNumber: number;
  notInterested: number;
  noResponse: number;
  uncontacted: number;
  contacted: number;
  stillOpen: number;
  notAGoodTime: number;
  notATcnMember: number;
}

export const computeOwnerBreakdown = (contacts: FollowUpContact[]): OwnerBreakdownRow[] => {
  const map = new Map<string, OwnerBreakdownRow>();
  for (const c of contacts) {
    const key = c.ownerId || 'unassigned';
    let row = map.get(key);
    if (!row) {
      row = {
        ownerId: c.ownerId || null,
        ownerName: c.ownerName || (c.ownerId ? 'Unknown' : 'Unassigned'),
        assigned: 0, toContact: 0, waiting: 0, needsReminder: 0, replied: 0, callBackLater: 0, registered: 0, wrongNumber: 0, notInterested: 0, noResponse: 0,
        uncontacted: 0, contacted: 0, stillOpen: 0, notAGoodTime: 0, notATcnMember: 0,
      };
      map.set(key, row);
    }
    row.assigned++;
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
      case 'WRONG_NUMBER': row.wrongNumber++; break;
      case 'NOT_INTERESTED': row.notInterested++; break;
      case 'NO_RESPONSE': row.noResponse++; break;
    }
  }
  for (const row of map.values()) {
    row.uncontacted = row.toContact;
    row.contacted = row.replied + row.callBackLater + row.registered + row.wrongNumber + row.notInterested;
    row.stillOpen = row.assigned - row.registered - row.wrongNumber - row.notInterested - row.noResponse;
  }
  return Array.from(map.values()).sort((a, b) => (b.toContact + b.waiting + b.needsReminder + b.replied + b.callBackLater) - (a.toContact + a.waiting + a.needsReminder + a.replied + a.callBackLater));
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
      base.replyStatus = 'REPLIED';
      base.registrationStatus = 'REGISTERED';
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
  }
  return base;
};

export const formatTemplateDate = (value?: string | null): string => {
  if (!value) return '';
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', {
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
