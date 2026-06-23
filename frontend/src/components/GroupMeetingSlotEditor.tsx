import React, { useState } from 'react';
import AppSelect from './AppSelect';

export type MeetingSlot = {
  meetingDay: string | null;
  meetingTime: string | null;
  meetingDurationMins: number | null;
};

interface Props {
  value: MeetingSlot;
  onChange: (slot: MeetingSlot) => void;
  disabled?: boolean;
}

const DAY_OPTIONS = [
  { value: 'WEDNESDAY', label: 'Wednesday' },
  { value: 'FRIDAY', label: 'Friday' },
  { value: 'SATURDAY', label: 'Saturday' },
];

const DURATION_OPTIONS = [
  { value: '45', label: '45 minutes' },
  { value: '60', label: '1 hour' },
];

// 5:00 PM – 8:15 PM in 15-min steps (latest start that ends by 9pm for a 45-min meeting)
const TIME_OPTIONS = (() => {
  const opts: { value: string; label: string }[] = [];
  for (let h = 17; h <= 20; h++) {
    const steps = h === 20 ? [0, 15] : [0, 15, 30, 45];
    for (const m of steps) {
      const value = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      const displayH = h > 12 ? h - 12 : h;
      const displayM = String(m).padStart(2, '0');
      const ampm = h >= 12 ? 'PM' : 'AM';
      opts.push({ value, label: `${displayH}:${displayM} ${ampm}` });
    }
  }
  return opts;
})();

export const formatMeetingSlot = (slot: { meetingDay?: string | null; meetingTime?: string | null; meetingDurationMins?: number | null }): string | null => {
  if (!slot.meetingDay || !slot.meetingTime) return null;
  const dayLabel = slot.meetingDay.charAt(0) + slot.meetingDay.slice(1).toLowerCase();
  const [h, m] = slot.meetingTime.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const displayH = h > 12 ? h - 12 : h === 0 ? 12 : h;
  const displayM = String(m).padStart(2, '0');
  const dur = slot.meetingDurationMins === 60 ? '1 hr' : slot.meetingDurationMins ? `${slot.meetingDurationMins} min` : '';
  return `${dayLabel} · ${displayH}:${displayM} ${ampm}${dur ? ` · ${dur}` : ''}`;
};

const GroupMeetingSlotEditor: React.FC<Props> = ({ value, onChange, disabled }) => {
  const [expanded, setExpanded] = useState(false);

  const summary = formatMeetingSlot(value);

  const update = (patch: Partial<MeetingSlot>) => {
    onChange({ ...value, ...patch });
  };

  if (!expanded) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => setExpanded(true)}
        className="flex w-full items-center justify-between rounded-2xl border border-orange-200 bg-white px-4 py-2.5 text-sm transition hover:border-primary hover:bg-orange-50/40 disabled:pointer-events-none disabled:opacity-50"
      >
        <span className={summary ? 'font-medium text-gray-900' : 'text-gray-400'}>
          {summary ?? 'Not set — tap to configure'}
        </span>
        <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
        </svg>
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-primary/30 bg-orange-50/30 p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Meeting slot</p>
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="text-xs font-semibold text-primary hover:text-primary-dark"
        >
          Done
        </button>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Day</label>
          <AppSelect
            value={value.meetingDay ?? ''}
            onChange={(v) => update({ meetingDay: v || null })}
            options={[{ value: '', label: '— Pick a day —' }, ...DAY_OPTIONS]}
            placeholder="Day"
            compact
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Start time</label>
          <AppSelect
            value={value.meetingTime ?? ''}
            onChange={(v) => update({ meetingTime: v || null })}
            options={[{ value: '', label: '— Pick a time —' }, ...TIME_OPTIONS]}
            placeholder="Time"
            compact
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Duration</label>
          <AppSelect
            value={value.meetingDurationMins ? String(value.meetingDurationMins) : ''}
            onChange={(v) => update({ meetingDurationMins: v ? Number(v) : null })}
            options={[{ value: '', label: '— Pick duration —' }, ...DURATION_OPTIONS]}
            placeholder="Duration"
            compact
          />
        </div>
      </div>
    </div>
  );
};

export default GroupMeetingSlotEditor;
