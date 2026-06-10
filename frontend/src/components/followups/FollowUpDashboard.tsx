import React from 'react';
import type { FollowUpContact } from '../../types';
import { computeFollowUpMetrics, computeOwnerBreakdown } from '../../utils/followUps';

const MetricCard: React.FC<{ label: string; value: number; tone?: string }> = ({ label, value, tone }) => (
  <div className="surface-card rounded-3xl p-4">
    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
    <p className={`mt-1 text-2xl font-bold ${tone || 'text-gray-900'}`}>{value}</p>
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
        <MetricCard label="Not interested" value={m.notInterested} tone="text-rose-700" />
      </div>

      <div className="surface-card overflow-hidden rounded-3xl">
        <div className="border-b border-orange-100 px-5 py-4">
          <p className="text-sm font-bold text-gray-900">By owner</p>
          <p className="text-xs text-gray-500">Focus on owners with high "still open" counts.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-orange-50/60 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-5 py-3">Owner</th>
                <th className="px-5 py-3">Assigned</th>
                <th className="px-5 py-3">Contacted</th>
                <th className="px-5 py-3">Registered</th>
                <th className="px-5 py-3">Still open</th>
              </tr>
            </thead>
            <tbody>
              {owners.length === 0 ? (
                <tr><td colSpan={5} className="px-5 py-8 text-center text-gray-400">No contacts yet.</td></tr>
              ) : (
                owners.map((row) => (
                  <tr key={row.ownerId || 'unassigned'} className="border-t border-orange-50">
                    <td className={`px-5 py-3 font-semibold ${row.ownerId ? 'text-gray-900' : 'text-amber-700'}`}>{row.ownerName}</td>
                    <td className="px-5 py-3">{row.assigned}</td>
                    <td className="px-5 py-3">{row.contacted}</td>
                    <td className="px-5 py-3">{row.registered}</td>
                    <td className="px-5 py-3 font-semibold">{row.stillOpen}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default FollowUpDashboard;
