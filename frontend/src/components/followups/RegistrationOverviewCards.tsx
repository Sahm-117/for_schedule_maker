import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import type { FollowUpContact, Participant } from '../../types';
import { participantPushApi, participantsApi } from '../../services/api';
import { computeRegistrationOverview, type PeopleBlock, type PendingReason, type RegistrationOverview, type TeenBlock } from '../../utils/registrationOverview';
import { VitalTile } from '../dashboard/DashboardParts';
import ModalShell from './ModalShell';
import LoginDetailsCard from '../participants/LoginDetailsCard';
import { firstNameOf } from '../../utils/people';

// The registration numbers, adults and teens apart, counted from people (see utils/registrationOverview).
// Shown on the admin Dashboard and on Follow-ups → Overview.

const pct = (rate: number) => Math.round(rate * 100);
// Zero of something is only good news once someone has registered: until then the tiles stay grey.
const EMPTY = { status: 'neutral' as const, statusLabel: 'Nothing yet' };

const REASON_LABEL: Record<PendingReason, string> = {
  loginSent: 'Login sent, not signed in yet',
  notSentYet: 'Login not sent yet',
  handMarked: 'Marked as logged in by hand, not signed in',
  parked: 'Not reachable, stopped, or joining next cohort',
};
const ADULT_REASONS: PendingReason[] = ['loginSent', 'notSentYet', 'parked', 'handMarked'];

const Block: React.FC<{ title: string; block: PeopleBlock; reasons: PendingReason[]; unit: string; notRegisteredLink?: string }> = ({ title, block, reasons, unit, notRegisteredLink }) => (
  <section aria-label={title}>
    <h3 className="mb-2 text-sm font-semibold text-gray-900">{title} <span className="font-normal text-gray-500">· {block.registered} registered</span></h3>
    <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
      <VitalTile
        title="Registered"
        status="neutral"
        statusLabel={title}
        value={block.registered}
        unit={block.registered === 1 ? unit : `${unit}s`}
        detail="Filled in the form, or registered by a support"
      />
      <VitalTile
        title="Logged in"
        status={block.loggedIn > 0 ? 'good' : 'neutral'}
        statusLabel="Chose a password"
        value={block.loggedIn}
        detail={block.registered > 0 ? `${pct(block.loggedIn / block.registered)}% of those registered` : 'Nobody registered yet'}
      />
      <div className="col-span-2 xl:col-span-1">
        <VitalTile
          title="Still to log in"
          {...(block.registered === 0 ? EMPTY : { status: block.pending > 0 ? 'warning' : 'good', statusLabel: block.pending > 0 ? 'Registered, not in the app' : 'Everyone is in' })}
          value={block.pending}
          detail={block.registered === 0 ? 'Nobody registered yet' : block.pending > 0 ? 'Registered, but not signed in yet:' : 'Nobody is waiting to sign in'}
        >
          {block.pending > 0 && (
            <ul className="space-y-0.5 text-[12px] text-gray-600">
              {reasons.filter((r) => block.reasons[r] > 0).map((r) => (
                <li key={r} className="flex justify-between gap-3">
                  <span>{REASON_LABEL[r]}{r === 'loginSent' && block.loginIssue > 0 ? ` (${block.loginIssue} with a problem)` : ''}</span>
                  <span className="font-semibold tabular-nums text-gray-800">{block.reasons[r]}</span>
                </li>
              ))}
            </ul>
          )}
        </VitalTile>
      </div>
      <VitalTile
        title="Not registered yet"
        {...(block.notRegistered === 0 && block.registered === 0 ? EMPTY : { status: block.notRegistered > 0 ? 'warning' : 'good', statusLabel: block.notRegistered > 0 ? 'Needs work' : 'All handled' })}
        value={block.notRegistered}
        detail={block.notRegistered > 0 ? 'On the follow-up list, still to register' : block.registered === 0 ? 'Nobody on the follow-up list yet' : 'Everyone on the list has registered or stopped'}
        to={block.notRegistered > 0 ? notRegisteredLink : undefined}
      />
    </div>
  </section>
);

// Adults registered but not signed in, each with "Resend login": opens their login message (the same card
// as on their profile) to copy or send in WhatsApp or by email. Nothing is sent from here, and people who
// cannot be reached (No response, next cohort, stopped) are left out.
const ResendLoginList: React.FC<{ people: PeopleBlock['pendingPeople'] }> = ({ people }) => {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<PeopleBlock['pendingPeople'][number] | null>(null);
  if (people.length === 0) return null;
  return (
    <section className="surface-card px-5 py-4" aria-label="Resend login">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-gray-900">
          {people.length} {people.length === 1 ? 'adult has' : 'adults have'} not signed in yet
          <span className="ml-2 text-xs font-normal text-gray-500">Resend their login by WhatsApp or email</span>
        </p>
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="text-xs font-semibold text-primary-dark hover:underline">
          {open ? 'Hide who' : 'Show who'}
        </button>
      </div>
      {open && (
        <ul className="mt-3 divide-y divide-gray-100">
          {people.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 py-2">
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-gray-900">{p.name}</span>
                <span className="block text-[11px] text-gray-500">{REASON_LABEL[p.reason]}</span>
              </span>
              <button type="button" onClick={() => setTarget(p)} className="flex-none rounded-2xl bg-primary px-3.5 py-1.5 text-xs font-semibold text-white active:scale-95">Resend login</button>
            </li>
          ))}
        </ul>
      )}
      <ModalShell
        isOpen={!!target}
        onClose={() => setTarget(null)}
        title="Resend login"
        subtitle={target ? `Send ${firstNameOf(target.name)} their login details. Nothing goes out until you send it.` : undefined}
      >
        {target && <LoginDetailsCard participantId={target.id} email={target.email} defaultOpen />}
      </ModalShell>
    </section>
  );
};

// Teens get no login details: they are Onboarded by their Teen Support, No response, or still being followed up.
const TeenCards: React.FC<{ block: TeenBlock; notRegisteredLink?: string }> = ({ block, notRegisteredLink }) => (
  <section aria-label="Teens">
    <h3 className="mb-2 text-sm font-semibold text-gray-900">Teens <span className="font-normal text-gray-500">· {block.registered} registered · no login details, so they are onboarded by their Teen Support</span></h3>
    <div className={`grid grid-cols-2 gap-4 ${block.notRegistered > 0 ? 'xl:grid-cols-5' : 'xl:grid-cols-4'}`}>
      <VitalTile title="Registered" status="neutral" statusLabel="Teens" value={block.registered} unit={block.registered === 1 ? 'teen' : 'teens'} detail="Filled in the form, or registered by a support" />
      <VitalTile
        title="Onboarded"
        status={block.onboarded > 0 ? 'good' : 'neutral'}
        statusLabel="By their Teen Support"
        value={block.onboarded}
        detail={block.registered > 0 ? `${pct(block.onboarded / block.registered)}% of those registered` : 'Nobody registered yet'}
      />
      <VitalTile
        title="No response"
        {...(block.registered === 0 ? EMPTY : { status: block.noResponse > 0 ? 'warning' : 'good', statusLabel: block.noResponse > 0 ? 'Not reachable' : 'None' })}
        value={block.noResponse}
        detail={block.registered === 0 ? 'Nobody registered yet' : block.noResponse > 0 ? 'Marked No response, or stopped' : 'Nobody is unreachable'}
      />
      <VitalTile
        title="Not onboarded yet"
        {...(block.registered === 0 ? EMPTY : { status: block.notOnboarded > 0 ? 'warning' : 'good', statusLabel: block.notOnboarded > 0 ? 'Still being followed up' : 'All done' })}
        value={block.notOnboarded}
        detail={block.registered === 0 ? 'Nobody registered yet' : block.notOnboarded > 0
          ? (block.waitingForSupport > 0 ? `${block.notOnboarded - block.waitingForSupport} with their Teen Support, ${block.waitingForSupport} waiting for one` : 'With their Teen Support')
          : 'Every registered teen is onboarded or marked No response'}
      />
      {block.notRegistered > 0 && (
        <VitalTile title="Not registered yet" status="warning" statusLabel="Needs work" value={block.notRegistered} detail="On the follow-up list, still to register" to={notRegisteredLink} />
      )}
    </div>
  </section>
);

const RegistrationOverviewCards: React.FC<{
  cohortId: string;
  contacts: FollowUpContact[];
  target?: number | null;
  /** Called with the figures once they are known, and with null while they are loading or could not be loaded. */
  onOverview?: (overview: RegistrationOverview | null) => void;
  /** Lists the adults who have not signed in with "Resend login" (admin Follow-ups only). */
  resendLogin?: boolean;
}> = ({ cohortId, contacts, target, onOverview, resendLogin = false }) => {
  const [people, setPeople] = useState<{ participants: Participant[]; signedIn: Set<string> } | null>(null);
  const [failed, setFailed] = useState(false);
  const request = useRef(0);

  // The people (and who has signed in) are read again whenever the contacts the page holds are refreshed,
  // so the cards never mix a new contact list with an old participant list. Switching cohort clears them.
  // A request that dies in transit (a phone coming back from the background, a dropped signal) is tried
  // once more, only the one that failed, before the error is shown. Real errors (expired session, no
  // permission) are not retried. The retry timer is cleared when a newer load starts or the cards go away.
  const retryTimers = useRef(new Set<number>());
  const clearRetries = useCallback(() => { retryTimers.current.forEach((t) => window.clearTimeout(t)); retryTimers.current.clear(); }, []);
  const load = useCallback(() => {
    const mine = ++request.current;
    clearRetries();
    setFailed(false);
    const withRetry = <T,>(fn: () => Promise<T>): Promise<T> => fn().catch((err: unknown) => {
      const message = err instanceof Error ? err.message : '';
      if (!/load failed|failed to fetch|network|timed? ?out|aborted/i.test(message)) throw err;
      return new Promise<T>((resolve, reject) => {
        const timer = window.setTimeout(() => { retryTimers.current.delete(timer); fn().then(resolve, reject); }, 1500);
        retryTimers.current.add(timer);
      });
    });
    Promise.all([withRetry(() => participantsApi.getAll({ cohortId })), withRetry(() => participantPushApi.getSignedInIds(cohortId))])
      .then(([p, ids]) => { if (mine === request.current) setPeople({ participants: p.participants, signedIn: new Set(ids) }); })
      .catch(() => { if (mine === request.current) setFailed(true); });
  }, [cohortId, clearRetries]);
  useEffect(() => { setPeople(null); }, [cohortId]);
  useEffect(() => {
    load();
    return () => { request.current += 1; clearRetries(); };
  }, [load, contacts, clearRetries]);

  const overview = useMemo(
    () => (people ? computeRegistrationOverview(people.participants, contacts, people.signedIn, cohortId) : null),
    [people, contacts, cohortId],
  );
  const onOverviewRef = useRef(onOverview);
  onOverviewRef.current = onOverview;
  useEffect(() => { onOverviewRef.current?.(overview); }, [overview]);

  if (failed) {
    return (
      <div className="surface-card p-5 text-sm text-gray-600">
        Couldn't check who has signed in, so the registration numbers aren't shown (a wrong number is worse than none).{' '}
        <button type="button" onClick={load} className="font-semibold text-primary underline underline-offset-2">Try again</button>
      </div>
    );
  }
  if (!overview) return <div className="surface-card p-5 text-sm text-gray-500">Counting who has registered and signed in…</div>;

  const { adults, teens, total, wrongNumberPeople } = overview;
  const unlinked = adults.unlinked + teens.unlinked;
  const wrongNumber = adults.wrongNumber + teens.wrongNumber;
  // The contact list is not split by age, so each tile only links to it when the other tile is empty.
  const link = '/follow-ups?tab=contacts&status=open';
  return (
    <div className="space-y-5">
      <p className="text-sm text-gray-600">
        <b className="font-semibold text-gray-900">{total.registered} registered</b> ({adults.registered} adults, {teens.registered} teens)
        {target ? <> · {pct(total.registered / target)}% of the {target} target</> : null}
        {' · '}Adults: {total.adultsLoggedIn} logged in, {total.adultsPending} still to log in
        {' · '}Teens: {teens.onboarded} onboarded, {teens.noResponse} no response, {teens.notOnboarded} not onboarded yet
      </p>
      {unlinked > 0 && (
        <p className="rounded-2xl bg-amber-100/80 px-3 py-2 text-[12px] text-amber-700">
          {unlinked} {unlinked === 1 ? 'contact is' : 'contacts are'} marked registered but {unlinked === 1 ? 'has' : 'have'} no participant record, so they are not counted above.
        </p>
      )}
      {wrongNumber > 0 && (
        <p className="rounded-2xl bg-rose-100/80 px-3 py-2 text-[12px] text-rose-700">
          {wrongNumber} registered {wrongNumber === 1 ? 'person has' : 'people have'} a wrong number, so they are not counted above. They are counted again once a correct number is added.
          {wrongNumberPeople.length > 0 && (
            <span className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
              {wrongNumberPeople.map((p) => (
                <NavLink key={p.id} to={`/participants/${p.id}`} className="font-semibold underline underline-offset-2 hover:text-rose-900">{p.name}</NavLink>
              ))}
            </span>
          )}
        </p>
      )}
      <Block title="Adults" block={adults} reasons={ADULT_REASONS} unit="adult" notRegisteredLink={teens.notRegistered === 0 ? link : undefined} />
      {resendLogin && <ResendLoginList people={adults.pendingPeople.filter((p) => p.reason !== 'parked')} />}
      <TeenCards block={teens} notRegisteredLink={adults.notRegistered === 0 ? link : undefined} />
    </div>
  );
};

export default RegistrationOverviewCards;
