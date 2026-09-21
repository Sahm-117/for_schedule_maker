import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import PageLoader from '../components/PageLoader';
import AppSelect from '../components/AppSelect';
import { formatMeetingSlot } from '../components/GroupMeetingSlotEditor';
import { useAuth } from '../hooks/useAuth';
import { useAppData } from '../context/AppDataContext';
import ModalShell from '../components/followups/ModalShell';
import { groupPrayerFocusApi, groupPrayerStatusApi, groupsApi, meetingAttendanceApi } from '../services/api';
import type { Group, GroupPrayerFocus, GroupPrayerStatus, MeetingAttendance, MeetingAttendanceStatus, Participant, Week } from '../types';
import { sortByText } from '../utils/sort';

const AdminGroupPrayersPage: React.FC = () => {
  const { isAdmin } = useAuth();
  if (!isAdmin) return <Navigate to="/dashboard" replace />;
  return <AdminGroupPrayersContent />;
};

const AdminGroupPrayersContent: React.FC = () => {
  const { activeCohort, weeks } = useAppData();

  const cohortWeeks: Week[] = useMemo(
    () => (weeks ?? []).filter((w) => w.cohortId === activeCohort?.id).sort((a, b) => a.weekNumber - b.weekNumber),
    [weeks, activeCohort]
  );

  const [groups, setGroups] = useState<Group[]>([]);
  const [focuses, setFocuses] = useState<GroupPrayerFocus[]>([]);
  const [statuses, setStatuses] = useState<GroupPrayerStatus[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [attendance, setAttendance] = useState<MeetingAttendance[]>([]);
  const [markTarget, setMarkTarget] = useState<{ group: Group; week: Week } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!activeCohort) { setLoading(false); return; }
    setLoading(true);
    try {
      const weekIds = (weeks ?? []).filter((w) => w.cohortId === activeCohort.id).map((w) => w.id);
      const [{ groups: gs }, { focuses: fs }, { statuses: ss }, { records }] = await Promise.all([
        groupsApi.getAll({ cohortId: activeCohort.id }),
        groupPrayerFocusApi.getForCohort(activeCohort.id),
        groupPrayerStatusApi.getForCohort(activeCohort.id),
        meetingAttendanceApi.getForWeeks(weekIds).catch(() => ({ records: [] as MeetingAttendance[] })),
      ]);
      setGroups(sortByText(gs, (group) => group.name));
      setFocuses(fs);
      setStatuses(ss);
      setAttendance(records);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [activeCohort, weeks]);

  useEffect(() => { void load(); }, [load]);

  // Fast lookup: `${groupId}:${weekId}` -> done
  const doneMap = useMemo(() => {
    const map = new Map<string, boolean>();
    statuses.forEach((s) => map.set(`${s.groupId}:${s.weekId}`, s.done));
    return map;
  }, [statuses]);

  const isDone = useCallback((groupId: string, weekId: number) => doneMap.get(`${groupId}:${weekId}`) === true, [doneMap]);

  const focusMap = useMemo(() => {
    const map = new Map<string, GroupPrayerFocus>();
    focuses.forEach((focus) => map.set(`${focus.groupId}:${focus.weekId}`, focus));
    return map;
  }, [focuses]);

  const getFocus = (groupId: string, weekId: number) => focusMap.get(`${groupId}:${weekId}`) ?? null;

  // Who joined the group meeting, per group and week.
  const joinedMap = useMemo(() => {
    const map = new Map<string, number>();
    attendance.filter((record) => record.status === 'JOINED' && record.groupId).forEach((record) => {
      const key = `${record.groupId}:${record.weekId}`;
      map.set(key, (map.get(key) ?? 0) + 1);
    });
    return map;
  }, [attendance]);
  const joinedCount = (groupId: string, weekId: number) => joinedMap.get(`${groupId}:${weekId}`) ?? 0;

  const visibleGroups = useMemo(
    () => sortByText(selectedGroupId ? groups.filter((g) => g.id === selectedGroupId) : groups, (group) => group.name),
    [groups, selectedGroupId]
  );

  // Trend: per week, count of groups marked done out of all groups
  const trend = useMemo(
    () => cohortWeeks.map((w) => ({
      weekId: w.id,
      weekNumber: w.weekNumber,
      done: groups.filter((g) => isDone(g.id, w.id)).length,
      total: groups.length,
    })),
    [cohortWeeks, groups, isDone]
  );

  const groupOptions = useMemo(
    () => [{ value: '', label: 'All groups' }, ...sortByText(groups, (group) => group.name).map((g) => ({ value: g.id, label: g.name }))],
    [groups]
  );

  return (
    <div className="page-content">
      <PageHeader
        title="Group meetings"
        subtitle={activeCohort ? `${activeCohort.name} · Weekly meetings, focus and completion` : 'No active cohort'}
      />

      {!activeCohort ? (
        <p className="text-sm text-gray-500">Select or create a cohort first.</p>
      ) : cohortWeeks.length === 0 ? (
        <p className="text-sm text-gray-500">No weeks in this cohort yet.</p>
      ) : loading ? (
        <PageLoader />
      ) : groups.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-orange-200 py-12 text-center">
          <p className="text-sm text-gray-500">No groups in this cohort yet.</p>
          <p className="mt-1 text-xs text-gray-400">Create groups and assign supports to track meeting completion.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {/* Trend strip */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Weekly trend</p>
            <div className="flex flex-wrap gap-2">
              {trend.map((t) => {
                const all = t.total > 0 && t.done === t.total;
                const none = t.done === 0;
                const cls = all
                  ? 'bg-emerald-100/80 text-emerald-700'
                  : none
                    ? 'bg-neutral-100 text-neutral-600'
                    : 'bg-amber-100/80 text-amber-700';
                return (
                  <div key={t.weekId} className={`rounded-2xl px-4 py-2 ${cls}`}>
                    <p className="text-[11px] font-semibold uppercase tracking-wide opacity-70">Week {t.weekNumber}</p>
                    <p className="mt-0.5 text-lg font-bold">{t.done}/{t.total}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Group filter */}
          <div className="max-w-xs">
            <AppSelect
              label="Filter by group"
              value={selectedGroupId}
              onChange={setSelectedGroupId}
              options={groupOptions}
              placeholder="All groups"
            />
          </div>

          {/* Status grid */}
          <div className="overflow-x-auto rounded-2xl border border-orange-100 bg-white shadow-sm">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-orange-100 bg-orange-50/60">
                  <th className="sticky left-0 z-10 bg-orange-50/60 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Group</th>
                  {cohortWeeks.map((w) => (
                    <th key={w.id} className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">
                      Week {w.weekNumber}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-orange-50">
                {visibleGroups.map((g) => (
                  <tr key={g.id} className="hover:bg-orange-50/30">
                    <td className="sticky left-0 z-10 bg-white px-4 py-3 font-medium text-gray-900 whitespace-nowrap">
                      <span>
                        {g.name}
                        {g.supportName && <span className="ml-2 text-xs text-gray-400">{g.supportName}</span>}
                      </span>
                      <span className="mt-0.5 block text-xs font-normal text-gray-400">
                        {formatMeetingSlot(g) ?? 'No meeting set'}
                      </span>
                    </td>
                    {cohortWeeks.map((w) => {
                      const done = isDone(g.id, w.id);
                      const focus = getFocus(g.id, w.id);
                      return (
                        <td key={w.id} className="px-4 py-3 text-center">
                          <button
                            type="button"
                            onClick={() => setMarkTarget({ group: g, week: w })}
                            title="Open meeting attendance"
                            className="flex min-w-[120px] w-full flex-col items-center gap-1 rounded-xl px-1 py-1 transition hover:bg-orange-50"
                          >
                            <span className="text-xs font-semibold text-gray-800">
                              {focus?.participantName || '—'}
                            </span>
                            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                              done ? 'bg-emerald-100/80 text-emerald-700' : 'bg-neutral-100 text-neutral-600'
                            }`}>
                              {done ? 'Done' : 'Not done'}
                            </span>
                            <span className="text-[11px] text-gray-500">
                              {joinedCount(g.id, w.id)}/{g.participantCount ?? 0} joined
                            </span>
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <MeetingAttendanceModal
        target={markTarget}
        records={attendance}
        submitted={!!markTarget && isDone(markTarget.group.id, markTarget.week.id)}
        onSubmittedChange={async (next) => {
          if (!markTarget) return;
          const { status } = await groupPrayerStatusApi.setDone(markTarget.group.id, markTarget.week.id, next);
          setStatuses((prev) => [...prev.filter((entry) => !(entry.groupId === status.groupId && entry.weekId === status.weekId)), status]);
        }}
        onClose={() => setMarkTarget(null)}
        onMarked={(record) => setAttendance((prev) => [...prev.filter((entry) => !(entry.participantId === record.participantId && entry.weekId === record.weekId)), record])}
      />
    </div>
  );
};

// ── Meeting attendance for one group and week ────────────────────────────────
// The support marks this in their group meeting; operations can also mark or fix it here.

const MARK_OPTIONS: Array<{ value: MeetingAttendanceStatus; label: string; cls: string }> = [
  { value: 'JOINED', label: 'Joined', cls: 'bg-emerald-100/80 text-emerald-700' },
  { value: 'EXCUSED', label: 'Excused', cls: 'bg-amber-100/80 text-amber-700' },
  { value: 'MISSED', label: 'Missed', cls: 'bg-red-100/80 text-red-700' },
];

const MeetingAttendanceModal: React.FC<{
  target: { group: Group; week: Week } | null;
  records: MeetingAttendance[];
  submitted: boolean;
  onSubmittedChange: (next: boolean) => Promise<void>;
  onClose: () => void;
  onMarked: (record: MeetingAttendance) => void;
}> = ({ target, records, submitted, onSubmittedChange, onClose, onMarked }) => {
  const { user } = useAuth();
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [reopening, setReopening] = useState(false);
  const groupId = target?.group.id;

  useEffect(() => {
    if (!groupId) { setParticipants([]); return; }
    setLoading(true);
    groupsApi.getParticipants(groupId)
      .then(({ participants: ps }) => setParticipants(sortByText(ps, (participant) => participant.fullName)))
      .catch(() => setParticipants([]))
      .finally(() => setLoading(false));
  }, [groupId]);

  if (!target) return null;

  const statusFor = (participantId: string) =>
    records.find((record) => record.participantId === participantId && record.weekId === target.week.id)?.status ?? null;

  const mark = async (participantId: string, status: MeetingAttendanceStatus) => {
    setSavingId(participantId);
    try {
      const { record } = await meetingAttendanceApi.mark({ participantId, groupId: target.group.id, weekId: target.week.id, status, markedById: user?.id ?? null });
      onMarked(record);
    } catch { /* ignore */ }
    finally { setSavingId(null); }
  };

  return (
    <ModalShell
      isOpen={!!target}
      onClose={onClose}
      title={`${target.group.name} · Week ${target.week.weekNumber}`}
      subtitle={submitted ? 'Submitted by the support · who joined the group meeting' : 'Not submitted yet · who joined the group meeting'}
      footer={(
        <>
          <button
            type="button"
            onClick={async () => {
              setReopening(true);
              try { await onSubmittedChange(!submitted); } finally { setReopening(false); }
            }}
            disabled={reopening}
            className="rounded-2xl border border-orange-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-orange-50 disabled:opacity-60"
          >
            {reopening ? 'Saving…' : submitted ? 'Reopen for the support' : 'Mark as submitted'}
          </button>
          <button type="button" onClick={onClose} className="rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-white">Close</button>
        </>
      )}
    >
      {loading ? (
        <p className="py-6 text-center text-sm text-gray-400">Loading participants…</p>
      ) : participants.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-500">No participants in this group yet.</p>
      ) : (
        <div className="space-y-2">
          {participants.map((participant) => {
            const status = statusFor(participant.id);
            return (
              <div key={participant.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-orange-100 px-3 py-2.5">
                <p className="min-w-0 flex-1 text-sm font-semibold text-gray-900">{participant.fullName}</p>
                <div className="flex flex-none gap-1.5">
                  {MARK_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => void mark(participant.id, option.value)}
                      disabled={savingId === participant.id}
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold transition disabled:opacity-50 ${status === option.value ? option.cls : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'}`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </ModalShell>
  );
};

export default AdminGroupPrayersPage;
