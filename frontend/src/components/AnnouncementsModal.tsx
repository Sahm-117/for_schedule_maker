import React, { useState, useEffect, useMemo } from 'react';
import { announcementsApi, labelsApi } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import { useAppData } from '../context/AppDataContext';
import type { Announcement, Label } from '../types';
import AppSelect from './AppSelect';

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
  const [labels, setLabels] = useState<Label[]>([]);
  const [sending, setSending] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
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

  const labelNameById = useMemo(() => new Map(labels.map((l) => [l.id, l.name])), [labels]);

  const labelOptions = useMemo(() => {
    // Prefer tags scoped to the active cohort (group tags); fall back to all.
    const scoped = labels.filter((l) => !l.cohortId || l.cohortId === activeCohort?.id);
    const sorted = [...scoped].sort((a, b) => new Intl.Collator(undefined, { numeric: true }).compare(a.name, b.name));
    return [{ value: '', label: 'Everyone in audience' }, ...sorted.map((l) => ({ value: l.id, label: l.name }))];
  }, [labels, activeCohort?.id]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !body.trim() || !user) return;
    setSending(true);
    setStatus(null);
    try {
      const { sent } = await announcementsApi.send(subject.trim(), body.trim(), user.id, {
        scope,
        cohortId: scope === 'ACTIVE_COHORT' ? activeCohort?.id || null : null,
        targetLabelId: targetLabelId || null,
      });
      const targetName = targetLabelId ? labels.find((l) => l.id === targetLabelId)?.name : null;
      setStatus({ type: 'success', message: targetName ? `Sent to ${targetName}.` : `Sent to ${sent} device${sent !== 1 ? 's' : ''}.` });
      setSubject('');
      setBody('');
      setTargetLabelId('');
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

  const handleDelete = async (announcement: Announcement) => {
    if (!isAdmin) return;
    const confirmed = window.confirm(`Delete "${announcement.subject}"? This will remove it from announcement history and support-facing feeds.`);
    if (!confirmed) return;

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

            <button
              type="submit"
              disabled={sending || !subject.trim() || !body.trim()}
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
                          {a.targetLabelId && (
                            <span className="ml-1.5 rounded-full bg-violet-100/80 px-1.5 py-0.5 font-semibold text-violet-700">
                              To: {labelNameById.get(a.targetLabelId) || 'tag'}
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="flex items-start gap-2 flex-shrink-0">
                        <span className="text-xs text-gray-400">
                          {new Date(a.sentAt).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => void handleDelete(a)}
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

  return embedded ? (
    <div className="surface-card overflow-hidden">{content}</div>
  ) : (
    <div className="fixed inset-0 z-50 flex items-end bg-black/50 p-0 sm:items-center sm:justify-center sm:p-4">
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white shadow-xl sm:max-w-lg sm:rounded-2xl">
        {content}
      </div>
    </div>
  );
};

export default AnnouncementsModal;
