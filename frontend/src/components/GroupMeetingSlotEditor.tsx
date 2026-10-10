import React, { useState } from 'react';
import AppSelect from './AppSelect';
import { useGroupMeetingLimits } from '../hooks/useGroupMeetingLimits';
import { MEETING_DAYS, formatDuration, startTimeOptions } from '../utils/groupMeetingLimits';

export type MeetingSlot = {
  meetingDay: string | null;
  meetingTime: string | null;
  meetingDurationMins: number | null;
};

interface Props {
  value: MeetingSlot;
  onChange: (slot: MeetingSlot) => void;
  disabled?: boolean;
  /** Admin-set meetings: any day, any time, any length. Group calls keep the usual limits. */
  anySlot?: boolean;
}

const ALL_DAY_OPTIONS = [
  { value: 'MONDAY', label: 'Monday' },
  { value: 'TUESDAY', label: 'Tuesday' },
  { value: 'WEDNESDAY', label: 'Wednesday' },
  { value: 'THURSDAY', label: 'Thursday' },
  { value: 'FRIDAY', label: 'Friday' },
  { value: 'SATURDAY', label: 'Saturday' },
  { value: 'SUNDAY', label: 'Sunday' },
];

const ANY_DURATION_OPTIONS = [30, 45, 60, 75, 90, 120, 150, 180].map((m) => ({ value: String(m), label: m < 60 ? `${m} minutes` : m === 60 ? '1 hour' : m % 60 === 0 ? `${m / 60} hours` : `${Math.floor(m / 60)} h ${m % 60} min` }));

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

const GroupMeetingSlotEditor: React.FC<Props> = ({ value, onChange, disabled, anySlot = false }) => {
  const [expanded, setExpanded] = useState(false);
  // The back-office limits (Settings > Group call limits) decide what the pickers offer, unless this is an admin-set meeting.
  const limits = useGroupMeetingLimits();
  // A slot saved before the limits changed stays selectable, so it is never shown as blank.
  const withCurrent = (options: Array<{ value: string; label: string }>, current: string | null | undefined, label?: string) =>
    current && !options.some((o) => o.value === current) ? [{ value: current, label: label ?? current }, ...options] : options;

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
            options={[{ value: '', label: '— Pick a day —' }, ...(anySlot ? ALL_DAY_OPTIONS : withCurrent(MEETING_DAYS.filter((d) => limits.days.includes(d.value)), value.meetingDay, MEETING_DAYS.find((d) => d.value === value.meetingDay)?.label))]}
            placeholder="Day"
            compact
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Start time</label>
          {anySlot ? (
            <input
              type="time"
              value={value.meetingTime ?? ''}
              onChange={(e) => update({ meetingTime: e.target.value || null })}
              className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          ) : (
            <AppSelect
              value={value.meetingTime ?? ''}
              onChange={(v) => update({ meetingTime: v || null })}
              options={[{ value: '', label: '— Pick a time —' }, ...withCurrent(startTimeOptions(limits), value.meetingTime, value.meetingTime ? formatMeetingSlot({ meetingDay: 'X', meetingTime: value.meetingTime })?.split(' · ')[1] : undefined)]}
              placeholder="Time"
              compact
            />
          )}
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Duration</label>
          <AppSelect
            value={value.meetingDurationMins ? String(value.meetingDurationMins) : ''}
            onChange={(v) => update({ meetingDurationMins: v ? Number(v) : null })}
            options={[{ value: '', label: '— Pick duration —' }, ...(anySlot ? (value.meetingDurationMins && !ANY_DURATION_OPTIONS.some((o) => o.value === String(value.meetingDurationMins)) ? [{ value: String(value.meetingDurationMins), label: `${value.meetingDurationMins} minutes` }, ...ANY_DURATION_OPTIONS] : ANY_DURATION_OPTIONS) : withCurrent(limits.durations.map((m) => ({ value: String(m), label: formatDuration(m) })), value.meetingDurationMins ? String(value.meetingDurationMins) : null, value.meetingDurationMins ? formatDuration(value.meetingDurationMins) : undefined))]}
            placeholder="Duration"
            compact
          />
        </div>
      </div>
    </div>
  );
};

export default GroupMeetingSlotEditor;
