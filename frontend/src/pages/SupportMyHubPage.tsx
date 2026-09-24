import React, { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import SegmentedTabs from '../components/SegmentedTabs';
import AppSelect from '../components/AppSelect';
import AppOverflowMenu from '../components/AppOverflowMenu';
import ConfirmationModal from '../components/ConfirmationModal';
import { MeetingCallCard, type MeetingSaveInput } from '../components/groups/GroupCallCard';
import { useAuth } from '../hooks/useAuth';
import { useAppData } from '../context/AppDataContext';
import { myHubApi, supportNotesApi, supportSessionsApi, usersApi } from '../services/api';
import { buildWhatsAppLink } from '../utils/phone';
import { sortByText } from '../utils/sort';
import { cohortMode } from '../components/dashboard/healthModel';
import type { HubMessage, MyHubMember, SupportAttendanceStatus, SupportSession, SupportSessionType, User, SupportNote } from '../types';

const SESSION_TYPE_PILL: Record<SupportSessionType, string> = {
  SUNDAY_RECAP: 'bg-neutral-100 text-neutral-600',
  PRE_COHORT_TRAINING: 'bg-sky-100/80 text-sky-700',
  GET_TOGETHER: 'bg-violet-100/80 text-violet-700',
};

const SESSION_TYPE_LABEL: Record<SupportSessionType, string> = {
  SUNDAY_RECAP: 'Sunday recap',
  PRE_COHORT_TRAINING: 'Pre-cohort training',
  GET_TOGETHER: 'Get-together',
};

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

type HubTab = 'overview' | 'recap' | 'trainings' | 'notes' | 'message';

const SupportMyHubPage: React.FC = () => {
  const { user } = useAuth();
  const { myHub, refreshMyHub, weeks, activeCohort, cohorts } = useAppData();
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

  // ── Trainings & get-togethers (lead only) ─────────────────────────────────
  const [trainingSessions, setTrainingSessions] = useState<SupportSession[]>([]);
  const [trainingAllSupports, setTrainingAllSupports] = useState<User[]>([]);
  const [trainingAttendance, setTrainingAttendance] = useState<Record<string, Record<string, SupportAttendanceStatus>>>({});
  const [trainingSessionId, setTrainingSessionId] = useState<string | null>(null);
  const [trainingLoading, setTrainingLoading] = useState(false);
  const [trainingSaving, setTrainingSaving] = useState<string | null>(null);

  // Pre-cohort trainings happen before the cohort they're for starts, so the
  // lead's list mirrors the admin Hubs tab: the active cohort plus any
  // upcoming ones, not just this hub's own cohort.
  const trainingListCohortIds = useMemo(() => {
    const ids = new Set(
      cohorts.filter((c) => c.status !== 'ARCHIVED' && cohortMode(c) === 'upcoming').map((c) => c.id)
    );
    if (activeCohort) ids.add(activeCohort.id);
    return [...ids];
  }, [cohorts, activeCohort]);
  const cohortById = useMemo(() => new Map(cohorts.map((c) => [c.id, c])), [cohorts]);

  useEffect(() => {
    if (tab !== 'trainings' || !myHub?.hub) return;
    setTrainingLoading(true);
    Promise.all([
      supportSessionsApi.getForCohort(trainingListCohortIds, ['PRE_COHORT_TRAINING', 'GET_TOGETHER']),
      usersApi.getAll(),
    ])
      .then(([{ sessions, attendance }, { users }]) => {
        setTrainingSessions(sessions);
        setTrainingAllSupports(sortByText(users.filter((u) => u.role === 'SUPPORT'), (u) => u.name));
        const byMap: Record<string, Record<string, SupportAttendanceStatus>> = {};
        attendance.forEach((a) => {
          if (!byMap[a.sessionId]) byMap[a.sessionId] = {};
          byMap[a.sessionId][a.userId] = a.status;
        });
        setTrainingAttendance(byMap);
        setTrainingSessionId((prev) => prev ?? sessions[0]?.id ?? null);
      })
      .catch(() => { setTrainingSessions([]); setTrainingAttendance({}); })
      .finally(() => setTrainingLoading(false));
  }, [tab, myHub?.hub, trainingListCohortIds]);

  const handleMarkTraining = async (userId: string, status: SupportAttendanceStatus) => {
    if (!trainingSessionId) return;
    setTrainingSaving(userId);
    try {
      await supportSessionsApi.mark({ status, userId, sessionId: trainingSessionId });
      setTrainingAttendance((prev) => ({ ...prev, [trainingSessionId]: { ...prev[trainingSessionId], [userId]: status } }));
    } catch { /* ignore */ }
    finally { setTrainingSaving(null); }
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

  // ── Message acknowledgement (member "Got it") ─────────────────────────────
  const [ackedLocal, setAckedLocal] = useState<Set<string>>(new Set());

  const handleAcknowledge = async (messageId: string) => {
    setAckedLocal((prev) => new Set(prev).add(messageId));
    try {
      await myHubApi.acknowledgeMessage(messageId);
    } catch {
      setAckedLocal((prev) => {
        const next = new Set(prev);
        next.delete(messageId);
        return next;
      });
    }
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

  // ── Edit / delete a message (author, lead or admin) ───────────────────────
  const [editingMessage, setEditingMessage] = useState<HubMessage | null>(null);
  const [editSubject, setEditSubject] = useState('');
  const [editBody, setEditBody] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');
  const [deletingMessage, setDeletingMessage] = useState<HubMessage | null>(null);
  const [deleting, setDeleting] = useState(false);

  const startEditMessage = (msg: HubMessage) => {
    setEditingMessage(msg);
    setEditSubject(msg.subject);
    setEditBody(msg.body);
    setEditError('');
  };

  const handleSaveEdit = async () => {
    if (!editingMessage || !editSubject.trim() || !editBody.trim()) return;
    setEditSaving(true);
    setEditError('');
    try {
      await myHubApi.updateMessage(editingMessage.id, editSubject.trim(), editBody.trim());
      setEditingMessage(null);
      void refreshMyHub();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Could not save this message.');
    } finally {
      setEditSaving(false);
    }
  };

  const handleDeleteMessage = async () => {
    if (!deletingMessage) return;
    setDeleting(true);
    try {
      await myHubApi.deleteMessage(deletingMessage.id);
      setDeletingMessage(null);
      void refreshMyHub();
    } catch {
      /* leave the dialog open so the lead can retry */
    } finally {
      setDeleting(false);
    }
  };

  // ── Hub meeting (lead only edits; every member sees it) ───────────────────
  const handleSaveMeeting = async (input: MeetingSaveInput) => {
    if (!myHub?.hub) return;
    await myHubApi.updateMeeting(myHub.hub.id, input);
    void refreshMyHub();
  };

  if (user?.role !== 'SUPPORT') return <Navigate to="/dashboard" replace />;

  const isLead = !!myHub?.isLead;
  const leadMember = myHub?.hub ? myHub.members.find((m) => m.userId === myHub.hub!.leadUserId) : undefined;
  const leadWhatsAppLink = myHub?.hub ? buildWhatsAppLink(leadMember?.phone, `Hi ${myHub.hub.leadName?.split(' ')[0] ?? ''}`) : null;
  const tabs = [
    { key: 'overview', label: 'My Hub' },
    ...(isLead ? [
      { key: 'recap', label: 'Recap attendance', shortLabel: 'Recap' },
      { key: 'trainings', label: 'Trainings & get-togethers', shortLabel: 'Trainings' },
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

              <section className="surface-card p-5">
                <p className="mb-2 text-sm font-semibold text-gray-700">Hub meeting</p>
                <MeetingCallCard
                  slot={{
                    meetingDay: myHub.hub.meetingDay ?? null,
                    meetingTime: myHub.hub.meetingTime ?? null,
                    meetingDurationMins: myHub.hub.meetingDurationMins ?? null,
                  }}
                  callPlatform={myHub.hub.callPlatform ?? null}
                  callLink={myHub.hub.callLink ?? null}
                  resetKey={myHub.hub.id}
                  linkLabel="Meeting Call Link"
                  saveLabel="Save hub meeting"
                  onSave={isLead ? handleSaveMeeting : undefined}
                />
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
                  <ul className="max-h-[26rem] space-y-3 overflow-y-auto">
                    {myHub.messages.map((msg) => {
                      const acked = !!msg.ackedByMe || ackedLocal.has(msg.id);
                      const canManage = isLead || msg.authorId === user?.id;
                      return (
                        <li key={msg.id} className="rounded-xl border border-orange-100 p-3">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-semibold text-gray-900">{msg.subject}</p>
                            {canManage && (
                              <AppOverflowMenu
                                items={[
                                  { label: 'Edit', onClick: () => startEditMessage(msg) },
                                  { label: 'Delete', tone: 'danger', onClick: () => setDeletingMessage(msg) },
                                ]}
                              />
                            )}
                          </div>
                          <p className="mt-1 whitespace-pre-line text-sm text-gray-700">{msg.body}</p>
                          <p className="mt-1.5 text-[11px] text-gray-400">
                            {msg.authorName || 'Hub lead'} · {new Date(msg.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                            {msg.editedAt && ' · edited'}
                          </p>
                          {!isLead && (
                            acked ? (
                              <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-emerald-100/80 px-2.5 py-1 text-xs font-semibold text-emerald-700">✓ Acknowledged</span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => void handleAcknowledge(msg.id)}
                                className="fof-glow-ring mt-2 rounded-xl bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-200"
                              >
                                Got it
                              </button>
                            )
                          )}
                          {isLead && <HubMessageAckSummary message={msg} members={myHub.members} />}
                        </li>
                      );
                    })}
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

          {tab === 'trainings' && isLead && (
            <section className="surface-card p-5">
              {trainingLoading && trainingSessions.length === 0 ? (
                <p className="text-sm text-gray-400">Loading…</p>
              ) : trainingSessions.length === 0 ? (
                <p className="text-sm text-gray-400">No trainings or get-togethers yet — an admin creates these on the Hubs page.</p>
              ) : (
                <>
                  <div className="mb-4 w-full sm:w-72">
                    <AppSelect
                      value={trainingSessionId ?? ''}
                      onChange={(v) => setTrainingSessionId(v || null)}
                      options={trainingSessions.map((s) => ({
                        value: s.id,
                        label: `${s.title} · ${new Date(s.sessionDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · ${cohortById.get(s.cohortId)?.name ?? 'Cohort'}`,
                      }))}
                      placeholder="Pick a session"
                      compact
                    />
                  </div>
                  {trainingSessionId && (
                    <>
                      <span className={`mb-3 inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${SESSION_TYPE_PILL[trainingSessions.find((s) => s.id === trainingSessionId)?.type ?? 'PRE_COHORT_TRAINING']}`}>
                        {SESSION_TYPE_LABEL[trainingSessions.find((s) => s.id === trainingSessionId)?.type ?? 'PRE_COHORT_TRAINING']}
                      </span>
                      <span className="mb-3 ml-1.5 inline-flex rounded-full bg-neutral-100 px-2.5 py-0.5 text-[10px] font-semibold text-neutral-600">
                        {cohortById.get(trainingSessions.find((s) => s.id === trainingSessionId)?.cohortId ?? '')?.name ?? 'Cohort'}
                      </span>
                      {trainingAllSupports.length === 0 ? (
                        <p className="text-sm text-gray-400">No active supports.</p>
                      ) : (
                        <ul className="space-y-2">
                          {trainingAllSupports.map((u) => (
                            <li key={u.id} className="flex items-center justify-between gap-3 rounded-xl border border-orange-100 p-3">
                              <span className="text-sm font-semibold text-gray-900">{u.name}</span>
                              <div className="w-40">
                                <AppSelect
                                  value={trainingAttendance[trainingSessionId]?.[u.id] ?? ''}
                                  onChange={(v) => v && void handleMarkTraining(u.id, v as SupportAttendanceStatus)}
                                  options={STATUS_OPTIONS}
                                  placeholder={trainingSaving === u.id ? 'Saving…' : 'Not marked'}
                                  compact
                                />
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  )}
                </>
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

      {editingMessage && (
        <div className="fixed inset-0 z-[70] flex items-end bg-black/50 p-0 sm:items-center sm:justify-center sm:p-4">
          <div className="w-full overflow-y-auto rounded-t-3xl bg-white p-6 shadow-xl sm:max-w-lg sm:rounded-2xl">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">Edit message</h3>
            <div className="flex flex-col gap-3">
              <input
                type="text"
                value={editSubject}
                onChange={(e) => setEditSubject(e.target.value)}
                placeholder="Subject"
                className="w-full rounded-xl border border-orange-200 px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              <textarea
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
                rows={4}
                placeholder="Message"
                className="w-full rounded-xl border border-orange-200 px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              {editError && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{editError}</p>}
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setEditingMessage(null)}
                  className="rounded-full border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleSaveEdit()}
                  disabled={editSaving || !editSubject.trim() || !editBody.trim()}
                  className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {editSaving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmationModal
        isOpen={!!deletingMessage}
        onClose={() => setDeletingMessage(null)}
        onConfirm={() => void handleDeleteMessage()}
        title="Delete this message?"
        message="This removes the message and everyone's 'Got it' marks on it. Members won't be notified."
        confirmText={deleting ? 'Deleting…' : 'Delete'}
        confirmDisabled={deleting}
        type="danger"
      />
    </div>
  );
};

// Shown to the lead in place of the "Got it" button: how many of the other
// members have acknowledged, and (tap to open) who hasn't yet.
const HubMessageAckSummary: React.FC<{ message: HubMessage; members: MyHubMember[] }> = ({ message, members }) => {
  const [open, setOpen] = useState(false);
  const ackCount = message.ackCount ?? 0;
  const memberCount = message.memberCount ?? 0;
  const ackedIds = new Set(message.ackedUserIds ?? []);
  const notAcked = members.filter((m) => m.userId !== message.authorId && !ackedIds.has(m.userId));

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-gray-700"
      >
        {ackCount} of {memberCount} acknowledged
        <svg
          className={`h-3 w-3 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
        </svg>
      </button>
      {open && (
        notAcked.length === 0 ? (
          <p className="mt-1 text-[11px] text-gray-400">Everyone has acknowledged.</p>
        ) : (
          <p className="mt-1 text-[11px] text-gray-500">Not yet: {notAcked.map((m) => m.name).join(', ')}</p>
        )
      )}
    </div>
  );
};

export default SupportMyHubPage;
