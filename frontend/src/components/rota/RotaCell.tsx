import React from 'react';
import AppSelect from '../AppSelect';
import type { Label } from '../../types';
import { describeOwners, type LabelOwners, type RotaCell as RotaCellData } from '../../utils/rotaGrid';

export const CLEAR_OPTION = '__rota_clear__';

interface RotaCellProps {
  cell: RotaCellData;
  groupLabels: Label[];
  labelOwners: LabelOwners;
  /** Staged (not yet applied) selection: label id, or CLEAR_OPTION, or undefined. */
  staged: string | undefined;
  onStage: (value: string | undefined) => void;
  disabled?: boolean;
}

// Smooth Pill palette — soft surface, saturated text, no border.
const STATE_CHIP: Record<RotaCellData['state'], string> = {
  empty: 'bg-neutral-100 text-neutral-600',
  unassigned: 'bg-neutral-100 text-neutral-600',
  assigned: 'bg-emerald-100/80 text-emerald-700',
  partial: 'bg-amber-100/80 text-amber-700',
  mixed: 'bg-amber-100/80 text-amber-700',
};

const RotaCell: React.FC<RotaCellProps> = ({ cell, groupLabels, labelOwners, staged, onStage, disabled }) => {
  if (cell.state === 'empty') {
    return (
      <span className="text-xs text-gray-400" title="No activity this week matches this duty">
        —
      </span>
    );
  }

  const currentValue = staged ?? cell.assignedLabelId ?? '';
  const isStaged = staged !== undefined;

  const options = [
    { value: CLEAR_OPTION, label: '— None (clear)', meta: 'Removes labels — no reminders this week' },
    ...groupLabels.map((label) => ({
      value: label.id,
      label: label.name,
      meta: describeOwners(labelOwners.get(label.id)),
    })),
  ];

  const summary = () => {
    if (isStaged) {
      if (staged === CLEAR_OPTION) return 'Will clear';
      return groupLabels.find((l) => l.id === staged)?.name || 'Will change';
    }
    if (cell.state === 'mixed') return `Mixed (${cell.groupLabels.length})`;
    if (cell.state === 'partial') {
      const assigned = cell.activityIds.length - cell.unassignedCount;
      return `${cell.groupLabels[0].label.name} · ${assigned} of ${cell.activityIds.length}`;
    }
    if (cell.state === 'assigned') return cell.groupLabels[0].label.name;
    return '— add';
  };

  const owners = cell.assignedLabelId ? labelOwners.get(cell.assignedLabelId) : undefined;
  const chipClass = isStaged ? 'bg-sky-100/80 text-sky-700' : STATE_CHIP[cell.state];

  // Tooltip carries the detail that won't fit in the chip: who is actually
  // notified, and the per-label breakdown when a cell is mixed.
  const title = [
    `${cell.activityIds.length} matching ${cell.activityIds.length === 1 ? 'activity' : 'activities'}`,
    cell.groupLabels.length > 0
      ? cell.groupLabels.map((g) => `${g.label.name}: ${g.count}`).join(' · ')
      : 'No group label assigned',
    owners && owners.length > 0 ? `Notifies: ${owners.map((o) => o.name).join(', ')}` : null,
    cell.foreignLabels.length > 0
      ? `Warning: ${cell.foreignLabels.length} other label(s) would be removed`
      : null,
  ]
    .filter(Boolean)
    .join('\n');

  // Only show a status chip when it says something the dropdown cannot: a staged
  // edit, a mixed/partial cell, or a destructive warning. For a plain assigned or
  // empty cell the dropdown already shows the name, so a chip would just repeat it.
  const chipText = isStaged || cell.state === 'mixed' || cell.state === 'partial' ? summary() : null;

  return (
    <div className="min-w-[150px] space-y-1">
      {(chipText || cell.foreignLabels.length > 0) && (
        <div className="flex items-center gap-1.5">
          {chipText && (
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${chipClass}`}
              title={title}
            >
              {chipText}
            </span>
          )}
          {cell.foreignLabels.length > 0 && (
            <span
              className="h-1.5 w-1.5 rounded-full bg-red-500"
              title={`${cell.foreignLabels.length} non-duty label(s) on these activities will be removed`}
            />
          )}
        </div>
      )}
      <AppSelect
        value={currentValue}
        onChange={(value) => onStage(value === (cell.assignedLabelId ?? '') ? undefined : value)}
        options={options}
        placeholder="— add"
        compact
        loading={disabled}
      />
      {!isStaged && cell.state === 'assigned' && owners && owners.length !== 1 && (
        <div className="text-[10.5px] font-medium text-amber-700" title={title}>
          {owners.length === 0 ? 'No user — silent' : `Shared · ${owners.length} people`}
        </div>
      )}
    </div>
  );
};

export default RotaCell;
