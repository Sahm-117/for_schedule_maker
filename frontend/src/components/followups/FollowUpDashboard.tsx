import React, { useEffect, useState } from 'react';
import type { FollowUpContact, FollowUpStatus } from '../../types';
import { computeFollowUpFunnel, computeFollowUpHeadline, computeFollowUpStatus, computeIntroducerBreakdown, computeOwnerBreakdown, type OwnerBreakdownRow } from '../../utils/followUps';
import { VitalTile } from '../dashboard/DashboardParts';
import { settingsApi } from '../../services/api';

// One colour per status, matching the tone each status already carries on its
// pill: slate before contact, amber while waiting, emerald once they reply or
// register, sky for a shared login and next cohort, orange for a login
// problem, rose/neutral once they stop.
const STATUS_COLOR: Record<FollowUpStatus, string> = {
  TO_CONTACT: '#cbd5e1',
  WAITING: '#fcd34d',
  NEEDS_REMINDER: '#f59e0b',
  REPLIED: '#6ee7b7',
  CALL_BACK_LATER: '#c4b5fd',
  REGISTERED: '#6ee7b7',
  LOGIN_SHARED: '#7dd3fc',
  LOGIN_ISSUE: '#fb923c',
  ACCESS_CONFIRMED: '#10b981',
  ATTENDED: '#5eead4',
  NEXT_COHORT: '#38bdf8',
  WRONG_NUMBER: '#fb7185',
  NOT_INTERESTED: '#f43f5e',
  NO_RESPONSE: '#dfe3e8',
};

const pct = (rate: number) => Math.round(rate * 100);

// In "Where all … stand", Registered reads as the tile it belongs to.
const OVERVIEW_LABEL: Partial<Record<FollowUpStatus, string>> = { REGISTERED: 'Needs login' };

const Chevron: React.FC<{ open: boolean }> = ({ open }) => (
  <svg className={`h-3.5 w-3.5 flex-none text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="m9 5 7 7-7 7" />
  </svg>
);

const contactsLink = (status?: FollowUpStatus | 'open') =>
  `/follow-ups?tab=contacts${status ? `&status=${status}` : ''}`;

// Thin stacked bar showing how a support's assigned contacts split out, so the
// shape of their work is visible at a glance without reading five numbers.
const SupportBar: React.FC<{ row: OwnerBreakdownRow }> = ({ row }) => {
  // Wrong numbers aren't in `assigned` but still get their grey sliver.
  const total = row.assigned + row.wrongNumber || 1;
  const segments: Array<{ value: number; className: string }> = [
    { value: row.accessConfirmed, className: 'bg-emerald-500' },
    { value: row.loginShared - row.accessConfirmed, className: 'bg-emerald-200' },
    { value: row.loginToShare, className: 'bg-sky-500' },
    { value: row.stillOpen, className: 'bg-amber-500' },
    { value: row.nextCohort, className: 'bg-violet-500' },
    { value: row.stopped, className: 'bg-neutral-300' },
  ];
  // Stacked, not inline with the bar — at desktop table widths the two never
  // had enough shared space and the label got clipped down to a stray digit.
  return (
    <div className="mt-1.5 min-w-0">
      <span className="flex h-1.5 w-full max-w-[9rem] overflow-hidden rounded-full bg-gray-100">
        {segments.map((seg, i) => seg.value > 0 && (
          <span key={i} className={`h-full ${seg.className}`} style={{ width: `${(seg.value / total) * 100}%` }} />
        ))}
      </span>
      <span className="mt-1 block truncate text-[11px] text-gray-500">{row.accessConfirmed} of {row.assigned} logged in</span>
    </div>
  );
};

// The cohort's sign-up goal, set by the admin, with how far along it is and
// how many are still to go. Saved per cohort.
const MobilisationTarget: React.FC<{ cohortId: string; cohortName?: string; signedUp: number; onTarget?: (target: number | null) => void }> = ({ cohortId, cohortName, signedUp, onTarget }) => {
  const [target, setTargetState] = useState<number | null>(null);
  // The Signed up card below measures against the same target.
  const setTarget = (value: number | null) => { setTargetState(value); onTarget?.(value); };
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    setEditing(false);
    settingsApi.getMobilisationTarget(cohortId)
      .then(({ target: t }) => { if (!cancelled) setTarget(t); })
      .catch(() => { if (!cancelled) setTarget(null); })
      .finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [cohortId]);

  const startEdit = () => { setDraft(target ? String(target) : ''); setError(null); setEditing(true); };
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = Math.floor(Number(draft));
    if (!Number.isFinite(value) || value < 1) { setError('Enter a number above 0'); return; }
    setSaving(true);
    setError(null);
    try {
      const { target: saved } = await settingsApi.setMobilisationTarget(cohortId, value);
      setTarget(saved);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the target');
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) return null;
  const left = target ? Math.max(target - signedUp, 0) : 0;
  const progress = target ? Math.min(signedUp / target, 1) : 0;

  return (
    <section className="surface-card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-gray-900">Mobilisation target{cohortName ? ` · ${cohortName}` : ''}</h3>
          {target ? (
            <p className="mt-1 text-sm text-gray-600">
              <span className="text-2xl font-bold tabular-nums text-gray-900">{signedUp}</span> of {target} signed up
              {' · '}
              <span className={left > 0 ? 'font-semibold text-amber-700' : 'font-semibold text-emerald-700'}>
                {left > 0 ? `${left} to go` : 'Target reached'}
              </span>
            </p>
          ) : (
            <p className="mt-1 text-sm text-gray-500">No target set yet. Set how many sign-ups this cohort is aiming for.</p>
          )}
        </div>
        {!editing && (
          <button type="button" onClick={startEdit} className="rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
            {target ? 'Edit target' : 'Set target'}
          </button>
        )}
      </div>
      {editing && (
        <form onSubmit={save} className="mt-3 flex flex-wrap items-center gap-2">
          <input
            type="number"
            inputMode="numeric"
            min={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="e.g. 40"
            aria-label="Mobilisation target"
            autoFocus
            className="h-10 w-28 rounded-xl border border-gray-200 px-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <button type="submit" disabled={saving} className="h-10 rounded-xl bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button type="button" onClick={() => setEditing(false)} className="h-10 rounded-xl border border-gray-200 px-4 text-sm font-semibold text-gray-600 hover:bg-gray-50">
            Cancel
          </button>
          {error && <p className="w-full text-xs text-red-600">{error}</p>}
        </form>
      )}
      {target && (
        <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-gray-100">
          <span className={`block h-full ${left > 0 ? 'bg-primary' : 'bg-emerald-500'}`} style={{ width: `${progress * 100}%` }} />
        </div>
      )}
    </section>
  );
};

const FollowUpDashboard: React.FC<{ contacts: FollowUpContact[]; cohortId?: string | null; cohortName?: string; onShowUnassigned?: () => void }> = ({ contacts, cohortId, cohortName, onShowUnassigned }) => {
  const funnel = computeFollowUpFunnel(contacts);
  // A wrong number was never a prospect we could reach, so it's left out of the
  // prospect totals below. It still shows in the Dropped tile.
  const reachable = contacts.filter((c) => computeFollowUpStatus(c) !== 'WRONG_NUMBER');
  const wrongNumbers = contacts.length - reachable.length;
  const standing = computeFollowUpFunnel(reachable);
  // The four tiles, worked out the same way as on the admin Dashboard.
  const headline = computeFollowUpHeadline(contacts);
  const owners = computeOwnerBreakdown(contacts);
  const introducers = computeIntroducerBreakdown(contacts);
  const totalMet = introducers.reduce((sum, row) => sum + row.met, 0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [target, setTarget] = useState<number | null>(null);
  const priorContacts = reachable.filter((c) => !c.cohortId);
  const priorCohort = { total: priorContacts.length, unassigned: priorContacts.filter((c) => !c.ownerId).length };
  const currentCohortCount = reachable.length - priorCohort.total;
  // Of this cohort's people: who signed themselves up on the form vs. who a
  // support added to follow up (they haven't filled the form yet).
  const currentFromForm = reachable.filter((c) => c.cohortId && c.source === 'Google Form').length;
  const currentAdded = currentCohortCount - currentFromForm;

  const totals = owners.reduce(
    (sum, row) => ({
      assigned: sum.assigned + row.assigned,
      stillOpen: sum.stillOpen + row.stillOpen,
      loginToShare: sum.loginToShare + row.loginToShare,
      accessConfirmed: sum.accessConfirmed + row.accessConfirmed,
      nextCohort: sum.nextCohort + row.nextCohort,
      stopped: sum.stopped + row.stopped,
    }),
    { assigned: 0, stillOpen: 0, loginToShare: 0, accessConfirmed: 0, nextCohort: 0, stopped: 0 },
  );

  // Unassigned prospects are nobody's work yet, so they don't belong in a table
  // of who's doing what — they get their own callout above it instead.
  const unassignedRow = owners.find((row) => !row.ownerId);
  const namedOwners = owners.filter((row) => row.ownerId);

  // One row per status, biggest first, so the list reads as a ranking rather
  // than as a single bar the eye has to take apart.
  // Wrong numbers sit last, apart from the ranking, so it's clear what happened
  // to them without adding them to the total.
  const ranked = [
    ...[...standing.buckets].sort((a, b) => b.value - a.value),
    ...funnel.buckets.filter((b) => b.status === 'WRONG_NUMBER'),
  ];
  const biggest = ranked.length ? Math.max(...ranked.map((b) => b.value)) : 0;
  const byStage = (stages: string[]) => [...standing.buckets].filter((b) => stages.includes(b.stage)).sort((a, b) => b.value - a.value);
  const signedUpTotal = standing.registered + standing.loginShared + standing.done;
  const groups = [
    { key: 'signed', title: 'Signed up', buckets: byStage(['registered', 'loginShared', 'done']) },
    { key: 'open', title: 'Not signed up yet', buckets: byStage(['open']) },
    { key: 'next', title: 'Joining next cohort', buckets: byStage(['nextCohort']) },
    { key: 'stopped', title: 'Stopped', buckets: byStage(['stopped']) },
    { key: 'wrong', title: '', buckets: funnel.buckets.filter((b) => b.status === 'WRONG_NUMBER') },
  ].map((g) => ({ ...g, total: g.buckets.reduce((n, b) => n + b.value, 0) })).filter((g) => g.buckets.length > 0);

  return (
    <div className="space-y-6">
      {cohortId && <MobilisationTarget cohortId={cohortId} cohortName={cohortName} signedUp={headline.signedUp} onTarget={setTarget} />}

      {/* The path from sign-up to the app, then who still needs chasing. */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <VitalTile
          title="Signed up"
          status="neutral"
          statusLabel={target ? `${pct(headline.signedUp / target)}% of ${target} target` : 'No target set'}
          value={headline.signedUp}
          unit={headline.signedUp === 1 ? 'person' : 'people'}
          detail={headline.nextCohort > 0 ? `${headline.nextCohort} more waiting for the next cohort` : 'On the form or with their support'}
          to={contactsLink('REGISTERED')}
        />
        <VitalTile
          title="Needs login"
          status={headline.needsLogin > 0 ? 'warning' : 'good'}
          statusLabel={headline.needsLogin > 0 ? 'Waiting on us' : 'All handed over'}
          value={headline.needsLogin}
          unit={headline.needsLogin === 1 ? 'person' : 'people'}
          detail={headline.needsLogin > 0 ? 'Signed up, but nobody has sent their login yet' : 'Nobody is waiting on a login'}
          to={contactsLink('REGISTERED')}
        />
        <VitalTile
          title="Login shared"
          status="neutral"
          statusLabel="Waiting on them"
          value={headline.loginShared}
          unit={headline.loginShared === 1 ? 'person' : 'people'}
          detail={headline.loginShared > 0
            ? `They have their login but haven't signed in yet${headline.loginIssue > 0 ? ` · ${headline.loginIssue} with a login problem` : ''}`
            : 'Nobody is waiting to sign in'}
          to={contactsLink('LOGIN_SHARED')}
        />
        <VitalTile
          title="Logged in"
          status={headline.loggedIn > 0 ? 'good' : 'neutral'}
          statusLabel="Confirmed"
          value={headline.loggedIn}
          unit={headline.loggedIn === 1 ? 'person' : 'people'}
          detail={headline.signedUp > 0 ? `${pct(headline.loggedIn / headline.signedUp)}% of those signed up are in the app` : 'Nobody has signed in yet'}
          to={contactsLink('ACCESS_CONFIRMED')}
        />
        <VitalTile
          title="Not signed up yet"
          status={headline.notDone > 0 ? 'warning' : 'good'}
          statusLabel={headline.notDone > 0 ? 'Needs work' : 'All handled'}
          value={headline.notDone}
          unit={headline.notDone === 1 ? 'person' : 'people'}
          detail={headline.notDone > 0 ? 'They need to be contacted to register' : 'Everyone on the list has signed up or stopped'}
          to={contactsLink('open')}
        />
      </div>

      {/* Contacts with no cohort are prior-cohort follow-ups shown under the
          active cohort; split them out so the two groups aren't confused. */}
      {priorCohort.total > 0 && (
        <section className="surface-card p-5 sm:p-6">
          <h3 className="text-base font-semibold text-gray-900">This cohort vs. prior cohort follow-ups</h3>
          <p className="mb-4 text-xs text-gray-500">Prior-cohort people join this cohort once they’re assigned to a support.</p>
          <div className="mb-4 flex h-2.5 overflow-hidden rounded-full bg-gray-100">
            <span className="block h-full bg-primary" style={{ width: `${(currentCohortCount / reachable.length) * 100}%` }} />
            <span className="block h-full bg-neutral-300" style={{ width: `${(priorCohort.total / reachable.length) * 100}%` }} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-primary/10 px-4 py-3">
              <p className="text-2xl font-bold tabular-nums text-gray-900">{currentCohortCount}</p>
              <p className="text-xs font-semibold text-primary-dark">This cohort</p>
              <p className="mt-0.5 text-[11px] text-primary-dark/80">
                {currentFromForm} filled the form · {currentAdded} added for follow-up
              </p>
            </div>
            <div className="rounded-2xl bg-neutral-100 px-4 py-3">
              <p className="text-2xl font-bold tabular-nums text-gray-900">{priorCohort.total}</p>
              <p className="text-xs font-semibold text-neutral-600">From a prior cohort</p>
              <p className="mt-0.5 text-[11px] text-neutral-500">{priorCohort.unassigned} still to assign</p>
            </div>
          </div>
        </section>
      )}

      {/* Everyone on the list, grouped: signed up, not signed up yet, and the
          rest. Each person counted once, in one place only. */}
      <section className="surface-card p-5 sm:p-6">
        <h3 className="text-base font-semibold text-gray-900">All {standing.total} contacts</h3>
        <p className="mb-4 text-xs text-gray-500">
          {signedUpTotal} signed up · {standing.open} not signed up yet{standing.nextCohort + standing.stopped > 0 ? ` · ${standing.nextCohort + standing.stopped} other` : ''}. Each person counted once.
          {wrongNumbers > 0 && ` Wrong numbers are shown but not counted in the ${standing.total}.`}
        </p>
        {ranked.length === 0 ? (
          <p className="rounded-2xl bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">No contacts yet.</p>
        ) : (
          <div className="space-y-4">
            {groups.map((group) => (
              <div key={group.key} className={group.key === 'wrong' ? 'border-t border-dashed border-gray-200 pt-3' : ''}>
                {group.title && (
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                    {group.title} <span className="tabular-nums text-gray-500">{group.total}</span>
                  </p>
                )}
                <ul className="space-y-2.5">
                  {group.buckets.map((bucket) => (
                    <li key={bucket.status} className="flex items-center gap-3">
                      <span className="w-36 flex-none text-sm leading-tight text-gray-700 sm:w-48">{OVERVIEW_LABEL[bucket.status] ?? bucket.label}</span>
                      <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                        <span
                          className="block h-full rounded-full"
                          style={{ width: `${biggest ? Math.max((bucket.value / biggest) * 100, 4) : 0}%`, backgroundColor: STATUS_COLOR[bucket.status] }}
                        />
                      </span>
                      <span className="w-14 flex-none text-right text-sm font-bold tabular-nums text-gray-900">{bucket.value}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      {unassignedRow && unassignedRow.assigned > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {unassignedRow.assigned} {unassignedRow.assigned === 1 ? 'contact has' : 'contacts have'} nobody following up.{' '}
          {onShowUnassigned ? (
            <button type="button" onClick={onShowUnassigned} className="font-semibold text-amber-800 underline">
              Assign them
            </button>
          ) : (
            'Assign them from the Contacts list.'
          )}
        </div>
      )}

      <section className="surface-card overflow-hidden">
        <div className="border-b border-orange-100 px-5 py-4">
          <p className="text-sm font-bold text-gray-900">By support</p>
          <p className="text-xs text-gray-500">Most work left first. A follow-up is only done once they’ve logged in to the app. Open a row to see who is not joining, and why.</p>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="bg-orange-50/60 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th scope="col" className="px-5 py-3">Support</th>
              <th scope="col" className="hidden px-3 py-3 text-right sm:table-cell">Contacts</th>
              <th scope="col" className="hidden px-3 py-3 text-right sm:table-cell">Not signed up yet</th>
              <th scope="col" className="hidden px-3 py-3 text-right sm:table-cell">Needs login</th>
              <th scope="col" className="hidden px-3 py-3 text-right sm:table-cell">Logged in</th>
              <th scope="col" className="hidden px-3 py-3 text-right sm:table-cell">Next cohort</th>
              <th scope="col" className="hidden px-5 py-3 text-right sm:table-cell">Dropped</th>
            </tr>
          </thead>
          <tbody>
            {namedOwners.length === 0 ? (
              <tr><td colSpan={7} className="px-5 py-8 text-center text-gray-400">{owners.length === 0 ? 'No prospects yet.' : 'Nobody has been assigned a contact yet.'}</td></tr>
            ) : (
              namedOwners.map((row) => {
                const key = row.ownerId || 'unassigned';
                const open = expanded === key;
                return (
                  <React.Fragment key={key}>
                    <tr className="border-t border-orange-50">
                      <td className="px-5 py-3">
                        <button
                          type="button"
                          onClick={() => setExpanded(open ? null : key)}
                          aria-expanded={open}
                          className="flex w-full items-start gap-1.5 text-left"
                        >
                          <Chevron open={open} />
                          <div className="min-w-0 flex-1">
                            <span className="block truncate font-semibold text-gray-900">{row.ownerName}</span>
                            <SupportBar row={row} />
                          </div>
                        </button>
                      </td>
                      <td className="hidden px-3 py-3 text-right font-semibold tabular-nums sm:table-cell">{row.assigned}</td>
                      <td className="hidden px-3 py-3 text-right font-bold tabular-nums text-amber-700 sm:table-cell">{row.stillOpen}</td>
                      <td className={`hidden px-3 py-3 text-right font-bold tabular-nums sm:table-cell ${row.loginToShare > 0 ? 'text-sky-700' : 'text-gray-400'}`}>{row.loginToShare}</td>
                      <td className="hidden px-3 py-3 text-right font-semibold tabular-nums text-emerald-700 sm:table-cell">{row.accessConfirmed}</td>
                      <td className={`hidden px-3 py-3 text-right font-semibold tabular-nums sm:table-cell ${row.nextCohort > 0 ? 'text-violet-700' : 'text-gray-400'}`}>{row.nextCohort}</td>
                      <td className="hidden px-5 py-3 text-right font-semibold tabular-nums text-neutral-600 sm:table-cell">{row.stopped}</td>
                    </tr>
                    {open && (
                      <tr className="border-t border-orange-50 bg-orange-50/30">
                        <td colSpan={7} className="px-5 py-3">
                          <div className="mb-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:hidden">
                            <span className="text-gray-500">Contacts <span className="font-semibold tabular-nums text-gray-900">{row.assigned}</span></span>
                            <span className="text-gray-500">Not signed up yet <span className="font-semibold tabular-nums text-amber-700">{row.stillOpen}</span></span>
                            <span className="text-gray-500">Needs login <span className="font-semibold tabular-nums text-sky-700">{row.loginToShare}</span></span>
                            <span className="text-gray-500">Logged in <span className="font-semibold tabular-nums text-emerald-700">{row.accessConfirmed}</span></span>
                            <span className="text-gray-500">Next cohort <span className="font-semibold tabular-nums text-violet-700">{row.nextCohort}</span></span>
                            <span className="text-gray-500">Dropped <span className="font-semibold tabular-nums text-neutral-600">{row.stopped}</span></span>
                          </div>
                          {row.stopped === 0 && row.nextCohort === 0 ? (
                            <p className="text-xs text-gray-500">Everyone given to {row.ownerName} is still in play.</p>
                          ) : (
                            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                              <span className="text-xs font-semibold text-gray-700">Dropped <span className="tabular-nums text-gray-900">{row.stopped}</span></span>
                              {row.nextCohort > 0 && (
                                <span className="text-xs text-gray-600">Will join next cohort <span className="font-semibold tabular-nums text-gray-900">{row.nextCohort}</span></span>
                              )}
                              {row.stoppedReasons.map((reason) => (
                                <span key={reason.label} className="text-xs text-gray-600">
                                  {reason.label} <span className="font-semibold tabular-nums text-gray-900">{reason.value}</span>
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
          {owners.length > 0 && (
            <tfoot className="border-t-2 border-orange-100 bg-orange-50/40 text-sm">
              <tr>
                <td className="px-5 py-3 font-bold text-gray-900">Everyone</td>
                <td className="hidden px-3 py-3 text-right font-bold tabular-nums sm:table-cell">{totals.assigned}</td>
                <td className="hidden px-3 py-3 text-right font-bold tabular-nums text-amber-700 sm:table-cell">{totals.stillOpen}</td>
                <td className="hidden px-3 py-3 text-right font-bold tabular-nums text-sky-700 sm:table-cell">{totals.loginToShare}</td>
                <td className="hidden px-3 py-3 text-right font-bold tabular-nums text-emerald-700 sm:table-cell">{totals.accessConfirmed}</td>
                <td className="hidden px-3 py-3 text-right font-bold tabular-nums text-violet-700 sm:table-cell">{totals.nextCohort}</td>
                <td className="hidden px-5 py-3 text-right font-bold tabular-nums text-neutral-600 sm:table-cell">{totals.stopped}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </section>

      {/* Who is meeting people, as opposed to who is chasing them. These are two
          different supports on the same prospect, and the back office needs both. */}
      <section className="surface-card overflow-hidden">
        <div className="border-b border-orange-100 px-5 py-4">
          <p className="text-sm font-bold text-gray-900">Brought in by</p>
          <p className="text-xs text-gray-500">
            {totalMet === 0
              ? 'Nobody has brought anyone in yet.'
              : `${totalMet} ${totalMet === 1 ? 'person was' : 'people were'} brought in by a support. People who found the sign-up form on their own are not counted here.`}
          </p>
        </div>
        {introducers.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-gray-400">
            When a support taps “Met someone” in Mobilisation, they show up here.
          </p>
        ) : (
          <table className="w-full table-fixed text-left text-sm sm:table-auto">
            <thead className="bg-orange-50/60 text-[10px] uppercase tracking-wide text-gray-500 sm:text-xs">
              <tr>
                <th scope="col" className="w-[34%] px-2 py-3 sm:w-auto sm:px-5">Support</th>
                <th scope="col" className="w-[22%] px-1.5 py-3 text-right sm:w-auto sm:px-3">
                  <span className="sm:hidden">Brought</span>
                  <span className="hidden sm:inline">People brought</span>
                </th>
                <th scope="col" className="w-[22%] px-1.5 py-3 text-right sm:w-auto sm:px-3">Signed up</th>
                <th scope="col" className="w-[22%] px-2 py-3 text-right sm:w-auto sm:px-5">
                  Logged in
                </th>
              </tr>
            </thead>
            <tbody>
              {introducers.map((row) => (
                <tr key={row.supportId} className="border-t border-orange-50">
                  <td className="truncate px-2 py-3 font-semibold text-gray-900 sm:px-5">{row.supportName}</td>
                  <td className="px-1.5 py-3 text-right font-bold tabular-nums text-gray-900 sm:px-3">{row.met}</td>
                  <td className="px-1.5 py-3 text-right font-semibold tabular-nums text-emerald-700 sm:px-3">{row.signedUp}</td>
                  <td className="px-2 py-3 text-right font-semibold tabular-nums text-emerald-700 sm:px-5">{row.loggedIn}</td>
                </tr>
              ))}
            </tbody>
            {introducers.length > 1 && (
              <tfoot className="border-t-2 border-orange-100 bg-orange-50/40 text-sm">
                <tr>
                  <td className="px-2 py-3 font-bold text-gray-900 sm:px-5">Everyone</td>
                  <td className="px-1.5 py-3 text-right font-bold tabular-nums text-gray-900 sm:px-3">{totalMet}</td>
                  <td className="px-1.5 py-3 text-right font-bold tabular-nums text-emerald-700 sm:px-3">{introducers.reduce((n, r) => n + r.signedUp, 0)}</td>
                  <td className="px-2 py-3 text-right font-bold tabular-nums text-emerald-700 sm:px-5">{introducers.reduce((n, r) => n + r.loggedIn, 0)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        )}
      </section>
    </div>
  );
};

export default FollowUpDashboard;
