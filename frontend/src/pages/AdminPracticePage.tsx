import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import SegmentedTabs from '../components/SegmentedTabs';
import Avatar from '../components/Avatar';
import PageLoader from '../components/PageLoader';
import { useToast } from '../components/Toast';
import { useAuth } from '../hooks/useAuth';
import { practiceApi } from '../services/api';
import { PRACTICE_ROLE_LABEL, PRACTICE_SCENARIOS } from '../constants/practiceScenarios';
import type { PracticeOverview, PracticeOverviewMember } from '../types';

const SURFACE = 'rounded-[28px] bg-white shadow-[0_1px_2px_rgba(17,24,39,0.04),0_12px_32px_-16px_rgba(17,24,39,0.18)]';

const TITLES: Record<string, string> = {};
Object.values(PRACTICE_SCENARIOS).forEach((list) => list.forEach((s) => { TITLES[s.key] = s.title; }));

const when = (iso: string | null) => {
  if (!iso) return 'never';
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  if (mins < 1440) return `${Math.round(mins / 60)} h ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};
const stamp = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

const stepsOf = (m: PracticeOverviewMember) => {
  const steps = PRACTICE_SCENARIOS[m.role] ?? [];
  const done = steps.filter((s) => m.progress.some((p) => p.key === s.key && p.doneAt));
  const stuck = steps.filter((s) => m.progress.some((p) => p.key === s.key && p.stuckAt && !p.doneAt));
  return { steps, done, stuck };
};

const WALK_STATUS: Record<string, string> = { PENDING: 'Waiting', ACTIVE: 'Running now', ENDED: 'Ended', DECLINED: 'Declined', CANCELLED: 'Cancelled' };

const AdminPracticePage: React.FC = () => {
  const { isAdmin } = useAuth();
  const toast = useToast();
  const [data, setData] = useState<PracticeOverview | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'people' | 'walks'>('people');
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (silent = false) => {
    try {
      const next = await practiceApi.overview();
      setData((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
      setError('');
    } catch (e) {
      if (!silent) setError(e instanceof Error ? e.message : 'Could not load Practice.');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void load(true); }, 8000);
    return () => window.clearInterval(timer);
  }, [load]);

  const toggle = async () => {
    if (!data || busy) return;
    const next = !data.on;
    setBusy(true);
    try {
      await practiceApi.setOn(next);
      setData({ ...data, on: next });
      toast({ message: next ? 'Practice is on. Supports will see it in their cohort menu.' : 'Practice is off.' });
      void load(true);
    } catch (e) {
      toast({ tone: 'error', message: e instanceof Error ? e.message : 'Could not change Practice.' });
    } finally { setBusy(false); }
  };

  const stats = useMemo(() => {
    if (!data) return null;
    const finished = data.members.filter((m) => { const s = stepsOf(m); return s.steps.length > 0 && s.done.length === s.steps.length; }).length;
    return {
      joined: data.members.length,
      now: data.members.filter((m) => m.online).length,
      finished,
      walks: data.walkthroughs.length,
    };
  }, [data]);

  if (!isAdmin) return <Navigate to="/dashboard" replace />;
  if (!data && !error) return <PageLoader />;

  return (
    <div>
      <PageHeader
        title="Practice"
        back={{ label: 'Settings', fallbackTo: '/settings' }}
        subtitle="A read-only record of who is using Practice. People reset their own practice."
        action={data && (
          <button
            type="button"
            role="switch"
            aria-checked={data.on}
            disabled={busy}
            onClick={() => void toggle()}
            className="inline-flex items-center gap-3 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-800 disabled:opacity-60"
          >
            Practice {data.on ? 'on' : 'off'}
            <span className={`relative h-[24px] w-[42px] rounded-full transition ${data.on ? 'bg-emerald-500' : 'bg-gray-300'}`}>
              <span className={`absolute top-[3px] h-[18px] w-[18px] rounded-full bg-white shadow transition-all ${data.on ? 'left-[21px]' : 'left-[3px]'}`} />
            </span>
          </button>
        )}
      />
      {error && <p className="mb-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {stats && (
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {([['People who joined', stats.joined], ['In Practice now', stats.now], ['Finished all steps', stats.finished], ['Walkthroughs run', stats.walks]] as const).map(([label, n]) => (
            <div key={label} className={`${SURFACE} px-4 py-3`}>
              <p className="text-2xl font-bold text-gray-900">{n}</p>
              <p className="text-xs text-gray-500">{label}</p>
            </div>
          ))}
        </div>
      )}

      <SegmentedTabs
        className="mb-4"
        active={tab}
        onChange={(key) => setTab(key as 'people' | 'walks')}
        tabs={[{ key: 'people', label: `People (${data?.members.length ?? 0})` }, { key: 'walks', label: `Walkthroughs (${data?.walkthroughs.length ?? 0})` }]}
      />

      {tab === 'people' && (
        <div className="space-y-3">
          {data?.members.length === 0 && <p className={`${SURFACE} px-5 py-8 text-center text-sm text-gray-500`}>Nobody has joined Practice yet.</p>}
          {data?.members.map((m) => {
            const { steps, done, stuck } = stepsOf(m);
            const isOpen = open === m.userId;
            const complete = steps.length > 0 && done.length === steps.length;
            return (
              <div key={m.userId} className={`${SURFACE} p-4`}>
                <button type="button" onClick={() => setOpen(isOpen ? null : m.userId)} aria-expanded={isOpen} className="w-full text-left">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar name={m.name} avatarUrl={m.avatarUrl} size="md" />
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-gray-900">{m.name}</p>
                        <p className="text-xs text-gray-500">
                          <span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${m.online ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                          {PRACTICE_ROLE_LABEL[m.role]}{m.inParticipantView ? ' · as participant' : ''} · {m.online ? 'in now' : `last seen ${when(m.lastSeenAt)}`}
                        </p>
                      </div>
                    </div>
                    <span className="flex-none text-xs text-gray-400">Joined {when(m.joinedAt)}</span>
                  </div>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-gray-100">
                    <div className={`h-full rounded-full ${complete ? 'bg-emerald-500' : 'bg-primary'}`} style={{ width: `${steps.length ? Math.round((done.length / steps.length) * 100) : 0}%` }} />
                  </div>
                  <p className="mt-1.5 text-xs text-gray-500">
                    {done.length} of {steps.length} steps{complete ? ' · all done' : ''}
                    {stuck.length > 0 && <span className="ml-2 font-semibold text-amber-600">Stuck: {TITLES[stuck[0].key]}{stuck.length > 1 ? ` +${stuck.length - 1}` : ''}</span>}
                  </p>
                </button>
                {isOpen && (
                  <ul className="mt-3 divide-y divide-gray-100 border-t border-gray-100">
                    {steps.map((s) => {
                      const p = m.progress.find((row) => row.key === s.key);
                      return (
                        <li key={s.key} className="flex items-start justify-between gap-3 py-2 text-sm">
                          <span className={p?.doneAt ? 'text-gray-800' : 'text-gray-400'}>{p?.doneAt ? '✓' : '○'} {s.title}</span>
                          <span className="flex-none text-xs text-gray-400">
                            {p?.doneAt ? stamp(p.doneAt) : p?.stuckAt ? <span className="font-semibold text-amber-600">Stuck</span> : 'Not yet'}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}

      {tab === 'walks' && (
        <div className="space-y-3">
          {data?.walkthroughs.length === 0 && <p className={`${SURFACE} px-5 py-8 text-center text-sm text-gray-500`}>No walkthroughs yet.</p>}
          {data?.walkthroughs.map((w) => (
            <div key={w.id} className={`${SURFACE} flex items-start justify-between gap-3 p-4`}>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900">{w.fromName} with {w.toName}</p>
                <p className="text-xs text-gray-500">
                  {PRACTICE_ROLE_LABEL[w.fromRole as keyof typeof PRACTICE_ROLE_LABEL] ?? w.fromRole} and {PRACTICE_ROLE_LABEL[w.toRole as keyof typeof PRACTICE_ROLE_LABEL] ?? w.toRole} · {stamp(w.createdAt)}
                </p>
              </div>
              <span className={`flex-none rounded-full px-2.5 py-1 text-xs font-semibold ${w.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>{WALK_STATUS[w.status]}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminPracticePage;
