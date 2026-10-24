import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ParticipantHome } from '../../types';
import { useParticipantApp } from '../../context/ParticipantAppContext';
import { participantAppApi } from '../../services/api';
import Spinner from '../Spinner';

// Shown on Home and on the My Journey Attendance tab while the Sunday
// register is open and this participant hasn't been marked yet. The push
// notification is the real alert; this is just a live nudge while it's open.
// "I'm here" and "I can't come today" tell the support; neither marks attendance.

const countdownLabel = (closesAt: string, now: number) => {
  const ms = new Date(closesAt).getTime() - now;
  if (ms <= 0) return 'Closing…';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

const REASONS = ['I am unwell', 'I am travelling', 'Work', 'A family matter', 'Something else'] as const;

const CantSheet: React.FC<{ supportFirst: string; onClose: () => void; onSent: (reason: string) => void }> = ({ supportFirst, onClose, onSent }) => {
  const [reason, setReason] = useState<string>('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const send = async () => {
    const full = [reason, note.trim()].filter(Boolean).join(': ');
    if (!full) { setError('Pick a reason or write one.'); return; }
    setSaving(true);
    setError('');
    try {
      await participantAppApi.sendClassSignal('CANT', full);
      onSent(full);
    } catch (err) {
      setError(err instanceof Error && err.message !== 'SESSION_EXPIRED' ? err.message : 'Could not send that. Please try again.');
      setSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="cant-title">
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white p-6 shadow-xl sm:max-w-md sm:rounded-3xl">
        <h2 id="cant-title" className="text-lg font-bold text-gray-900">Can&apos;t come today?</h2>
        <p className="mt-1.5 text-[14px] leading-relaxed text-gray-600">That&apos;s okay. Tell {supportFirst} why so they know you are fine.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {REASONS.map((r) => (
            <button key={r} type="button" onClick={() => setReason(r)} className={`min-h-[40px] rounded-full px-3.5 text-[13px] font-semibold transition ${reason === r ? 'bg-primary text-white' : 'border border-gray-200 bg-white text-gray-700'}`}>{r}</button>
          ))}
        </div>
        <label className="mt-4 block">
          <span className="mb-1.5 block text-[13px] font-semibold text-gray-900">Anything to add? (optional)</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="A few words" className="min-h-[72px] w-full resize-y rounded-xl border border-gray-200 px-3.5 py-3 text-[15px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
        </label>
        {error && <p className="mt-3 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</p>}
        <div className="mt-5 flex flex-col gap-2">
          <button type="button" onClick={() => { void send(); }} disabled={saving} className="flex min-h-[48px] items-center justify-center rounded-xl bg-primary px-4 text-[15px] font-semibold text-white disabled:opacity-60">
            {saving ? <span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Sending…</span> : `Tell ${supportFirst}`}
          </button>
          <button type="button" onClick={onClose} disabled={saving} className="min-h-[44px] text-[14px] font-semibold text-gray-500">Not now</button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

const AttendanceCountdownCard: React.FC<{ openWindow: ParticipantHome['openWindow'] }> = ({ openWindow }) => {
  const { home } = useParticipantApp();
  const [now, setNow] = useState(() => Date.now());
  const [signal, setSignal] = useState<'HERE' | 'CANT' | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [cantOpen, setCantOpen] = useState(false);
  const weekId = openWindow?.weekId ?? null;
  const supportFirst = (home?.group?.supportName || 'your support').split(' ')[0];

  useEffect(() => {
    if (!openWindow) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [openWindow]);

  // What they already told their support this week (so a refresh or another device shows it).
  useEffect(() => {
    setSignal(null);
    if (weekId === null) return undefined;
    let cancelled = false;
    participantAppApi.classSignalMine(weekId).then((r) => { if (!cancelled) setSignal(r.status); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [weekId]);

  if (!openWindow || openWindow.myStatus) return null;

  const imHere = async () => {
    setSending(true);
    setError('');
    try {
      await participantAppApi.sendClassSignal('HERE');
      setSignal('HERE');
    } catch (err) {
      setError(err instanceof Error && err.message !== 'SESSION_EXPIRED' ? err.message : 'Could not send that. Please try again.');
    } finally { setSending(false); }
  };

  return (
    <section className="rounded-[18px] border border-[#bae0fb] bg-[#eef6fd] px-4 py-3.5">
      <p className="text-[11px] font-bold uppercase tracking-[0.04em] text-[#3c6da3]">Attendance is open</p>
      <p className="mt-1 text-[15px] font-bold text-gray-900">Attendance closes in {countdownLabel(openWindow.closesAt, now)}</p>
      {signal === 'HERE' ? (
        <p className="mt-1 text-[13px] text-gray-600">{supportFirst} knows you&apos;re here. Thank you.</p>
      ) : signal === 'CANT' ? (
        <p className="mt-1 text-[13px] text-gray-600">{supportFirst} knows you can&apos;t make it today. <button type="button" onClick={() => { void imHere(); }} className="font-semibold text-[#c2410c]">Actually, I&apos;m here</button></p>
      ) : (
        <>
          <p className="mt-1 text-[13px] text-gray-500">Let your support know you&apos;re here.</p>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => { void imHere(); }} disabled={sending} className="flex min-h-[44px] flex-1 items-center justify-center rounded-xl bg-[#c2410c] px-4 text-[14px] font-bold text-white disabled:opacity-60">
              {sending ? <Spinner className="h-4 w-4" /> : "I'm here"}
            </button>
            <button type="button" onClick={() => setCantOpen(true)} className="min-h-[44px] flex-1 rounded-xl border border-[#bae0fb] bg-white px-4 text-[14px] font-semibold text-gray-700">Can&apos;t come today</button>
          </div>
        </>
      )}
      {error && <p className="mt-2 text-[13px] text-red-700">{error}</p>}
      {cantOpen && <CantSheet supportFirst={supportFirst} onClose={() => setCantOpen(false)} onSent={() => { setSignal('CANT'); setCantOpen(false); }} />}
    </section>
  );
};

export default AttendanceCountdownCard;
