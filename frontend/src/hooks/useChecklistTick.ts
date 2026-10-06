import { useCallback, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { supportChecklistApi } from '../services/api';
import type { SupportChecklistItem } from '../types';
import { isAdminChecklistTask } from '../utils/checklist';

/**
 * Ticking a checklist item, shared by Home and the Schedule page's Checklist tab.
 * Ticking a task an admin set first asks for an optional note (the caller renders
 * TaskNoteSheet from the returned noteTask); unticking and a support's own duties
 * save straight away. The change shows at once and is rolled back if saving fails.
 */
export const useChecklistTick = (
  setChecklist: Dispatch<SetStateAction<SupportChecklistItem[]>>,
  autoHide: { start: (id: string) => void; cancel: (id: string) => void },
  onError?: (message: string) => void,
) => {
  const [noteTask, setNoteTask] = useState<SupportChecklistItem | null>(null);

  const toggle = useCallback(async (item: SupportChecklistItem, note?: string) => {
    if (!item.done && isAdminChecklistTask(item) && note === undefined) { setNoteTask(item); return; }
    const savedNote = !item.done ? (note?.trim() || null) : null;
    setChecklist((prev) => prev.map((entry) => entry.id === item.id ? { ...entry, done: !item.done, completionNote: savedNote } : entry));
    if (item.done) autoHide.cancel(item.id); else autoHide.start(item.id);
    try {
      await supportChecklistApi.setDone(item.id, !item.done, savedNote);
    } catch (error) {
      autoHide.cancel(item.id);
      setChecklist((prev) => prev.map((entry) => entry.id === item.id ? { ...entry, done: item.done, completionNote: item.completionNote ?? null } : entry));
      onError?.(error instanceof Error ? error.message : 'That could not be updated.');
    }
  }, [setChecklist, autoHide, onError]);

  const cancelNote = useCallback(() => setNoteTask(null), []);
  const saveNote = useCallback((note: string) => {
    const target = noteTask;
    setNoteTask(null);
    if (target) void toggle(target, note);
  }, [noteTask, toggle]);

  return { toggle, noteTask, cancelNote, saveNote };
};
