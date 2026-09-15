import React, { useCallback, useEffect, useMemo, useState } from 'react';
import AppSelect from './AppSelect';
import { useAuth } from '../hooks/useAuth';
import { coverRequestsApi, usersApi } from '../services/api';
import type { CoverRequest, User } from '../types';

// Cover requests from supports. Operations assigns a covering support; during the
// cover period that support can mark attendance for the away support's group.

const formatPeriod = (startsAt: string, endsAt: string) => {
  const format = (value: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
  return `${format(startsAt)} – ${format(endsAt)}`;
};

const CoverRequestsPanel: React.FC = () => {
  const { user } = useAuth();
  const [requests, setRequests] = useState<CoverRequest[]>([]);
  const [supports, setSupports] = useState<User[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [requestsRes, usersRes] = await Promise.all([coverRequestsApi.getAll(), usersApi.getAll()]);
      setRequests(requestsRes.requests);
      setSupports(usersRes.users.filter((entry) => entry.role === 'SUPPORT').sort((a, b) => a.name.localeCompare(b.name)));
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cover requests could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Past covers drop off; waiting requests first, then by start date.
  const current = useMemo(() => {
    const now = Date.now();
    return requests
      .filter((request) => new Date(request.endsAt).getTime() >= now)
      .sort((a, b) => (a.status === b.status ? new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime() : a.status === 'PENDING' ? -1 : 1));
  }, [requests]);

  const assign = async (request: CoverRequest) => {
    const coverSupportId = drafts[request.id];
    if (!coverSupportId || !user) return;
    setSavingId(request.id);
    setError('');
    try {
      const { request: updated } = await coverRequestsApi.assign(request.id, coverSupportId, user.id);
      setRequests((prev) => prev.map((entry) => (entry.id === updated.id ? updated : entry)));
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[request.id];
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The cover could not be assigned.');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <section className="surface-card p-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Cover requests</h3>
        <p className="text-sm text-gray-500">Assign a support to cover. They can mark attendance for that group during the cover period.</p>
      </div>
      {error && <p className="mb-3 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</p>}
      {loading ? (
        <p className="py-6 text-center text-sm text-gray-400">Loading cover requests…</p>
      ) : current.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-orange-200 bg-orange-50/50 px-4 py-8 text-center text-sm text-gray-500">No cover requests right now.</p>
      ) : (
        <div className="space-y-3">
          {current.map((request) => {
            const options = supports
              .filter((entry) => entry.id !== request.supportId)
              .map((entry) => ({ value: entry.id, label: entry.name }));
            const draft = drafts[request.id] ?? '';
            return (
              <div key={request.id} className="rounded-2xl border border-orange-100 bg-white px-4 py-4">
                <div className="flex flex-wrap items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-900">{request.supportName || 'Support'}</p>
                    <p className="mt-0.5 text-xs text-gray-500">{formatPeriod(request.startsAt, request.endsAt)}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${request.status === 'ASSIGNED' ? 'bg-emerald-100/80 text-emerald-700' : 'bg-amber-100/80 text-amber-700'}`}>
                    {request.status === 'ASSIGNED' ? `Covered by ${request.coverSupportName || 'a support'}` : 'Waiting for cover'}
                  </span>
                </div>
                <p className="mt-2 text-sm text-gray-700">{request.reason}</p>
                {request.note && <p className="mt-1 text-xs text-gray-500">{request.note}</p>}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <div className="min-w-[12rem] flex-1">
                    <AppSelect
                      value={draft}
                      onChange={(value) => setDrafts((prev) => ({ ...prev, [request.id]: value }))}
                      options={options}
                      placeholder={request.status === 'ASSIGNED' ? 'Change covering support' : 'Choose a support'}
                      compact
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => { void assign(request); }}
                    disabled={!draft || savingId === request.id}
                    className="h-10 rounded-xl bg-primary px-4 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {savingId === request.id ? 'Assigning…' : 'Assign'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};

export default CoverRequestsPanel;
