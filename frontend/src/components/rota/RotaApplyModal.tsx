import React from 'react';
import ModalShell from '../followups/ModalShell';
import type { Label } from '../../types';
import { describeOwners, type LabelOwners, type RotaCell } from '../../utils/rotaGrid';
import { ROTA_DUTIES } from '../../config/rotaDuties';
import { CLEAR_OPTION } from './RotaCell';

export interface StagedChange {
  key: string;
  cell: RotaCell;
  /** Target label id, or CLEAR_OPTION to remove all labels. */
  value: string;
}

interface RotaApplyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  changes: StagedChange[];
  groupLabels: Label[];
  labelOwners: LabelOwners;
  applying: boolean;
  error?: string;
}

const dutyName = (dutyId: string) => ROTA_DUTIES.find((d) => d.id === dutyId)?.name || dutyId;

/**
 * Shows exactly what a save will do before it happens.
 *
 * This step is deliberately mandatory. The write replaces every label on the
 * matched activities, and reminder notifications are live — so an unreviewed bulk
 * change pushes to real people. Destructive rows are called out individually.
 */
const RotaApplyModal: React.FC<RotaApplyModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  changes,
  groupLabels,
  labelOwners,
  applying,
  error,
}) => {
  const labelName = (id: string) => groupLabels.find((l) => l.id === id)?.name || id;

  const totalActivities = changes.reduce((sum, c) => sum + c.cell.activityIds.length, 0);
  const notifiedNames = new Set<string>();
  for (const change of changes) {
    if (change.value === CLEAR_OPTION) continue;
    for (const owner of labelOwners.get(change.value) || []) notifiedNames.add(owner.name);
  }

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title="Review rota changes"
      subtitle={`${changes.length} ${changes.length === 1 ? 'cell' : 'cells'} · ${totalActivities} activities affected`}
      wide
      footer={
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={applying}
            className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={applying || changes.length === 0}
            className="rounded-xl bg-[var(--color-primary,#f97316)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {applying ? 'Applying…' : 'Apply changes'}
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        {notifiedNames.size > 0 && (
          <p className="rounded-xl bg-sky-50 px-3 py-2 text-[13px] text-sky-800">
            After applying, reminders for these activities go to:{' '}
            <strong>{[...notifiedNames].join(', ')}</strong>.
          </p>
        )}

        {changes.map(({ key, cell, value }) => {
          const clearing = value === CLEAR_OPTION;
          const owners = clearing ? [] : labelOwners.get(value) || [];
          const destructive = cell.state === 'mixed' || clearing || cell.foreignLabels.length > 0;

          return (
            <div
              key={key}
              className={`rounded-xl px-3 py-2.5 text-[13px] ${destructive ? 'bg-amber-50' : 'bg-gray-50'}`}
            >
              <div className="font-semibold text-gray-900">
                {dutyName(cell.dutyId)} · Week {cell.weekNumber}
              </div>
              <div className="mt-0.5 text-gray-600">
                {cell.activityIds.length} {cell.activityIds.length === 1 ? 'activity' : 'activities'} ·{' '}
                {cell.groupLabels.length === 0
                  ? 'currently unassigned'
                  : cell.groupLabels.map((g) => `${g.label.name} (${g.count})`).join(', ')}
                {' → '}
                <strong>{clearing ? 'no label — goes silent' : labelName(value)}</strong>
              </div>

              {cell.state === 'mixed' && (
                <div className="mt-1 font-medium text-amber-700">
                  This replaces {cell.groupLabels.length} different assignments with one.
                </div>
              )}
              {cell.foreignLabels.length > 0 && (
                <div className="mt-1 font-medium text-red-600">
                  Will also remove: {cell.foreignLabels.map((l) => l.name).join(', ')}
                </div>
              )}
              {!clearing && (
                <div className={`mt-1 ${owners.length === 1 ? 'text-gray-500' : 'font-medium text-amber-700'}`}>
                  {describeOwners(owners)}
                </div>
              )}
            </div>
          );
        })}

        {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-[13px] text-red-700">{error}</p>}
      </div>
    </ModalShell>
  );
};

export default RotaApplyModal;
