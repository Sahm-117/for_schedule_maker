import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Navigate, useSearchParams } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import SegmentedTabs from '../components/SegmentedTabs';
import AppSelect from '../components/AppSelect';
import SaveStatus, { type SaveState } from '../components/SaveStatus';
import AppOverflowMenu from '../components/AppOverflowMenu';
import ConfirmationModal from '../components/ConfirmationModal';
import { MeetingCallCard, type MeetingSaveInput } from '../components/groups/GroupCallCard';
import HubMeetingPanel from '../components/hubs/HubMeetingPanel';
import { HUB_JOB_INFO, sortHubJobs } from '../components/hubs/hubJobs';
import { useAuth } from '../hooks/useAuth';
import { useAppData } from '../context/AppDataContext';
import { myHubApi, supportHubsApi, supportNotesApi, supportRecapsApi, supportSessionsApi } from '../services/api';
import { buildWhatsAppLink } from '../utils/phone';
import { sortByText } from '../utils/sort';
import { cohortMode } from '../components/dashboard/healthModel';
import type {
  AssistantHubPermission,
  HubJob,
  HubMessage,
  MyHubMember,
  MyHubPayload,
  SupportAttendanceStatus,
  SupportSession,
  SupportSessionType,
  SupportNote,
  SupportRecap,
} from '../types';
import Spinner from '../components/Spinner';

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

const PERMISSION_OPTIONS: Array<{ value: AssistantHubPermission; label: string; hint: string; summary: string }> = [
  { value: 'MEETING', label: 'Meeting time & link', hint: 'Edit when and where the hub meets.', summary: 'edit meeting time & link' },
  { value: 'ATTENDANCE', label: 'Attendance & hub meeting', hint: 'Mark attendance and run the hub meeting.', summary: 'run attendance & hub meeting' },
  { value: 'MESSAGE', label: 'Message the hub', hint: 'Send messages to everyone in the hub.', summary: 'message the hub' },
];

type HubTab = 'overview' | 'meeting' | 'trainings' | 'notes' | 'message';

const SupportMyHubPage: React.FC = () => {
  const { user } = useAuth();
  const { refreshMyHub, weeks, activeCohort, cohorts } = useAppData();
  // /support/my-hub?tab=meeting opens straight to the Hub meeting tab — used
  // by the "Open hub meeting" home button and the live-dot nav links.
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState<HubTab>(() => {
    const requested = searchParams.get('tab');
    return (['overview', 'meeting', 'trainings', 'notes', 'message'] as const).includes(requested as HubTab)
      ? (requested as HubTab)
      : 'overview';
  });
  const [loaded, setLoaded] = useState(false);

  // ── My hub(s) — an operational support may cover 2+ hubs, so this page ────
  // loads the full list and lets them switch; a support with just one hub
  // sees no switcher at all.
  const [hubs, setHubs] = useState<MyHubPayload[]>([]);
  const [selectedHubId, setSelectedHubId] = useState<string | null>(null);

  const loadHubs = useCallback(async () => {
    if (user?.role !== 'SUPPORT' || !activeCohort?.id) { setHubs([]); return; }
    const { hubs: list } = await myHubApi.getMyHubs(activeCohort.id);
    setHubs(list);
    setSelectedHubId((prev) => (prev && list.some((h) => h.hub?.id === prev) ? prev : list[0]?.hub?.id ?? null));
  }, [user?.role, activeCohort?.id]);

  useEffect(() => {
    setLoaded(false);
    void loadHubs().finally(() => setLoaded(true));
  }, [loadHubs]);

  const myHub = useMemo(() => hubs.find((h) => h.hub?.id === selectedHubId) ?? null, [hubs, selectedHubId]);

  // ── Prayer list — visible to every hub member, not just the lead ─────────
  const [prayerItems, setPrayerItems] = useState<import('../types').HubPrayerListItem[]>([]);
  const [prayerLoading, setPrayerLoading] = useState(false);

  useEffect(() => {
    if (!myHub?.hub) { setPrayerItems([]); return; }
    setPrayerLoading(true);
    myHubApi.prayerList(myHub.hub.id)
      .then(({ items }) => setPrayerItems(items))
      .catch(() => setPrayerItems([]))
      .finally(() => setPrayerLoading(false));
  }, [myHub?.hub?.id]);

  // ── Role intro popup — first time seeing a job, or reopened by tapping ────
  // your own pill.
  const [introQueue, setIntroQueue] = useState<HubJob[]>([]);
  const [manualIntroJob, setManualIntroJob] = useState<HubJob | null>(null);

  useEffect(() => {
    setIntroQueue(myHub?.unseenIntroJobs ?? []);
    // Only reseed when the selected hub changes, not on every payload refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myHub?.hub?.id]);

  const activeIntroJob = manualIntroJob ?? introQueue[0] ?? null;

  const dismissIntro = async () => {
    if (!activeIntroJob || !myHub?.hub) return;
    const job = activeIntroJob;
    const hubId = myHub.hub.id;
    if (manualIntroJob) setManualIntroJob(null);
    else setIntroQueue((prev) => prev.slice(1));
    try {
      await myHubApi.markRoleIntroSeen(hubId, job);
    } catch {
      /* not worth blocking the popup on */
    }
  };

  // ── Assistant permissions (lead only) ─────────────────────────────────────
  // Read-only one-line summary by default; tapping Edit reveals the switches
  // as a draft (Save/Cancel), collapsing back to the summary once saved.
  const [permEditing, setPermEditing] = useState(false);
  const [permDraft, setPermDraft] = useState<AssistantHubPermission[]>([]);
  const [permSaving, setPermSaving] = useState(false);
  const [permError, setPermError] = useState('');

  const startEditingPermissions = () => {
    setPermDraft(myHub?.hub?.assistantPermissions ?? []);
    setPermError('');
    setPermEditing(true);
  };

  const handleToggleDraftPermission = (perm: AssistantHubPermission) => {
    setPermDraft((prev) => (prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm]));
  };

  const handleSavePermissions = async () => {
    if (!myHub?.hub) return;
    setPermSaving(true);
    setPermError('');
    try {
      await supportHubsApi.setAssistantPermissions(myHub.hub.id, permDraft);
      await loadHubs();
      setPermEditing(false);
    } catch (err) {
      setPermError(err instanceof Error ? err.message : 'Could not save this.');
    } finally {
      setPermSaving(false);
    }
  };

  // ── Hub meeting (lead, or assistant with ATTENDANCE permission) ───────────
  const sortedWeeks = useMemo(() => [...weeks].sort((a, b) => b.weekNumber - a.weekNumber), [weeks]);
  const [meetingWeekId, setMeetingWeekId] = useState<number | null>(null);
  const [recaps, setRecaps] = useState<SupportRecap[]>([]);

  useEffect(() => {
    if (sortedWeeks.length > 0 && meetingWeekId == null) setMeetingWeekId(sortedWeeks[0].id);
  }, [sortedWeeks, meetingWeekId]);

  useEffect(() => {
    if (tab !== 'meeting' || !activeCohort?.id) return;
    supportRecapsApi.getForCohort(activeCohort.id)
      .then(({ recaps: list }) => setRecaps(list))
      .catch(() => setRecaps([]));
  }, [tab, activeCohort?.id]);

  const meetingAttendanceRows = useMemo(
    () => (myHub?.myAttendance ?? []).filter((a) => a.type === 'SUNDAY_RECAP'),
    [myHub?.myAttendance]
  );
  const submittedWeekIds = useMemo(
    () => meetingAttendanceRows.filter((a) => !!a.submittedAt && a.weekId != null).map((a) => a.weekId as number),
    [meetingAttendanceRows]
  );

  const handleSubmitMeeting = async (weekId: number, notes: string) => {
    if (!myHub?.hub) return;
    await myHubApi.submitMeeting(myHub.hub.id, weekId, notes);
    await Promise.all([loadHubs(), refreshMyHub()]);
  };

  const handleReopenMeeting = async (weekId: number) => {
    if (!myHub?.hub) return;
    await myHubApi.reopenMeeting(myHub.hub.id, weekId);
    await Promise.all([loadHubs(), refreshMyHub()]);
  };

  // ── Trainings & get-togethers (lead only) ─────────────────────────────────
  const [trainingSessions, setTrainingSessions] = useState<SupportSession[]>([]);
  const [trainingAllSupports, setTrainingAllSupports] = useState<MyHubMember[]>([]);
  const [trainingAttendance, setTrainingAttendance] = useState<Record<string, Record<string, SupportAttendanceStatus>>>({});
  const [trainingSessionId, setTrainingSessionId] = useState<string | null>(null);
  const [trainingLoading, setTrainingLoading] = useState(false);
  // Per-person save feedback on the training marks, keyed by userId.
  const [trainingSaveState, setTrainingSaveState] = useState<Record<string, SaveState>>({});

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
    // A lead only marks their own hub's members, not every support in the app.
    setTrainingAllSupports(sortByText(myHub.members, (m) => m.name));
    supportSessionsApi.getForCohort(trainingListCohortIds, ['PRE_COHORT_TRAINING', 'GET_TOGETHER'])
      .then(({ sessions, attendance }) => {
        setTrainingSessions(sessions);
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
  }, [tab, myHub?.hub, myHub?.members, trainingListCohortIds]);

  const handleMarkTraining = async (userId: string, status: SupportAttendanceStatus) => {
    if (!trainingSessionId) return;
    const setState = (state?: SaveState) => setTrainingSaveState((prev) => {
      const next = { ...prev };
      if (state) next[userId] = state; else delete next[userId];
      return next;
    });
    setState('saving');
    try {
      await supportSessionsApi.mark({ status, userId, sessionId: trainingSessionId });
      setTrainingAttendance((prev) => ({ ...prev, [trainingSessionId]: { ...prev[trainingSessionId], [userId]: status } }));
      setState('saved');
      setTimeout(() => setTrainingSaveState((prev) => {
        if (prev[userId] !== 'saved') return prev;
        const next = { ...prev };
        delete next[userId];
        return next;
      }), 2000);
    } catch {
      setState('error');
    }
  };

  // ── Notes (lead only) ──────────────────────────────────────────────────────
  const [noteSupportId, setNoteSupportId] = useState('');
  const [notes, setNotes] = useState<SupportNote[]>([]);
  const [noteBody, setNoteBody] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteLoading, setNoteLoading] = useState(false);

  // A lead can't write notes about themselves, so they're left out of the pick.
  const noteableMembers = useMemo(
    () => (myHub?.members ?? []).filter((m) => m.userId !== user?.id),
    [myHub?.members, user?.id],
  );

  useEffect(() => {
    if (noteableMembers.length && !noteSupportId) setNoteSupportId(noteableMembers[0].userId);
  }, [noteableMembers, noteSupportId]);

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

  // ── Message hub (lead, or assistant with MESSAGE permission) ──────────────
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
      void loadHubs();
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
      void loadHubs();
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
      void loadHubs();
      void refreshMyHub();
    } catch {
      /* leave the dialog open so the lead can retry */
    } finally {
      setDeleting(false);
    }
  };

  // ── Hub meeting time/link (lead, or assistant with MEETING permission) ────
  const handleSaveMeeting = async (input: MeetingSaveInput) => {
    if (!myHub?.hub) return;
    await myHubApi.updateMeeting(myHub.hub.id, input);
    void loadHubs();
    void refreshMyHub();
  };

  if (user?.role !== 'SUPPORT') return <Navigate to="/dashboard" replace />;

  const isLead = !!myHub?.isLead;
  const canMeeting = isLead || !!myHub?.canMeeting;
  const canAttendance = isLead || !!myHub?.canAttendance;
  const canMessage = isLead || !!myHub?.canMessage;
  const isRecapLead = (myHub?.myJobs ?? []).includes('RECAP_LEAD');
  const isPrayerLead = (myHub?.myJobs ?? []).includes('PRAYER_LEAD');
  const leadMember = myHub?.hub ? myHub.members.find((m) => m.userId === myHub.hub!.leadUserId) : undefined;
  const leadWhatsAppLink = myHub?.hub ? buildWhatsAppLink(leadMember?.phone, `Hi ${myHub.hub.leadName?.split(' ')[0] ?? ''}`) : null;
  // Every hub member can open the Hub meeting tab now — full walk-through
  // (lead/assistant), single-step access (recap or prayer lead), or read-only
  // follow-along for everyone else. See HubMeetingPanel for the split.
  const tabs = [
    { key: 'overview', label: 'My Hub' },
    { key: 'meeting', label: 'Hub meeting', shortLabel: 'Meeting' },
    ...(isLead ? [
      { key: 'trainings', label: 'Trainings & get-togethers', shortLabel: 'Trainings' },
      { key: 'notes', label: 'Notes' },
    ] : []),
    ...(canMessage ? [{ key: 'message', label: 'Message hub', shortLabel: 'Message' }] : []),
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
          {hubs.length > 1 && (
            <div className="w-full sm:w-72">
              <AppSelect
                value={selectedHubId ?? ''}
                onChange={setSelectedHubId}
                options={hubs.filter((h) => h.hub).map((h) => ({ value: h.hub!.id, label: h.hub!.name }))}
                placeholder="Choose hub"
                compact
              />
            </div>
          )}

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
                  onSave={canMeeting ? handleSaveMeeting : undefined}
                />
              </section>

              <section data-wt="hub-members" className="surface-card p-5">
                <p className="mb-2 text-sm font-semibold text-gray-700">Fellow supports</p>
                {myHub.members.length === 0 && !(myHub.hub?.itSupports?.length) ? (
                  <p className="text-sm text-gray-400">No members yet.</p>
                ) : (
                  <ul className="divide-y divide-orange-50">
                    {myHub.members.map((m) => {
                      // A member can also be this hub's IT support; the member row carries that label too.
                      const jobs: HubJob[] = [...(m.jobs ?? []), ...((myHub.hub?.itSupports ?? []).some((it) => it.userId === m.userId) && !(m.jobs ?? []).includes('IT_SUPPORT') ? ['IT_SUPPORT' as HubJob] : [])];
                      return (
                      <li key={m.userId} className="flex items-center justify-between gap-2 py-2 text-sm">
                        <div className="min-w-0">
                          <p className="text-gray-800">{m.name}</p>
                          {!!jobs.length && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {sortHubJobs(jobs).map((job) => (
                                <HubJobPillButton
                                  key={job}
                                  job={job}
                                  isOwn={m.userId === user?.id}
                                  onOwnTap={() => setManualIntroJob(job)}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                        <span className="flex-none text-xs text-gray-400">{m.groupName || 'No group'}</span>
                      </li>
                      );
                    })}
                    {(myHub.hub?.itSupports ?? [])
                      .filter((it) => !myHub.members.some((m) => m.userId === it.userId))
                      .map((it) => (
                        <li key={`it-${it.userId}`} className="flex items-center justify-between gap-2 py-2 text-sm">
                          <div className="min-w-0">
                            <p className="text-gray-800">{it.name}</p>
                            <div className="mt-1 flex flex-wrap gap-1">
                              <HubJobPillButton
                                job="IT_SUPPORT"
                                isOwn={it.userId === user?.id}
                                onOwnTap={() => setManualIntroJob('IT_SUPPORT')}
                              />
                            </div>
                          </div>
                        </li>
                      ))}
                  </ul>
                )}
              </section>

              <section className="surface-card p-5">
                <p className="mb-2 text-sm font-semibold text-gray-700">Prayer list</p>
                {prayerLoading ? (
                  <p className="flex items-center gap-1.5 text-sm text-gray-400"><Spinner className="h-3.5 w-3.5" />Loading…</p>
                ) : prayerItems.length === 0 ? (
                  <p className="text-sm text-gray-400">Nothing shared for prayer yet.</p>
                ) : (
                  <ul className="max-h-72 space-y-2 overflow-y-auto">
                    {[...prayerItems]
                      .sort((a, b) => (a.timesPrayedFor !== b.timesPrayedFor
                        ? a.timesPrayedFor - b.timesPrayedFor
                        : (a.lastPrayedWeek ?? -Infinity) - (b.lastPrayedWeek ?? -Infinity)))
                      .map((item) => (
                      <li key={item.participantId} className="rounded-xl border border-orange-100 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-semibold text-gray-900">{item.fullName}</p>
                          <span className="flex-none rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-bold text-neutral-600">
                            {item.timesPrayedFor > 0 ? `Prayed for ${item.timesPrayedFor}× · last Week ${item.lastPrayedWeek}` : 'Not prayed for yet'}
                          </span>
                        </div>
                        <p className="text-xs text-gray-400">{item.groupName || 'No group'}{item.categoryName ? ` · ${item.categoryName}` : ''}</p>
                        <p className="mt-1 whitespace-pre-line text-sm text-gray-700">{item.body}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {isLead && myHub.hub.assistantLeadUserId && (
                <section className="surface-card p-5">
                  <p className="mb-1 text-sm font-semibold text-gray-700">Assistant permissions</p>
                  <p className="mb-3 text-xs text-gray-400">What {myHub.hub.assistantLeadName || 'your assistant'} can do.</p>
                  {permError && <p className="mb-2 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">{permError}</p>}
                  {permEditing ? (
                    <>
                      <div className="space-y-3">
                        {PERMISSION_OPTIONS.map((opt) => {
                          const checked = permDraft.includes(opt.value);
                          return (
                            <div key={opt.value} className="flex items-center justify-between gap-4 rounded-2xl bg-gray-50 px-3 py-2.5">
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-gray-800">{opt.label}</p>
                                <p className="text-xs text-gray-500">{opt.hint}</p>
                              </div>
                              <button
                                type="button"
                                role="switch"
                                aria-checked={checked}
                                aria-label={opt.label}
                                onClick={() => handleToggleDraftPermission(opt.value)}
                                disabled={permSaving}
                                className={`relative inline-flex h-8 w-14 flex-none items-center rounded-full transition disabled:opacity-60 ${checked ? 'bg-primary' : 'bg-slate-200'}`}
                              >
                                <span className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition ${checked ? 'translate-x-7' : 'translate-x-1'}`} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                      <div className="mt-3.5 flex gap-2.5">
                        <button
                          type="button"
                          onClick={() => { setPermEditing(false); setPermError(''); }}
                          disabled={permSaving}
                          className="min-h-[42px] rounded-xl border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-700 disabled:opacity-60"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => { void handleSavePermissions(); }}
                          disabled={permSaving}
                          className="min-h-[42px] flex-1 rounded-xl bg-primary px-4 text-sm font-semibold text-white disabled:opacity-60"
                        >
                          {permSaving ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Saving…</span>) : 'Save'}
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center justify-between gap-3">
                      <p className="min-w-0 text-sm text-gray-700">
                        {(() => {
                          const granted = PERMISSION_OPTIONS.filter((opt) => (myHub.hub!.assistantPermissions ?? []).includes(opt.value));
                          return granted.length === 0
                            ? "Assistant can't do anything extra yet."
                            : `Assistant can: ${granted.map((opt) => opt.summary).join(' · ')}`;
                        })()}
                      </p>
                      <button type="button" onClick={startEditingPermissions} className="flex-none text-sm font-semibold text-primary">Edit</button>
                    </div>
                  )}
                </section>
              )}

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

          {tab === 'meeting' && (
            <HubMeetingPanel
              hubId={myHub.hub.id}
              members={myHub.members}
              weeks={sortedWeeks}
              weekId={meetingWeekId}
              onWeekChange={setMeetingWeekId}
              submittedWeekIds={submittedWeekIds}
              hubLeadName={myHub.hub.leadName}
              recapLeadName={myHub.hub.recapLeadName}
              prayerLeadName={myHub.hub.prayerLeadName}
              prayerItems={prayerItems}
              recaps={recaps}
              messages={myHub.messages}
              canReopen={canAttendance}
              canAttendance={canAttendance}
              isRecapLead={isRecapLead}
              isPrayerLead={isPrayerLead}
              onSubmit={handleSubmitMeeting}
              onReopen={handleReopenMeeting}
            />
          )}

          {tab === 'trainings' && isLead && (
            <section className="surface-card p-5">
              {trainingLoading && trainingSessions.length === 0 ? (
                <p className="flex items-center gap-1.5 text-sm text-gray-400"><Spinner className="h-3.5 w-3.5" />Loading…</p>
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
                            <li key={u.userId} className="flex items-center justify-between gap-3 rounded-xl border border-orange-100 p-3">
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-gray-900">{u.name}</p>
                                <SaveStatus state={trainingSaveState[u.userId]} />
                              </div>
                              <div className="w-40 flex-none">
                                <AppSelect
                                  value={trainingAttendance[trainingSessionId]?.[u.userId] ?? ''}
                                  onChange={(v) => v && void handleMarkTraining(u.userId, v as SupportAttendanceStatus)}
                                  options={STATUS_OPTIONS}
                                  placeholder="Not marked"
                                  disabled={trainingSaveState[u.userId] === 'saving'}
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
                  options={noteableMembers.map((m) => ({ value: m.userId, label: m.name }))}
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
                  {noteSaving ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Saving…</span>) : 'Add note'}
                </button>
              </div>
              {noteLoading ? (
                <p className="flex items-center gap-1.5 text-sm text-gray-400"><Spinner className="h-3.5 w-3.5" />Loading…</p>
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

          {tab === 'message' && canMessage && (
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
                  {sending ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Sending…</span>) : 'Send to hub'}
                </button>
              </div>
            </section>
          )}
        </div>
      )}

      {activeIntroJob && createPortal(
        <div className="fixed inset-0 z-[120] flex items-end bg-black/50 p-0 sm:items-center sm:justify-center sm:p-4">
          <div className="w-full rounded-t-3xl bg-white p-6 shadow-xl sm:max-w-md sm:rounded-2xl">
            <h3 className="text-lg font-semibold text-gray-900">You're the {HUB_JOB_INFO[activeIntroJob].label}</h3>
            <p className="mt-2 text-sm leading-relaxed text-gray-600">{HUB_JOB_INFO[activeIntroJob].introBody}</p>
            <button
              type="button"
              onClick={() => void dismissIntro()}
              className="mt-5 w-full rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-white active:scale-95"
            >
              Got it
            </button>
          </div>
        </div>,
        document.body
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
                  {editSaving ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Saving…</span>) : 'Save'}
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
        confirmLoading={deleting}
        confirmDisabled={deleting}
        type="danger"
      />
    </div>
  );
};

// Small colour pill for one job; tapping it shows a short explanation, except
// on your own pill which reopens the full role-intro popup instead.
const HubJobPillButton: React.FC<{ job: HubJob; isOwn: boolean; onOwnTap: () => void }> = ({ job, isOwn, onOwnTap }) => {
  const info = HUB_JOB_INFO[job];
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<React.CSSProperties>({});
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    const place = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(240, window.innerWidth - 24);
      const left = Math.min(Math.max(12, rect.left + rect.width / 2 - width / 2), window.innerWidth - width - 12);
      const below = rect.bottom + 8;
      const top = below + 100 > window.innerHeight ? Math.max(12, rect.top - 8 - 100) : below;
      setStyle({ position: 'fixed', top, left, width, zIndex: 130 });
    };
    const close = (event: PointerEvent) => {
      if (popRef.current?.contains(event.target as Node) || buttonRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    document.addEventListener('pointerdown', close);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      document.removeEventListener('pointerdown', close);
    };
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          if (isOwn) { onOwnTap(); return; }
          setOpen((value) => !value);
        }}
        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${info.pill}`}
      >
        {info.label}
      </button>
      {open && !isOwn && createPortal(
        <div ref={popRef} role="tooltip" style={style} className="rounded-xl bg-gray-800 px-3 py-2.5 text-xs font-medium leading-relaxed text-white shadow-[0_12px_30px_-10px_rgba(17,24,39,0.45)]">
          {info.description}
        </div>,
        document.body
      )}
    </>
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
