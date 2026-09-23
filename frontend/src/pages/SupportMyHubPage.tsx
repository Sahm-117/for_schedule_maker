import React, { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import SegmentedTabs from '../components/SegmentedTabs';
import AppSelect from '../components/AppSelect';
import { useAuth } from '../hooks/useAuth';
import { useAppData } from '../context/AppDataContext';
import { myHubApi, supportNotesApi, supportSessionsApi } from '../services/api';
import { buildWhatsAppLink } from '../utils/phone';
import type { SupportAttendanceStatus, SupportNote } from '../types';

const STATUS_OPTIONS: Array<{ value: SupportAttendanceStatus; label: string }> = [
  { value: 'PRESENT', label: 'Present' },
  { value: 'LATE', label: 'Late' },
  { value: 'ABSENT', label: 'Absent' },
  { value: 'EXCUSED', label: 'Excused' },
];

const STATUS_PILL: Record<SupportAttendanceStatus, string> = {
  PRESENT: 'bg-emerald-100/80 text-emerald-700',
  LATE: 'bg-amber-100/80 text-amber-700',
  ABSENT: 'bg-red-100/80 text-red-700',
  EXCUSED: 'bg-violet-100/80 text-violet-700',
};

type HubTab = 'overview' | 'recap' | 'notes' | 'message';

const SupportMyHubPage: React.FC = () => {
  const { user } = useAuth();
  const { myHub, refreshMyHub, weeks, activeCohort } = useAppData();
  const [tab, setTab] = useState<HubTab>('overview');
  const [loaded, setLoaded] = useState(!!myHub);

  useEffect(() => {
    void refreshMyHub().finally(() => setLoaded(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCohort?.id]);

  // ── Recap attendance (lead only) ──────────────────────────────────────────
  const sortedWeeks = useMemo(() => [...weeks].sort((a, b) => b.weekNumber - a.weekNumber), [weeks]);
  const [recapWeekId, setRecapWeekId] = useState<number | null>(null);
  const [recapMarks, setRecapMarks] = useState<Record<string, SupportAttendanceStatus>>({});
  const [recapLoading, setRecapLoading] = useState(false);
  const [recapSaving, setRecapSaving] = useState<string | null>(null);

  useEffect(() => {
    if (sortedWeeks.length > 0 && recapWeekId == null) setRecapWeekId(sortedWeeks[0].id);
  }, [sortedWeeks, recapWeekId]);

  useEffect(() => {
    if (tab !== 'recap' || !myHub?.hub || recapWeekId == null) return;
    setRecapLoading(true);
    supportSessionsApi.getForHubWeek(myHub.hub.id, recapWeekId)
      .then(({ attendance }) => {
        const map: Record<string, SupportAttendanceStatus> = {};
        attendance.forEach((a) => { map[a.userId] = a.status; });
        setRecapMarks(map);
      })
      .catch(() => setRecapMarks({}))
      .finally(() => setRecapLoading(false));
  }, [tab, myHub?.hub, recapWeekId]);

  const handleMark = async (userId: string, status: SupportAttendanceStatus) => {
    if (!myHub?.hub || recapWeekId == null) return;
    setRecapSaving(userId);
    try {
      await supportSessionsApi.mark({ status, userId, hubId: myHub.hub.id, weekId: recapWeekId });
      setRecapMarks((prev) => ({ ...prev, [userId]: status }));
    } catch { /* ignore */ }
    finally { setRecapSaving(null); }
  };

  // ── Notes (lead only) ──────────────────────────────────────────────────────
  const [noteSupportId, setNoteSupportId] = useState('');
  const [notes, setNotes] = useState<SupportNote[]>([]);
  const [noteBody, setNoteBody] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteLoading, setNoteLoading] = useState(false);

  useEffect(() => {
    if (myHub?.members.length && !noteSupportId) setNoteSupportId(myHub.members[0].userId);
  }, [myHub?.members, noteSupportId]);

  useEffect(() => {
    if (tab !== 'notes' || !noteSupportId) return;
    setNoteLoading(true);
    supportNotesApi.getForSupport(noteSupportId)
      .then((res) => setNotes(res.notes))
      .catch(() => setNotes([]))
      .finally(() => setNoteLoading(false));
  }, [tab, noteSupportId]);

  const handleAddNote = async () => {
    if (!myHub?.hub || !noteSupportId || !noteBody.trim()) return;
    setNoteSaving(true);
    try {
      const { note } = await supportNotesApi.create({ supportId: noteSupportId, hubId: myHub.hub.id, noteType: 'NOTE', body: noteBody.trim() });
      setNotes((prev) => [note, ...prev]);
      setNoteBody('');
    } catch { /* ignore */ }
    finally { setNoteSaving(false); }
  };

  // ── Message hub (lead only) ───────────────────────────────────────────────
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [sendStatus, setSendStatus] = useState<'success' | 'error' | null>(null);

  const handleSend = async () => {
    if (!myHub?.hub || !subject.trim() || !body.trim()) return;
    setSending(true);
    setSendStatus(null);
    try {
      await myHubApi.postMessage(myHub.hub.id, subject.trim(), body.trim());
      setSubject('');
      setBody('');
      setSendStatus('success');
      void refreshMyHub();
    } catch {
      setSendStatus('error');
    } finally {
      setSending(false);
    }
  };

  if (user?.role !== 'SUPPORT') return <Navigate to="/dashboard" replace />;

  const isLead = !!myHub?.isLead;
  const leadMember = myHub?.hub ? myHub.members.find((m) => m.userId === myHub.hub!.leadUserId) : undefined;
  const leadWhatsAppLink = myHub?.hub ? buildWhatsAppLink(leadMember?.phone, `Hi ${myHub.hub.leadName?.split(' ')[0] ?? ''}`) : null;
  const tabs = [
    { key: 'overview', label: 'My Hub' },
    ...(isLead ? [
      { key: 'recap', label: 'Recap attendance', shortLabel: 'Recap' },
      { key: 'notes', label: 'Notes' },
      { key: 'message', label: 'Message hub', shortLabel: 'Message' },
    ] : []),
  ];

  return (
    <div className="page-content">
      <PageHeader title="My Hub" tourId={myHub?.isLead ? 'support:my-hub-lead' : 'support:my-hub'} subtitle={myHub?.hub ? myHub.hub.name : 'Your hub'} />

      {!loaded ? (
        <div className="space-y-3" aria-busy="true">
          {[0, 1].map((i) => <div key={i} className="surface-card h-24 animate-pulse" />)}
        </div>
      ) : !myHub?.hub ? (
        <div className="surface-card p-8 text-center text-sm text-gray-500">You’re not in a hub for this cohort yet.</div>
      ) : (
        <div className="space-y-4">
          {tabs.length > 1 && (
            <div data-wt="hub-tabs">
              <SegmentedTabs tabs={tabs} active={tab} onChange={(k) => setTab(k as HubTab)} />
            </div>
          )}

          {tab === 'overview' && (
            <div className="space-y-4">
              <section className="surface-card p-5">
                <p className="text-sm text-gray-500">Lead</p>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <p className="text-base font-semibold text-gray-900">{myHub.hub.leadName || 'No lead assigned'}</p>
                  {leadWhatsAppLink && (
                    <a href={leadWhatsAppLink} target="_blank" rel="noreferrer" className="rounded-xl bg-emerald-100/80 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100">WhatsApp</a>
                  )}
                </div>
              </section>

              <section data-wt="hub-members" className="surface-card p-5">
                <p className="mb-2 text-sm font-semibold text-gray-700">Fellow supports</p>
                {myHub.members.length === 0 ? (
                  <p className="text-sm text-gray-400">No members yet.</p>
                ) : (
                  <ul className="divide-y divide-orange-50">
                    {myHub.members.map((m) => (
                      <li key={m.userId} className="flex items-center justify-between py-2 text-sm">
                        <span className="text-gray-800">
                          {m.name}
                          {m.isLead && <span className="ml-2 rounded-full bg-violet-100/80 px-2 py-0.5 text-[10px] font-semibold text-violet-700">Lead</span>}
                        </span>
                        <span className="text-xs text-gray-400">{m.groupName || 'No group'}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="surface-card p-5">
                <p className="mb-2 text-sm font-semibold text-gray-700">Messages from the lead</p>
                {myHub.messages.length === 0 ? (
                  <p className="text-sm text-gray-400">No messages yet.</p>
                ) : (
                  <ul className="space-y-3">
                    {myHub.messages.map((msg) => (
                      <li key={msg.id} className="rounded-xl border border-orange-100 p-3">
                        <p className="text-sm font-semibold text-gray-900">{msg.subject}</p>
                        <p className="mt-1 whitespace-pre-line text-sm text-gray-700">{msg.body}</p>
                        <p className="mt-1.5 text-[11px] text-gray-400">{msg.authorName || 'Hub lead'} · {new Date(msg.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="surface-card p-5">
                <p className="mb-2 text-sm font-semibold text-gray-700">My attendance</p>
                {myHub.myAttendance.length === 0 ? (
                  <p className="text-sm text-gray-400">No marks yet.</p>
                ) : (
                  <ul className="divide-y divide-orange-50">
                    {myHub.myAttendance.map((a) => (
                      <li key={a.sessionId} className="flex items-center justify-between py-2 text-sm">
                        <span className="text-gray-800">{a.title}</span>
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_PILL[a.status]}`}>{a.status}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          )}

          {tab === 'recap' && isLead && (
            <section className="surface-card p-5">
              <div className="mb-4 w-full sm:w-64">
                <AppSelect
                  value={recapWeekId != null ? String(recapWeekId) : ''}
                  onChange={(v) => setRecapWeekId(v ? Number(v) : null)}
                  options={sortedWeeks.map((w) => ({ value: String(w.id), label: `Week ${w.weekNumber}` }))}
                  placeholder="Pick a week"
                  compact
                />
              </div>
              {recapLoading ? (
                <p className="text-sm text-gray-400">Loading…</p>
              ) : myHub.members.length === 0 ? (
                <p className="text-sm text-gray-400">No members yet.</p>
              ) : (
                <ul className="space-y-2">
                  {myHub.members.map((m) => (
                    <li key={m.userId} className="flex items-center justify-between gap-3 rounded-xl border border-orange-100 p-3">
                      <span className="text-sm font-semibold text-gray-900">{m.name}</span>
                      <div className="w-40">
                        <AppSelect
                          value={recapMarks[m.userId] ?? ''}
                          onChange={(v) => v && void handleMark(m.userId, v as SupportAttendanceStatus)}
                          options={STATUS_OPTIONS}
                          placeholder={recapSaving === m.userId ? 'Saving…' : 'Not marked'}
                          compact
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {tab === 'notes' && isLead && (
            <section className="surface-card p-5">
              <div className="mb-4 w-full sm:w-64">
                <AppSelect
                  value={noteSupportId}
                  onChange={setNoteSupportId}
                  options={myHub.members.map((m) => ({ value: m.userId, label: m.name }))}
                  placeholder="Pick a support"
                  compact
                />
              </div>
              <div className="mb-4 flex flex-col gap-2">
                <textarea
                  value={noteBody}
                  onChange={(e) => setNoteBody(e.target.value)}
                  rows={3}
                  placeholder="Write a private note — only you and admin can see this."
                  className="w-full rounded-xl border border-orange-200 px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
                <button
                  type="button"
                  onClick={() => void handleAddNote()}
                  disabled={noteSaving || !noteBody.trim()}
                  className="self-end rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-white active:scale-95 disabled:opacity-60"
                >
                  {noteSaving ? 'Saving…' : 'Add note'}
                </button>
              </div>
              {noteLoading ? (
                <p className="text-sm text-gray-400">Loading…</p>
              ) : notes.length === 0 ? (
                <p className="text-sm text-gray-400">No notes yet.</p>
              ) : (
                <ul className="space-y-2">
                  {notes.map((n) => (
                    <li key={n.id} className="rounded-xl border border-orange-100 p-3">
                      <p className="whitespace-pre-line text-sm text-gray-800">{n.body}</p>
                      <p className="mt-1.5 text-[11px] text-gray-400">{n.authorName || 'You'} · {new Date(n.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {tab === 'message' && isLead && (
            <section className="surface-card p-5">
              {sendStatus === 'success' && <p className="mb-3 rounded-xl bg-emerald-50 px-4 py-2.5 text-sm text-emerald-700">Message sent to the hub.</p>}
              {sendStatus === 'error' && <p className="mb-3 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-600">Failed to send. Please try again.</p>}
              <div className="flex flex-col gap-3">
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Subject"
                  className="w-full rounded-xl border border-orange-200 px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={4}
                  placeholder="Message"
                  className="w-full rounded-xl border border-orange-200 px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
                <button
                  type="button"
                  onClick={() => void handleSend()}
                  disabled={sending || !subject.trim() || !body.trim()}
                  className="self-end rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-white active:scale-95 disabled:opacity-60"
                >
                  {sending ? 'Sending…' : 'Send to hub'}
                </button>
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
};

export default SupportMyHubPage;
