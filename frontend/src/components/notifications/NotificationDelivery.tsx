import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import Avatar from '../Avatar';
import ConfirmationModal from '../ConfirmationModal';
import PageLoader from '../PageLoader';
import { useToast } from '../Toast';
import { notificationDeliveryApi } from '../../services/api';
import type { NotificationRecipient, NotificationSend } from '../../types';

// Admin → Notifications. Every notification that went out, to whom, and who has read
// it. Tap one to see the people, and remind the ones who haven't (one or all).
// Same look as the support and participant apps: soft white cards, big numbers, pills.

const SURFACE = 'rounded-[28px] bg-white shadow-[0_1px_2px_rgba(17,24,39,0.04),0_12px_32px_-16px_rgba(17,24,39,0.18)]';
const PRIMARY = 'flex h-[52px] w-full items-center justify-center gap-2 rounded-full bg-primary px-5 text-[15px] font-semibold text-white transition active:scale-[0.98] disabled:opacity-60';
const SECONDARY = 'flex h-[52px] w-full items-center justify-center gap-2 rounded-full bg-[#f2f2f4] px-5 text-[15px] font-semibold text-gray-900 transition active:scale-[0.98]';

type Audience = 'ALL' | 'STAFF' | 'PARTICIPANT' | 'PUSH';
const AUDIENCES: Array<{ key: Audience; label: string }> = [
  { key: 'ALL', label: 'All' },
  { key: 'STAFF', label: 'Supports' },
  { key: 'PARTICIPANT', label: 'Participants' },
  { key: 'PUSH', label: 'Push only' },
];
const RANGES = [7, 14, 30];

const TYPE_LABEL: Record<string, string> = {
  FOLLOWUP_ASSIGNMENT: 'Follow-up', FOLLOWUP_ISSUE: 'Follow-up', FOLLOWUP_TERMINAL: 'Follow-up',
  ANNOUNCEMENT: 'Announcement', HUB: 'Hub', REMINDER: 'Reminder', ATTENDANCE_REPORT: 'Attendance',
  ONBOARDING: 'Onboarding', FAITH_PROJECT_SUBMITTED: 'Faith project', FAITH_PROJECT_REVIEW: 'Faith project',
  FAITH_HELP: 'Faith project', MANUAL_QUESTION: 'Class', TESTIMONY: 'Testimony', ESCALATION: 'Escalation', GENERAL: 'General',
};
const typeLabel = (send: NotificationSend) => (send.source === 'PUSH' ? 'Push' : TYPE_LABEL[send.type] ?? 'Other');

const fmtWhen = (iso: string) => new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Africa/Lagos' });
const span = (from: string, to: string) => {
  const mins = Math.max(0, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 60000));
  if (mins < 1) return 'straight away';
  if (mins < 60) return `${mins} min after`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h after`;
  return `${Math.round(hours / 24)} d after`;
};
const waiting = (iso: string) => {
  const mins = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h`;
  return `${Math.round(hours / 24)} d`;
};
const sendKey = (s: NotificationSend) => `${s.source}|${s.type}|${s.title}|${s.body}|${s.path}|${s.sentAt}`;

const Chevron: React.FC = () => (
  <svg className="h-4 w-4 flex-none text-gray-300" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="m9 5 7 7-7 7" />
  </svg>
);

const ReadMeter: React.FC<{ send: NotificationSend }> = ({ send }) => {
  if (!send.tracked) return <span className="text-[13px] text-gray-400">Not tracked</span>;
  const pct = send.recipients ? Math.round((send.readCount / send.recipients) * 100) : 0;
  return (
    <div className="w-full min-w-[112px]">
      <p className="text-[13px] tabular-nums text-gray-500"><span className="text-[15px] font-semibold text-gray-900">{send.readCount}</span> of {send.recipients} read</p>
      <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-[#f2f2f4]" aria-hidden="true">
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
};

const RecipientsSheet: React.FC<{ send: NotificationSend; onClose: () => void; onReminded: () => void }> = ({ send, onClose, onReminded }) => {
  const toast = useToast();
  const [people, setPeople] = useState<NotificationRecipient[] | null>(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const [sendingAll, setSendingAll] = useState(false);

  useEffect(() => {
    let cancelled = false;
    notificationDeliveryApi.getRecipients(send)
      .then((rows) => { if (!cancelled) setPeople(rows); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load the list.'); });
    return () => { cancelled = true; };
  }, [send]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const unread = useMemo(() => (people ?? []).filter((p) => p.read === false), [people]);

  const remind = async (targets: NotificationRecipient[]) => {
    const reached = await notificationDeliveryApi.remind(send, targets.map((t) => ({ id: t.id, role: t.role })));
    toast({ message: targets.length === 1
      ? `Reminded ${targets[0].name.split(' ')[0]}.`
      : `Reminded ${targets.length} people${reached.sent > 0 ? ` (${reached.sent} phone${reached.sent === 1 ? '' : 's'} reached)` : ''}.` });
    onReminded();
  };
  const remindOne = async (person: NotificationRecipient) => {
    setBusyId(person.id);
    try { await remind([person]); } catch { toast({ tone: 'error', message: "That didn't send. Please try again." }); } finally { setBusyId(null); }
  };
  const remindAll = async () => {
    setSendingAll(true);
    try { await remind(unread); setConfirmAll(false); } catch { toast({ tone: 'error', message: "That didn't send. Please try again." }); } finally { setSendingAll(false); }
  };

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={send.title}>
      <button type="button" aria-label="Close" className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <div className="relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-t-[32px] bg-white shadow-[0_-8px_40px_rgba(15,23,42,0.2)] sm:rounded-[32px]">
        <div className="px-6 pb-5 pt-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-primary">{typeLabel(send)} · {fmtWhen(send.sentAt)}</p>
              <h2 className="mt-1 text-[24px] font-bold leading-[1.15] tracking-[-0.02em] text-gray-900">{send.title}</h2>
              {send.body && <p className="mt-2 line-clamp-3 text-[14.5px] leading-[1.55] text-gray-500">{send.body}</p>}
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-[#f2f2f4] text-[18px] leading-none text-gray-500 transition active:scale-95">×</button>
          </div>

          {send.tracked ? (
            <div className="mt-5">
              <p className="text-[40px] font-bold leading-none tracking-[-0.03em] tabular-nums text-gray-900">
                {send.readCount}<span className="text-[22px] font-semibold text-gray-300"> / {send.recipients}</span>
              </p>
              <p className="mt-1.5 text-[14.5px] text-gray-500">
                {people ? (unread.length > 0 ? `${unread.length} haven’t opened it yet` : 'Everyone has read it') : 'read so far'}
              </p>
              {unread.length > 0 && (
                <button type="button" onClick={() => setConfirmAll(true)} className={`${PRIMARY} mt-4`}>Remind all {unread.length}</button>
              )}
            </div>
          ) : (
            <p className="mt-5 rounded-2xl bg-[#f7f7f9] px-4 py-3.5 text-[14px] leading-[1.55] text-gray-500">
              This went out as a phone push only, so there is no in-app copy to show as read. You can see who it was sent to.
            </p>
          )}
        </div>

        <div className="min-h-[120px] flex-1 overflow-y-auto border-t border-[#f0f0f2] px-3 py-2">
          {error ? (
            <p className="px-3 py-8 text-center text-sm text-red-600">{error}</p>
          ) : !people ? (
            <PageLoader />
          ) : people.length === 0 ? (
            <p className="px-3 py-8 text-center text-[15px] text-gray-500">No one to show.</p>
          ) : (
            <ul>
              {people.map((p) => (
                <li key={`${p.id}-${p.sentAt}`} className="flex items-center gap-3 rounded-2xl px-3 py-3">
                  <Avatar name={p.name} size="md" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15.5px] font-semibold text-gray-900">{p.name}</p>
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] text-gray-500">
                      {p.read === true && <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />{p.readAt ? `Read ${span(p.sentAt, p.readAt)}` : 'Read'}</span>}
                      {p.read === false && <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-amber-400" aria-hidden="true" />Unread for {waiting(p.sentAt)}</span>}
                      {p.read === null && <span>{p.role === 'ADMIN' ? 'Admin' : 'Support'}</span>}
                      {!p.hasPush && <span className="text-gray-400">· No phone alerts</span>}
                    </p>
                  </div>
                  {p.read === false && send.tracked && (
                    <button type="button" disabled={busyId === p.id} onClick={() => void remindOne(p)} className="h-9 flex-none rounded-full bg-[#f2f2f4] px-4 text-[13px] font-semibold text-gray-900 transition active:scale-95 disabled:opacity-60">
                      {busyId === p.id ? 'Sending…' : 'Remind'}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="border-t border-[#f0f0f2] px-6 py-4"><button type="button" onClick={onClose} className={SECONDARY}>Done</button></div>
      </div>

      <ConfirmationModal
        isOpen={confirmAll}
        onClose={() => setConfirmAll(false)}
        onConfirm={() => void remindAll()}
        title={`Remind ${unread.length} ${unread.length === 1 ? 'person' : 'people'}?`}
        message={`They get “Reminder: ${send.title}” in their app, and as a phone push if they have alerts on. Only the ones who haven’t read it.`}
        confirmText="Send reminder"
        type="info"
        confirmLoading={sendingAll}
      />
    </div>,
    document.body,
  );
};

const NotificationDelivery: React.FC = () => {
  const [days, setDays] = useState(14);
  const [audience, setAudience] = useState<Audience>('ALL');
  const [query, setQuery] = useState('');
  const [sends, setSends] = useState<NotificationSend[] | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<NotificationSend | null>(null);

  const load = useCallback(() => {
    notificationDeliveryApi.getSends(days)
      .then((rows) => { setSends(rows); setError(''); })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load notifications.'));
  }, [days]);
  useEffect(() => { setSends(null); load(); }, [load]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (sends ?? []).filter((s) => (audience === 'ALL' || s.source === audience)
      && (!q || s.title.toLowerCase().includes(q) || s.body.toLowerCase().includes(q)));
  }, [sends, audience, query]);

  const totals = useMemo(() => {
    const tracked = shown.filter((s) => s.tracked);
    const sent = tracked.reduce((n, s) => n + s.recipients, 0);
    const read = tracked.reduce((n, s) => n + s.readCount, 0);
    return { sends: shown.length, sent, read, unread: sent - read, pct: sent ? Math.round((read / sent) * 100) : null, pushOnly: shown.filter((s) => !s.tracked).length };
  }, [shown]);

  const pill = (active: boolean) => `whitespace-nowrap rounded-full px-4 py-2 text-[13.5px] font-semibold transition active:scale-95 ${active ? 'bg-gray-900 text-white' : 'bg-[#f2f2f4] text-gray-700 hover:bg-[#e9e9ec]'}`;

  return (
    <div data-wt="notification-delivery" className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {AUDIENCES.map((a) => <button key={a.key} type="button" onClick={() => setAudience(a.key)} className={pill(audience === a.key)}>{a.label}</button>)}
        </div>
        <div className="flex gap-1 sm:ml-auto" role="group" aria-label="Time range">
          {RANGES.map((d) => (
            <button key={d} type="button" onClick={() => setDays(d)} className={`rounded-full px-3 py-2 text-[13px] font-semibold transition ${days === d ? 'bg-primary/10 text-primary' : 'text-gray-500 hover:text-gray-900'}`}>{d} days</button>
          ))}
        </div>
      </div>

      {error ? (
        <p className="py-16 text-center text-sm text-red-600">{error}</p>
      ) : !sends ? (
        <PageLoader />
      ) : (
        <>
          <section className={`${SURFACE} px-6 pb-6 pt-7 sm:px-8 sm:pb-8 sm:pt-9`}>
            <p className="text-[13px] font-semibold text-primary">Last {days} days</p>
            {totals.pct === null ? (
              <h2 className="mt-1.5 text-[30px] font-bold leading-[1.1] tracking-[-0.025em] text-gray-900">{totals.sends} sent</h2>
            ) : (
              <h2 className="mt-1.5 text-[52px] font-bold leading-none tracking-[-0.035em] tabular-nums text-gray-900">{totals.pct}<span className="text-[30px] text-gray-300">% read</span></h2>
            )}
            <p className="mt-2 text-[15px] leading-[1.55] text-gray-500">
              {totals.sends} sent{totals.sent > 0 ? ` · ${totals.read} of ${totals.sent} opened · ${totals.unread} still unread` : ''}{totals.pushOnly > 0 ? ` · ${totals.pushOnly} phone-only` : ''}
            </p>
          </section>

          <div>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search what was sent"
              aria-label="Search what was sent"
              className="mb-3 h-12 w-full rounded-full border border-transparent bg-[#f2f2f4] px-5 text-[15px] text-gray-900 outline-none placeholder:text-gray-400 focus:border-primary/40 focus:bg-white"
            />
            {shown.length === 0 ? (
              <section className={`${SURFACE} px-8 py-14 text-center`}>
                <p className="text-[19px] font-semibold tracking-[-0.01em] text-gray-900">Nothing here</p>
                <p className="mx-auto mt-2 max-w-[34ch] text-[15px] leading-[1.55] text-gray-500">Nothing matches that in the last {days} days.</p>
              </section>
            ) : (
              <ul className={`${SURFACE} divide-y divide-[#f0f0f2] overflow-hidden`}>
                {shown.map((s) => (
                  <li key={sendKey(s)}>
                    <button type="button" onClick={() => setOpen(s)} className="flex w-full items-center gap-4 px-5 py-4 text-left transition hover:bg-[#fafafa] sm:px-6">
                      <span className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
                      <span className="min-w-0 flex-1">
                        <span className="line-clamp-2 block text-[16px] font-semibold leading-snug text-gray-900">{s.title}</span>
                        <span className="mt-0.5 block text-[13px] text-gray-500">
                          {typeLabel(s)} · {fmtWhen(s.sentAt)} · {s.recipients} {s.source === 'PARTICIPANT' ? (s.recipients === 1 ? 'participant' : 'participants') : s.recipients === 1 ? 'person' : 'people'}
                        </span>
                      </span>
                      <span className="w-full max-w-[220px] flex-none sm:w-[132px]"><ReadMeter send={s} /></span>
                      </span>
                      <Chevron />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      {open && <RecipientsSheet send={open} onClose={() => setOpen(null)} onReminded={load} />}
    </div>
  );
};

export default NotificationDelivery;
