import React from 'react';
import AppMultiSelect from '../AppMultiSelect';
import type { Label } from '../../types';
import { describeOwners, type LabelOwners, type RotaCell as RotaCellData } from '../../utils/rotaGrid';
import LabelBadgePopover from './LabelBadgePopover';

interface RotaCellProps {
  cell: RotaCellData;
  groupLabels: Label[];
  labelOwners: LabelOwners;
  /** Staged (not yet applied) selection: label ids, or undefined if untouched. Empty array clears. */
  staged: string[] | undefined;
  onStage: (value: string[] | undefined) => void;
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

  const assignedLabelIds = cell.groupLabels.map((g) => g.label.id);
  const currentValues = staged ?? assignedLabelIds;
  const isStaged = staged !== undefined;

  const options = groupLabels.map((label) => ({
    value: label.id,
    label: label.name,
    meta: describeOwners(labelOwners.get(label.id)),
  }));

  const namesFor = (ids: string[]) =>
    ids.map((id) => groupLabels.find((l) => l.id === id)?.name || id);

  const currentNames = namesFor(currentValues);
  const isStagedEmpty = isStaged && currentValues.length === 0;
  const chipClass = isStaged ? 'bg-sky-100/80 text-sky-700' : STATE_CHIP[cell.state];

  // Only show a status chip when it says something the dropdown cannot: a staged
  // edit, a mixed/partial cell, or a destructive warning.
  const showChip = isStaged || cell.state === 'mixed' || cell.state === 'partial';

  const chipText = () => {
    if (isStagedEmpty) return 'Will clear';
    if (isStaged) return currentNames[0] || 'Will change';
    if (cell.state === 'partial') {
      const assigned = cell.activityIds.length - cell.unassignedCount;
      return `${cell.groupLabels[0].label.name} · ${assigned} of ${cell.activityIds.length}`;
    }
    return currentNames[0] || '— add';
  };

  const extraCount = currentNames.length - 1;
  const popoverItems = currentValues.map((id) => ({
    id,
    name: groupLabels.find((l) => l.id === id)?.name || id,
    meta: describeOwners(labelOwners.get(id)),
  }));

  // Tooltip carries detail that won't fit in the chip: who is actually notified,
  // and the per-label breakdown when a cell carries more than one label.
  const title = [
    `${cell.activityIds.length} matching ${cell.activityIds.length === 1 ? 'activity' : 'activities'}`,
    cell.groupLabels.length > 0
      ? cell.groupLabels.map((g) => `${g.label.name}: ${g.count}`).join(' · ')
      : 'No group label assigned',
    cell.foreignLabels.length > 0
      ? `Warning: ${cell.foreignLabels.length} other label(s) would be removed`
      : null,
  ]
    .filter(Boolean)
    .join('\n');

  return (
    <div className="min-w-[150px] space-y-1">
      {(showChip || extraCount > 0 || cell.foreignLabels.length > 0) && (
        <div className="flex items-center gap-1.5">
          {showChip && (
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${chipClass}`}
              title={title}
            >
              {chipText()}
            </span>
          )}
          {!isStagedEmpty && extraCount > 0 && (
            <LabelBadgePopover
              badgeText={`+${extraCount}`}
              badgeClassName={chipClass}
              items={popoverItems}
              title="Assigned supports"
            />
          )}
          {cell.foreignLabels.length > 0 && (
            <span
              className="h-1.5 w-1.5 rounded-full bg-red-500"
              title={`${cell.foreignLabels.length} non-duty label(s) on these activities will be removed`}
            />
          )}
        </div>
      )}
      <AppMultiSelect
        values={currentValues}
        onChange={(next) => {
          const sameAsAssigned =
            next.length === assignedLabelIds.length && next.every((v) => assignedLabelIds.includes(v));
          onStage(sameAsAssigned ? undefined : next);
        }}
        options={options}
        placeholder="— add"
        compact
        disabled={disabled}
      />
    </div>
  );
};

export default RotaCell;
