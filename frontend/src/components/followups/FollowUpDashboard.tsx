import React, { useState } from 'react';
import type { FollowUpContact, FollowUpStatus } from '../../types';
import { computeFollowUpFunnel, computeOwnerBreakdown } from '../../utils/followUps';
import { SegmentBar, VitalTile } from '../dashboard/DashboardParts';

// One colour per status, matching the tone each status already carries on its
// pill: slate before contact, amber while waiting, emerald once they reply or
// register, sky for next cohort, rose/neutral once they stop.
const STATUS_COLOR: Record<FollowUpStatus, string> = {
  TO_CONTACT: '#cbd5e1',
  WAITING: '#fcd34d',
  NEEDS_REMINDER: '#f59e0b',
  REPLIED: '#6ee7b7',
  CALL_BACK_LATER: '#c4b5fd',
  REGISTERED: '#10b981',
  NEXT_COHORT: '#38bdf8',
  WRONG_NUMBER: '#fb7185',
  NOT_INTERESTED: '#f43f5e',
  NO_RESPONSE: '#dfe3e8',
};

const STAGE_COLOR = { open: '#f59e0b', registered: '#10b981', nextCohort: '#38bdf8', stopped: '#dfe3e8' };

const pct = (rate: number) => Math.round(rate * 100);

/** A SegmentBar without its legend — inside a table row the columns already name the parts. */
const MiniBar: React.FC<{ segments: Array<{ label: string; value: number; color: string }> }> = ({ segments }) => {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  if (total === 0) return null;
  return (
    <div className="flex h-1.5 w-full max-w-[180px] gap-0.5 overflow-hidden rounded-full">
      {segments.filter((s) => s.value > 0).map((s) => (
        <span
          key={s.label}
          className="h-full first:rounded-l-full last:rounded-r-full"
          style={{ width: `${(s.value / total) * 100}%`, backgroundColor: s.color }}
          title={`${s.label}: ${s.value}`}
        />
      ))}
    </div>
  );
};

const Chevron: React.FC<{ open: boolean }> = ({ open }) => (
  <svg className={`h-3.5 w-3.5 flex-none text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="m9 5 7 7-7 7" />
  </svg>
);

const contactsLink = (status?: FollowUpStatus | 'open') =>
  `/follow-ups?tab=contacts${status ? `&status=${status}` : ''}`;

const FollowUpDashboard: React.FC<{ contacts: FollowUpContact[] }> = ({ contacts }) => {
  const funnel = computeFollowUpFunnel(contacts);
  const owners = computeOwnerBreakdown(contacts);
  const [expanded, setExpanded] = useState<string | null>(null);

  const totals = owners.reduce(
    (sum, row) => ({
      assigned: sum.assigned + row.assigned,
      stillOpen: sum.stillOpen + row.stillOpen,
      registered: sum.registered + row.registered,
      stopped: sum.stopped + row.stopped,
    }),
    { assigned: 0, stillOpen: 0, registered: 0, stopped: 0 },
  );

  // Only name a top reason when one actually leads; otherwise say how many
  // reasons the drop-outs are spread across, rather than picking a tied winner.
  const [topReason, runnerUp] = funnel.stoppedReasons;
  const stoppedDetail = !topReason
    ? 'Nobody has dropped out'
    : runnerUp && runnerUp.value === topReason.value
      ? `Spread across ${funnel.stoppedReasons.length} reasons`
      : `Most common: ${topReason.label.toLowerCase()} (${topReason.value})`;

  return (
    <div className="space-y-6">
      {/* The three numbers worth acting on. Everything else is detail below. */}
      <div className="grid gap-4 sm:grid-cols-3">
        <VitalTile
          title="Registered"
          status="neutral"
          statusLabel={funnel.conversion === null ? 'No contacts yet' : `${pct(funnel.conversion)}% of ${funnel.total}`}
          value={funnel.registered}
          unit={funnel.total ? `of ${funnel.total}` : undefined}
          detail={funnel.nextCohort > 0 ? `${funnel.nextCohort} more waiting for the next cohort` : 'Contacts who made it to registration'}
          to={contactsLink('REGISTERED')}
        />
        <VitalTile
          title="Still open"
          status={funnel.open > 0 ? 'warning' : 'good'}
          statusLabel={funnel.open > 0 ? 'Needs work' : 'All handled'}
          value={funnel.open}
          unit={funnel.open === 1 ? 'contact' : 'contacts'}
          detail={funnel.open > 0 ? 'Waiting on a first message, a reply, or a call back' : 'Nobody is waiting on a follow-up'}
          to={contactsLink('open')}
        />
        <VitalTile
          title="Stopped"
          status="neutral"
          statusLabel="Closed, not registered"
          value={funnel.stopped}
          unit={funnel.stopped === 1 ? 'contact' : 'contacts'}
          detail={stoppedDetail}
        />
      </div>

      {/* The honest total: one bucket per contact, so the parts always sum to the whole. */}
      <section className="surface-card p-5 sm:p-6">
        <h3 className="text-base font-semibold text-gray-900">Where all {funnel.total} stand</h3>
        <p className="mb-4 text-xs text-gray-500">Every contact counted once, in one place only.</p>
        {funnel.total === 0 ? (
          <p className="rounded-2xl bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">No contacts yet.</p>
        ) : (
          <SegmentBar segments={funnel.buckets.map((b) => ({ label: b.label, value: b.value, color: STATUS_COLOR[b.status] }))} />
        )}
      </section>

      <section className="surface-card overflow-hidden">
        <div className="border-b border-orange-100 px-5 py-4">
          <p className="text-sm font-bold text-gray-900">By follow-up rep</p>
          <p className="text-xs text-gray-500">Most still-open work first. Open a row to see why contacts stopped.</p>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="bg-orange-50/60 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th scope="col" className="px-5 py-3">Follow-up rep</th>
              <th scope="col" className="px-3 py-3 text-right">Assigned</th>
              <th scope="col" className="px-3 py-3 text-right">Still open</th>
              <th scope="col" className="px-3 py-3 text-right">Registered</th>
              <th scope="col" className="px-5 py-3 text-right">Stopped</th>
            </tr>
          </thead>
          <tbody>
            {owners.length === 0 ? (
              <tr><td colSpan={5} className="px-5 py-8 text-center text-gray-400">No contacts yet.</td></tr>
            ) : (
              owners.map((row) => {
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
                          className="flex w-full items-center gap-1.5 text-left"
                        >
                          <Chevron open={open} />
                          <span className={`truncate font-semibold ${row.ownerId ? 'text-gray-900' : 'text-amber-700'}`}>{row.ownerName}</span>
                        </button>
                        <div className="mt-1.5 pl-5">
                          <MiniBar segments={[
                            { label: 'Still open', value: row.stillOpen, color: STAGE_COLOR.open },
                            { label: 'Registered', value: row.registered, color: STAGE_COLOR.registered },
                            { label: 'Next cohort', value: row.nextCohort, color: STAGE_COLOR.nextCohort },
                            { label: 'Stopped', value: row.stopped, color: STAGE_COLOR.stopped },
                          ]} />
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right font-semibold tabular-nums align-top">{row.assigned}</td>
                      <td className="px-3 py-3 text-right font-bold tabular-nums align-top text-amber-700">{row.stillOpen}</td>
                      <td className="px-3 py-3 text-right font-semibold tabular-nums align-top text-emerald-700">{row.registered}</td>
                      <td className="px-5 py-3 text-right tabular-nums align-top text-gray-600">{row.stopped}</td>
                    </tr>
                    {open && (
                      <tr className="border-t border-orange-50 bg-orange-50/30">
                        <td colSpan={5} className="px-5 py-3">
                          {row.stoppedReasons.length === 0 && row.nextCohort === 0 ? (
                            <p className="text-xs text-gray-500">Nobody assigned to {row.ownerName} has stopped.</p>
                          ) : (
                            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
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
                <td className="px-5 py-3 font-bold text-gray-900">All reps</td>
                <td className="px-3 py-3 text-right font-bold tabular-nums">{totals.assigned}</td>
                <td className="px-3 py-3 text-right font-bold tabular-nums text-amber-700">{totals.stillOpen}</td>
                <td className="px-3 py-3 text-right font-bold tabular-nums text-emerald-700">{totals.registered}</td>
                <td className="px-5 py-3 text-right font-bold tabular-nums text-gray-600">{totals.stopped}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </section>
    </div>
  );
};

export default FollowUpDashboard;
