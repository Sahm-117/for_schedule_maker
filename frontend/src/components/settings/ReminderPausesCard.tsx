import React, { useEffect, useState } from 'react';
import { settingsApi } from '../../services/api';
import { lagosTodayIso } from '../../utils/participantApp';
import Spinner from '../Spinner';

// Switches that stop some automatic sending, for a day when the usual reminders would say the wrong thing
// (for example, no class this Sunday). A switch is saved straight away. "Paused through" a date means the
// reminders start again the day after it; with no date the pause stays until it is switched back on.

type Group = 'class' | 'activities';

const GROUPS: Array<{ key: Group; title: string; hint: string }> = [
  { key: 'class', title: 'Class and service reminders', hint: 'Participants: the Saturday and Sunday "see you at class" nudges and the "view the venue map" reminders.' },
  { key: 'activities', title: 'Support schedule reminders', hint: 'Supports: the reminders before each activity on their schedule.' },
];

const isPaused = (value: string | null | undefined, today: string) => !!value && (value === 'ALWAYS' || today <= value);

const describe = (value: string | null | undefined, today: string) => {
  if (!isPaused(value, today)) return 'Sending as normal';
  if (value === 'ALWAYS') return 'Paused until you switch it back on';
  const label = new Date(`${value}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  return `Paused through ${label}`;
};

const ReminderPausesCard: React.FC = () => {
  const [pauses, setPauses] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<Group | null>(null);
  const [draftDate, setDraftDate] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const today = lagosTodayIso(new Date());

  useEffect(() => {
    let cancelled = false;
    settingsApi.getReminderPauses()
      .then((value) => { if (!cancelled) setPauses(value); })
      .catch(() => { if (!cancelled) setError('Could not load these switches.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const save = async (group: Group, value: string | null) => {
    setBusy(group);
    setError('');
    try {
      setPauses(await settingsApi.setReminderPause(group, value));
      setDraftDate((draft) => ({ ...draft, [group]: '' }));
    } catch {
      setError('Could not save. Nothing changed, try again.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="rounded-[22px] border border-[#eef0f4] bg-white p-5 shadow-[0_2px_8px_-3px_rgba(17,24,39,0.10)]">
      <h3 className="text-[17px] font-extrabold text-gray-900">Pause automatic reminders</h3>
      <p className="mt-1 text-[13px] text-gray-500">Switch one on to stop that reminder from going out. It takes effect at once.</p>
      {error && <p className="mt-3 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</p>}
      {loading ? (
        <p className="mt-4 flex items-center gap-1.5 text-sm text-gray-500"><Spinner className="h-3.5 w-3.5" />Loading…</p>
      ) : (
        <ul className="mt-3 divide-y divide-[#f1f2f5]">
          {GROUPS.map((group) => {
            const value = pauses[group.key];
            const paused = isPaused(value, today);
            return (
              <li key={group.key} className="py-3.5">
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-bold text-gray-900">{group.title}</p>
                    <p className="mt-0.5 text-[13px] text-gray-500">{group.hint}</p>
                    <p className={`mt-1 text-[13px] font-semibold ${paused ? 'text-amber-700' : 'text-emerald-700'}`}>{describe(value, today)}</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={paused}
                    aria-label={`Pause ${group.title}`}
                    disabled={busy !== null}
                    onClick={() => { void save(group.key, paused ? null : 'ALWAYS'); }}
                    className={`relative inline-flex h-8 w-14 flex-none items-center rounded-full transition disabled:opacity-60 ${paused ? 'bg-primary' : 'bg-slate-200'}`}
                  >
                    <span className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition ${paused ? 'translate-x-7' : 'translate-x-1'}`} />
                  </button>
                </div>
                {paused && (
                  <label className="mt-2.5 flex flex-wrap items-center gap-2 text-[13px] text-gray-600">
                    Start again after
                    <input
                      type="date"
                      value={draftDate[group.key] ?? (value && value !== 'ALWAYS' ? value : '')}
                      min={today}
                      disabled={busy !== null}
                      onChange={(event) => setDraftDate((draft) => ({ ...draft, [group.key]: event.target.value }))}
                      onBlur={() => {
                        const picked = draftDate[group.key];
                        if (picked === undefined || picked === (value && value !== 'ALWAYS' ? value : '')) return;
                        if (picked && picked < today) { setError('Pick today or a later day.'); setDraftDate((draft) => ({ ...draft, [group.key]: '' })); return; }
                        void save(group.key, picked || 'ALWAYS');
                      }}
                      className="rounded-xl border border-gray-200 px-3 py-1.5 text-sm"
                    />
                    <span className="text-gray-400">(leave empty to stay paused)</span>
                  </label>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};

export default ReminderPausesCard;
