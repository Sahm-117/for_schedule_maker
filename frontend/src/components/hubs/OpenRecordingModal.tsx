import React, { useEffect, useState } from 'react';
import AppSelect from '../AppSelect';
import ModalShell from '../followups/ModalShell';
import Spinner from '../Spinner';
import { meetingRecordingApi } from '../../services/api';
import { formatLagosMoment } from '../../utils/meetingWindow';
import type { Week } from '../../types';

// Admin-only. A hub's or group's meeting can normally be recorded only from 10 minutes before its time
// until midnight that day. This opens recording for one week for 24 hours (a meeting held in a break
// week, or one that was missed) and can close it again.
const OpenRecordingModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  /** "Hub 4" or the group's name. */
  name: string;
  target: { hubId?: string | null; groupId?: string | null };
  weeks: Week[];
  defaultWeekId?: number | null;
}> = ({ isOpen, onClose, name, target, weeks, defaultWeekId = null }) => {
  const sorted = [...weeks].sort((a, b) => a.weekNumber - b.weekNumber);
  const [weekId, setWeekId] = useState<number | null>(defaultWeekId ?? sorted[0]?.id ?? null);
  const [until, setUntil] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const targetId = target.hubId ?? target.groupId ?? '';

  useEffect(() => { if (isOpen) { setWeekId(defaultWeekId ?? sorted[0]?.id ?? null); setError(''); } }, [isOpen, targetId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isOpen || weekId === null) return undefined;
    let cancelled = false;
    setUntil(null);
    meetingRecordingApi.getOpening(target, weekId).then((value) => { if (!cancelled) setUntil(value); }).catch(() => { /* none shown */ });
    return () => { cancelled = true; };
  }, [isOpen, weekId, targetId]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (action: 'open' | 'close') => {
    if (weekId === null) return;
    setBusy(true);
    setError('');
    try {
      if (action === 'open') setUntil(await meetingRecordingApi.open(target, weekId, 24));
      else { await meetingRecordingApi.close(target, weekId); setUntil(null); }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell isOpen={isOpen} onClose={onClose} title="Open meeting" subtitle={name}>
      <div className="flex flex-col gap-4">
        <p className="text-[13px] leading-relaxed text-gray-600">
          A meeting can normally be taken (attendance and marking it held) from 10 minutes before its time until midnight that day. Open a week here if the meeting was held on another day, or was missed. It stays open for 24 hours.
        </p>
        <AppSelect
          label="Week"
          value={weekId === null ? '' : String(weekId)}
          onChange={(value) => setWeekId(Number(value))}
          options={sorted.map((week) => ({ value: String(week.id), label: `Week ${week.weekNumber}` }))}
          placeholder="Choose week"
        />
        {until ? (
          <p className="rounded-xl bg-emerald-50 px-3.5 py-2.5 text-[13px] font-semibold text-emerald-800">Open until {formatLagosMoment(new Date(until))}</p>
        ) : (
          <p className="rounded-xl bg-[#f5f5f7] px-3.5 py-2.5 text-[13px] text-gray-600">Following the normal window.</p>
        )}
        {error && <p className="text-[13px] text-red-600">{error}</p>}
        <div className="flex gap-2">
          <button type="button" onClick={() => { void run('open'); }} disabled={busy || weekId === null} className="min-h-[44px] flex-1 rounded-xl bg-primary px-4 text-[14px] font-semibold text-white disabled:opacity-50">
            {busy ? <Spinner className="mx-auto h-4 w-4" /> : until ? 'Open for 24 more hours' : 'Open for 24 hours'}
          </button>
          {until && (
            <button type="button" onClick={() => { void run('close'); }} disabled={busy} className="min-h-[44px] rounded-xl border border-gray-200 bg-white px-4 text-[14px] font-semibold text-gray-700 disabled:opacity-50">Close</button>
          )}
        </div>
      </div>
    </ModalShell>
  );
};

export default OpenRecordingModal;
