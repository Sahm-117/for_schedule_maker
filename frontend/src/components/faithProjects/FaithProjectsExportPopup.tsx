import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { FaithProject, Group, Participant } from '../../types';

interface FaithProjectsExportPopupProps {
  groups: Group[];
  participants: Participant[];
  projectByParticipant: Map<string, FaithProject>;
  cohortName: string;
  onClose: () => void;
}

const STATUS_LABEL: Record<string, string> = {
  NOT_DRAFTED: 'Not Drafted',
  AWAITING_DRAFT: 'Awaiting Draft',
  UNDER_REFINEMENT: 'Under Refinement',
  NEEDS_REFINEMENT: 'Needs Refinement',
  APPROVED: 'Approved',
};

const truncate = (text: string, max = 56) =>
  text.length > max ? `${text.slice(0, max)}…` : text;

const buildExportText = (
  groups: Group[],
  participants: Participant[],
  projectByParticipant: Map<string, FaithProject>,
  selectedGroupIds: Set<string>,
  includeUnassigned: boolean,
  notDraftedOnly: boolean,
  cohortName: string,
): string => {
  const filtered = participants.filter((p) => {
    const inGroup = p.groupId
      ? selectedGroupIds.has(p.groupId)
      : includeUnassigned;
    if (!inGroup) return false;
    if (notDraftedOnly) {
      const fp = projectByParticipant.get(p.id);
      return (fp?.status ?? 'NOT_DRAFTED') === 'NOT_DRAFTED';
    }
    return true;
  });

  const byGroup = new Map<string, Participant[]>();
  const unassigned: Participant[] = [];
  for (const p of filtered) {
    if (p.groupId) {
      const list = byGroup.get(p.groupId) ?? [];
      list.push(p);
      byGroup.set(p.groupId, list);
    } else {
      unassigned.push(p);
    }
  }

  const lines: string[] = [];
  lines.push(`── Faith Projects — ${cohortName} ──`);
  lines.push('');

  const sortedGroupIds = [...byGroup.keys()].sort((a, b) => {
    const ga = groups.find((g) => g.id === a);
    const gb = groups.find((g) => g.id === b);
    return (ga?.name ?? '').localeCompare(gb?.name ?? '');
  });

  for (const gid of sortedGroupIds) {
    const g = groups.find((gr) => gr.id === gid);
    if (!g) continue;
    const members = byGroup.get(gid) ?? [];
    const supportName = g.supportName || 'No support assigned';
    lines.push(`${g.name} — Support: ${supportName}`);
    for (const p of members) {
      const fp = projectByParticipant.get(p.id) ?? null;
      const preview = (!fp || fp.status === 'NOT_DRAFTED')
        ? 'Not drafted'
        : truncate(fp.title || fp.body || '', 56);
      const status = STATUS_LABEL[fp?.status ?? 'NOT_DRAFTED'] ?? fp?.status ?? 'Not Drafted';
      lines.push(`  ${p.fullName.padEnd(20)}│ ${preview.padEnd(56)}│ ${status}`);
    }
    lines.push('');
  }

  if (unassigned.length > 0 && includeUnassigned) {
    lines.push('Unassigned — Support: —');
    for (const p of unassigned) {
      const fp = projectByParticipant.get(p.id) ?? null;
      const preview = (!fp || fp.status === 'NOT_DRAFTED')
        ? 'Not drafted'
        : truncate(fp.title || fp.body || '', 56);
      const status = STATUS_LABEL[fp?.status ?? 'NOT_DRAFTED'] ?? fp?.status ?? 'Not Drafted';
      lines.push(`  ${p.fullName.padEnd(20)}│ ${preview.padEnd(56)}│ ${status}`);
    }
    lines.push('');
  }

  return lines.join('\n');
};

const FaithProjectsExportPopup: React.FC<FaithProjectsExportPopupProps> = ({
  groups,
  participants,
  projectByParticipant,
  cohortName,
  onClose,
}) => {
  const [copied, setCopied] = useState(false);
  const [notDraftedOnly, setNotDraftedOnly] = useState(false);
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(new Set());
  const [includeUnassigned, setIncludeUnassigned] = useState(true);

  const sortedGroups = useMemo(
    () => [...groups].sort((a, b) => a.name.localeCompare(b.name)),
    [groups],
  );

  const unassignedCount = useMemo(
    () => participants.filter((p) => !p.groupId).length,
    [participants],
  );

  const allSelected = sortedGroups.every((g) => selectedGroupIds.has(g.id)) && includeUnassigned;

  const selectAll = () => {
    const next = new Set<string>();
    sortedGroups.forEach((g) => next.add(g.id));
    setSelectedGroupIds(next);
    setIncludeUnassigned(true);
  };

  const deselectAll = () => {
    setSelectedGroupIds(new Set());
    setIncludeUnassigned(false);
  };

  const toggleGroup = (gid: string) => {
    const next = new Set(selectedGroupIds);
    if (next.has(gid)) {
      next.delete(gid);
    } else {
      next.add(gid);
    }
    setSelectedGroupIds(next);
  };

  const text = useMemo(
    () => buildExportText(groups, participants, projectByParticipant, selectedGroupIds, includeUnassigned, notDraftedOnly, cohortName),
    [groups, participants, projectByParticipant, selectedGroupIds, includeUnassigned, notDraftedOnly, cohortName],
  );

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

  return createPortal(
    <div className="fixed inset-0 z-[130] flex items-end justify-center sm:items-center" onClick={onClose}>
      <div className="absolute inset-0 bg-slate-900/35" />
      <div
        className="relative mb-0 flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-t-[28px] bg-white pb-8 shadow-[0_-8px_40px_rgba(15,23,42,0.15)] sm:mb-0 sm:rounded-[28px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-gray-200 sm:hidden" />
        <div className="flex items-center justify-between border-b border-orange-100 px-5 py-4">
          <h3 className="text-lg font-bold text-gray-900">Export faith projects</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Filters */}
        <div className="shrink-0 space-y-3 border-b border-orange-100 px-5 py-3">
          <label className="flex items-center gap-2.5">
            <input
              type="checkbox"
              checked={notDraftedOnly}
              onChange={() => setNotDraftedOnly((v) => !v)}
              className="h-4 w-4 rounded border-orange-300 text-primary focus:ring-primary/30"
            />
            <span className="text-sm font-semibold text-gray-700">Not drafted only</span>
          </label>
        </div>

        {/* Group checklist */}
        <div className="shrink-0 border-b border-orange-100 px-5 py-2">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Groups</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={selectAll}
                className="text-xs font-semibold text-primary hover:text-primary-dark"
              >
                Select all
              </button>
              <button
                type="button"
                onClick={deselectAll}
                className="text-xs font-semibold text-gray-500 hover:text-gray-700"
              >
                Deselect all
              </button>
            </div>
          </div>
          <div className="max-h-40 overflow-y-auto">
            <div className="space-y-1">
              {sortedGroups.map((g) => (
                <label
                  key={g.id}
                  className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-orange-50"
                >
                  <input
                    type="checkbox"
                    checked={selectedGroupIds.has(g.id)}
                    onChange={() => toggleGroup(g.id)}
                    className="h-4 w-4 rounded border-orange-300 text-primary focus:ring-primary/30"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-800">{g.name}</p>
                    <p className="truncate text-xs text-gray-500">
                      {g.supportName || 'No support assigned'}
                    </p>
                  </div>
                </label>
              ))}
              {unassignedCount > 0 && (
                <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-orange-50">
                  <input
                    type="checkbox"
                    checked={includeUnassigned}
                    onChange={() => setIncludeUnassigned((v) => !v)}
                    className="h-4 w-4 rounded border-orange-300 text-primary focus:ring-primary/30"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-800">Unassigned</p>
                    <p className="text-xs text-gray-500">{unassignedCount} participant{unassignedCount !== 1 ? 's' : ''}</p>
                  </div>
                </label>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="shrink-0 px-5 py-3">
          <button
            type="button"
            onClick={() => { void copyAll(); }}
            disabled={!text.trim()}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-white transition hover:bg-primary-dark active:scale-[0.98] disabled:opacity-50"
          >
            {copied ? 'Copied!' : 'Copy to clipboard'}
          </button>
          <p className="mt-2 text-center text-xs text-gray-400">Formatted for WhatsApp or chat — paste anywhere.</p>
        </div>

        {/* Preview */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5">
          {text.trim() ? (
            <pre className="whitespace-pre-wrap break-words rounded-2xl border border-orange-100 bg-orange-50/40 p-3 text-xs leading-relaxed text-gray-700">
              {text}
            </pre>
          ) : (
            <p className="py-8 text-center text-sm text-gray-500">
              Select at least one group to generate an export.
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default FaithProjectsExportPopup;
