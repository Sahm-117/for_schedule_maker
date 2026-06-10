import type {
  User,
  FollowUpContact,
  FollowUpMessageStatus,
  FollowUpReplyStatus,
  FollowUpCallStatus,
  FollowUpRegistrationStatus,
  FollowUpNextAction,
  IssueStatus,
} from '../types';

type StatusMeta = { label: string; tone: string };

const pill = (tone: string) => tone;

export const MESSAGE_STATUS_META: Record<FollowUpMessageStatus, StatusMeta> = {
  NOT_SENT: { label: 'Not Sent', tone: pill('bg-slate-100 text-slate-600') },
  SENT: { label: 'Sent', tone: pill('bg-emerald-100/80 text-emerald-700') },
};

export const REPLY_STATUS_META: Record<FollowUpReplyStatus, StatusMeta> = {
  NO_REPLY: { label: 'No Reply', tone: 'bg-slate-100 text-slate-600' },
  REPLIED: { label: 'Replied', tone: 'bg-emerald-100/80 text-emerald-700' },
  NEEDS_REMINDER: { label: 'Needs Reminder', tone: 'bg-amber-100/80 text-amber-700' },
};

export const CALL_STATUS_META: Record<FollowUpCallStatus, StatusMeta> = {
  NOT_CALLED: { label: 'Not Called', tone: 'bg-slate-100 text-slate-600' },
  CALLED: { label: 'Called', tone: 'bg-emerald-100/80 text-emerald-700' },
  MISSED_CALL: { label: 'Missed Call', tone: 'bg-rose-100/80 text-rose-700' },
  CALL_BACK_LATER: { label: 'Call Back Later', tone: 'bg-amber-100/80 text-amber-700' },
  NOT_APPLICABLE: { label: 'Not Applicable', tone: 'bg-neutral-100 text-neutral-600' },
};

export const REGISTRATION_STATUS_META: Record<FollowUpRegistrationStatus, StatusMeta> = {
  NOT_REGISTERED: { label: 'Not Registered', tone: 'bg-slate-100 text-slate-600' },
  PENDING_CONFIRMATION: { label: 'Pending Confirmation', tone: 'bg-amber-100/80 text-amber-700' },
  REGISTERED: { label: 'Registered', tone: 'bg-emerald-100/80 text-emerald-700' },
  STILL_THINKING: { label: 'Still Thinking', tone: 'bg-violet-100/80 text-violet-700' },
  NOT_INTERESTED: { label: 'Not Interested', tone: 'bg-rose-100/80 text-rose-700' },
  NOT_A_TCN_MEMBER: { label: 'Not a TCN Member', tone: 'bg-rose-100/80 text-rose-700' },
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

export const statusOptions = <T extends string>(meta: Record<T, StatusMeta>) =>
  (Object.keys(meta) as T[]).map((value) => ({ value, label: meta[value].label }));

export const isTerminalFollowUpRegistrationStatus = (status: FollowUpRegistrationStatus): boolean =>
  status === 'NOT_INTERESTED' || status === 'NOT_A_TCN_MEMBER';

export const isTerminalFollowUpContact = (contact: FollowUpContact): boolean =>
  !!contact.archivedAt || contact.nextAction === 'CLOSE' || isTerminalFollowUpRegistrationStatus(contact.registrationStatus);

export interface FollowUpMetrics {
  total: number;
  contacted: number;
  replied: number;
  called: number;
  registered: number;
  noResponse: number;
  notContacted: number;
  stillThinking: number;
  pendingConfirmation: number;
  notInterested: number;
  needsAction: number;
  interestedNotRegistered: number;
}

export const computeFollowUpMetrics = (contacts: FollowUpContact[]): FollowUpMetrics => {
  const total = contacts.length;
  const contacted = contacts.filter((c) => c.messageStatus === 'SENT' || c.callStatus === 'CALLED').length;
  const replied = contacts.filter((c) => c.replyStatus === 'REPLIED').length;
  const called = contacts.filter((c) => c.callStatus === 'CALLED').length;
  const registered = contacts.filter((c) => c.registrationStatus === 'REGISTERED').length;
  const noResponse = contacts.filter((c) => c.messageStatus === 'SENT' && c.replyStatus === 'NO_REPLY').length;
  const notContacted = contacts.filter((c) => c.messageStatus === 'NOT_SENT' && c.callStatus === 'NOT_CALLED').length;
  const stillThinking = contacts.filter((c) => c.registrationStatus === 'STILL_THINKING').length;
  const pendingConfirmation = contacts.filter((c) => c.registrationStatus === 'PENDING_CONFIRMATION').length;
  const notInterested = contacts.filter((c) => isTerminalFollowUpRegistrationStatus(c.registrationStatus)).length;
  const needsAction = contacts.filter((c) => !isTerminalFollowUpContact(c)).length;
  const interestedNotRegistered = contacts.filter(
    (c) => c.registrationStatus !== 'REGISTERED' && !isTerminalFollowUpRegistrationStatus(c.registrationStatus)
  ).length;
  return {
    total,
    contacted,
    replied,
    called,
    registered,
    noResponse,
    notContacted,
    stillThinking,
    pendingConfirmation,
    notInterested,
    needsAction,
    interestedNotRegistered,
  };
};

export interface OwnerBreakdownRow {
  ownerId: string | null;
  ownerName: string;
  assigned: number;
  contacted: number;
  registered: number;
  stillOpen: number;
}

export const computeOwnerBreakdown = (contacts: FollowUpContact[]): OwnerBreakdownRow[] => {
  const map = new Map<string, OwnerBreakdownRow>();
  for (const c of contacts) {
    const key = c.ownerId || 'unassigned';
    const row = map.get(key) || {
      ownerId: c.ownerId || null,
      ownerName: c.ownerName || (c.ownerId ? 'Unknown' : 'Unassigned'),
      assigned: 0,
      contacted: 0,
      registered: 0,
      stillOpen: 0,
    };
    row.assigned += 1;
    if (c.replyStatus === 'REPLIED' || c.callStatus === 'CALLED' || c.callStatus === 'MISSED_CALL' || c.callStatus === 'NOT_APPLICABLE') row.contacted += 1;
    if (c.registrationStatus === 'REGISTERED') row.registered += 1;
    if (c.replyStatus !== 'REPLIED' && c.registrationStatus !== 'REGISTERED') row.stillOpen += 1;
    map.set(key, row);
  }
  return Array.from(map.values()).sort((a, b) => b.assigned - a.assigned);
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
