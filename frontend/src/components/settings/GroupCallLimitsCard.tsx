import React, { useEffect, useState } from 'react';
import AppSelect from '../AppSelect';
import { settingsApi } from '../../services/api';
import { usePermissions } from '../../hooks/usePermissions';
import { setCachedMeetingLimits } from '../../hooks/useGroupMeetingLimits';
import {
  DEFAULT_GROUP_MEETING_LIMITS, MEETING_DAYS, MEETING_DURATION_CHOICES, describeMeetingLimits, formatClock, formatDuration, fromMinutes, toMinutes,
  type GroupMeetingLimits,
} from '../../utils/groupMeetingLimits';

// Settings > Group call limits: which days, how early, how late and how long a support can set a group's weekly call.
// The meeting-time picker follows this, and the database refuses a support's change that falls outside it.

const TIME_CHOICES = (() => {
  const out: Array<{ value: string; label: string }> = [];
  for (let t = 5 * 60; t <= 23 * 60 + 30; t += 15) out.push({ value: fromMinutes(t), label: formatClock(fromMinutes(t)) });
  return out;
})();

const same = (a: GroupMeetingLimits, b: GroupMeetingLimits) =>
  a.earliestStart === b.earliestStart && a.latestEnd === b.latestEnd && a.days.join() === b.days.join() && a.durations.join() === b.durations.join();

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
  const shortest = draft.durations.length ? Math.min(...draft.durations) : 0;
  const problem = draft.days.length === 0 ? 'Pick at least one day.'
    : draft.durations.length === 0 ? 'Pick at least one length.'
    : toMinutes(draft.earliestStart) + shortest > toMinutes(draft.latestEnd) ? 'The earliest start and the latest end leave no room for the shortest length.'
    : '';

  const save = async () => {
    setSaving(true);
    setStatus('');
    try {
      const value = await settingsApi.setGroupMeetingLimits({ ...draft, days: order(draft.days), durations: [...draft.durations].sort((a, b) => a - b) });
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
          <p className="mt-1 text-sm text-gray-500">The days, times and lengths a support can pick for their group's weekly call. Admins are not held to them.</p>
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Earliest start</p>
              <AppSelect value={draft.earliestStart} onChange={(v) => setDraft((p) => ({ ...p, earliestStart: v }))} options={TIME_CHOICES} placeholder="Earliest" compact disabled={saving} />
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Must finish by</p>
              <AppSelect value={draft.latestEnd} onChange={(v) => setDraft((p) => ({ ...p, latestEnd: v }))} options={TIME_CHOICES} placeholder="Latest" compact disabled={saving} />
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Lengths</p>
            <div className="flex flex-wrap gap-1.5">
              {MEETING_DURATION_CHOICES.map((m) => <Chip key={m} on={draft.durations.includes(m)} label={formatDuration(m)} disabled={saving} onClick={() => setDraft((p) => ({ ...p, durations: toggle(p.durations, m) }))} />)}
            </div>
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
