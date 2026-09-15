import React, { useCallback, useEffect, useMemo, useState } from 'react';
import AppSelect from '../AppSelect';
import ModalShell from '../followups/ModalShell';
import PageLoader from '../PageLoader';
import InfoTip from '../InfoTip';
import { attendanceApi, participantsApi } from '../../services/api';
import type { AttendanceRecord, AttendanceStatus, Participant, Week } from '../../types';

const STATUS_BUTTONS: Array<{ status: AttendanceStatus; label: string; activeCls: string }> = [
  { status: 'PRESENT', label: 'Present', activeCls: 'bg-emerald-100/80 text-emerald-700' },
  { status: 'LATE', label: 'Late', activeCls: 'bg-amber-100/80 text-amber-700' },
  { status: 'ABSENT', label: 'Absent', activeCls: 'bg-red-100/80 text-red-700' },
];

const initialsOf = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('');

interface ParticipantNotesModalProps {
  participant: Participant | null;
  saving: boolean;
  onClose: () => void;
  onSave: (notes: string) => Promise<void>;
}

export const ParticipantNotesModal: React.FC<ParticipantNotesModalProps> = ({ participant, saving, onClose, onSave }) => {
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

interface SundayClassPanelProps {
  supportId: string;
  participants: Participant[];
  weeks: Week[];
  weekId: number | null;
  onWeekChange: (weekId: number) => void;
  venue?: string | null;
  onParticipantUpdated: (participant: Participant) => void;
}

// Sunday class register for a support's group. Marks save as they are tapped.
const SundayClassPanel: React.FC<SundayClassPanelProps> = ({
  supportId,
  participants,
  weeks,
  weekId,
  onWeekChange,
  venue,
  onParticipantUpdated,
}) => {
  const [records, setRecords] = useState<Map<string, AttendanceRecord>>(new Map());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [noteParticipant, setNoteParticipant] = useState<Participant | null>(null);
  const [savingNote, setSavingNote] = useState(false);

  const load = useCallback(async () => {
    if (weekId === null) { setLoading(false); return; }
    setLoading(true);
    try {
      const { records: rs } = await attendanceApi.getForWeek({ weekId, supportId });
      const map = new Map<string, AttendanceRecord>();
      rs.forEach((record) => map.set(record.participantId, record));
      setRecords(map);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [supportId, weekId]);

  useEffect(() => { void load(); }, [load]);

  const handleMark = async (participantId: string, status: AttendanceStatus) => {
    if (weekId === null) return;
    setSaving((prev) => new Set(prev).add(participantId));
    try {
      const { record } = await attendanceApi.mark(participantId, weekId, status, supportId);
      setRecords((prev) => new Map(prev).set(participantId, record));
    } catch { /* ignore */ }
    finally {
      setSaving((prev) => { const next = new Set(prev); next.delete(participantId); return next; });
    }
  };

  const handleSaveNote = async (notes: string) => {
    if (!noteParticipant) return;
    setSavingNote(true);
    try {
      const { participant } = await participantsApi.update(noteParticipant.id, { notes: notes.trim() || null });
      onParticipantUpdated(participant);
      setNoteParticipant(null);
    } catch {
      // keep the modal open if save fails
    } finally {
      setSavingNote(false);
    }
  };

  const selectedWeek = weeks.find((week) => week.id === weekId) ?? null;
  const markedCount = participants.filter((participant) => records.has(participant.id)).length;
  const presentCount = participants.filter((participant) => records.get(participant.id)?.status === 'PRESENT').length;
  const allMarked = participants.length > 0 && markedCount === participants.length;

  const summary = useMemo(() => {
    if (markedCount === 0) return `Nobody marked yet, ${participants.length} in the group.`;
    return `${presentCount} of ${participants.length} present, ${participants.length - markedCount} still unmarked.`;
  }, [markedCount, participants.length, presentCount]);

  return (
    <div className="flex flex-col gap-3">
      <section className="rounded-[20px] border border-[#ffdeca] bg-white p-[18px] shadow-[0_2px_8px_-3px_rgba(17,24,39,0.10)]">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="min-w-0 text-base font-bold leading-snug text-gray-900">Sunday class · Week {selectedWeek?.weekNumber ?? '–'}</h2>
            <InfoTip label="About the Sunday register">
              This is the Sunday class register. Who joined the weekly group call is recorded under Group meetings. Marks save as you tap.
            </InfoTip>
          </div>
          <span className={`mt-0.5 flex-none whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold ${allMarked ? 'bg-emerald-100/80 text-emerald-700' : 'bg-neutral-100 text-neutral-600'}`}>
            {allMarked ? 'All marked' : 'Not complete'}
          </span>
        </div>
        <p className="mt-1 text-[13px] text-gray-500">{venue?.trim() ? venue : 'Venue not set'} · the physical class</p>
        {weeks.length > 0 && (
          <div className="mt-3">
            <AppSelect
              value={weekId ? String(weekId) : ''}
              onChange={(value) => onWeekChange(Number(value))}
              options={weeks.map((week) => ({ value: String(week.id), label: `Week ${week.weekNumber}` }))}
              placeholder="Choose week"
              compact
            />
          </div>
        )}
      </section>

      <section className="rounded-[20px] border border-[#eef0f4] bg-white p-[18px] shadow-[0_2px_8px_-3px_rgba(17,24,39,0.10)]">
        <h3 className="text-[15px] font-bold text-gray-900">Mark your group</h3>
        <p className="mt-0.5 text-[13px] text-gray-500">{summary}</p>

        {loading ? (
          <PageLoader />
        ) : participants.length === 0 ? (
          <div className="mt-3.5 rounded-2xl border border-dashed border-orange-200 py-10 text-center text-sm text-gray-500">
            No participants are in this group yet.
          </div>
        ) : (
          <div className="mt-3.5 flex flex-col gap-2">
            {participants.map((participant) => {
              const current = records.get(participant.id)?.status;
              const busy = saving.has(participant.id);
              return (
                <div key={participant.id} className="flex flex-wrap items-center gap-2.5 rounded-[14px] border border-[#f1f2f5] px-3 py-2.5">
                  <div className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-[#fff1e7] text-xs font-bold text-[#c2410c]">
                    {initialsOf(participant.fullName)}
                  </div>
                  <button
                    type="button"
                    onClick={() => setNoteParticipant(participant)}
                    className="min-w-0 text-left"
                    title={participant.notes?.trim() ? 'View or edit note' : 'Add a note'}
                  >
                    <span className="block truncate text-sm font-semibold text-gray-900">{participant.fullName}</span>
                    {participant.notes?.trim() && <span className="block text-[11px] text-gray-400">Has a note</span>}
                  </button>
                  <div className="ml-auto flex flex-wrap gap-1.5">
                    {STATUS_BUTTONS.map(({ status, label, activeCls }) => (
                      <button
                        key={status}
                        type="button"
                        disabled={busy}
                        onClick={() => { void handleMark(participant.id, status); }}
                        className={`rounded-full px-3 py-1.5 text-xs font-semibold transition disabled:opacity-60 ${current === status ? activeCls : 'bg-[#f4f5f7] text-gray-500 hover:bg-gray-200/70'}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <ParticipantNotesModal
        participant={noteParticipant}
        saving={savingNote}
        onClose={() => setNoteParticipant(null)}
        onSave={handleSaveNote}
      />
    </div>
  );
};

export default SundayClassPanel;
