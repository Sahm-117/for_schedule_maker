import React from 'react';
import type { SupportChecklistItem } from '../../types';
import { isAdminChecklistTask } from '../../utils/checklist';

// Under a checklist item's label: a quiet "From admin" pill, the due day, and the
// note the support wrote when they ticked it. Renders nothing for their own duties.
const ChecklistTaskMeta: React.FC<{ item: SupportChecklistItem }> = ({ item }) => {
  const fromAdmin = isAdminChecklistTask(item);
  if (!fromAdmin && !item.dueDay && !item.completionNote) return null;
  return (
    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] text-gray-500">
      {fromAdmin && <span className="rounded-full bg-neutral-100 px-2 py-0.5 font-semibold text-neutral-600">From admin</span>}
      {item.dueDay && <span className="font-medium">Due {item.dueDay}</span>}
      {item.completionNote && <span className="w-full whitespace-pre-wrap text-gray-500">“{item.completionNote}”</span>}
    </span>
  );
};

export default ChecklistTaskMeta;
