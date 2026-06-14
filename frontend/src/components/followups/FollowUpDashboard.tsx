import React, { useState } from 'react';
import type { FollowUpContact } from '../../types';
import { computeFollowUpMetrics, computeOwnerBreakdown } from '../../utils/followUps';

const MetricCard: React.FC<{ label: string; value: number; tone?: string }> = ({ label, value, tone }) => (
  <div className="surface-card rounded-3xl p-4">
    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
    <p className={`mt-1 text-2xl font-bold ${tone || 'text-gray-900'}`}>{value}</p>
  </div>
);

const AccordionSection: React.FC<{ title: string; subtitle: string; defaultOpen?: boolean; children: React.ReactNode }> = ({ title, subtitle, defaultOpen = false, children }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="surface-card overflow-hidden rounded-3xl">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
      >
        <div>
          <p className="text-sm font-bold text-gray-900">{title}</p>
          <p className="text-xs text-gray-500">{subtitle}</p>
        </div>
        <svg
          className={`h-5 w-5 shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m19 9-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="overflow-x-auto border-t border-orange-100">
          {children}
        </div>
      )}
    </div>
  );
};

const FollowUpDashboard: React.FC<{ contacts: FollowUpContact[] }> = ({ contacts }) => {
  const m = computeFollowUpMetrics(contacts);
  const owners = computeOwnerBreakdown(contacts);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="Total" value={m.total} />
        <MetricCard label="Contacted" value={m.contacted} tone="text-sky-700" />
        <MetricCard label="Registered" value={m.registered} tone="text-emerald-700" />
        <MetricCard label="Needs Reminder" value={m.needsReminder} tone="text-amber-700" />
        <MetricCard label="Call Back Later" value={m.callBackLater} tone="text-violet-700" />
        <MetricCard label="Not Contacted" value={m.notContacted} tone="text-rose-700" />
        <MetricCard label="No Response" value={m.noResponse} tone="text-amber-700" />
        <MetricCard label="Closed" value={m.closed} tone="text-rose-700" />
      </div>

      <div className="surface-card overflow-hidden rounded-3xl">
        <div className="border-b border-orange-100 px-5 py-4">
          <p className="text-sm font-bold text-gray-900">Contacts</p>
          <p className="text-xs text-gray-500">Focus on owners with high 'still open' counts.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-orange-50/60 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-5 py-3 whitespace-nowrap">Owner</th>
                <th className="px-5 py-3 whitespace-nowrap">Assigned</th>
                <th className="px-5 py-3 whitespace-nowrap">Uncontacted</th>
                <th className="px-5 py-3 whitespace-nowrap">Contacted</th>
                <th className="px-5 py-3 whitespace-nowrap">Still Open</th>
              </tr>
            </thead>
            <tbody>
              {owners.length === 0 ? (
                <tr><td colSpan={5} className="px-5 py-8 text-center text-gray-400">No contacts yet.</td></tr>
              ) : (
                owners.map((row) => (
                  <tr key={row.ownerId || 'unassigned'} className="border-t border-orange-50">
                    <td className={`px-5 py-3 font-semibold whitespace-nowrap ${row.ownerId ? 'text-gray-900' : 'text-amber-700'}`}>{row.ownerName}</td>
                    <td className="px-5 py-3 whitespace-nowrap">{row.assigned}</td>
                    <td className="px-5 py-3 whitespace-nowrap">{row.uncontacted}</td>
                    <td className="px-5 py-3 whitespace-nowrap">{row.contacted}</td>
                    <td className="px-5 py-3 whitespace-nowrap font-semibold">{row.stillOpen}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AccordionSection title="What happened" subtitle="Why contacts stopped being followed up.">
        <table className="w-full text-left text-sm">
          <thead className="bg-orange-50/60 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-5 py-3 whitespace-nowrap">Owner</th>
                <th className="px-5 py-3 whitespace-nowrap">Registered</th>
                <th className="px-5 py-3 whitespace-nowrap">Wrong Number</th>
                <th className="px-5 py-3 whitespace-nowrap">Not Interested</th>
                <th className="px-5 py-3 whitespace-nowrap">Not a Good Time</th>
                <th className="px-5 py-3 whitespace-nowrap">Not a TCN Member</th>
                <th className="px-5 py-3 whitespace-nowrap">No Response</th>
              </tr>
          </thead>
          <tbody>
            {owners.length === 0 ? (
              <tr><td colSpan={7} className="px-5 py-8 text-center text-gray-400">No contacts yet.</td></tr>
              ) : (
                owners.map((row) => (
                  <tr key={row.ownerId || 'unassigned'} className="border-t border-orange-50">
                    <td className={`px-5 py-3 font-semibold whitespace-nowrap ${row.ownerId ? 'text-gray-900' : 'text-amber-700'}`}>{row.ownerName}</td>
                    <td className="px-5 py-3 whitespace-nowrap font-semibold text-emerald-700">{row.registered}</td>
                  <td className="px-5 py-3 whitespace-nowrap">{row.wrongNumber}</td>
                  <td className="px-5 py-3 whitespace-nowrap">{Math.max(0, row.notInterested - row.notAGoodTime - row.notATcnMember)}</td>
                  <td className="px-5 py-3 whitespace-nowrap">{row.notAGoodTime}</td>
                  <td className="px-5 py-3 whitespace-nowrap">{row.notATcnMember}</td>
                  <td className="px-5 py-3 whitespace-nowrap">{row.noResponse}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </AccordionSection>
    </div>
  );
};

export default FollowUpDashboard;
