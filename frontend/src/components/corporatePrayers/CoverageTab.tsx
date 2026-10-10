import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ConfirmationModal from '../ConfirmationModal';
import PageLoader from '../PageLoader';
import { useToast } from '../Toast';
import { corporatePrayersApi } from '../../services/api';
import { usePolling } from '../../hooks/usePolling';
import type { PrayerCoverage, PrayerCoveragePerson, PrayerOverview, PrayerPool } from '../../types';
import { PRAYER_TYPE_LABEL, clockLabel } from '../../utils/prayerText';
import { INPUT, Notice, SECONDARY_BTN } from './ui';

// Who has been prayed for in the current cycle, who is still to come, and today's counts. Names are for admins only.

const POOL_LABEL: Record<PrayerPool, { title: string; hint: string }> = {
  FAITH: { title: 'Faith project slots', hint: 'People with a saved faith project who have not opted out.' },
  NAME: { title: 'Verse and picture slots', hint: 'Every participant who has not opted out.' },
};

const shortDate = (iso: string | null) => {
  if (!iso) return 'Not yet';
  const date = new Date(`${iso}T12:00:00`);
  return Number.isNaN(date.getTime()) ? iso : new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(date);
};

const PoolCard: React.FC<{
  pool: PrayerPool; coverage: PrayerCoverage; onRestart: (pool: PrayerPool) => void; onSkip: (person: PrayerCoveragePerson, skip: boolean) => void;
}> = ({ pool, coverage, onRestart, onSkip }) => {
  const cycle = coverage.cycles?.[pool];
  const notYet = useMemo(() => coverage.notYet?.[pool] ?? [], [coverage.notYet, pool]);
  const done = useMemo(() => coverage.doneList?.[pool] ?? [], [coverage.doneList, pool]);
  const [query, setQuery] = useState('');
  const [showDone, setShowDone] = useState(false);
  const total = cycle?.total ?? 0;
  const doneCount = cycle?.done ?? 0;
  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;
  const filtered = useMemo(() => notYet.filter((person) => person.name.toLowerCase().includes(query.trim().toLowerCase())), [notYet, query]);

  return (
    <section className="surface-card space-y-3 p-5" aria-labelledby={`cov-${pool}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 id={`cov-${pool}`} className="text-base font-bold text-gray-900">{POOL_LABEL[pool].title}</h3>
          <p className="text-[13px] text-gray-500">{POOL_LABEL[pool].hint}</p>
        </div>
        <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-600">Cycle {cycle?.cycleNo ?? 1}</span>
      </div>
      <div>
        <div className="flex items-baseline justify-between text-sm">
          <span className="font-semibold text-gray-900">{doneCount} of {total} prayed for</span>
          <span className="text-gray-500">{pct}%</span>
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-gray-200" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${POOL_LABEL[pool].title} cycle progress`}>
          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
        </div>
      </div>
      {total === 0 ? <Notice tone="info">No one is in this pool yet.</Notice> : (
        <>
          <div>
            <label htmlFor={`cov-q-${pool}`} className="sr-only">Search people still to come</label>
            <input id={`cov-q-${pool}`} value={query} onChange={(event) => setQuery(event.target.value)} className={INPUT} placeholder={`Still to come (${notYet.length}). Search`} />
          </div>
          <ul className="max-h-64 divide-y divide-gray-100 overflow-y-auto rounded-xl border border-gray-100">
            {filtered.length === 0 ? <li className="px-3 py-3 text-sm text-gray-500">{notYet.length === 0 ? 'Everyone has had a turn this cycle.' : 'No one matches.'}</li> : filtered.map((person) => (
              <li key={person.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-gray-900">{person.name}{person.skipped && <span className="ml-2 rounded-full bg-amber-100/80 px-2 py-0.5 align-middle text-[11px] font-semibold text-amber-800">Skipped</span>}</p>
                  <p className="text-xs text-gray-500">Last prayed for: {shortDate(person.lastOn)}</p>
                </div>
                <button type="button" onClick={() => onSkip(person, !person.skipped)} className="min-h-[36px] flex-none rounded-lg border border-gray-200 px-2.5 text-xs font-semibold text-gray-600 hover:bg-gray-50">
                  {person.skipped ? 'Include again' : 'Skip this cycle'}
                </button>
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => setShowDone((value) => !value)} aria-expanded={showDone} className="text-[13px] font-semibold text-gray-600 underline-offset-2 hover:underline">
            {showDone ? 'Hide' : 'Show'} who has had a turn ({done.length})
          </button>
          {showDone && (
            <ul className="max-h-48 divide-y divide-gray-100 overflow-y-auto rounded-xl border border-gray-100">
              {done.map((person) => (
                <li key={person.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm"><span className="truncate text-gray-900">{person.name}</span><span className="flex-none text-xs text-gray-500">{shortDate(person.lastOn)}</span></li>
              ))}
            </ul>
          )}
        </>
      )}
      <button type="button" onClick={() => onRestart(pool)} className={SECONDARY_BTN}>Restart the cycle</button>
    </section>
  );
};

const CoverageTab: React.FC<{ cohortId: string; overview: PrayerOverview; onReload: () => void }> = ({ cohortId, overview, onReload }) => {
  const toast = useToast();
  const [coverage, setCoverage] = useState<PrayerCoverage | null>(null);
  const [error, setError] = useState('');
  const [restarting, setRestarting] = useState<PrayerPool | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setCoverage(await corporatePrayersApi.coverage(cohortId)); setError(''); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not load coverage.'); }
  }, [cohortId]);
  useEffect(() => { void load(); }, [load]);
  // Today's counts change while people pray; the rest changes slowly. One quiet refresh of the overview while this tab is open.
  usePolling(() => onReload(), 15000);

  const restart = async () => {
    if (!restarting) return;
    setBusy(true);
    try { await corporatePrayersApi.restartCycle(cohortId, restarting); toast({ message: 'Cycle restarted' }); setRestarting(null); void load(); }
    catch (err) { toast({ tone: 'error', message: err instanceof Error ? err.message : 'Could not restart the cycle.' }); setRestarting(null); }
    finally { setBusy(false); }
  };

  const skip = async (person: PrayerCoveragePerson, skipIt: boolean) => {
    try { await corporatePrayersApi.skipPerson(cohortId, person.id, skipIt); void load(); }
    catch (err) { toast({ tone: 'error', message: err instanceof Error ? err.message : 'Could not update that person.' }); }
  };

  if (!coverage && !error) return <PageLoader />;
  const todaySlots = overview.slots.filter((slot) => slot.active);

  return (
    <div className="space-y-5">
      {error && <Notice tone="error">{error}</Notice>}
      <section className="surface-card p-5" aria-labelledby="cov-today">
        <h2 id="cov-today" className="text-base font-bold text-gray-900">Today</h2>
        {todaySlots.length === 0 ? <p className="mt-1 text-sm text-gray-500">No active slots.</p> : (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {todaySlots.map((slot) => (
              <li key={slot.id} className="rounded-xl bg-gray-50 px-3.5 py-3">
                <p className="text-sm font-bold text-gray-900">{clockLabel(slot.time)} <span className="font-medium text-gray-500">· {slot.name || PRAYER_TYPE_LABEL[slot.slotType]}</span></p>
                <p className="mt-0.5 text-[13px] text-gray-600">{slot.today ? `${slot.today.counts.joined} joined · ${slot.today.counts.praying} praying · ${slot.today.counts.amen} said Amen` : 'Not opened yet today'}</p>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-gray-500">Counted: {overview.counted.participants} participants and {overview.counted.supports} supports. Admins are not counted unless they also support.</p>
      </section>
      {coverage && (
        <div className="grid gap-5 lg:grid-cols-2">
          <PoolCard pool="FAITH" coverage={coverage} onRestart={setRestarting} onSkip={(person, value) => { void skip(person, value); }} />
          <PoolCard pool="NAME" coverage={coverage} onRestart={setRestarting} onSkip={(person, value) => { void skip(person, value); }} />
        </div>
      )}
      {coverage && coverage.hubs.length > 0 && (
        <section className="surface-card p-5" aria-labelledby="cov-hubs">
          <h2 id="cov-hubs" className="text-base font-bold text-gray-900">Hubs</h2>
          <p className="text-[13px] text-gray-500">In hub mode, each hub prays for a different person each day.</p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[320px] text-left text-sm">
              <thead><tr className="text-xs uppercase tracking-wide text-gray-500"><th className="py-2 pr-4 font-semibold">Hub</th><th className="py-2 pr-4 font-semibold">Participants</th><th className="py-2 font-semibold">Supports</th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {coverage.hubs.map((hub) => (
                  <tr key={hub.hubKey}><td className="py-2 pr-4 font-semibold text-gray-900">{hub.name}</td><td className="py-2 pr-4 tabular-nums text-gray-700">{hub.participants}</td><td className="py-2 tabular-nums text-gray-700">{hub.supports}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <ConfirmationModal
        isOpen={!!restarting}
        onClose={() => setRestarting(null)}
        onConfirm={() => { void restart(); }}
        title="Restart the cycle?"
        message="Everyone becomes eligible again, starting with the people longest since they were prayed for. Nothing is deleted."
        confirmText="Restart"
        type="warning"
        confirmLoading={busy}
      />
    </div>
  );
};

export default CoverageTab;
