import React, { useState, useEffect } from 'react';
import { announcementsApi } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import { useAppData } from '../context/AppDataContext';
import type { Announcement } from '../types';

interface AnnouncementsModalProps {
  isOpen: boolean;
  onClose: () => void;
  embedded?: boolean;
  showComposer?: boolean;
  showHistory?: boolean;
}

const AnnouncementsModal: React.FC<AnnouncementsModalProps> = ({
  isOpen,
  onClose,
  embedded = false,
  showComposer = true,
  showHistory = true,
}) => {
  const { user, isAdmin, userCohortIds } = useAuth();
  const { activeCohort, liveRevision } = useAppData();
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [scope, setScope] = useState<'ACTIVE_COHORT' | 'ALL_USERS'>('ACTIVE_COHORT');
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [history, setHistory] = useState<Announcement[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [visibleCount, setVisibleCount] = useState(4);

  const SUBJECT_MAX = 80;
  const BODY_MAX = 200;

  const shouldRender = embedded || isOpen;

  useEffect(() => {
    if (!shouldRender) return;
    setVisibleCount(4);
    setScope('ACTIVE_COHORT');
    setLoadingHistory(true);
    announcementsApi.getHistory({
      cohortId: activeCohort?.id || null,
      userId: user?.id,
      isAdmin,
      accessibleCohortIds: userCohortIds,
    })
      .then((res) => setHistory(res.announcements))
      .catch(() => {})
      .finally(() => setLoadingHistory(false));
  }, [activeCohort?.id, isAdmin, liveRevision, shouldRender, user?.id, userCohortIds]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !body.trim() || !user) return;
    setSending(true);
    setStatus(null);
    try {
      const { sent } = await announcementsApi.send(subject.trim(), body.trim(), user.id, {
        scope,
        cohortId: scope === 'ACTIVE_COHORT' ? activeCohort?.id || null : null,
      });
      setStatus({ type: 'success', message: `Sent to ${sent} device${sent !== 1 ? 's' : ''}.` });
      setSubject('');
      setBody('');
      const res = await announcementsApi.getHistory({
        cohortId: activeCohort?.id || null,
        userId: user.id,
        isAdmin,
        accessibleCohortIds: userCohortIds,
      });
      setHistory(res.announcements);
    } catch {
      setStatus({ type: 'error', message: 'Failed to send announcement. Please try again.' });
    } finally {
      setSending(false);
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
                        </p>
                      </div>
                      <span className="text-xs text-gray-400 flex-shrink-0">
                        {new Date(a.sentAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </span>
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
