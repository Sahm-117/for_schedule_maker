import React, { useEffect, useState } from 'react';
import AppSelect from '../AppSelect';
import { settingsApi } from '../../services/api';
import { usePermissions } from '../../hooks/usePermissions';
import { setCachedMeetingLimits } from '../../hooks/useGroupMeetingLimits';
import {
  DEFAULT_GROUP_MEETING_LIMITS, MEETING_DAYS, describeMeetingLimits, formatClock, fromMinutes, toMinutes, windowForDay,
  type DayWindow, type GroupMeetingLimits,
} from '../../utils/groupMeetingLimits';

// Settings > Group call limits: which days, and the earliest and latest start on each day, a support can set a group's weekly call.
// The meeting-time picker follows this, and the database refuses a support's change that falls outside it.

const TIME_CHOICES = (() => {
  const out: Array<{ value: string; label: string }> = [];
  for (let t = 0; t <= 23 * 60 + 45; t += 15) out.push({ value: fromMinutes(t), label: formatClock(fromMinutes(t)) });
  return out;
})();

// What a save would store: every ticked day carries its own times.
const effective = (l: GroupMeetingLimits): GroupMeetingLimits => ({
  ...l,
  dayTimes: Object.fromEntries(MEETING_DAYS.filter((d) => l.days.includes(d.value)).map((d) => [d.value, windowForDay(l, d.value)])),
});

const same = (a: GroupMeetingLimits, b: GroupMeetingLimits) => {
  const x = effective(a); const y = effective(b);
  return x.days.join() === y.days.join() && x.days.every((d) => x.dayTimes[d].earliestStart === y.dayTimes[d].earliestStart && x.dayTimes[d].latestStart === y.dayTimes[d].latestStart);
};

const Chip: React.FC<{ on: boolean; label: string; onClick: () => void; disabled?: boolean }> = ({ on, label, onClick, disabled }) => (
  <button type="button" role="switch" aria-checked={on} disabled={disabled} onClick={onClick}
    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${on ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'} disabled:opacity-60`}>
    {label}
  </button>
);

const GroupCallLimitsCard: React.FC = () => {
  const { can } = usePermissions();
  const canEdit = can('settings', 'edit');
  const [saved, setSaved] = useState<GroupMeetingLimits>(DEFAULT_GROUP_MEETING_LIMITS);
  const [draft, setDraft] = useState<GroupMeetingLimits>(DEFAULT_GROUP_MEETING_LIMITS);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => {
    let cancelled = false;
    settingsApi.getGroupMeetingLimits().then((l) => { if (!cancelled) { setSaved(l); setDraft(l); } }).catch(() => { /* defaults stay */ }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const toggle = <T,>(list: T[], item: T): T[] => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);
  const order = (days: string[]) => MEETING_DAYS.map((d) => d.value).filter((d) => days.includes(d));
  const badDay = draft.days.find((d) => { const w = windowForDay(draft, d); return toMinutes(w.earliestStart) > toMinutes(w.latestStart); });
  const problem = draft.days.length === 0 ? 'Pick at least one day.'
    : badDay ? `${MEETING_DAYS.find((d) => d.value === badDay)?.label}: the earliest start is after the latest start.`
    : '';
  const setDayTime = (day: string, patch: Partial<DayWindow>) => setDraft((p) => ({ ...p, dayTimes: { ...p.dayTimes, [day]: { ...windowForDay(p, day), ...patch } } }));

  const save = async () => {
    setSaving(true);
    setStatus('');
    try {
      const value = await settingsApi.setGroupMeetingLimits({ ...effective(draft), days: order(draft.days) });
      setSaved(value); setDraft(value); setCachedMeetingLimits(value);
      setEditing(false);
      setStatus('Saved. Supports are held to these from now on. Calls already set keep working until someone changes them.');
    } catch {
      setStatus('Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="surface-card p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-gray-900">Group call limits</h3>
          <p className="mt-1 text-sm text-gray-500">The days and start times a support can pick for their group's weekly call. Admins are not held to them.</p>
        </div>
        {canEdit && !editing && !loading && (
          <button type="button" onClick={() => { setStatus(''); setEditing(true); }} className="flex-none rounded-xl bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-200">Edit</button>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : !editing ? (
        <div className="space-y-2">
          <p className="text-sm leading-relaxed text-gray-700">{describeMeetingLimits(saved)}</p>
          {status && <p className="text-xs text-emerald-700" role="status">{status}</p>}
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Days</p>
            <div className="flex flex-wrap gap-1.5">
              {MEETING_DAYS.map((d) => <Chip key={d.value} on={draft.days.includes(d.value)} label={d.label.slice(0, 3)} disabled={saving} onClick={() => setDraft((p) => ({ ...p, days: toggle(p.days, d.value) }))} />)}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Start times for each day</p>
            {MEETING_DAYS.filter((d) => draft.days.includes(d.value)).map((d) => {
              const w = windowForDay(draft, d.value);
              return (
                <div key={d.value} className="grid grid-cols-[4.5rem_1fr_1fr] items-center gap-2">
                  <span className="text-sm font-semibold text-gray-700">{d.label}</span>
                  <AppSelect value={w.earliestStart} onChange={(v) => setDayTime(d.value, { earliestStart: v })} options={TIME_CHOICES} placeholder="Earliest" compact disabled={saving} />
                  <AppSelect value={w.latestStart} onChange={(v) => setDayTime(d.value, { latestStart: v })} options={TIME_CHOICES} placeholder="Latest" compact disabled={saving} />
                </div>
              );
            })}
            <p className="text-xs text-gray-400">First box is the earliest a call can start, second is the latest.</p>
          </div>
          {problem && <p className="text-xs font-medium text-red-600" role="alert">{problem}</p>}
          {status && <p className="text-xs text-red-600" role="alert">{status}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={saving || !!problem || same(draft, saved)} onClick={() => void save()} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save limits'}</button>
            <button type="button" disabled={saving} onClick={() => { setDraft(saved); setStatus(''); setEditing(false); }} className="rounded-xl bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700">Cancel</button>
            <button type="button" disabled={saving} onClick={() => setDraft(DEFAULT_GROUP_MEETING_LIMITS)} className="ml-auto text-xs font-semibold text-primary">Reset to the original rules</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default GroupCallLimitsCard;
