import React, { useEffect, useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import SegmentedTabs from '../SegmentedTabs';
import BirthdayGraphicSheet from '../BirthdayGraphicSheet';
import { birthdaysApi } from '../../services/api';
import type { BirthdayList, BirthdayPerson } from '../../types';

interface Props {
  cohortId: string;
}

type Kind = 'supports' | 'participants';
type Tagged = BirthdayPerson & { kind: Kind };

const WINDOW_DAYS = 14;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const countdown = (days: number): string => (days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `in ${days} days`);
const initials = (name: string): string => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('');

/** Who is celebrating today and over the next two weeks, on the admin Dashboard. Same feed as the Birthdays page. */
const BirthdaysCard: React.FC<Props> = ({ cohortId }) => {
  const [data, setData] = useState<BirthdayList | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [who, setWho] = useState<'all' | Kind>('all');
  const [graphicFor, setGraphicFor] = useState<Tagged | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setFailed(false);
    birthdaysApi.list(cohortId)
      .then((res) => { if (!cancelled) setData(res); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [cohortId, attempt]);

  const { today, soon, missing } = useMemo(() => {
    if (!data) return { today: [] as Tagged[], soon: [] as Tagged[], missing: 0 };
    const tag = (list: BirthdayPerson[], kind: Kind): Tagged[] => list.filter((p) => p.daysUntil <= WINDOW_DAYS).map((p) => ({ ...p, kind }));
    const all = [
      ...(who === 'participants' ? [] : tag(data.supports, 'supports')),
      ...(who === 'supports' ? [] : tag(data.participants, 'participants')),
    ].sort((a, b) => a.daysUntil - b.daysUntil || a.name.localeCompare(b.name));
    const gone = who === 'supports' ? data.missing.supports : who === 'participants' ? data.missing.participants : data.missing.supports + data.missing.participants;
    return { today: all.filter((p) => p.daysUntil === 0), soon: all.filter((p) => p.daysUntil > 0), missing: gone };
  }, [data, who]);

  return (
    <section className="surface-card min-w-0 p-5 sm:p-6" data-testid="birthdays-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-gray-900">Birthdays</h3>
          <p className="text-xs text-gray-500">Today and the next {WINDOW_DAYS} days</p>
        </div>
        <SegmentedTabs
          tabs={[{ key: 'all', label: 'Everyone' }, { key: 'supports', label: 'Supports' }, { key: 'participants', label: 'Participants', shortLabel: 'Members' }]}
          active={who}
          onChange={(k) => setWho(k as 'all' | Kind)}
          className="w-full sm:w-auto"
        />
      </div>

      {failed ? (
        <p className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
          Could not load birthdays.
          <button type="button" onClick={() => setAttempt((n) => n + 1)} className="font-semibold underline">Try again</button>
        </p>
      ) : !data ? (
        <p className="mt-6 rounded-2xl bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">Loading…</p>
      ) : (
        <>
          {today.length > 0 && (
            <div className="mt-4 space-y-2">
              {today.map((p) => (
                <div key={`${p.kind}-${p.id}`} className="flex items-center gap-3 rounded-2xl bg-gradient-to-br from-[#fff1e6] to-[#ffe3cc] p-3.5">
                  <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-white/80 text-[13px] font-bold text-[#9a4a12]">{initials(p.name)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[#9a4a12]">Celebrating today</p>
                    <p className="break-words text-[15px] font-semibold text-gray-900">{p.name}</p>
                    <p className="truncate text-xs text-gray-600">{p.kind === 'supports' ? 'Support' : p.cohorts.slice(0, 2).join(' · ') || 'Participant'}</p>
                  </div>
                  <button type="button" onClick={() => setGraphicFor(p)} className="min-h-[36px] flex-none rounded-full bg-primary px-3.5 text-[13px] font-semibold text-white shadow-sm">Make graphic</button>
                </div>
              ))}
            </div>
          )}

          {soon.length > 0 ? (
            <ul className="mt-3 divide-y divide-gray-100">
              {soon.map((p) => (
                <li key={`${p.kind}-${p.id}`} className="flex items-center gap-3 py-2.5">
                  <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-gray-100 text-xs font-bold text-gray-600">{initials(p.name)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-sm font-semibold text-gray-900">{p.name}</p>
                    <p className="text-xs text-gray-500">{p.day} {MONTHS[p.month - 1]} · {p.kind === 'supports' ? 'Support' : 'Participant'}</p>
                  </div>
                  <span className={`flex-none rounded-full px-2.5 py-1 text-xs font-semibold ${p.daysUntil <= 2 ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600'}`}>{countdown(p.daysUntil)}</span>
                </li>
              ))}
            </ul>
          ) : today.length === 0 ? (
            <p className="mt-4 rounded-2xl bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">No birthdays in the next {WINDOW_DAYS} days.</p>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
            <span>{missing > 0 ? `${missing} ${missing === 1 ? 'person has' : 'people have'} no birthday on file` : ''}</span>
            <NavLink to="/birthdays" className="font-semibold text-primary-dark hover:underline">See all birthdays</NavLink>
          </div>
        </>
      )}
      {graphicFor && <BirthdayGraphicSheet person={graphicFor} roleLabel={graphicFor.kind === 'supports' ? 'Support' : 'Participant'} onClose={() => setGraphicFor(null)} />}
    </section>
  );
};

export default BirthdaysCard;
