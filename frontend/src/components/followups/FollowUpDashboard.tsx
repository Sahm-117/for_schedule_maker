import React, { useState } from 'react';
import type { FollowUpContact, FollowUpStatus } from '../../types';
import { computeFollowUpFunnel, computeIntroducerBreakdown, computeOwnerBreakdown, type OwnerBreakdownRow } from '../../utils/followUps';
import { VitalTile } from '../dashboard/DashboardParts';

// One colour per status, matching the tone each status already carries on its
// pill: slate before contact, amber while waiting, emerald once they reply or
// register, sky for next cohort, rose/neutral once they stop.
const STATUS_COLOR: Record<FollowUpStatus, string> = {
  TO_CONTACT: '#cbd5e1',
  WAITING: '#fcd34d',
  NEEDS_REMINDER: '#f59e0b',
  REPLIED: '#6ee7b7',
  CALL_BACK_LATER: '#c4b5fd',
  REGISTERED: '#6ee7b7',
  LOGIN_SHARED: '#10b981',
  NEXT_COHORT: '#38bdf8',
  WRONG_NUMBER: '#fb7185',
  NOT_INTERESTED: '#f43f5e',
  NO_RESPONSE: '#dfe3e8',
};

const pct = (rate: number) => Math.round(rate * 100);

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
  const total = row.assigned || 1;
  const segments: Array<{ value: number; className: string }> = [
    { value: row.loginShared, className: 'bg-emerald-500' },
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
      <span className="mt-1 block truncate text-[11px] text-gray-500">{row.loginShared} of {row.assigned} joined</span>
    </div>
  );
};

const FollowUpDashboard: React.FC<{ contacts: FollowUpContact[]; onShowUnassigned?: () => void }> = ({ contacts, onShowUnassigned }) => {
  const funnel = computeFollowUpFunnel(contacts);
  const owners = computeOwnerBreakdown(contacts);
  const introducers = computeIntroducerBreakdown(contacts);
  const totalMet = introducers.reduce((sum, row) => sum + row.met, 0);
  const [expanded, setExpanded] = useState<string | null>(null);

  const totals = owners.reduce(
    (sum, row) => ({
      assigned: sum.assigned + row.assigned,
      stillOpen: sum.stillOpen + row.stillOpen,
      loginToShare: sum.loginToShare + row.loginToShare,
      loginShared: sum.loginShared + row.loginShared,
      nextCohort: sum.nextCohort + row.nextCohort,
      stopped: sum.stopped + row.stopped,
    }),
    { assigned: 0, stillOpen: 0, loginToShare: 0, loginShared: 0, nextCohort: 0, stopped: 0 },
  );

  // Unassigned prospects are nobody's work yet, so they don't belong in a table
  // of who's doing what — they get their own callout above it instead.
  const unassignedRow = owners.find((row) => !row.ownerId);
  const namedOwners = owners.filter((row) => row.ownerId);

  // Only name a top reason when one actually leads; otherwise say how many
  // reasons the drop-outs are spread across, rather than picking a tied winner.
  const [topReason, runnerUp] = funnel.stoppedReasons;
  const stoppedDetail = !topReason
    ? 'Nobody has dropped out'
    : runnerUp && runnerUp.value === topReason.value
      ? `Spread across ${funnel.stoppedReasons.length} reasons`
      : `Most common: ${topReason.label.toLowerCase()} (${topReason.value})`;

  // One row per status, biggest first, so the list reads as a ranking rather
  // than as a single bar the eye has to take apart.
  const ranked = [...funnel.buckets].sort((a, b) => b.value - a.value);
  const biggest = ranked.length ? ranked[0].value : 0;

  return (
    <div className="space-y-6">
      {/* The four numbers worth acting on. Everything else is detail below. */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <VitalTile
          title="Signed up"
          status="neutral"
          statusLabel={funnel.conversion === null ? 'No prospects yet' : `${pct(funnel.conversion)}% of ${funnel.total}`}
          value={funnel.signedUp}
          unit={funnel.total ? `of ${funnel.total}` : undefined}
          detail={funnel.nextCohort > 0 ? `${funnel.nextCohort} more waiting for the next cohort` : 'They filled in the registration form'}
          to={contactsLink('REGISTERED')}
        />
        <VitalTile
          title="Needs login"
          status={funnel.registered > 0 ? 'warning' : 'good'}
          statusLabel={funnel.registered > 0 ? 'Waiting on us' : 'All handed over'}
          value={funnel.registered}
          unit={funnel.registered === 1 ? 'prospect' : 'prospects'}
          detail={funnel.registered > 0 ? 'Signed up, but still cannot get into the app' : 'Nobody is waiting on a login'}
          to={contactsLink('REGISTERED')}
        />
        <VitalTile
          title="Not done yet"
          status={funnel.open > 0 ? 'warning' : 'good'}
          statusLabel={funnel.open > 0 ? 'Needs work' : 'All handled'}
          value={funnel.open}
          unit={funnel.open === 1 ? 'prospect' : 'prospects'}
          detail={funnel.open > 0 ? 'Someone still has to message, call or chase them' : 'Nobody is waiting on a follow-up'}
          to={contactsLink('open')}
        />
        <VitalTile
          title="Dropped"
          status="neutral"
          statusLabel="Follow-up is over"
          value={funnel.stopped}
          unit={funnel.stopped === 1 ? 'prospect' : 'prospects'}
          detail={stoppedDetail}
        />
      </div>

      {/* One line per status, so the parts always add up to the whole. */}
      <section className="surface-card p-5 sm:p-6">
        <h3 className="text-base font-semibold text-gray-900">Where all {funnel.total} stand</h3>
        <p className="mb-4 text-xs text-gray-500">Each prospect counted once, in one place only.</p>
        {funnel.total === 0 ? (
          <p className="rounded-2xl bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">No prospects yet.</p>
        ) : (
          <ul className="space-y-2.5">
            {ranked.map((bucket) => (
              <li key={bucket.status} className="flex items-center gap-3">
                <span className="w-32 flex-none truncate text-sm text-gray-700 sm:w-44">{bucket.label}</span>
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
          <p className="text-xs text-gray-500">Most work left first. A follow-up is only done once the prospect has their app login. Open a row to see who is not joining, and why.</p>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="bg-orange-50/60 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th scope="col" className="px-5 py-3">Support</th>
              <th scope="col" className="hidden px-3 py-3 text-right sm:table-cell">Contacts</th>
              <th scope="col" className="hidden px-3 py-3 text-right sm:table-cell">Not done yet</th>
              <th scope="col" className="hidden px-3 py-3 text-right sm:table-cell">Needs login</th>
              <th scope="col" className="hidden px-3 py-3 text-right sm:table-cell">Joined the app</th>
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
                      <td className="hidden px-3 py-3 text-right font-semibold tabular-nums text-emerald-700 sm:table-cell">{row.loginShared}</td>
                      <td className={`hidden px-3 py-3 text-right font-semibold tabular-nums sm:table-cell ${row.nextCohort > 0 ? 'text-violet-700' : 'text-gray-400'}`}>{row.nextCohort}</td>
                      <td className="hidden px-5 py-3 text-right font-semibold tabular-nums text-neutral-600 sm:table-cell">{row.stopped}</td>
                    </tr>
                    {open && (
                      <tr className="border-t border-orange-50 bg-orange-50/30">
                        <td colSpan={7} className="px-5 py-3">
                          <div className="mb-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:hidden">
                            <span className="text-gray-500">Contacts <span className="font-semibold tabular-nums text-gray-900">{row.assigned}</span></span>
                            <span className="text-gray-500">Not done yet <span className="font-semibold tabular-nums text-amber-700">{row.stillOpen}</span></span>
                            <span className="text-gray-500">Needs login <span className="font-semibold tabular-nums text-sky-700">{row.loginToShare}</span></span>
                            <span className="text-gray-500">Joined the app <span className="font-semibold tabular-nums text-emerald-700">{row.loginShared}</span></span>
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
                <td className="hidden px-3 py-3 text-right font-bold tabular-nums text-emerald-700 sm:table-cell">{totals.loginShared}</td>
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
                  <span className="sm:hidden">Joined</span>
                  <span className="hidden sm:inline">Joined the app</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {introducers.map((row) => (
                <tr key={row.supportId} className="border-t border-orange-50">
                  <td className="truncate px-2 py-3 font-semibold text-gray-900 sm:px-5">{row.supportName}</td>
                  <td className="px-1.5 py-3 text-right font-bold tabular-nums text-gray-900 sm:px-3">{row.met}</td>
                  <td className="px-1.5 py-3 text-right font-semibold tabular-nums text-emerald-700 sm:px-3">{row.signedUp}</td>
                  <td className="px-2 py-3 text-right font-semibold tabular-nums text-emerald-700 sm:px-5">{row.loginShared}</td>
                </tr>
              ))}
            </tbody>
            {introducers.length > 1 && (
              <tfoot className="border-t-2 border-orange-100 bg-orange-50/40 text-sm">
                <tr>
                  <td className="px-2 py-3 font-bold text-gray-900 sm:px-5">Everyone</td>
                  <td className="px-1.5 py-3 text-right font-bold tabular-nums text-gray-900 sm:px-3">{totalMet}</td>
                  <td className="px-1.5 py-3 text-right font-bold tabular-nums text-emerald-700 sm:px-3">{introducers.reduce((n, r) => n + r.signedUp, 0)}</td>
                  <td className="px-2 py-3 text-right font-bold tabular-nums text-emerald-700 sm:px-5">{introducers.reduce((n, r) => n + r.loginShared, 0)}</td>
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
