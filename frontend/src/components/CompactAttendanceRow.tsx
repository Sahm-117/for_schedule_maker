import React from 'react';
import AppSelect from './AppSelect';

export interface CompactAttendanceOption {
  value: string;
  label: string;
}

interface CompactAttendanceRowProps {
  name: string;
  value: string;
  onChange: (value: string) => void;
  options: CompactAttendanceOption[];
  placeholder?: string;
  disabled?: boolean;
  /** Small status line under the name — e.g. SaveStatus, or an error message. */
  status?: React.ReactNode;
}

// One compact "name + dropdown" attendance row — shared by the hub meeting
// (HubMeetingPanel) and group meeting (MeetingModePanel) walk-throughs'
// Attendance step, so both mark attendance the same way.
const CompactAttendanceRow: React.FC<CompactAttendanceRowProps> = ({
  name,
  value,
  onChange,
  options,
  placeholder = 'Not marked',
  disabled,
  status,
}) => (
  <li className="flex items-center justify-between gap-3 rounded-xl border border-orange-100 p-3">
    <div className="min-w-0">
      <p className="text-sm font-semibold text-gray-900">{name}</p>
      {status}
    </div>
    <div className="w-40 flex-none">
      <AppSelect
        value={value}
        onChange={(v) => v && onChange(v)}
        options={options}
        placeholder={placeholder}
        disabled={disabled}
        compact
      />
    </div>
  </li>
);

export default CompactAttendanceRow;
