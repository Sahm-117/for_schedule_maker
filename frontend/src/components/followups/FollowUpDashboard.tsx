import React from 'react';
import type { FollowUpContact } from '../../types';
import { computeFollowUpMetrics, computeOwnerBreakdown } from '../../utils/followUps';

const MetricCard: React.FC<{ label: string; value: number; tone?: string }> = ({ label, value, tone }) => (
  <div className="surface-card rounded-3xl p-4">
    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
    <p className={`mt-1 text-2xl font-bold ${tone || 'text-gray-900'}`}>{value}</p>
  </div>
);

const OwnerTable: React.FC<{
  title: string;
  subtitle: string;
  headers: string[];
  rows: { key: string; cells: (string | number)[]; highlight?: boolean }[];
}> = ({ title, subtitle, headers, rows }) => (
  <div className="surface-card overflow-hidden rounded-3xl">
    <div className="border-b border-orange-100 px-5 py-4">
      <p className="text-sm font-bold text-gray-900">{title}</p>
      <p className="text-xs text-gray-500">{subtitle}</p>
    </div>
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="bg-orange-50/60 text-xs uppercase tracking-wide text-gray-500">
          <tr>
            {headers.map((h) => (
              <th key={h} className="px-5 py-3 whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={headers.length} className="px-5 py-8 text-center text-gray-400">No contacts yet.</td></tr>
          ) : (
            rows.map((row) => (
              <tr key={row.key} className="border-t border-orange-50">
                <td className={`px-5 py-3 font-semibold whitespace-nowrap ${row.key === 'unassigned' ? 'text-amber-700' : 'text-gray-900'}`}>{row.cells[0]}</td>
                {row.cells.slice(1).map((cell, i) => (
                  <td key={i} className={`px-5 py-3 whitespace-nowrap ${row.highlight && i === row.cells.length - 1 ? 'font-semibold' : ''}`}>{cell}</td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  </div>
);

const FollowUpDashboard: React.FC<{ contacts: FollowUpContact[] }> = ({ contacts }) => {
  const m = computeFollowUpMetrics(contacts);
  const owners = computeOwnerBreakdown(contacts);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <MetricCard label="Total interested" value={m.total} />
        <MetricCard label="Contacted" value={m.contacted} tone="text-sky-700" />
        <MetricCard label="Replied" value={m.replied} tone="text-emerald-700" />
        <MetricCard label="Called" value={m.called} tone="text-emerald-700" />
        <MetricCard label="Registered" value={m.registered} tone="text-emerald-700" />
        <MetricCard label="Needs action" value={m.needsAction} tone="text-amber-700" />
        <MetricCard label="Not contacted" value={m.notContacted} tone="text-rose-700" />
        <MetricCard label="No response" value={m.noResponse} tone="text-amber-700" />
        <MetricCard label="Interested, not registered" value={m.interestedNotRegistered} tone="text-violet-700" />
        <MetricCard label="Pending confirmation" value={m.pendingConfirmation} tone="text-amber-700" />
        <MetricCard label="Still thinking" value={m.stillThinking} tone="text-violet-700" />
        <MetricCard label="Closed" value={m.notInterested} tone="text-rose-700" />
      </div>

      <OwnerTable
        title="Contacts"
        subtitle="Focus on owners with high 'still open' counts."
        headers={['Owner', 'Assigned', 'Uncontacted', 'Contacted', 'Still Open']}
        rows={owners.map((o) => ({
          key: o.ownerId || 'unassigned',
          cells: [o.ownerName, o.assigned, o.uncontacted, o.contacted, o.stillOpen],
          highlight: true,
        }))}
      />

      <OwnerTable
        title="What happened"
        subtitle="Why contacts stopped being followed up."
        headers={['Owner', 'Wrong Number', 'Not Interested', 'Not a Good Time', 'Not a TCN Member']}
        rows={owners.map((o) => ({
          key: o.ownerId || 'unassigned',
          cells: [o.ownerName, o.wrongNumber, o.notInterested, o.notAGoodTime, o.notATcnMember],
        }))}
      />

      <OwnerTable
        title="Conversion"
        subtitle="How many registered so far."
        headers={['Owner', 'Registered', 'Still Open', 'Conversion Rate']}
        rows={owners.map((o) => ({
          key: o.ownerId || 'unassigned',
          cells: [o.ownerName, o.registered, o.stillOpen, o.assigned > 0 ? `${Math.round((o.registered / o.assigned) * 100)}%` : '-'],
        }))}
      />
    </div>
  );
};

export default FollowUpDashboard;
