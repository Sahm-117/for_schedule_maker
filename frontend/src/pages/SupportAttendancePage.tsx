import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import { useAuth } from '../hooks/useAuth';
import { useAppData } from '../context/AppDataContext';
import { attendanceApi, participantsApi } from '../services/api';
import type { AttendanceRecord, AttendanceStatus, Participant, Week } from '../types';
import { getIdealWeekForCohort } from '../utils/weekFocus';

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

const SupportAttendancePage: React.FC = () => {
  const { user } = useAuth();
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

  if (!user || user.role !== 'SUPPORT') return <Navigate to="/support" replace />;

  useEffect(() => {
    if (cohortWeeks.length === 0) return;
    const selectedStillExists = selectedWeekId !== null && cohortWeeks.some((week) => week.id === selectedWeekId);
    if (!selectedStillExists) {
      setSelectedWeekId(getIdealWeekForCohort(activeCohort, cohortWeeks)?.id ?? cohortWeeks[0].id);
    }
  }, [activeCohort, cohortWeeks, selectedWeekId]);

  const load = useCallback(async () => {
    if (!activeCohort || selectedWeekId === null || !user?.id) { setLoading(false); return; }
    setLoading(true);
    try {
      const [{ participants: ps }, { records: rs }] = await Promise.all([
        participantsApi.getAll({ cohortId: activeCohort.id, supportId: user.id }),
        attendanceApi.getForWeek({ weekId: selectedWeekId, supportId: user.id }),
      ]);
      setParticipants(ps);
      const map = new Map<string, AttendanceRecord>();
      rs.forEach((r) => map.set(r.participantId, r));
      setRecords(map);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [activeCohort, selectedWeekId, user?.id]);

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
    const pct = total > 0 ? Math.round(((present + late) / total) * 100) : 0;
    return { total, present, late, absent, pct };
  }, [participants, records]);

  const selectedWeek = cohortWeeks.find((w) => w.id === selectedWeekId);

  return (
    <div className="page-content">
      <PageHeader
        title="Attendance"
        subtitle={selectedWeek ? `Week ${selectedWeek.weekNumber} · Your group` : 'Your group'}
      />

      {cohortWeeks.length === 0 ? (
        <p className="text-sm text-gray-500">No weeks available yet.</p>
      ) : (
        <>
          {/* Week selector */}
          <div className="mb-5">
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

          {/* Summary */}
          {!loading && participants.length > 0 && (
            <div className="mb-5 grid grid-cols-4 gap-2">
              {[
                { label: 'Present', value: summary.present, cls: 'bg-emerald-100/80 text-emerald-700' },
                { label: 'Late', value: summary.late, cls: 'bg-amber-100/80 text-amber-700' },
                { label: 'Absent', value: summary.absent, cls: 'bg-red-100/80 text-red-700' },
                { label: '%', value: `${summary.pct}%`, cls: 'bg-sky-100/80 text-sky-700' },
              ].map(({ label, value, cls }) => (
                <div key={label} className={`rounded-2xl px-3 py-2.5 text-center ${cls}`}>
                  <p className="text-xs font-semibold opacity-70">{label}</p>
                  <p className="mt-0.5 text-xl font-bold">{value}</p>
                </div>
              ))}
            </div>
          )}

          {loading ? (
            <p className="text-sm text-gray-400">Loading…</p>
          ) : participants.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-orange-200 py-12 text-center">
              <p className="text-sm text-gray-500">You have no participants assigned yet.</p>
              <p className="mt-1 text-xs text-gray-400">Ask an admin to assign you to a group.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {participants.map((p) => {
                const rec = records.get(p.id);
                const isSaving = saving.has(p.id);
                return (
                  <div key={p.id} className="flex flex-col gap-2 rounded-2xl border border-orange-100 bg-white p-4 shadow-sm">
                    <p className="font-semibold text-gray-900">{p.fullName}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {STATUS_OPTIONS.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => void handleMark(p.id, s)}
                          disabled={isSaving}
                          className={`rounded-full px-4 py-1.5 text-xs font-semibold transition active:scale-95 disabled:opacity-60 ${
                            rec?.status === s
                              ? STATUS_STYLE[s]
                              : 'border border-orange-100 bg-white text-gray-500 hover:bg-orange-50'
                          }`}
                        >
                          {STATUS_LABEL[s]}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default SupportAttendancePage;
