import React, { useEffect, useMemo, useState } from 'react';
import Avatar from '../Avatar';
import Spinner from '../Spinner';
import { PROGRESS_STEPS, StepPill } from '../OnboardingStepPills';
import { myHubApi } from '../../services/api';
import { supportProfileChecklist } from '../../utils/people';
import { buildParticipantMessageLink } from '../../utils/phone';
import WhatsAppIcon from '../WhatsAppIcon';
import type { FaithProjectStatus, HubGroupOverview } from '../../types';

const SURFACE = 'rounded-[28px] bg-white shadow-[0_1px_2px_rgba(17,24,39,0.04),0_12px_32px_-16px_rgba(17,24,39,0.18)]';

// Same wording as the participant card, so a hub lead and a support read the
// Faith Project state the same way.
const FP_CHIP: Record<FaithProjectStatus, { label: string; cls: string }> = {
  NOT_DRAFTED: { label: 'Not started', cls: 'bg-[#f6f7f9] text-gray-500' },
  AWAITING_DRAFT: { label: 'Sent back for work', cls: 'bg-[#fef3c7] text-[#b45309]' },
  NEEDS_REFINEMENT: { label: 'With the support', cls: 'bg-[#fff1e6] text-[#c2410c]' },
  UNDER_REFINEMENT: { label: 'With the back office', cls: 'bg-[#ede9fe] text-[#6d28d9]' },
  APPROVED: { label: 'Approved', cls: 'bg-[#f2fbf5] text-[#15803d]' },
};

const STATUS_LABEL: Record<string, string> = {
  PRESENT: 'Present', ABSENT: 'Absent', LATE: 'Late', LEFT_EARLY: 'Left early', EXCUSED: 'Excused', NONE: 'Not marked',
};

const BellOff: React.FC<{ className?: string }> = ({ className = 'h-4 w-4' }) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M6 16.5V11a6 6 0 1112 0v5.5l1.8 2H4.2z" /><path d="M10 21a2 2 0 004 0M3 3l18 18" />
  </svg>
);

const AlertsChip: React.FC<{ on: boolean; onLabel?: string; offLabel?: string }> = ({ on, onLabel = 'Alerts on', offLabel = 'Alerts off' }) => (
  on
    ? <span className="inline-flex items-center rounded-full bg-emerald-100/80 px-2.5 py-1 text-xs font-semibold text-emerald-700">{onLabel}</span>
    : <span className="inline-flex items-center gap-1 rounded-full bg-amber-100/80 px-2.5 py-1 text-xs font-semibold text-amber-700"><BellOff className="h-3 w-3" />{offLabel}</span>
);

// The hub lead's read-only look at one support's group: how complete the
// support's profile is and whether their phone gets alerts, then the
// participants (onboarding, overall attendance, Faith Project, alerts). Tap a
// person for their last four classes. Nothing here changes anything.
const GroupPeopleOverview: React.FC<{ groupId: string }> = ({ groupId }) => {
  const [data, setData] = useState<HubGroupOverview | null>(null);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError('');
    myHubApi.getGroupOverview(groupId)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load the overview.'); });
    return () => { cancelled = true; };
  }, [groupId]);

  const summary = useMemo(() => {
    if (!data) return null;
    const people = data.participants;
    const onboarded = people.filter((p) => p.onboarding.completed).length;
    const attended = people.reduce((n, p) => n + p.classesAttended, 0);
    const possible = people.length * data.classesRun;
    const approved = people.filter((p) => p.faithProjectStatus === 'APPROVED').length;
    const alertsOff = people.filter((p) => !p.hasPush).length;
    return { onboarded, approved, alertsOff, rate: possible > 0 ? Math.round((attended / possible) * 100) : null };
  }, [data]);

  if (error) {
    return <section className={`${SURFACE} px-6 py-5`}><p className="text-[15px] text-gray-500">{error}</p></section>;
  }
  if (!data || !summary) {
    return <section className={`${SURFACE} flex justify-center px-6 py-8`}><Spinner /></section>;
  }

  const support = data.support;
  const checklist = support
    ? supportProfileChecklist({
      avatarUrl: support.hasPhoto ? 'x' : null,
      gender: support.hasGender ? 'x' : null,
      ageRange: support.hasAgeRange ? 'x' : null,
      phone: support.hasPhone ? 'x' : null,
    } as Parameters<typeof supportProfileChecklist>[0])
    : [];
  const done = checklist.filter((i) => i.done).length;
  const missing = checklist.filter((i) => !i.done).map((i) => i.label);
  const percent = checklist.length ? Math.round((done / checklist.length) * 100) : 0;
  const n = data.participants.length;

  return (
    <>
      {support && (
        <section data-wt="group-view-support" className={`${SURFACE} px-6 py-5`}>
          <p className="text-[13px] font-semibold uppercase tracking-[0.04em] text-gray-500">The support</p>
          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-[15px] font-semibold text-gray-900">Profile</p>
            <span className="text-[15px] font-bold text-gray-900">{percent}%</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-gray-100">
            <div className={`h-full rounded-full ${percent === 100 ? 'bg-emerald-500' : 'bg-primary'}`} style={{ width: `${percent}%` }} />
          </div>
          <p className="mt-1.5 text-[13px] text-gray-500">{missing.length === 0 ? 'Profile complete' : `Missing: ${missing.join(', ').toLowerCase()}`}</p>
          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="text-[15px] font-semibold text-gray-900">Phone alerts</p>
            <AlertsChip on={support.hasPush} />
          </div>
        </section>
      )}

      <section data-wt="group-view-people" className={`${SURFACE} px-6 py-5`}>
        <p className="text-[13px] font-semibold uppercase tracking-[0.04em] text-gray-500">Participants</p>
        {n === 0 ? (
          <p className="mt-2 text-[15px] text-gray-500">No participants in this group yet.</p>
        ) : (
          <>
            <div className="mt-3 grid grid-cols-3 gap-2.5">
              {[
                [`${summary.onboarded}/${n}`, 'onboarded'],
                [summary.rate === null ? '-' : `${summary.rate}%`, data.classesRun === 0 ? 'no classes yet' : `attendance, ${data.classesRun} ${data.classesRun === 1 ? 'class' : 'classes'}`],
                [`${summary.approved}/${n}`, 'Faith Projects approved'],
              ].map(([value, label]) => (
                <div key={String(label)} className="rounded-2xl bg-[#f6f7f9] px-2 py-3 text-center">
                  <p className="text-[20px] font-bold text-gray-900">{value}</p>
                  <p className="text-[12px] leading-tight text-gray-500">{label}</p>
                </div>
              ))}
            </div>
            {summary.alertsOff > 0 && (
              <p className="mt-3 inline-flex items-center gap-1.5 text-[13px] text-amber-700"><BellOff className="h-3.5 w-3.5" />{summary.alertsOff} of {n} have phone alerts off</p>
            )}
            <ul className="mt-3 divide-y divide-gray-100">
              {data.participants.map((p) => {
                const open = openId === p.participantId;
                const pct = data.classesRun > 0 ? Math.round((p.classesAttended / data.classesRun) * 100) : null;
                const fp = FP_CHIP[p.faithProjectStatus ?? 'NOT_DRAFTED'];
                const messageLink = buildParticipantMessageLink(p.phone, p.name);
                const stepsDone = PROGRESS_STEPS.filter((s) => p.onboarding[s.key]).length;
                return (
                  <li key={p.participantId}>
                    <button
                      type="button"
                      onClick={() => setOpenId(open ? null : p.participantId)}
                      aria-expanded={open}
                      className="flex w-full items-center gap-3 py-3 text-left"
                    >
                      <Avatar name={p.name} avatarUrl={p.avatarUrl} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-[15px] font-semibold text-gray-900">{p.name}</span>
                          {!p.hasPush && <span title="Phone alerts off" className="text-amber-600"><BellOff className="h-3.5 w-3.5" /></span>}
                        </span>
                        <span className="mt-1 flex flex-wrap items-center gap-1.5">
                          {p.onboarding.completed
                            ? <span className="rounded-full bg-emerald-100/80 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">Onboarded</span>
                            : <span className="rounded-full bg-amber-100/80 px-2.5 py-0.5 text-xs font-semibold text-amber-700">Onboarding {stepsDone}/{PROGRESS_STEPS.length}</span>}
                          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${fp.cls}`}>{fp.label}</span>
                        </span>
                      </span>
                      <span className="flex-none text-right">
                        <span className="block text-[15px] font-bold text-gray-900">{pct === null ? '-' : `${pct}%`}</span>
                        <span className="block text-[11px] text-gray-400">attended</span>
                      </span>
                      <svg className={`h-4 w-4 flex-none text-gray-400 transition ${open ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 6l6 6-6 6" /></svg>
                    </button>
                    {open && (
                      <div className="mb-3 ml-11 rounded-2xl bg-[#f6f7f9] px-4 py-3">
                        {messageLink ? (
                          <a href={messageLink} target="_blank" rel="noreferrer" className="mb-3 inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-white px-3.5 text-[13px] font-semibold text-gray-800 shadow-sm">
                            <WhatsAppIcon />Send message
                          </a>
                        ) : (
                          <p className="mb-3 text-[13px] text-gray-500">{p.isTeen ? "A teen's number stays with their Teen Support." : 'No number saved.'}</p>
                        )}
                        <p className="text-[12px] font-semibold uppercase tracking-[0.04em] text-gray-500">Onboarding</p>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {PROGRESS_STEPS.map((s) => <StepPill key={s.key} label={s.label} done={p.onboarding[s.key]} />)}
                        </div>
                        <p className="mt-3 text-[12px] font-semibold uppercase tracking-[0.04em] text-gray-500">Recent classes</p>
                        {p.recent.length === 0 ? (
                          <p className="mt-1 text-[13px] text-gray-500">No classes have run yet.</p>
                        ) : (
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {p.recent.map((r) => (
                              <span key={r.weekNumber} className={`rounded-full px-2.5 py-1 text-xs font-semibold ${r.attended ? 'bg-emerald-100/80 text-emerald-700' : 'bg-rose-100/80 text-rose-700'}`}>
                                Week {r.weekNumber}: {STATUS_LABEL[r.status] ?? r.status}
                              </span>
                            ))}
                          </div>
                        )}
                        <p className="mt-3 text-[12px] font-semibold uppercase tracking-[0.04em] text-gray-500">Phone alerts</p>
                        <div className="mt-1.5"><AlertsChip on={p.hasPush} /></div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>
    </>
  );
};

export default GroupPeopleOverview;
