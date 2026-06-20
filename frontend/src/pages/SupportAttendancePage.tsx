import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import AppSelect from '../components/AppSelect';
import ModalShell from '../components/followups/ModalShell';
import PageHeader from '../components/PageHeader';
import PageLoader from '../components/PageLoader';
import { useAuth } from '../hooks/useAuth';
import { useAppData } from '../context/AppDataContext';
import { attendanceApi, participantsApi } from '../services/api';
import type { AttendanceRecord, AttendanceStatus, Participant, Week } from '../types';
import { getIdealWeekForCohort } from '../utils/weekFocus';
import { sortByText } from '../utils/sort';

const STATUS_OPTIONS: AttendanceStatus[] = ['PRESENT', 'LATE', 'ABSENT'];

const STATUS_LABEL: Record<AttendanceStatus, string> = {
  PRESENT: 'Present',
  LATE: 'Late',
  ABSENT: 'Absent',
};

const STATUS_SELECT_OPTIONS = STATUS_OPTIONS.map((status) => ({
  value: status,
  label: STATUS_LABEL[status],
}));

interface ParticipantNotesModalProps {
  participant: Participant | null;
  saving: boolean;
  onClose: () => void;
  onSave: (notes: string) => Promise<void>;
}

const ParticipantNotesModal: React.FC<ParticipantNotesModalProps> = ({ participant, saving, onClose, onSave }) => {
  const [notes, setNotes] = useState('');

  useEffect(() => {
    setNotes(participant?.notes ?? '');
  }, [participant]);

  return (
    <ModalShell
      isOpen={!!participant}
      onClose={onClose}
      title={participant ? participant.fullName : 'Participant notes'}
      subtitle="Add anything worth remembering for this participant."
      footer={(
        <>
          <button type="button" onClick={onClose} className="rounded-2xl border border-orange-200 px-5 py-2.5 text-sm font-semibold text-gray-600 hover:bg-orange-50">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => { void onSave(notes); }}
            disabled={saving}
            className="rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save note'}
          </button>
        </>
      )}
    >
      <div className="space-y-4">
        <div className="rounded-2xl border border-orange-100 bg-orange-50/40 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Participant note</p>
          <p className="mt-1 text-sm text-gray-600">This note stays with the participant and can be updated anytime.</p>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Notes</label>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={5}
            className="w-full rounded-xl border border-orange-200 px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            placeholder="Add a context note for this participant..."
          />
        </div>
      </div>
    </ModalShell>
  );
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
  const [selectedParticipant, setSelectedParticipant] = useState<Participant | null>(null);
  const [savingNote, setSavingNote] = useState(false);

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
      setParticipants(sortByText(ps, (participant) => participant.fullName));
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

  const handleSaveNote = async (notes: string) => {
    if (!selectedParticipant) return;
    setSavingNote(true);
    try {
      const { participant } = await participantsApi.update(selectedParticipant.id, {
        notes: notes.trim() || null,
      });
      setParticipants((prev) => sortByText(
        prev.map((entry) => (entry.id === participant.id ? { ...entry, ...participant } : entry)),
        (entry) => entry.fullName
      ));
      setSelectedParticipant((prev) => (prev && prev.id === participant.id ? { ...prev, ...participant } : prev));
      setSelectedParticipant(null);
    } catch {
      // keep the modal open if save fails
    } finally {
      setSavingNote(false);
    }
  };

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
          <div className="mb-5 max-w-sm">
            <AppSelect
              value={selectedWeekId ? String(selectedWeekId) : ''}
              onChange={(value) => setSelectedWeekId(Number(value))}
              options={cohortWeeks.map((week) => ({
                value: String(week.id),
                label: `Week ${week.weekNumber}`,
              }))}
              placeholder="Choose week"
              label="Week"
            />
          </div>

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
            <PageLoader />
          ) : participants.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-orange-200 py-12 text-center">
              <p className="text-sm text-gray-500">You have no participants assigned yet.</p>
              <p className="mt-1 text-xs text-gray-400">Ask an admin to assign you to a group.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {participants.map((p) => {
                const rec = records.get(p.id);
                const isSaving = saving.has(p.id);
                return (
                  <div
                    key={p.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedParticipant(p)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setSelectedParticipant(p);
                      }
                    }}
                    className="flex w-full cursor-pointer items-center gap-4 rounded-2xl border border-orange-100 bg-white p-4 text-left shadow-sm transition hover:bg-orange-50/30"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-gray-900">{p.fullName}</p>
                      <p className="mt-1 text-xs text-gray-500">
                        {p.notes?.trim() ? 'View or edit note' : 'Tap to add a note'}
                      </p>
                      <div
                        className="mt-3 max-w-[220px]"
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => event.stopPropagation()}
                      >
                        <AppSelect
                          label="Attendance"
                          value={rec?.status ?? ''}
                          onChange={(value) => { void handleMark(p.id, value as AttendanceStatus); }}
                          options={STATUS_SELECT_OPTIONS}
                          placeholder="Choose status"
                          loading={isSaving}
                        />
                      </div>
                    </div>
                    <span className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-orange-50 text-gray-400">
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m9 5 7 7-7 7" />
                      </svg>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      <ParticipantNotesModal
        participant={selectedParticipant}
        saving={savingNote}
        onClose={() => setSelectedParticipant(null)}
        onSave={handleSaveNote}
      />
    </div>
  );
};

export default SupportAttendancePage;
