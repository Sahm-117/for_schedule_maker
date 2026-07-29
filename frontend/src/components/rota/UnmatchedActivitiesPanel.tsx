import React, { useState } from 'react';
import type { UnmatchedGroup } from '../../utils/rotaGrid';

interface UnmatchedActivitiesPanelProps {
  groups: UnmatchedGroup[];
  onOpenSchedule?: () => void;
}

/**
 * Activities that look like a duty but don't match one exactly — usually a typo or
 * spacing difference ("Prayer Watch Post ( Whatsapp)"), or a description that packs
 * several slots into one line.
 *
 * Read-only on purpose. The rota won't guess which duty a malformed description
 * belongs to; the fix is to correct the description in the Schedule, after which it
 * joins its duty row automatically. Descriptions render monospaced so the stray
 * spaces and hyphens are actually visible.
 */
const UnmatchedActivitiesPanel: React.FC<UnmatchedActivitiesPanelProps> = ({ groups, onOpenSchedule }) => {
  const [open, setOpen] = useState(false);

  if (groups.length === 0) return null;

  const total = groups.reduce((sum, g) => sum + g.count, 0);

  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="text-sm font-semibold text-gray-900">
          Not in the rota
          <span className="ml-2 rounded-full bg-amber-100/80 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
            {total}
          </span>
        </span>
        <span className="text-xs font-medium text-gray-500">{open ? 'Hide' : 'Show'}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-2">
          <p className="text-[13px] text-gray-600">
            These look like duties but their wording doesn't match any rota row, so they're left
            alone. Fix the description in the Schedule and they'll join their duty automatically.
          </p>
          {groups.map((group) => (
            <div key={group.description} className="rounded-xl bg-gray-50 px-3 py-2">
              <div className="font-mono text-[12px] text-gray-800">{group.description}</div>
              <div className="mt-0.5 text-[11.5px] text-gray-500">
                {group.count} {group.count === 1 ? 'activity' : 'activities'} · Week
                {group.weekNumbers.length === 1 ? ' ' : 's '}
                {group.weekNumbers.join(', ')}
              </div>
            </div>
          ))}
          {onOpenSchedule && (
            <button
              type="button"
              onClick={onOpenSchedule}
              className="text-[13px] font-semibold text-[var(--color-primary,#f97316)]"
            >
              Fix in Schedule →
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default UnmatchedActivitiesPanel;
