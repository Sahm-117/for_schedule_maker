import React, { useMemo } from 'react';
import type { Activity, SupportActivityCompletion, User } from '../types';
import ActivityText from './ActivityText';
import LabelChip from './LabelChip';
import { PeriodBadge } from './PeriodIcon';

interface AdminCompletionOverviewDrawerProps {
  open: boolean;
  onClose: () => void;
  activities: Activity[];
  users: User[];
  completions: SupportActivityCompletion[];
  heading: string;
  subheading: string;
  selectedUserId?: string;
}

const AdminCompletionOverviewDrawer: React.FC<AdminCompletionOverviewDrawerProps> = ({
  open,
  onClose,
  activities,
  users,
  completions,
  heading,
  subheading,
  selectedUserId,
}) => {
  const completionsByActivity = useMemo(() => {
    const map = new Map<number, SupportActivityCompletion[]>();
    completions.forEach((completion) => {
      const current = map.get(completion.activityId) || [];
      current.push(completion);
      map.set(completion.activityId, current);
    });
    return map;
  }, [completions]);

  const summary = useMemo(() => {
    const activitySummaries = activities.map((activity) => {
      const activityLabelIds = new Set((activity.labels || []).map((label) => label.id));
      const assignedSupports = users.filter((member) =>
        member.role === 'SUPPORT' && member.labels?.some((label) => activityLabelIds.has(label.id))
      ).filter((member) => !selectedUserId || member.id === selectedUserId);
      const completedUserIds = new Set((completionsByActivity.get(activity.id) || []).map((item) => item.userId));

      return {
        activity,
        assignedSupports,
        doneSupports: assignedSupports.filter((member) => completedUserIds.has(member.id)),
        pendingSupports: assignedSupports.filter((member) => !completedUserIds.has(member.id)),
      };
    });

    const totalAssigned = activitySummaries.reduce((sum, item) => sum + item.assignedSupports.length, 0);
    const totalCompleted = activitySummaries.reduce((sum, item) => sum + item.doneSupports.length, 0);

    return {
      activitySummaries,
      totalAssigned,
      totalCompleted,
    };
  }, [activities, completionsByActivity, selectedUserId, users]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <button type="button" className="absolute inset-0 bg-slate-900/45" onClick={onClose} />
      <aside className="absolute inset-y-0 right-0 flex w-full max-w-xl flex-col bg-[#fffdf8] shadow-[0_20px_80px_rgba(15,23,42,0.24)]">
        <div className="border-b border-orange-100 bg-white/90 px-5 py-5 backdrop-blur">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Completion Overview</p>
              <h2 className="mt-2 text-2xl font-bold text-gray-900">{heading}</h2>
              <p className="mt-1 text-sm text-gray-500">{subheading}</p>
            </div>
            <button type="button" onClick={onClose} className="rounded-2xl border border-orange-100 bg-white p-2 text-gray-400 hover:text-gray-700">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-3">
            <MetricTile label="Activities" value={activities.length} />
            <MetricTile label="Completed" value={summary.totalCompleted} />
            <MetricTile label="Pending" value={Math.max(summary.totalAssigned - summary.totalCompleted, 0)} />
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
          {summary.activitySummaries.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-orange-200 bg-white px-5 py-12 text-center text-sm text-gray-500">
              No activities are scheduled in this overview.
            </div>
          ) : summary.activitySummaries.map(({ activity, assignedSupports, doneSupports, pendingSupports }) => (
            <div key={activity.id} className="rounded-3xl border border-orange-100 bg-white px-4 py-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900"><ActivityText text={activity.description} /></p>
                  <p className="mt-1 text-xs text-gray-500">
                    {activity.day?.dayName ? `${activity.day.dayName} • ` : ''}{activity.time}
                  </p>
                </div>
                <PeriodBadge period={activity.period} compact />
              </div>

              {activity.labels && activity.labels.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {activity.labels.map((label) => (
                    <LabelChip key={label.id} name={label.name} color={label.color} size="sm" />
                  ))}
                </div>
              )}

              {assignedSupports.length === 0 ? (
                <div className="mt-4 rounded-2xl border border-dashed border-gray-200 bg-slate-50 px-3 py-3 text-sm text-gray-500">
                  No support users are mapped to this activity’s support groups yet.
                </div>
              ) : (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <StatusCluster title="Done" tone="done" names={doneSupports.map((member) => member.name)} />
                  <StatusCluster title="Pending" tone="pending" names={pendingSupports.map((member) => member.name)} />
                </div>
              )}
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
};

const MetricTile: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="rounded-2xl border border-orange-100 bg-orange-50/60 px-3 py-3">
    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500">{label}</p>
    <p className="mt-2 text-xl font-bold text-gray-900">{value}</p>
  </div>
);

const StatusCluster: React.FC<{ title: string; tone: 'done' | 'pending'; names: string[] }> = ({ title, tone, names }) => (
  <div className={`rounded-2xl border px-3 py-3 ${
    tone === 'done' ? 'border-emerald-100 bg-emerald-50/50' : 'border-slate-200 bg-slate-50'
  }`}>
    <div className="flex items-center justify-between gap-3">
      <p className={`text-xs font-semibold uppercase tracking-[0.12em] ${tone === 'done' ? 'text-emerald-700' : 'text-slate-500'}`}>{title}</p>
      <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${tone === 'done' ? 'bg-white text-emerald-700' : 'bg-white text-slate-600'}`}>
        {names.length}
      </span>
    </div>
    <div className="mt-3 flex flex-wrap gap-2">
      {names.length === 0 ? (
        <span className="text-xs text-gray-500">None</span>
      ) : names.map((name) => (
        <span
          key={name}
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
            tone === 'done' ? 'bg-white text-emerald-700 ring-1 ring-emerald-200' : 'bg-white text-slate-600 ring-1 ring-slate-200'
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${tone === 'done' ? 'bg-emerald-500' : 'bg-slate-400'}`} />
          {name}
        </span>
      ))}
    </div>
  </div>
);

export default AdminCompletionOverviewDrawer;
