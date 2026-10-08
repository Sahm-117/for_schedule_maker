import type { FollowUpContact, Participant } from '../types';
import { FOLLOW_UP_STAGE, computeFollowUpStatus, contactInCohortScope, isTeenContact } from './followUps';
import { normaliseAgeRange } from './groupingRules';

// The registration numbers on the admin Dashboard and Follow-ups → Overview, counted from PEOPLE, not
// from follow-up statuses, and adults and teens apart.
//   Registered  = a participant in the cohort (they filled the form, or a support registered them).
// ADULTS:
//   Logged in   = they chose their own password and the login is on (the same check the group builder uses).
//   Still to log in = everyone else who is registered, with the reason, so nobody drops out of the total
//                     when they are parked (No response, next cohort).
// TEENS get no login details, so a teen is only Onboarded (by their Teen Support), No response, or not
// onboarded yet; whether a teen has a password is not counted.
// A follow-up status is only used to say WHY an adult has not logged in, or where a teen is; it never
// changes who is registered, with one exception: a registered person whose number is marked Wrong
// Number (and who is not in the app) cannot be reached, so they are left out of the totals and counted
// in `wrongNumber` instead. They come back in as soon as the contact moves off Wrong Number.

export type PendingReason = 'loginSent' | 'notSentYet' | 'handMarked' | 'parked';

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
  /** Registered but marked Wrong Number and not in the app: left out of every number above. */
  wrongNumber: number;
}

export interface TeenBlock {
  registered: number;
  /** Onboarded by their Teen Support. */
  onboarded: number;
  /** Marked No response (or otherwise stopped / parked). */
  noResponse: number;
  /** Everyone else: still being followed up. Always registered - onboarded - noResponse. */
  notOnboarded: number;
  /** Of notOnboarded, those with no Teen Support yet. */
  waitingForSupport: number;
  /** On the follow-up list but not registered yet. */
  notRegistered: number;
  unlinked: number;
  /** Registered but marked Wrong Number: left out of every number above. */
  wrongNumber: number;
}

export interface RegistrationOverview {
  adults: PeopleBlock;
  teens: TeenBlock;
  /** Everyone registered; logged in and still to log in are about adults only (teens get no login). */
  total: { registered: number; adultsLoggedIn: number; adultsPending: number };
}

const emptyBlock = (): PeopleBlock => ({
  registered: 0,
  loggedIn: 0,
  pending: 0,
  reasons: { loginSent: 0, notSentYet: 0, handMarked: 0, parked: 0 },
  loginIssue: 0,
  notRegistered: 0,
  unlinked: 0,
  wrongNumber: 0,
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

const pendingReason = (c: FollowUpContact | undefined): PendingReason => {
  if (c && isParked(c)) return 'parked';
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
  const teens: TeenBlock = { registered: 0, onboarded: 0, noResponse: 0, notOnboarded: 0, waitingForSupport: 0, notRegistered: 0, unlinked: 0, wrongNumber: 0 };
  const registeredContactIds = new Set<string>();

  participants.forEach((p) => {
    if (p.isTest || p.status !== 'ACTIVE' || p.cohortId !== cohortId) return;
    const contact = p.followUpContactId ? byContact.get(p.followUpContactId) : undefined;
    if (p.followUpContactId) registeredContactIds.add(p.followUpContactId);
    const wrongNumber = !!contact && computeFollowUpStatus(contact) === 'WRONG_NUMBER';
    if (isTeenPerson(p, contact)) {
      if (wrongNumber) { teens.wrongNumber += 1; return; }
      teens.registered += 1;
      if (contact && isParked(contact)) teens.noResponse += 1;
      else if (contact && computeFollowUpStatus(contact) === 'TEEN_ONBOARDED') teens.onboarded += 1;
      else {
        teens.notOnboarded += 1;
        if (!contact?.ownerId) teens.waitingForSupport += 1;
      }
      return;
    }
    // Someone who signed in has reached the app, so a stale Wrong Number does not take them out.
    if (wrongNumber && !signedInIds.has(p.id)) { adults.wrongNumber += 1; return; }
    adults.registered += 1;
    if (signedInIds.has(p.id)) { adults.loggedIn += 1; return; }
    adults.pending += 1;
    const reason = pendingReason(contact);
    adults.reasons[reason] += 1;
    if (reason === 'loginSent' && contact && computeFollowUpStatus(contact) === 'LOGIN_ISSUE') adults.loginIssue += 1;
  });

  // Follow-up contacts with no participant yet: still to register (open), or marked registered with no
  // participant record to count (so the totals can say so rather than silently differ from the list).
  contacts.forEach((c) => {
    if (c.isTest || c.archivedAt || registeredContactIds.has(c.id)) return;
    if (!contactInCohortScope(c, cohortId, cohortId)) return;
    const stage = FOLLOW_UP_STAGE[computeFollowUpStatus(c)];
    const block: { notRegistered: number; unlinked: number } = isTeenRecord(c) ? teens : adults;
    if (stage === 'open') block.notRegistered += 1;
    else if (stage === 'registered' || stage === 'loginShared' || stage === 'done') block.unlinked += 1;
  });

  return {
    adults,
    teens,
    total: { registered: adults.registered + teens.registered, adultsLoggedIn: adults.loggedIn, adultsPending: adults.pending },
  };
};
