import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { FollowUpContact, Participant } from '../../types';
import { participantPushApi, participantsApi } from '../../services/api';
import { computeRegistrationOverview, type PeopleBlock, type PendingReason, type RegistrationOverview } from '../../utils/registrationOverview';
import { VitalTile } from '../dashboard/DashboardParts';

// The registration numbers, adults and teens apart, counted from people (see utils/registrationOverview).
// Shown on the admin Dashboard and on Follow-ups → Overview.

const pct = (rate: number) => Math.round(rate * 100);

const REASON_LABEL: Record<PendingReason, string> = {
  loginSent: 'Login sent, not signed in yet',
  notSentYet: 'Login not sent yet',
  handMarked: 'Marked as logged in by hand, not signed in',
  parked: 'Not reachable, or joining next cohort',
  withTeenSupport: 'With their Teen Support',
  waitingForSupport: 'Waiting for a Teen Support',
};
const ADULT_REASONS: PendingReason[] = ['loginSent', 'notSentYet', 'parked', 'handMarked'];
const TEEN_REASONS: PendingReason[] = ['withTeenSupport', 'waitingForSupport', 'parked'];

const Block: React.FC<{ title: string; block: PeopleBlock; reasons: PendingReason[]; unit: string }> = ({ title, block, reasons, unit }) => (
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
        to={block.notRegistered > 0 ? '/follow-ups?tab=contacts&status=open' : undefined}
      />
    </div>
  </section>
);

const RegistrationOverviewCards: React.FC<{
  cohortId: string;
  contacts: FollowUpContact[];
  target?: number | null;
  /** Called with the figures once they are known, so a page can use the same total elsewhere. */
  onOverview?: (overview: RegistrationOverview) => void;
}> = ({ cohortId, contacts, target, onOverview }) => {
  const [people, setPeople] = useState<{ participants: Participant[]; signedIn: Set<string> } | null>(null);
  const [failed, setFailed] = useState(false);
  const request = useRef(0);

  const load = useCallback(() => {
    const mine = ++request.current;
    setFailed(false);
    Promise.all([participantsApi.getAll({ cohortId }), participantPushApi.getSignedInIds(cohortId)])
      .then(([p, ids]) => { if (mine === request.current) setPeople({ participants: p.participants, signedIn: new Set(ids) }); })
      .catch(() => { if (mine === request.current) setFailed(true); });
  }, [cohortId]);
  useEffect(() => {
    setPeople(null);
    load();
    return () => { request.current += 1; };
  }, [load]);

  const overview = people ? computeRegistrationOverview(people.participants, contacts, people.signedIn, cohortId) : null;
  const registered = overview?.total.registered ?? null;
  useEffect(() => { if (overview && onOverview) onOverview(overview); }, [registered, overview?.total.loggedIn, overview?.teens.registered]); // eslint-disable-line react-hooks/exhaustive-deps

  if (failed) {
    return (
      <div className="surface-card p-5 text-sm text-gray-600">
        Couldn't check who has signed in, so the registration numbers aren't shown (a wrong number is worse than none).{' '}
        <button type="button" onClick={load} className="font-semibold text-primary underline underline-offset-2">Try again</button>
      </div>
    );
  }
  if (!overview) return <div className="surface-card p-5 text-sm text-gray-500">Counting who has registered and signed in…</div>;

  const { adults, teens, total } = overview;
  return (
    <div className="space-y-5">
      <p className="text-sm text-gray-600">
        <b className="font-semibold text-gray-900">{total.registered} registered</b> ({adults.registered} adults, {teens.registered} teens)
        {target ? <> · {pct(total.registered / target)}% of the {target} target</> : null}
        {' · '}{total.loggedIn} logged in · {total.pending} still to log in
      </p>
      <Block title="Adults" block={adults} reasons={ADULT_REASONS} unit="adult" />
      <Block title="Teens" block={teens} reasons={TEEN_REASONS} unit="teen" />
    </div>
  );
};

export default RegistrationOverviewCards;
