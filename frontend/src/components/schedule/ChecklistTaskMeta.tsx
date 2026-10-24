import React from 'react';
import type { SupportChecklistItem } from '../../types';
import { isAdminChecklistTask, taskDueText } from '../../utils/checklist';
import { lagosTodayIso } from '../../utils/participantApp';

const TONE = { overdue: 'font-semibold text-red-700', today: 'font-semibold text-[#c2410c]', soon: 'font-medium' } as const;

// Under a checklist item's label: a quiet "From admin" pill, the deadline, and the
// note the support wrote when they ticked it. Renders nothing for their own tasks with no deadline.
const ChecklistTaskMeta: React.FC<{ item: SupportChecklistItem }> = ({ item }) => {
  const fromAdmin = isAdminChecklistTask(item);
  const due = taskDueText(item, lagosTodayIso(new Date()));
  if (!fromAdmin && !due && !item.completionNote) return null;
  return (
    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] text-gray-500">
      {fromAdmin && <span className="rounded-full bg-neutral-100 px-2 py-0.5 font-semibold text-neutral-600">From admin</span>}
      {due && <span className={TONE[due.tone]}>{due.text}</span>}
      {item.completionNote && <span className="w-full whitespace-pre-wrap text-gray-500">“{item.completionNote}”</span>}
    </span>
  );
};

export default ChecklistTaskMeta;
