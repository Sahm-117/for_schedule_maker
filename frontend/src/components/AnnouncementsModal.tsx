import React, { useState, useEffect, useMemo } from 'react';
import { announcementsApi, labelsApi, groupsApi } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import { useAppData } from '../context/AppDataContext';
import type { Announcement, Label, Group } from '../types';
import AppSelect from './AppSelect';
import type { AnnouncementAudience } from '../types';

const EXTERNAL_LINK = '__external';
const HOME_LINK_OPTIONS = [
  { value: '', label: 'No link' },
  { value: '/support/participants', label: 'My Group' },
  { value: '/support/schedule', label: 'My Schedule' },
  { value: '/support/mobilisation', label: 'Mobilisation' },
  { value: '/support/resources', label: 'Resources' },
  { value: '/support/hub', label: 'Hub' },
  { value: '/support/announcements', label: 'Announcements' },
  { value: EXTERNAL_LINK, label: 'Web address…' },
];
import ConfirmationModal from './ConfirmationModal';

// Home-screen link targets inside the participant app.
const PARTICIPANT_HOME_LINK_OPTIONS = [
  { value: '', label: 'No link' },
  { value: '/me/feedback', label: 'Feedback' },
  { value: '/me/group', label: 'My Group' },
  { value: '/me/faith', label: 'Faith Project' },
  { value: '/me/resources', label: 'Resources' },
  { value: '/me/journey', label: 'My Journey' },
  { value: EXTERNAL_LINK, label: 'Web address…' },
];

const AUDIENCE_OPTIONS: Array<{ value: AnnouncementAudience; label: string; hint: string }> = [
  { value: 'SUPPORTS', label: 'Supports', hint: 'Support app' },
  { value: 'PARTICIPANTS', label: 'Participants', hint: 'Participant app' },
  { value: 'EVERYONE', label: 'Both', hint: 'Supports and participants' },
];

const AUDIENCE_LABEL: Record<AnnouncementAudience, string> = { SUPPORTS: 'Supports', PARTICIPANTS: 'Participants', EVERYONE: 'Supports and participants' };

interface AnnouncementsModalProps {
  isOpen: boolean;
  onClose: () => void;
  embedded?: boolean;
  showComposer?: boolean;
  showHistory?: boolean;
  history?: Announcement[];
  loadingHistory?: boolean;
  onSent?: () => void;
}

const AnnouncementsModal: React.FC<AnnouncementsModalProps> = ({
  isOpen,
  onClose,
  embedded = false,
  showComposer = true,
  showHistory = true,
  history: propHistory,
  loadingHistory: propLoadingHistory,
  onSent,
}) => {
  const { user, isAdmin, userCohortIds } = useAuth();
  const { activeCohort, liveRevision } = useAppData();
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [scope, setScope] = useState<'ACTIVE_COHORT' | 'ALL_USERS'>('ACTIVE_COHORT');
  const [targetLabelId, setTargetLabelId] = useState(''); // '' = everyone in scope
  const [targetGroupId, setTargetGroupId] = useState(''); // '' = everyone; participants-only group filter
  const [groups, setGroups] = useState<Group[]>([]);
  const [audience, setAudience] = useState<AnnouncementAudience>('SUPPORTS');
  const [showOnHome, setShowOnHome] = useState(false);
  const [homeUntil, setHomeUntil] = useState('');
  const [linkTarget, setLinkTarget] = useState('');
  const [externalUrl, setExternalUrl] = useState('');
  const [linkLabel, setLinkLabel] = useState('');
  const [removingHomeId, setRemovingHomeId] = useState<string | null>(null);
  const [labels, setLabels] = useState<Label[]>([]);
  const [sending, setSending] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Announcement | null>(null);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [localHistory, setLocalHistory] = useState<Announcement[]>([]);
  const [localLoadingHistory, setLocalLoadingHistory] = useState(false);
  const [visibleCount, setVisibleCount] = useState(4);

  const history = propHistory ?? localHistory;
  const loadingHistory = propLoadingHistory ?? localLoadingHistory;

  const SUBJECT_MAX = 80;
  const BODY_MAX = 200;

  const shouldRender = embedded || isOpen;

  useEffect(() => {
    if (propHistory) return;
    if (!shouldRender) return;
    setVisibleCount(4);
    setScope('ACTIVE_COHORT');
    setLocalLoadingHistory(true);
    announcementsApi.getHistory({
      cohortId: activeCohort?.id || null,
      userId: user?.id,
      isAdmin,
      accessibleCohortIds: userCohortIds,
    })
      .then((res) => setLocalHistory(res.announcements))
      .catch(() => {})
      .finally(() => setLocalLoadingHistory(false));
  }, [activeCohort?.id, isAdmin, liveRevision, shouldRender, user?.id, userCohortIds, propHistory]);

  useEffect(() => {
    if (propHistory) return;
    const interval = setInterval(() => {
      announcementsApi.getHistory({
        cohortId: activeCohort?.id || null,
        userId: user?.id,
        isAdmin,
        accessibleCohortIds: userCohortIds,
      })
        .then((res) => setLocalHistory(res.announcements))
        .catch(() => {});
    }, 15000);
    return () => clearInterval(interval);
  }, [activeCohort?.id, isAdmin, user?.id, userCohortIds, propHistory]);

  // Load tags so the admin can target a specific support's group tag, and so the
  // history list can label targeted announcements.
  useEffect(() => {
    if (!shouldRender) return;
    labelsApi.getAll().then((res) => setLabels(res.labels)).catch(() => setLabels([]));
  }, [shouldRender]);

  // Groups (rosters of participants) for narrowing the Participants audience.
  useEffect(() => {
    if (!shouldRender || !activeCohort?.id) { setGroups([]); return; }
    groupsApi.getAll({ cohortId: activeCohort.id }).then((res) => setGroups(res.groups)).catch(() => setGroups([]));
  }, [shouldRender, activeCohort?.id]);

  const groupNameById = useMemo(() => new Map(groups.map((g) => [g.id, g.name])), [groups]);

  const groupOptions = useMemo(() => {
    const sorted = [...groups].sort((a, b) => new Intl.Collator(undefined, { numeric: true }).compare(a.name, b.name));
    return [{ value: '', label: 'Everyone in audience' }, ...sorted.map((g) => ({ value: g.id, label: g.name }))];
  }, [groups]);

  const labelNameById = useMemo(() => new Map(labels.map((l) => [l.id, l.name])), [labels]);

  const labelOptions = useMemo(() => {
    // Prefer tags scoped to the active cohort (group tags); fall back to all.
    const scoped = labels.filter((l) => !l.cohortId || l.cohortId === activeCohort?.id);
    const sorted = [...scoped].sort((a, b) => new Intl.Collator(undefined, { numeric: true }).compare(a.name, b.name));
    return [{ value: '', label: 'Everyone in audience' }, ...sorted.map((l) => ({ value: l.id, label: l.name }))];
  }, [labels, activeCohort?.id]);

  const homeLinkUrl = linkTarget === EXTERNAL_LINK ? externalUrl.trim() : linkTarget;
  const homeInvalid = showOnHome && (!homeUntil || (linkTarget === EXTERNAL_LINK && !/^https?:\/\//i.test(externalUrl.trim())));

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !body.trim() || !user || homeInvalid) return;
    setSending(true);
    setStatus(null);
    try {
      const { sent } = await announcementsApi.send(subject.trim(), body.trim(), user.id, {
        scope,
        cohortId: scope === 'ACTIVE_COHORT' ? activeCohort?.id || null : null,
        targetLabelId: audience === 'PARTICIPANTS' ? null : targetLabelId || null,
        targetGroupId: audience === 'PARTICIPANTS' ? targetGroupId || null : null,
        audience,
        home: showOnHome
          ? { homeUntil: new Date(`${homeUntil}T23:59:59`).toISOString(), linkUrl: homeLinkUrl || null, linkLabel: linkLabel.trim() || null }
          : null,
      });
      const targetName = audience === 'PARTICIPANTS'
        ? (targetGroupId ? groupNameById.get(targetGroupId) : null)
        : (targetLabelId ? labels.find((l) => l.id === targetLabelId)?.name : null);
      setStatus({ type: 'success', message: targetName ? `Sent to ${targetName}.` : `Sent to ${sent} device${sent !== 1 ? 's' : ''}.` });
      setSubject('');
      setBody('');
      setTargetLabelId('');
      setTargetGroupId('');
      setAudience('SUPPORTS');
      setShowOnHome(false);
      setHomeUntil('');
      setLinkTarget('');
      setExternalUrl('');
      setLinkLabel('');
      if (onSent) {
        onSent();
      } else {
        const res = await announcementsApi.getHistory({
          cohortId: activeCohort?.id || null,
          userId: user.id,
          isAdmin,
          accessibleCohortIds: userCohortIds,
        });
        setLocalHistory(res.announcements);
      }
    } catch {
      setStatus({ type: 'error', message: 'Failed to send announcement. Please try again.' });
    } finally {
      setSending(false);
    }
  };

  const handleDelete = async () => {
    if (!isAdmin || !deleteTarget) return;
    const announcement = deleteTarget;
    setDeleteTarget(null);

    setDeletingId(announcement.id);
    setStatus(null);
    try {
      await announcementsApi.delete(announcement.id);
      if (onSent) {
        onSent();
      } else {
        setLocalHistory((prev) => prev.filter((item) => item.id !== announcement.id));
      }
      setStatus({ type: 'success', message: 'Announcement deleted.' });
    } catch {
      setStatus({ type: 'error', message: 'Failed to delete announcement. Please try again.' });
    } finally {
      setDeletingId(null);
    }
  };

  const handleRemoveFromHome = async (announcement: Announcement) => {
    setRemovingHomeId(announcement.id);
    setStatus(null);
    try {
      await announcementsApi.removeFromHome(announcement.id);
      if (onSent) {
        onSent();
      } else {
        setLocalHistory((prev) => prev.map((item) => (item.id === announcement.id ? { ...item, showOnHome: false } : item)));
      }
      setStatus({ type: 'success', message: 'Removed from the home screen.' });
    } catch {
      setStatus({ type: 'error', message: 'Could not remove it from the home screen. Please try again.' });
    } finally {
      setRemovingHomeId(null);
    }
  };

  if (!shouldRender) return null;

  const content = (
    <div className="p-6">
      <div className="flex justify-between items-center mb-5">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Announcements</h2>
          <p className="text-xs text-gray-500 mt-0.5">Send a push notification to the active cohort or all support users.</p>
        </div>
        {!embedded && (
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {status && (
        <div className={`mb-4 p-3 rounded-lg text-sm ${
          status.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
        }`}>
          {status.message}
        </div>
      )}

      {showComposer && (
        <form onSubmit={handleSend} className={`space-y-3 ${showHistory ? 'mb-6' : 'mb-0'}`}>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Audience</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setScope('ACTIVE_COHORT')}
                  className={`rounded-xl border px-3 py-2 text-sm font-semibold ${scope === 'ACTIVE_COHORT' ? 'border-primary bg-primary/10 text-primary' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                >
                  Active Cohort
                  <span className="mt-1 block text-[11px] font-medium text-gray-500">
                    {activeCohort?.name || 'No active cohort'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setScope('ALL_USERS')}
                  className={`rounded-xl border px-3 py-2 text-sm font-semibold ${scope === 'ALL_USERS' ? 'border-primary bg-primary/10 text-primary' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                >
                  All Users
                  <span className="mt-1 block text-[11px] font-medium text-gray-500">
                    Global blast
                  </span>
                </button>
              </div>
            </div>

            {isAdmin && (
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Who is it for?</label>
                <div className="grid grid-cols-3 gap-2">
                  {AUDIENCE_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => { setAudience(option.value); setLinkTarget(''); setTargetLabelId(''); setTargetGroupId(''); }}
                      aria-pressed={audience === option.value}
                      className={`rounded-xl border px-3 py-2 text-sm font-semibold ${audience === option.value ? 'border-primary bg-primary/10 text-primary' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                    >
                      {option.label}
                      <span className="mt-1 block text-[11px] font-medium text-gray-500">{option.hint}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {audience === 'PARTICIPANTS' ? (
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Send to a specific group (optional)</label>
              <AppSelect
                value={targetGroupId}
                onChange={setTargetGroupId}
                options={groupOptions}
                placeholder="Everyone in audience"
                compact
              />
              <p className="mt-1 text-[11px] text-gray-500">
                Pick a group to send only to the participants in that group. Leave as “Everyone” to notify all participants.
              </p>
            </div>
            ) : (
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Send to a specific tag (optional)</label>
              <AppSelect
                value={targetLabelId}
                onChange={setTargetLabelId}
                options={labelOptions}
                placeholder="Everyone in audience"
                compact
              />
              <p className="mt-1 text-[11px] text-gray-500">
                Pick a group’s support tag to send to only that support. Leave as “Everyone” to notify the whole audience.
              </p>
            </div>
            )}

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-sm font-medium text-gray-700">Subject</label>
                <span className={`text-xs ${subject.length >= SUBJECT_MAX ? 'text-red-500' : 'text-gray-400'}`}>
                  {subject.length}/{SUBJECT_MAX}
                </span>
              </div>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value.slice(0, SUBJECT_MAX))}
                placeholder="e.g. Programme Update"
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-sm font-medium text-gray-700">Message</label>
                <span className={`text-xs ${body.length >= BODY_MAX ? 'text-red-500' : 'text-gray-400'}`}>
                  {body.length}/{BODY_MAX}
                </span>
              </div>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value.slice(0, BODY_MAX))}
                placeholder="Type your message to all support group members..."
                required
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent resize-none"
              />
            </div>

            <div className="rounded-xl border border-gray-200 p-3">
              <label className="flex cursor-pointer items-center justify-between gap-3">
                <span>
                  <span className="block text-sm font-medium text-gray-700">Show on home screen</span>
                  <span className="block text-[11px] text-gray-500">Pinned on {audience === 'SUPPORTS' ? 'the support Home' : audience === 'PARTICIPANTS' ? 'the participant Home' : 'both Homes'} until the date you pick.</span>
                </span>
                <input type="checkbox" checked={showOnHome} onChange={(e) => setShowOnHome(e.target.checked)} className="h-5 w-5 accent-[var(--color-primary)]" />
              </label>
              {showOnHome && (
                <div className="mt-3 space-y-3 border-t border-gray-100 pt-3">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Show until</label>
                    <input
                      type="date"
                      value={homeUntil}
                      min={new Date().toISOString().slice(0, 10)}
                      onChange={(e) => setHomeUntil(e.target.value)}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Link (optional)</label>
                    <AppSelect value={linkTarget} onChange={setLinkTarget} options={audience === 'PARTICIPANTS' ? PARTICIPANT_HOME_LINK_OPTIONS : HOME_LINK_OPTIONS} placeholder="No link" compact />
                  </div>
                  {linkTarget === EXTERNAL_LINK && (
                    <input
                      type="url"
                      value={externalUrl}
                      onChange={(e) => setExternalUrl(e.target.value)}
                      placeholder="https://"
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                    />
                  )}
                  {linkTarget && (
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">Button text</label>
                      <input
                        type="text"
                        value={linkLabel}
                        onChange={(e) => setLinkLabel(e.target.value.slice(0, 30))}
                        placeholder="Open"
                        className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={sending || !subject.trim() || !body.trim() || homeInvalid}
              className="w-full h-11 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {sending ? 'Sending...' : '📢 Send Announcement'}
            </button>
        </form>
      )}

      {showHistory && (
        <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">History</h3>
            {loadingHistory ? (
              <div className="text-center py-6">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto" />
              </div>
            ) : history.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">No announcements sent yet</p>
            ) : (
              <div className="space-y-2">
                {history.slice(0, visibleCount).map((a) => (
                  <div key={a.id} className="border border-gray-100 rounded-xl p-3 bg-gray-50">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{a.subject}</p>
                        <p className="mt-0.5 text-[11px] text-gray-400">
                          {a.scope === 'ALL_USERS' ? 'All Users' : a.cohortName || 'Active Cohort'}
                          {isAdmin && a.audience && a.audience !== 'SUPPORTS' && (
                            <span className="ml-1.5 rounded-full bg-sky-100/80 px-1.5 py-0.5 font-semibold text-sky-700">{AUDIENCE_LABEL[a.audience]}</span>
                          )}
                          {a.targetLabelId && (
                            <span className="ml-1.5 rounded-full bg-violet-100/80 px-1.5 py-0.5 font-semibold text-violet-700">
                              To: {labelNameById.get(a.targetLabelId) || 'tag'}
                            </span>
                          )}
                          {a.targetGroupId && (
                            <span className="ml-1.5 rounded-full bg-violet-100/80 px-1.5 py-0.5 font-semibold text-violet-700">
                              To: {groupNameById.get(a.targetGroupId) || 'group'}
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="flex items-start gap-2 flex-shrink-0">
                        <span className="text-xs text-gray-400">
                          {new Date(a.sentAt).toLocaleString('en-US', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true })}
                        </span>
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(a)}
                            disabled={deletingId === a.id}
                            className="rounded-lg p-1 text-rose-500 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                            title="Delete announcement"
                            aria-label={`Delete ${a.subject}`}
                          >
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7 18.133 19.142A2 2 0 0 1 16.138 21H7.862a2 2 0 0 1-1.995-1.858L5 7m5 4v6m4-6v6M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{a.body}</p>
                    {a.showOnHome && a.homeUntil && new Date(a.homeUntil).getTime() > Date.now() && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-red-100/80 px-2 py-0.5 text-[11px] font-semibold text-red-700">
                          On home until {new Date(a.homeUntil).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                        </span>
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => { void handleRemoveFromHome(a); }}
                            disabled={removingHomeId === a.id}
                            className="text-[11px] font-semibold text-gray-600 hover:text-gray-900 disabled:opacity-50"
                          >
                            {removingHomeId === a.id ? 'Removing…' : 'Remove from home'}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
                {visibleCount < history.length && (
                  <button
                    type="button"
                    onClick={() => setVisibleCount((c) => c + 4)}
                    className="w-full py-2 text-xs text-primary hover:underline"
                  >
                    Load more
                  </button>
                )}
              </div>
            )}
        </div>
      )}

      {!embedded && (
        <div className="flex justify-end pt-5 border-t mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-xl hover:bg-gray-50">
            Close
          </button>
        </div>
      )}
    </div>
  );

  const deleteConfirm = (
    <ConfirmationModal
      isOpen={!!deleteTarget}
      onClose={() => setDeleteTarget(null)}
      onConfirm={() => { void handleDelete(); }}
      title="Delete announcement"
      message={`Delete "${deleteTarget?.subject}"? This will remove it from announcement history and support-facing feeds.`}
      confirmText="Delete"
    />
  );

  return embedded ? (
    <>
      <div className="surface-card overflow-hidden">{content}</div>
      {deleteConfirm}
    </>
  ) : (
    <div className="fixed inset-0 z-50 flex items-end bg-black/50 p-0 sm:items-center sm:justify-center sm:p-4">
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white shadow-xl sm:max-w-lg sm:rounded-2xl">
        {content}
      </div>
      {deleteConfirm}
    </div>
  );
};

export default AnnouncementsModal;
