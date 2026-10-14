import React, { useEffect, useState } from 'react';
import { Sheet } from '../groups/ParticipantCard';
import FaithProjectHistory from './FaithProjectHistory';
import Spinner from '../Spinner';
import { faithProjectsApi } from '../../services/api';
import { FAITH_PROJECT_STATUS_LABEL } from '../../utils/participantApp';
import type { FaithProject, FaithProjectVersion } from '../../types';

// A popover for one person's Faith Project that works from any page: give it a participant and it
// loads the project and its edit history itself. Read-only (a support edits the category from their
// own My Group card). Closes on the X, outside tap, or Close.

const CHIP: Record<string, string> = {
  NOT_DRAFTED: 'bg-[#f6f7f9] text-gray-500',
  SAVED: 'bg-[#f2fbf5] text-[#15803d]',
};

const FaithProjectPopover: React.FC<{ participant: { id: string; name: string } | null; onClose: () => void }> = ({ participant, onClose }) => {
  const [project, setProject] = useState<FaithProject | null>(null);
  const [versions, setVersions] = useState<FaithProjectVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!participant) return undefined;
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    setProject(null);
    setVersions([]);
    Promise.all([
      faithProjectsApi.getByParticipant(participant.id),
      faithProjectsApi.getVersions(participant.id).catch(() => null),
    ])
      .then(([projects, history]) => {
        if (cancelled) return;
        setProject(projects.projects[0] ?? null);
        setVersions(history?.versions ?? []);
      })
      .catch(() => { if (!cancelled) setFailed(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [participant?.id]);

  if (!participant) return null;
  const status = project?.status ?? 'NOT_DRAFTED';
  const firstName = participant.name.trim().split(/\s+/)[0] || 'The participant';

  return (
    <Sheet
      open
      onClose={onClose}
      title={participant.name}
      subtitle="Faith project"
      headerExtra={!loading && !failed ? (
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {project?.categoryName && <span className="rounded-full bg-[#eef2f7] px-2.5 py-1 text-[11px] font-bold text-[#4b5563]">{project.categoryName}</span>}
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${CHIP[status] ?? CHIP.NOT_DRAFTED}`}>{FAITH_PROJECT_STATUS_LABEL[status as keyof typeof FAITH_PROJECT_STATUS_LABEL] ?? status}</span>
        </div>
      ) : undefined}
    >
      {loading ? (
        <div className="flex justify-center py-10"><Spinner /></div>
      ) : failed ? (
        <p className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-600">Could not load this Faith Project. Close this and try again.</p>
      ) : (
        <>
          <div className="whitespace-pre-wrap rounded-[14px] border border-[#ffdeca] bg-[#fff8f3] p-3.5 text-[14.5px] leading-relaxed text-gray-800">
            {project?.body?.trim() || 'Nothing saved yet.'}
          </div>
          <p className="mt-2 text-[12.5px] text-gray-400">{firstName} edits this themselves.</p>
          <FaithProjectHistory className="mt-3" versions={versions} participantLabel={firstName} />
        </>
      )}
    </Sheet>
  );
};

export default FaithProjectPopover;
