import React, { useState } from 'react';
import type { Label, Week } from '../../types';
import { ROTA_DUTIES } from '../../config/rotaDuties';
import { cellKey, type LabelOwners, type RotaCell as RotaCellData } from '../../utils/rotaGrid';
import RotaCell from './RotaCell';

interface RotaGridProps {
  /** Weeks drive the columns, so gaps in the numbering are handled for free. */
  weeks: Week[];
  grid: Map<string, RotaCellData>;
  groupLabels: Label[];
  labelOwners: LabelOwners;
  staged: Map<string, string[]>;
  onStage: (key: string, value: string[] | undefined) => void;
  applying?: boolean;
  blockedDutyIds?: Set<string>;
}

const RotaGrid: React.FC<RotaGridProps> = ({
  weeks,
  grid,
  groupLabels,
  labelOwners,
  staged,
  onStage,
  applying,
  blockedDutyIds,
}) => {
  // Phones show one week at a time; the first is open to start.
  const [openWeeks, setOpenWeeks] = useState<Set<number>>(() => new Set(weeks.slice(0, 1).map((w) => w.id)));
  return (
  <>
  {/* Phones: one card per week, a row per duty. From tablet size up, the grid below. */}
  <ul className="divide-y divide-gray-100 overflow-hidden rounded-[22px] bg-white shadow-[0_1px_2px_rgba(17,24,39,0.04),0_8px_24px_-14px_rgba(17,24,39,0.18)] md:hidden">
    {weeks.map((week) => {
      const expanded = openWeeks.has(week.id);
      return (
      <li key={week.id}>
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setOpenWeeks((prev) => { const next = new Set(prev); if (next.has(week.id)) next.delete(week.id); else next.add(week.id); return next; })}
          className="flex w-full items-center justify-between px-4 py-3 text-left active:bg-gray-50"
        >
          <span className="text-[15px] font-semibold text-gray-900">Week {week.weekNumber}</span>
          <svg className={`h-4 w-4 text-gray-300 transition-transform ${expanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
        </button>
        {expanded && (
        <ul className="divide-y divide-gray-100 bg-gray-50/60 px-4">
          {ROTA_DUTIES.map((duty) => {
            const blocked = blockedDutyIds?.has(duty.id);
            const key = cellKey(duty.id, week.id);
            const cell = grid.get(key);
            return (
              <li key={duty.id} className="py-2.5">
                <p className="text-[12.5px] font-semibold text-gray-700">{duty.name}{duty.subLabel && <span className="ml-1.5 text-[11px] font-medium text-gray-400">{duty.subLabel}</span>}</p>
                {blocked && <p className="text-[11px] font-semibold text-red-600">Overlaps another duty. Editing disabled</p>}
                {cell && (
                  <div className="mt-1">
                    <RotaCell
                      cell={cell}
                      groupLabels={groupLabels}
                      labelOwners={labelOwners}
                      staged={staged.get(key)}
                      onStage={(value) => onStage(key, value)}
                      disabled={applying || blocked}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        )}
      </li>
      );
    })}
  </ul>
  <div className="hidden overflow-x-auto rounded-2xl bg-white shadow-sm md:block">
    <table className="w-full border-separate border-spacing-0 text-sm">
      <thead>
        <tr>
          <th className="sticky left-0 top-0 z-30 min-w-[190px] border-b border-gray-100 bg-white px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-gray-500">
            Duty
          </th>
          {weeks.map((week) => (
            <th
              key={week.id}
              className="sticky top-0 z-10 border-b border-gray-100 bg-white px-3 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-gray-500"
            >
              Wk {week.weekNumber}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {ROTA_DUTIES.map((duty) => {
          const blocked = blockedDutyIds?.has(duty.id);
          return (
            <tr key={duty.id}>
              <th className="sticky left-0 z-20 border-b border-gray-100 bg-white px-4 py-3 text-left align-top">
                <div className="text-[13px] font-bold text-gray-900">{duty.name}</div>
                {duty.subLabel && (
                  <div className="text-[10.5px] font-medium text-gray-500">{duty.subLabel}</div>
                )}
                {blocked && (
                  <div className="mt-1 text-[10.5px] font-semibold text-red-600">
                    Overlaps another duty — editing disabled
                  </div>
                )}
              </th>
              {weeks.map((week) => {
                const key = cellKey(duty.id, week.id);
                const cell = grid.get(key);
                return (
                  <td key={week.id} className="border-b border-gray-100 px-3 py-3 align-top">
                    {cell && (
                      <RotaCell
                        cell={cell}
                        groupLabels={groupLabels}
                        labelOwners={labelOwners}
                        staged={staged.get(key)}
                        onStage={(value) => onStage(key, value)}
                        disabled={applying || blocked}
                      />
                    )}
                  </td>
                );
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
  </>
  );
};

export default RotaGrid;
