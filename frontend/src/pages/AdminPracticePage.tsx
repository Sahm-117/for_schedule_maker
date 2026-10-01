import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import SegmentedTabs from '../components/SegmentedTabs';
import AppSelect from '../components/AppSelect';
import AppOverflowMenu from '../components/AppOverflowMenu';
import ConfirmationModal from '../components/ConfirmationModal';
import ModalShell from '../components/followups/ModalShell';
import Avatar from '../components/Avatar';
import Spinner from '../components/Spinner';
import PageLoader from '../components/PageLoader';
import { useToast } from '../components/Toast';
import { useAuth } from '../hooks/useAuth';
import { practiceApi, usersApi } from '../services/api';
import { PRACTICE_ROLE_LABEL, PRACTICE_SCENARIOS } from '../constants/practiceScenarios';
import { pickableUsers } from '../utils/testUsers';
import { sortByText } from '../utils/sort';
import type { PracticeCalendar, PracticeMemberState, PracticeProgressItem, PracticeRole, PracticeState, User } from '../types';

const SURFACE = 'rounded-[28px] bg-white shadow-[0_1px_2px_rgba(17,24,39,0.04),0_12px_32px_-16px_rgba(17,24,39,0.18)]';
const ROLE_OPTIONS = (['SUPPORT', 'HUB_LEAD', 'ASSISTANT', 'RECAP_LEAD', 'PRAYER_LEAD'] as PracticeRole[]).map((role) => ({ value: role, label: PRACTICE_ROLE_LABEL[role] }));
const CALENDAR_TABS: Array<{ key: PracticeCalendar; label: string }> = [
  { key: 'BEFORE', label: 'Before' },
  { key: 'CLASS_DAY', label: 'Class day' },
  { key: 'MID_WEEK', label: 'Mid-week' },
  { key: 'WEEK_2', label: 'Week 2' },
];

const doneOf = (items: PracticeProgressItem[], keys: string[]) => keys.filter((key) => items.some((item) => item.key === key && item.doneAt)).length;
const stuckOf = (items: PracticeProgressItem[]) => items.filter((item) => item.stuckAt).length;
const phoneLabel = (phone: string) => phone.replace(/^(\d{4})(\d{3})(\d{4})$/, '$1 $2 $3');

const Bar: React.FC<{ done: number; total: number }> = ({ done, total }) => (
  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-gray-100">
    <div className={`h-full rounded-full transition-all ${done === total && total > 0 ? 'bg-emerald-500' : 'bg-primary'}`} style={{ width: `${total ? Math.round((done / total) * 100) : 0}%` }} />
  </div>
);

const AdminPracticePage: React.FC = () => {
  const { isAdmin } = useAuth();
  const toast = useToast();
  const [state, setState] = useState<PracticeState | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'board' | 'team'>('board');
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [roster, setRoster] = useState<Array<{ userId: string; name: string; role: PracticeRole; avatarUrl?: string | null }>>([]);
  const [dirty, setDirty] = useState(false);
  const [supports, setSupports] = useState<User[]>([]);
  const [adding, setAdding] = useState(false);
  const [pick, setPick] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [confirm, setConfirm] = useState<null | { kind: 'all' } | { kind: 'person'; member: PracticeMemberState; withFirstTime?: boolean } | { kind: 'participant'; id: string; name: string }>(null);
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;

  const load = useCallback(async (silent = false) => {
    try {
      const next = await practiceApi.getState();
      setState((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
      if (!dirtyRef.current) {
        setRoster(next.members.map((m) => ({ userId: m.userId, name: m.name, role: m.role, avatarUrl: m.avatarUrl })));
      }
      setError('');
    } catch (err) {
      if (!silent) setError(err instanceof Error ? err.message : 'Could not load Practice.');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void load(true); }, 8000);
    return () => window.clearInterval(timer);
  }, [load]);
  useEffect(() => {
    usersApi.getAll().then(({ users }) => setSupports(sortByText(pickableUsers(users.filter((u) => u.role === 'SUPPORT' && u.isActive !== false)), (u) => u.name))).catch(() => {});
  }, []);
  useEffect(() => { if (state && !state.built) setTab('team'); }, [state?.built]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (work: () => Promise<void>, ok: string) => {
    setBusy(true);
    try { await work(); toast({ message: ok }); await load(true); }
    catch (err) { toast({ tone: 'error', message: err instanceof Error ? err.message : 'That did not work. Please try again.' }); }
    finally { setBusy(false); }
  };

  const setUp = () => run(async () => {
    await practiceApi.setRoster(roster.map((m) => ({ userId: m.userId, role: m.role })));
    await practiceApi.build(state?.calendar ?? 'CLASS_DAY');
    setDirty(false);
    setTab('board');
  }, 'Practice is set up.');

  const available = useMemo(() => {
    const inRoster = new Set(roster.map((m) => m.userId));
    const q = query.trim().toLowerCase();
    return supports.filter((u) => !inRoster.has(u.id) && (!q || u.name.toLowerCase().includes(q)));
  }, [supports, roster, query]);

  if (!isAdmin) return <Navigate to="/dashboard" replace />;
  if (!state && !error) return <PageLoader />;

  const built = !!state?.built;
  const teamNote = dirty ? 'You have changed the team. Set up Practice to apply it.' : built ? 'Setting up again rebuilds Practice from scratch.' : 'Pick the team and give each person a role, then set up.';

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Practice"
        subtitle="A safe place for the team to try the app together."
        action={(
          <button type="button" disabled={busy || roster.length === 0} onClick={() => (built && !dirty ? setConfirm({ kind: 'all' }) : void setUp())} className="inline-flex h-11 items-center justify-center rounded-2xl bg-primary px-4 text-sm font-semibold text-white active:scale-[0.98] disabled:opacity-50">
            {busy ? <Spinner className="h-4 w-4" /> : built && !dirty ? 'Reset all' : 'Set up'}
          </button>
        )}
      />
      {error && <p className={`${SURFACE} mb-4 px-6 py-4 text-sm text-gray-500`}>{error}</p>}

      <div className="flex flex-col gap-4">
        <section className={`${SURFACE} px-6 py-5`}>
          <button
            type="button"
            role="switch"
            aria-checked={!!state?.on}
            disabled={busy || !built}
            onClick={() => void run(() => practiceApi.setOn(!state?.on), state?.on ? 'Test mode is off.' : 'Test mode is on.')}
            className="flex w-full items-center gap-4 text-left disabled:opacity-50"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-[17px] font-bold text-gray-900">Test mode</span>
              <span className="block text-[13px] text-gray-500">{!built ? 'Set up Practice first.' : state?.on ? 'On. The team sees Practice in their cohort menu.' : 'Off. Practice is hidden from the team.'}</span>
            </span>
            <span className={`relative h-[28px] w-[48px] flex-none rounded-full transition ${state?.on ? 'bg-emerald-500' : 'bg-gray-300'}`}>
              <span className={`absolute top-[3px] h-[22px] w-[22px] rounded-full bg-white shadow transition-all ${state?.on ? 'left-[23px]' : 'left-[3px]'}`} />
            </span>
          </button>
        </section>

        {built && (
          <section className={`${SURFACE} px-6 py-5`}>
            <p className="text-[13px] font-semibold uppercase tracking-[0.04em] text-gray-500">Where are we in the programme?</p>
            <div className="mt-3">
              <SegmentedTabs
                wrap
                tabs={CALENDAR_TABS}
                active={state?.calendar ?? 'CLASS_DAY'}
                onChange={(key) => void run(() => practiceApi.setCalendar(key as PracticeCalendar), 'Practice calendar updated.')}
              />
            </div>
            <p className="mt-2 text-[12px] text-gray-500">Moves the practice class dates so today matches. Nothing people did is cleared.</p>
          </section>
        )}

        <SegmentedTabs tabs={[{ key: 'board', label: 'Board' }, { key: 'team', label: `Team (${roster.length})` }]} active={tab} onChange={(key) => setTab(key as 'board' | 'team')} />

        {tab === 'board' && (
          !built || !state ? (
            <p className={`${SURFACE} px-6 py-8 text-center text-sm text-gray-500`}>Nothing here yet. Pick the team, then set up Practice.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {state.members.map((m) => {
                const scenarios = PRACTICE_SCENARIOS[m.role];
                const keys = scenarios.map((s) => s.key);
                const done = doneOf(m.progress, keys);
                const stuck = stuckOf(m.progress);
                const people = m.group?.participants ?? [];
                const isOpen = open === m.userId;
                return (
                  <section key={m.userId} className={`${SURFACE} px-5 py-4`}>
                    <div className="flex items-center gap-3">
                      <button type="button" onClick={() => setOpen(isOpen ? null : m.userId)} aria-expanded={isOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                        <Avatar name={m.name} avatarUrl={m.avatarUrl} size="sm" />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="truncate text-[15px] font-semibold text-gray-900">{m.name}</span>
                            {stuck > 0 && <span className="rounded-full bg-rose-100/80 px-2 py-0.5 text-[11px] font-semibold text-rose-700">{stuck} stuck</span>}
                          </span>
                          <span className="block text-[12px] text-gray-500">{PRACTICE_ROLE_LABEL[m.role]} · {done} of {scenarios.length} done</span>
                          <Bar done={done} total={scenarios.length} />
                        </span>
                        <svg className={`h-4 w-4 flex-none text-gray-400 transition-transform ${isOpen ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 6l6 6-6 6" /></svg>
                      </button>
                      <AppOverflowMenu align="right" items={[
                        { label: 'Reset practice progress', onClick: () => setConfirm({ kind: 'person', member: m }) },
                        { label: 'Reset practice + first-time experience', onClick: () => setConfirm({ kind: 'person', member: m, withFirstTime: true }) },
                      ]} />
                    </div>
                    {isOpen && (
                      <div className="mt-3 border-t border-gray-100 pt-3">
                        <ul className="space-y-1.5">
                          {scenarios.map((s) => {
                            const entry = m.progress.find((item) => item.key === s.key);
                            return (
                              <li key={s.key} className="flex items-start gap-2 text-[13px]">
                                <span className={`mt-0.5 h-3.5 w-3.5 flex-none rounded-full ${entry?.doneAt ? 'bg-emerald-500' : entry?.stuckAt ? 'bg-rose-500' : 'bg-gray-200'}`} aria-hidden="true" />
                                <span className={entry?.doneAt ? 'text-gray-400 line-through' : entry?.stuckAt ? 'font-semibold text-rose-700' : 'text-gray-700'}>{s.title}</span>
                              </li>
                            );
                          })}
                        </ul>
                        {people.length > 0 && (
                          <>
                            <p className="mb-1 mt-4 text-[12px] font-semibold uppercase tracking-[0.04em] text-gray-500">{m.group?.name} · participants</p>
                            <ul className="divide-y divide-gray-100">
                              {people.map((p) => {
                                const pKeys = PRACTICE_SCENARIOS.PARTICIPANT.map((s) => s.key);
                                const pDone = doneOf(p.progress, pKeys);
                                const pStuck = stuckOf(p.progress);
                                return (
                                  <li key={p.id} className="flex items-center gap-3 py-2.5">
                                    <div className="min-w-0 flex-1">
                                      <p className="truncate text-[14px] font-semibold text-gray-900">{p.name} {pStuck > 0 && <span className="ml-1 rounded-full bg-rose-100/80 px-2 py-0.5 text-[11px] font-semibold text-rose-700">{pStuck} stuck</span>}</p>
                                      <p className="text-[12px] text-gray-500">
                                        {phoneLabel(p.phone)} · {p.signedIn ? 'signed in' : `code ${p.code ?? '-'}`} · {pDone} of {pKeys.length}
                                      </p>
                                    </div>
                                    <button type="button" onClick={() => { void navigator.clipboard?.writeText(`${p.phone} ${p.code ?? ''}`.trim()); toast({ message: 'Copied.' }); }} className="text-[12px] font-semibold text-primary">Copy</button>
                                    <button type="button" onClick={() => setConfirm({ kind: 'participant', id: p.id, name: p.name })} className="text-[12px] font-semibold text-gray-500 hover:text-gray-800">Reset</button>
                                  </li>
                                );
                              })}
                            </ul>
                          </>
                        )}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          )
        )}

        {tab === 'team' && (
          <section className={`${SURFACE} px-5 py-4`}>
            <ul className="divide-y divide-gray-100">
              {roster.map((m) => (
                <li key={m.userId} className="flex items-center gap-3 py-3">
                  <Avatar name={m.name} avatarUrl={m.avatarUrl} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-gray-900">{m.name}</span>
                  <div className="w-44">
                    <AppSelect value={m.role} options={ROLE_OPTIONS} placeholder="Role" compact onChange={(v) => { setRoster((prev) => prev.map((x) => (x.userId === m.userId ? { ...x, role: v as PracticeRole } : x))); setDirty(true); }} />
                  </div>
                  <button type="button" aria-label={`Remove ${m.name}`} onClick={() => { setRoster((prev) => prev.filter((x) => x.userId !== m.userId)); setDirty(true); }} className="text-gray-400 hover:text-rose-600">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </li>
              ))}
              {roster.length === 0 && <li className="py-6 text-center text-sm text-gray-500">No one yet.</li>}
            </ul>
            <button type="button" onClick={() => { setPick(new Set()); setQuery(''); setAdding(true); }} className="mt-3 rounded-full bg-[#f5f5f7] px-4 py-2 text-[13px] font-semibold text-gray-800 active:scale-[0.98]">Add people</button>
            <p className="mt-3 text-[12px] text-gray-500">{teamNote} Participants are made up, three for each support, and sign in with their phone number and the code FOF-PRACTICE.</p>
          </section>
        )}
      </div>

      <ModalShell
        isOpen={adding}
        onClose={() => setAdding(false)}
        title="Add people"
        subtitle="They start as supports. Change the role after."
        footer={(
          <>
            <button type="button" onClick={() => setAdding(false)} className="rounded-full border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600">Cancel</button>
            <button
              type="button"
              disabled={pick.size === 0}
              onClick={() => {
                setRoster((prev) => [...prev, ...supports.filter((u) => pick.has(u.id)).map((u) => ({ userId: u.id, name: u.name, role: 'SUPPORT' as PracticeRole, avatarUrl: u.avatarUrl }))]);
                setDirty(true);
                setAdding(false);
              }}
              className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              Add {pick.size > 0 ? pick.size : ''}
            </button>
          </>
        )}
      >
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search supports" className="mb-2 w-full rounded-2xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
        <ul className="divide-y divide-gray-100">
          {available.map((u) => {
            const on = pick.has(u.id);
            return (
              <li key={u.id}>
                <button type="button" role="checkbox" aria-checked={on} onClick={() => setPick((prev) => { const next = new Set(prev); if (on) next.delete(u.id); else next.add(u.id); return next; })} className="flex w-full items-center gap-3 py-2.5 text-left">
                  <span className={`grid h-5 w-5 flex-none place-items-center rounded-md border-2 ${on ? 'border-primary bg-primary text-white' : 'border-gray-300 text-transparent'}`}>
                    <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                  </span>
                  <span className="text-[14px] font-semibold text-gray-900">{u.name}</span>
                </button>
              </li>
            );
          })}
          {available.length === 0 && <li className="py-6 text-center text-sm text-gray-500">No one else to add.</li>}
        </ul>
      </ModalShell>

      <ConfirmationModal
        isOpen={!!confirm}
        onClose={() => setConfirm(null)}
        title={confirm?.kind === 'all' ? 'Reset all of Practice?' : confirm?.kind === 'person' ? `Reset ${confirm.member.name}?` : `Reset ${confirm?.kind === 'participant' ? confirm.name : ''}?`}
        message={confirm?.kind === 'all'
          ? 'Everything people did in Practice is cleared and it is rebuilt from the team list. Real data is not touched.'
          : confirm?.kind === 'person'
            ? confirm.withFirstTime
              ? 'Their practice group and checklist start again, and the welcome, tours and role introductions show again on their next sign-in.'
              : 'Their practice group starts again with new made-up participants, and their checklist is cleared.'
            : 'They go back to their first sign-in, with the same phone number and code.'}
        confirmText="Reset"
        type="warning"
        confirmLoading={busy}
        onConfirm={() => {
          const target = confirm;
          setConfirm(null);
          if (!target) return;
          if (target.kind === 'all') void setUp();
          else if (target.kind === 'person') void run(async () => { await practiceApi.resetPerson(target.member.userId); if (target.withFirstTime) await practiceApi.resetFirstTime(target.member.userId); }, `${target.member.name} is reset.`);
          else void run(async () => { await practiceApi.resetParticipant(target.id); await practiceApi.resetParticipantFirstTime(target.id); }, `${target.name} is reset.`);
        }}
      />
    </div>
  );
};

export default AdminPracticePage;
