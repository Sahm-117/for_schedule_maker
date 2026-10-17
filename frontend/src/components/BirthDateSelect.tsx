import React, { useEffect, useState } from 'react';
import AppSelect from './AppSelect';

// Day, month and year as three dropdowns (the same look as the support profile's birthday), giving back a full
// YYYY-MM-DD date once all three are chosen, or '' while one is still empty.

const YEARS = Array.from({ length: 90 }, (_, i) => { const y = new Date().getFullYear() - 10 - i; return { value: String(y), label: String(y) }; });
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((label, i) => ({ value: String(i + 1).padStart(2, '0'), label }));
const DAYS = Array.from({ length: 31 }, (_, i) => ({ value: String(i + 1).padStart(2, '0'), label: String(i + 1) }));

const split = (iso: string) => /^\d{4}-\d{2}-\d{2}$/.test(iso) ? { year: iso.slice(0, 4), month: iso.slice(5, 7), day: iso.slice(8, 10) } : { year: '', month: '', day: '' };

interface BirthDateSelectProps {
  value: string;
  onChange: (iso: string) => void;
}

const BirthDateSelect: React.FC<BirthDateSelectProps> = ({ value, onChange }) => {
  const [parts, setParts] = useState(() => split(value));
  useEffect(() => { if (value) setParts(split(value)); }, [value]);

  const update = (patch: Partial<typeof parts>) => {
    const next = { ...parts, ...patch };
    // February to a 31st: keep the last day of the month instead of an impossible date.
    if (next.month && next.day) {
      const last = new Date(Number(next.year || 2024), Number(next.month), 0).getDate();
      if (Number(next.day) > last) next.day = String(last).padStart(2, '0');
    }
    setParts(next);
    onChange(next.year && next.month && next.day ? `${next.year}-${next.month}-${next.day}` : '');
  };

  const dayCount = parts.month ? new Date(Number(parts.year || 2024), Number(parts.month), 0).getDate() : 31;
  return (
    <div className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.1fr)_minmax(0,1fr)] gap-2 [&>*]:min-w-0">
      <AppSelect value={parts.day} onChange={(day) => update({ day })} options={DAYS.slice(0, dayCount)} placeholder="Day" />
      <AppSelect value={parts.month} onChange={(month) => update({ month })} options={MONTHS} placeholder="Month" />
      <AppSelect value={parts.year} onChange={(year) => update({ year })} options={parts.year && !YEARS.some((y) => y.value === parts.year) ? [{ value: parts.year, label: parts.year }, ...YEARS] : YEARS} placeholder="Year" />
    </div>
  );
};

export default BirthDateSelect;
