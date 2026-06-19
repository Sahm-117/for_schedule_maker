import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import { useAuth } from '../hooks/useAuth';
import { useAppData } from '../context/AppDataContext';
import { attendanceApi, participantsApi } from '../services/api';
import type { AttendanceRecord, AttendanceStatus, Participant, Week } from '../types';

const STATUS_OPTIONS: AttendanceStatus[] = ['PRESENT', 'LATE', 'ABSENT'];

const STATUS_STYLE: Record<AttendanceStatus, string> = {
  PRESENT: 'bg-emerald-100/80 text-emerald-700',
  LATE: 'bg-amber-100/80 text-amber-700',
  ABSENT: 'bg-red-100/80 text-red-700',
};

const STATUS_LABEL: Record<AttendanceStatus, string> = {
  PRESENT: 'Present',
  LATE: 'Late',
  ABSENT: 'Absent',
};

const AdminAttendancePage: React.FC = () => {
  const { isAdmin, user } = useAuth();
  const { activeCohort, weeks } = useAppData();

  const cohortWeeks: Week[] = useMemo(
    () => (weeks ?? []).filter((w) => w.cohortId === activeCohort?.id).sort((a, b) => a.weekNumber - b.weekNumber),
    [weeks, activeCohort]
  );

  const [selectedWeekId, setSelectedWeekId] = useState<number | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [records, setRecords] = useState<Map<string, AttendanceRecord>>(new Map());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Set<string>>(new Set());

  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  // Default to the most recent week
  useEffect(() => {
    if (cohortWeeks.length > 0 && selectedWeekId === null) {
      setSelectedWeekId(cohortWeeks[cohortWeeks.length - 1].id);
    }
  }, [cohortWeeks, selectedWeekId]);

  const load = useCallback(async () => {
    if (!activeCohort || selectedWeekId === null) { setLoading(false); return; }
    setLoading(true);
    try {
      const [{ participants: ps }, { records: rs }] = await Promise.all([
        participantsApi.getAll({ cohortId: activeCohort.id }),
        attendanceApi.getForWeek({ weekId: selectedWeekId }),
      ]);
      setParticipants(ps.filter((p) => p.status === 'ACTIVE'));
      const map = new Map<string, AttendanceRecord>();
      rs.forEach((r) => map.set(r.participantId, r));
      setRecords(map);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [activeCohort, selectedWeekId]);

  useEffect(() => { void load(); }, [load]);

  const handleMark = async (participantId: string, status: AttendanceStatus) => {
    if (selectedWeekId === null) return;
    setSaving((prev) => new Set(prev).add(participantId));
    try {
      const { record } = await attendanceApi.mark(participantId, selectedWeekId, status, user?.id);
      setRecords((prev) => new Map(prev).set(participantId, record));
    } catch { /* ignore */ }
    finally {
      setSaving((prev) => { const next = new Set(prev); next.delete(participantId); return next; });
    }
  };

  const summary = useMemo(() => {
    const total = participants.length;
    const present = [...records.values()].filter((r) => r.status === 'PRESENT').length;
    const late = [...records.values()].filter((r) => r.status === 'LATE').length;
    const absent = [...records.values()].filter((r) => r.status === 'ABSENT').length;
    const unmarked = total - (present + late + absent);
    const pct = total > 0 ? Math.round(((present + late) / total) * 100) : 0;
    return { total, present, late, absent, unmarked, pct };
  }, [participants, records]);

  const selectedWeek = cohortWeeks.find((w) => w.id === selectedWeekId);

  return (
    <div className="page-content">
      <PageHeader
        title="Attendance"
        subtitle={activeCohort ? activeCohort.name : 'No active cohort'}
      />

      {!activeCohort ? (
        <p className="text-sm text-gray-500">Select or create a cohort first.</p>
      ) : cohortWeeks.length === 0 ? (
        <p className="text-sm text-gray-500">No weeks in this cohort yet.</p>
      ) : (
        <>
          {/* Week selector */}
          <div className="mb-6">
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Week</label>
            <div className="flex flex-wrap gap-2">
              {cohortWeeks.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => setSelectedWeekId(w.id)}
                  className={`rounded-full px-4 py-1.5 text-sm font-semibold transition active:scale-95 ${
                    selectedWeekId === w.id
                      ? 'bg-primary text-white shadow-sm'
                      : 'border border-orange-200 bg-white text-gray-600 hover:bg-orange-50'
                  }`}
                >
                  Week {w.weekNumber}
                </button>
              ))}
            </div>
          </div>

          {/* Summary cards */}
          {!loading && (
            <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: 'Present', value: summary.present, cls: 'bg-emerald-100/80 text-emerald-700' },
                { label: 'Late', value: summary.late, cls: 'bg-amber-100/80 text-amber-700' },
                { label: 'Absent', value: summary.absent, cls: 'bg-red-100/80 text-red-700' },
                { label: 'Attendance', value: `${summary.pct}%`, cls: 'bg-sky-100/80 text-sky-700' },
              ].map(({ label, value, cls }) => (
                <div key={label} className={`rounded-2xl px-4 py-3 ${cls}`}>
                  <p className="text-xs font-semibold uppercase tracking-wide opacity-70">{label}</p>
                  <p className="mt-1 text-2xl font-bold">{value}</p>
                </div>
              ))}
            </div>
          )}

          {loading ? (
            <p className="text-sm text-gray-400">Loading…</p>
          ) : participants.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-orange-200 py-12 text-center">
              <p className="text-sm text-gray-500">No active participants in this cohort.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-orange-100 bg-white shadow-sm">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-orange-100 bg-orange-50/60">
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Participant</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Group</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Attendance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-orange-50">
                  {participants.map((p) => {
                    const rec = records.get(p.id);
                    const isSaving = saving.has(p.id);
                    return (
                      <tr key={p.id} className="hover:bg-orange-50/30">
                        <td className="px-4 py-3 font-medium text-gray-900">{p.fullName}</td>
                        <td className="px-4 py-3 text-gray-500">{p.groupName ?? '—'}</td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1.5">
                            {STATUS_OPTIONS.map((s) => (
                              <button
                                key={s}
                                type="button"
                                onClick={() => void handleMark(p.id, s)}
                                disabled={isSaving}
                                className={`rounded-full px-3 py-1 text-xs font-semibold transition active:scale-95 disabled:opacity-60 ${
                                  rec?.status === s
                                    ? STATUS_STYLE[s]
                                    : 'border border-orange-100 bg-white text-gray-500 hover:bg-orange-50'
                                }`}
                              >
                                {STATUS_LABEL[s]}
                              </button>
                            ))}
                            {!rec && <span className="ml-2 text-xs text-gray-400 self-center">Not marked</span>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default AdminAttendancePage;
