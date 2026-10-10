import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FollowUpContact, Participant } from '../../types';
import { participantPushApi, participantsApi } from '../../services/api';
import { computeRegistrationOverview, type PeopleBlock, type PendingReason, type RegistrationOverview, type TeenBlock } from '../../utils/registrationOverview';
import { VitalTile } from '../dashboard/DashboardParts';

// The registration numbers, adults and teens apart, counted from people (see utils/registrationOverview).
// Shown on the admin Dashboard and on Follow-ups → Overview.

const pct = (rate: number) => Math.round(rate * 100);

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
          status={block.pending > 0 ? 'warning' : 'good'}
          statusLabel={block.pending > 0 ? 'Registered, not in the app' : 'Everyone is in'}
          value={block.pending}
          detail={block.pending > 0 ? 'Registered, but not signed in yet:' : 'Nobody is waiting to sign in'}
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
        status={block.notRegistered > 0 ? 'warning' : 'good'}
        statusLabel={block.notRegistered > 0 ? 'Needs work' : 'All handled'}
        value={block.notRegistered}
        detail={block.notRegistered > 0 ? 'On the follow-up list, still to register' : 'Everyone on the list has registered or stopped'}
        to={block.notRegistered > 0 ? notRegisteredLink : undefined}
      />
    </div>
  </section>
);

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
        status={block.noResponse > 0 ? 'warning' : 'good'}
        statusLabel={block.noResponse > 0 ? 'Not reachable' : 'None'}
        value={block.noResponse}
        detail={block.noResponse > 0 ? 'Marked No response, or stopped' : 'Nobody is unreachable'}
      />
      <VitalTile
        title="Not onboarded yet"
        status={block.notOnboarded > 0 ? 'warning' : 'good'}
        statusLabel={block.notOnboarded > 0 ? 'Still being followed up' : 'All done'}
        value={block.notOnboarded}
        detail={block.notOnboarded > 0
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
}> = ({ cohortId, contacts, target, onOverview }) => {
  const [people, setPeople] = useState<{ participants: Participant[]; signedIn: Set<string> } | null>(null);
  const [failed, setFailed] = useState(false);
  const request = useRef(0);

  // The people (and who has signed in) are read again whenever the contacts the page holds are refreshed,
  // so the cards never mix a new contact list with an old participant list. Switching cohort clears them.
  // A request that dies (a phone coming back from the background, a dropped signal) is tried once more
  // before anything is shown. If a refresh still fails while numbers are already on screen, those stay:
  // the error only replaces the cards when there is nothing to show.
  const load = useCallback(() => {
    const mine = ++request.current;
    setFailed(false);
    const fetchAll = () => Promise.all([participantsApi.getAll({ cohortId }), participantPushApi.getSignedInIds(cohortId)]);
    fetchAll()
      .catch(() => new Promise<void>((resolve) => { window.setTimeout(resolve, 1500); }).then(fetchAll))
      .then(([p, ids]) => { if (mine === request.current) setPeople({ participants: p.participants, signedIn: new Set(ids) }); })
      .catch(() => { if (mine === request.current) setFailed(true); });
  }, [cohortId]);
  useEffect(() => { setPeople(null); }, [cohortId]);
  useEffect(() => {
    load();
    return () => { request.current += 1; };
  }, [load, contacts]);

  const overview = useMemo(
    () => (people ? computeRegistrationOverview(people.participants, contacts, people.signedIn, cohortId) : null),
    [people, contacts, cohortId],
  );
  const onOverviewRef = useRef(onOverview);
  onOverviewRef.current = onOverview;
  useEffect(() => { onOverviewRef.current?.(overview); }, [overview]);

  if (failed && !people) {
    return (
      <div className="surface-card p-5 text-sm text-gray-600">
        Couldn't check who has signed in, so the registration numbers aren't shown (a wrong number is worse than none).{' '}
        <button type="button" onClick={load} className="font-semibold text-primary underline underline-offset-2">Try again</button>
      </div>
    );
  }
  if (!overview) return <div className="surface-card p-5 text-sm text-gray-500">Counting who has registered and signed in…</div>;

  const { adults, teens, total } = overview;
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
        </p>
      )}
      <Block title="Adults" block={adults} reasons={ADULT_REASONS} unit="adult" notRegisteredLink={teens.notRegistered === 0 ? link : undefined} />
      <TeenCards block={teens} notRegisteredLink={adults.notRegistered === 0 ? link : undefined} />
    </div>
  );
};

export default RegistrationOverviewCards;
