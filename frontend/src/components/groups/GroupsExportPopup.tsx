import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import type { Group, Participant } from '../../types';
import { buildAllGroupsText, buildGroupBlock, buildGroupsHeader } from '../../utils/whatsappExport';

interface GroupsExportPopupProps {
  groups: Group[];
  membersByGroupId: Map<string, Participant[]>;
  cohortName: string;
  unassignedParticipants: number;
  onClose: () => void;
}

const GroupsExportPopup: React.FC<GroupsExportPopupProps> = ({ groups, membersByGroupId, cohortName, unassignedParticipants, onClose }) => {
  const [copiedAll, setCopiedAll] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyAll = async () => {
    try {
      const header = buildGroupsHeader(cohortName, groups, membersByGroupId, unassignedParticipants);
      await navigator.clipboard.writeText(buildAllGroupsText(groups, membersByGroupId, header));
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2000);
    } catch { /* ignore */ }
  };

  const copyOne = async (g: Group) => {
    try {
      await navigator.clipboard.writeText(buildGroupBlock(g, membersByGroupId.get(g.id) ?? []));
      setCopiedId(g.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch { /* ignore */ }
  };

  return createPortal(
    <div className="fixed inset-0 z-[130] flex items-end justify-center sm:items-center" onClick={onClose}>
      <div className="absolute inset-0 bg-slate-900/35" />
      <div className="relative mb-0 max-h-[80vh] w-full max-w-md overflow-hidden rounded-t-[28px] bg-white pb-8 shadow-[0_-8px_40px_rgba(15,23,42,0.15)] sm:mb-0 sm:rounded-[28px]" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mt-3 h-1 w-10 rounded-full bg-gray-200 sm:hidden" />
        <div className="flex items-center justify-between border-b border-orange-100 px-5 py-4">
          <h3 className="text-lg font-bold text-gray-900">Export groups</h3>
          <button type="button" onClick={onClose} className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="px-5 py-3">
          <button
            type="button"
            onClick={() => { void copyAll(); }}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-white transition hover:bg-primary-dark active:scale-[0.98]"
          >
            {copiedAll ? 'Copied!' : `Copy all (${groups.length} groups)`}
          </button>
          <p className="mt-2 text-center text-xs text-gray-400">Formatted for WhatsApp — paste straight into a chat.</p>
        </div>

        <div className="max-h-[50vh] overflow-y-auto px-5">
          {groups.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">No groups to export.</p>
          ) : (
            <div className="divide-y divide-orange-50">
              {groups.map((g) => {
                const count = (membersByGroupId.get(g.id) ?? []).length;
                return (
                  <div key={g.id} className="flex items-center justify-between py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-gray-900">{g.name}</p>
                      <p className="truncate text-xs text-gray-500">{g.supportName || 'No support assigned'} · {count} {count === 1 ? 'member' : 'members'}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => { void copyOne(g); }}
                      className="ml-3 shrink-0 rounded-lg border border-orange-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-600 transition hover:bg-orange-50 active:scale-95"
                    >
                      {copiedId === g.id ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default GroupsExportPopup;
