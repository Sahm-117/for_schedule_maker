import type { FollowUpContact, Participant } from '../types';
import { FOLLOW_UP_STAGE, computeFollowUpStatus, contactInCohortScope, isTeenContact } from './followUps';
import { normaliseAgeRange } from './groupingRules';

// The registration numbers on the admin Dashboard and Follow-ups → Overview, counted from PEOPLE, not
// from follow-up statuses, and adults and teens apart.
//   Registered  = a participant in the cohort (they filled the form, or a support registered them).
//   Logged in   = they chose their own password and the login is on (the same check the group builder uses).
//   Still to log in = everyone else who is registered, with the reason, so nobody drops out of the total
//                     when they are parked (No response, next cohort) or moved to a Teen Support.
// A follow-up status is only used to say WHY someone has not logged in; it never changes who counts.

export type PendingReason = 'loginSent' | 'notSentYet' | 'handMarked' | 'parked' | 'withTeenSupport' | 'waitingForSupport';

export interface PeopleBlock {
  registered: number;
  loggedIn: number;
  /** Registered but not logged in: always registered - loggedIn. */
  pending: number;
  reasons: Record<PendingReason, number>;
  /** Of loginSent: those who reported a problem with their login. */
  loginIssue: number;
  /** On the follow-up list but not registered yet. */
  notRegistered: number;
  /** Marked as registered on the follow-up list but with no participant record to count. */
  unlinked: number;
}

export interface RegistrationOverview {
  adults: PeopleBlock;
  teens: PeopleBlock;
  total: { registered: number; loggedIn: number; pending: number };
}

const emptyBlock = (): PeopleBlock => ({
  registered: 0,
  loggedIn: 0,
  pending: 0,
  reasons: { loginSent: 0, notSentYet: 0, handMarked: 0, parked: 0, withTeenSupport: 0, waitingForSupport: 0 },
  loginIssue: 0,
  notRegistered: 0,
  unlinked: 0,
});

const TEEN_AGE = '18 and below';
const isTeenAge = (value?: string | null) => normaliseAgeRange(value) === TEEN_AGE;

/** A teen by the contact's own age range, or because the contact is on the teen path. */
const isTeenRecord = (contact?: FollowUpContact | null): boolean =>
  !!contact && (isTeenAge(contact.ageRange) || isTeenContact(contact));

/** A teen by their own age range, or by their contact (one rule for registered people and for contacts). */
export const isTeenPerson = (participant: Pick<Participant, 'ageRange'>, contact?: FollowUpContact | null): boolean =>
  isTeenAge(participant.ageRange) || isTeenRecord(contact);

/** Cannot be reached for now, waiting for the next cohort, or stopped (wrong number, not interested). */
const isParked = (c: FollowUpContact) => {
  if (c.noResponseAt) return true;
  const stage = FOLLOW_UP_STAGE[computeFollowUpStatus(c)];
  return stage === 'nextCohort' || stage === 'stopped';
};

const pendingReason = (teen: boolean, c: FollowUpContact | undefined): PendingReason => {
  if (c && isParked(c)) return 'parked';
  if (teen) return c?.ownerId ? 'withTeenSupport' : 'waitingForSupport';
  if (!c) return 'notSentYet';
  const status = computeFollowUpStatus(c);
  if (status === 'LOGIN_SHARED' || status === 'LOGIN_ISSUE') return 'loginSent';
  // Marked as in the app by hand, but they have not signed in.
  if (status === 'ACCESS_CONFIRMED' || status === 'ATTENDED') return 'handMarked';
  return 'notSentYet';
};

/**
 * `participants` are the cohort's participants, `contacts` its follow-up contacts (test ones are left out
 * here), `signedInIds` the ids from `participants_signed_in`.
 */
export const computeRegistrationOverview = (
  participants: Participant[],
  contacts: FollowUpContact[],
  signedInIds: Set<string>,
  cohortId: string,
): RegistrationOverview => {
  const byContact = new Map(contacts.map((c) => [c.id, c]));
  const adults = emptyBlock();
  const teens = emptyBlock();
  const registeredContactIds = new Set<string>();

  participants.forEach((p) => {
    if (p.isTest || p.status !== 'ACTIVE' || p.cohortId !== cohortId) return;
    const contact = p.followUpContactId ? byContact.get(p.followUpContactId) : undefined;
    if (p.followUpContactId) registeredContactIds.add(p.followUpContactId);
    const teen = isTeenPerson(p, contact);
    const block = teen ? teens : adults;
    block.registered += 1;
    if (signedInIds.has(p.id)) { block.loggedIn += 1; return; }
    block.pending += 1;
    const reason = pendingReason(teen, contact);
    block.reasons[reason] += 1;
    if (reason === 'loginSent' && contact && computeFollowUpStatus(contact) === 'LOGIN_ISSUE') block.loginIssue += 1;
  });

  // Follow-up contacts with no participant yet: still to register (open), or marked registered with no
  // participant record to count (so the totals can say so rather than silently differ from the list).
  contacts.forEach((c) => {
    if (c.isTest || c.archivedAt || registeredContactIds.has(c.id)) return;
    if (!contactInCohortScope(c, cohortId, cohortId)) return;
    const stage = FOLLOW_UP_STAGE[computeFollowUpStatus(c)];
    const block = isTeenRecord(c) ? teens : adults;
    if (stage === 'open') block.notRegistered += 1;
    else if (stage === 'registered' || stage === 'loginShared' || stage === 'done') block.unlinked += 1;
  });

  return {
    adults,
    teens,
    total: {
      registered: adults.registered + teens.registered,
      loggedIn: adults.loggedIn + teens.loggedIn,
      pending: adults.pending + teens.pending,
    },
  };
};
