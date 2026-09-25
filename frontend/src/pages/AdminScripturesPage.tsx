import React, { useEffect, useRef, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  DragOverlay,
  closestCenter,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import PageHeader from '../components/PageHeader';
import ConfirmationModal from '../components/ConfirmationModal';
import SaveStatus, { type SaveState } from '../components/SaveStatus';
import { useToast } from '../components/Toast';
import { useAuth } from '../hooks/useAuth';
import { scripturesApi, settingsApi } from '../services/api';
import type { Scripture } from '../types';

// Daily Inspirational Scripture designs for the participant app. Posts show in
// the order below, one per FOF day starting from "First post shows on day N".
// Uploads are resized in the browser first to keep storage and data use small.

const MAX_WIDTH = 1080;
const QUALITY = 0.82;

// Resize to at most 1080px wide and re-encode as WebP (JPEG where WebP isn't supported).
const shrinkImage = (file: File): Promise<Blob> => new Promise((resolve, reject) => {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    const scale = Math.min(1, MAX_WIDTH / img.naturalWidth);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) { URL.revokeObjectURL(url); reject(new Error('Could not read this image.')); return; }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);
    canvas.toBlob((webp) => {
      if (webp && webp.type === 'image/webp') { resolve(webp); return; }
      canvas.toBlob((jpeg) => (jpeg ? resolve(jpeg) : reject(new Error('Could not compress this image.'))), 'image/jpeg', QUALITY);
    }, 'image/webp', QUALITY);
  };
  img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read this image.')); };
  img.src = url;
});

interface PendingUpload {
  key: string;
  file: File;
  preview: string;
  day: string; // the position it will be appended at; not editable
  status: 'ready' | 'uploading' | 'done' | 'error';
  error?: string;
}

const dayFromName = (name: string) => {
  const match = name.replace(/\.[^.]+$/, '').match(/^\s*(\d{1,3})\s*$/);
  return match ? match[1] : '';
};

// "1st", "2nd", "3rd", "4th", ...
const ordinal = (n: number) => {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
};

const arrayMove = <T,>(list: T[], from: number, to: number): T[] => {
  const copy = list.slice();
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
};

// ── Draggable, droppable scripture card ─────────────────────────────────────

interface CardProps {
  scripture: Scripture;
  position: number;
  onReplace: () => void;
  onRemove: () => void;
}

const ScriptureCard: React.FC<CardProps> = ({ scripture, position, onReplace, onRemove }) => {
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({ id: scripture.id });
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: scripture.id });
  const setRefs = (node: HTMLDivElement | null) => { setDragRef(node); setDropRef(node); };

  return (
    <div
      ref={setRefs}
      {...attributes}
      {...listeners}
      style={{ touchAction: 'none' }}
      className={`surface-card cursor-grab p-2 active:cursor-grabbing ${isDragging ? 'opacity-30' : ''} ${isOver && !isDragging ? 'ring-2 ring-primary' : ''}`}
    >
      <img src={scripture.imageUrl} alt={`Scripture, ${ordinal(position)} post`} className="aspect-[4/5] w-full rounded-xl bg-gray-50 object-cover" loading="lazy" draggable={false} />
      <div className="mt-2 flex items-center gap-2 px-1">
        <span className="text-sm font-semibold text-gray-900">{ordinal(position)}</span>
        <button type="button" onClick={(e) => { e.stopPropagation(); onReplace(); }} className="ml-auto text-xs font-semibold text-primary">Replace</button>
        <button type="button" onClick={(e) => { e.stopPropagation(); onRemove(); }} className="text-xs font-semibold text-red-700">Remove</button>
      </div>
    </div>
  );
};

const AdminScripturesPage: React.FC = () => {
  const { user } = useAuth();
  const toast = useToast();
  const [scriptures, setScriptures] = useState<Scripture[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const [uploading, setUploading] = useState(false);
  const [toDelete, setToDelete] = useState<Scripture | null>(null);
  const [replaceDay, setReplaceDay] = useState<number | null>(null);
  const addInput = useRef<HTMLInputElement>(null);
  const replaceInput = useRef<HTMLInputElement>(null);

  const [startDay, setStartDay] = useState('1');
  const [startDaySaveState, setStartDaySaveState] = useState<SaveState | undefined>();
  const savedStartDay = useRef('1');

  const [orderSaveState, setOrderSaveState] = useState<SaveState | undefined>();
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor)
  );

  const load = async () => {
    try {
      const [{ scriptures: list }, day] = await Promise.all([scripturesApi.getAll(), settingsApi.getScriptureStartDay()]);
      setScriptures(list);
      setStartDay(String(day));
      savedStartDay.current = String(day);
    } catch (err) {
      toast({ message: err instanceof Error ? err.message : 'Could not load scriptures.', tone: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const saveStartDay = async () => {
    const parsed = Number(startDay);
    if (!(parsed > 0) || String(parsed) === savedStartDay.current) {
      setStartDay(savedStartDay.current);
      return;
    }
    setStartDaySaveState('saving');
    try {
      await settingsApi.setScriptureStartDay(parsed);
      savedStartDay.current = String(parsed);
      setStartDaySaveState('saved');
      setTimeout(() => setStartDaySaveState((s) => (s === 'saved' ? undefined : s)), 2000);
    } catch (err) {
      toast({ message: err instanceof Error ? err.message : 'Could not save the start day.', tone: 'error' });
      setStartDay(savedStartDay.current);
      setStartDaySaveState('error');
    }
  };

  // New uploads always append after the last position; files named with a
  // number still sort by it, but the number itself is no longer used as the
  // stored position.
  const addFiles = (files: FileList | null) => {
    if (!files?.length) return;
    const maxExisting = scriptures.reduce((m, s) => Math.max(m, s.dayNumber), 0);
    const maxPending = pending.reduce((m, p) => Math.max(m, Number(p.day) || 0), 0);
    let next = Math.max(maxExisting, maxPending) + 1;
    const items = Array.from(files)
      .sort((a, b) => (Number(dayFromName(a.name)) || Infinity) - (Number(dayFromName(b.name)) || Infinity))
      .map((file, index) => ({ key: `${Date.now()}-${index}-${file.name}`, file, preview: URL.createObjectURL(file), day: String(next++), status: 'ready' as const }));
    setPending((prev) => [...prev, ...items]);
  };

  const uploadAll = async () => {
    if (!user) return;
    setUploading(true);
    let uploaded = 0;
    for (const item of pending) {
      if (item.status === 'done') continue;
      setPending((prev) => prev.map((p) => (p.key === item.key ? { ...p, status: 'uploading', error: undefined } : p)));
      try {
        const image = await shrinkImage(item.file);
        const { scripture } = await scripturesApi.upload(Number(item.day), image, user.id);
        setScriptures((prev) => [...prev.filter((s) => s.dayNumber !== scripture.dayNumber), scripture].sort((a, b) => a.dayNumber - b.dayNumber));
        setPending((prev) => prev.map((p) => (p.key === item.key ? { ...p, status: 'done' } : p)));
        uploaded += 1;
      } catch (err) {
        setPending((prev) => prev.map((p) => (p.key === item.key ? { ...p, status: 'error', error: err instanceof Error ? err.message : 'Upload failed' } : p)));
      }
    }
    setUploading(false);
    setPending((prev) => {
      const left = prev.filter((p) => p.status !== 'done');
      prev.filter((p) => p.status === 'done').forEach((p) => URL.revokeObjectURL(p.preview));
      return left;
    });
    if (uploaded > 0) toast({ message: `${uploaded} scripture${uploaded === 1 ? '' : 's'} uploaded` });
  };

  const replace = async (file: File | undefined) => {
    if (!file || !user || replaceDay === null) return;
    const day = replaceDay;
    setReplaceDay(null);
    try {
      const { scripture } = await scripturesApi.upload(day, await shrinkImage(file), user.id);
      setScriptures((prev) => [...prev.filter((s) => s.dayNumber !== day), scripture].sort((a, b) => a.dayNumber - b.dayNumber));
      toast({ message: `${ordinal(day)} post replaced` });
    } catch (err) {
      toast({ message: err instanceof Error ? err.message : 'Could not replace this design.', tone: 'error' });
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    const target = toDelete;
    setToDelete(null);
    try {
      await scripturesApi.remove(target);
      const remaining = scriptures.filter((s) => s.id !== target.id);
      // Close the gap so positions stay contiguous (1..N).
      if (remaining.length > 0) {
        await scripturesApi.reorder(remaining.map((s) => s.id));
      }
      setScriptures(remaining.map((s, i) => ({ ...s, dayNumber: i + 1 })));
      toast({ message: 'Scripture removed' });
    } catch (err) {
      toast({ message: err instanceof Error ? err.message : 'Could not remove this design.', tone: 'error' });
    }
  };

  const handleDragStart = (event: DragStartEvent) => setActiveId(String(event.active.id));

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = scriptures.findIndex((s) => s.id === active.id);
    const newIndex = scriptures.findIndex((s) => s.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(scriptures, oldIndex, newIndex);
    setScriptures(reordered);
    setOrderSaveState('saving');
    try {
      await scripturesApi.reorder(reordered.map((s) => s.id));
      setScriptures(reordered.map((s, i) => ({ ...s, dayNumber: i + 1 })));
      setOrderSaveState('saved');
      setTimeout(() => setOrderSaveState((s) => (s === 'saved' ? undefined : s)), 2000);
    } catch (err) {
      toast({ message: err instanceof Error ? err.message : 'Could not save the new order.', tone: 'error' });
      setOrderSaveState('error');
      void load();
    }
  };

  const activeScripture = activeId ? scriptures.find((s) => s.id === activeId) : null;

  return (
    <div>
      <PageHeader
        title="Scriptures"
        tourId="admin:scriptures"
        subtitle="The daily Inspirational Scripture on the participant Home. Drag to reorder; the first post shows from 2:00 PM on the FOF day set below, then one more each day."
        action={(
          <button type="button" onClick={() => addInput.current?.click()} className="rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-white active:scale-95">
            + Upload
          </button>
        )}
      />
      <input ref={addInput} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
      <input ref={replaceInput} type="file" accept="image/*" className="hidden" onChange={(e) => { void replace(e.target.files?.[0]); e.target.value = ''; }} />

      <section className="surface-card mb-6 flex flex-wrap items-center gap-3 p-5">
        <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          First post shows on day
          <input
            type="number"
            min={1}
            value={startDay}
            onChange={(e) => setStartDay(e.target.value)}
            onBlur={() => { void saveStartDay(); }}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            className="w-16 rounded-lg border border-gray-200 px-2 py-1 text-sm"
          />
          of FOF
        </label>
        <SaveStatus state={startDaySaveState} />
      </section>

      {pending.length > 0 && (
        <section className="surface-card mb-6 p-5">
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-semibold text-gray-900">Ready to upload ({pending.length})</h2>
              <p className="text-xs text-gray-500">These will be added to the end, in this order. Drag to reorder afterwards.</p>
            </div>
            <button type="button" onClick={() => { pending.forEach((p) => URL.revokeObjectURL(p.preview)); setPending([]); }} disabled={uploading} className="rounded-2xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 disabled:opacity-50">
              Cancel
            </button>
            <button type="button" onClick={() => { void uploadAll(); }} disabled={uploading} className="rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
              {uploading ? 'Uploading…' : `Upload ${pending.filter((p) => p.status !== 'done').length}`}
            </button>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {pending.map((item) => (
              <div key={item.key} className="rounded-2xl border border-gray-100 p-2">
                <img src={item.preview} alt="" className="aspect-[4/5] w-full rounded-xl object-cover" />
                <p className={`mt-2 truncate text-[11px] ${item.status === 'error' ? 'text-red-700' : 'text-gray-400'}`} title={item.error || item.file.name}>
                  {item.status === 'uploading' ? 'Uploading…' : item.status === 'error' ? item.error : item.file.name}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {loading ? (
        <p className="py-12 text-center text-sm text-gray-500">Loading scriptures…</p>
      ) : scriptures.length === 0 ? (
        <section className="surface-card px-5 py-12 text-center">
          <p className="text-sm font-semibold text-gray-900">No scriptures yet</p>
          <p className="mt-1 text-sm text-gray-500">Upload the daily designs to show them to participants.</p>
        </section>
      ) : (
        <>
          <div className="mb-2 flex justify-end"><SaveStatus state={orderSaveState} /></div>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            <div data-wt="scriptures-grid" className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
              {scriptures.map((scripture) => (
                <ScriptureCard
                  key={scripture.id}
                  scripture={scripture}
                  position={scripture.dayNumber}
                  onReplace={() => { setReplaceDay(scripture.dayNumber); replaceInput.current?.click(); }}
                  onRemove={() => setToDelete(scripture)}
                />
              ))}
            </div>
            <DragOverlay>
              {activeScripture && (
                <div className="surface-card scale-105 p-2 shadow-xl">
                  <img src={activeScripture.imageUrl} alt="" className="aspect-[4/5] w-full rounded-xl object-cover" />
                </div>
              )}
            </DragOverlay>
          </DndContext>
        </>
      )}

      <ConfirmationModal
        isOpen={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={() => { void confirmDelete(); }}
        title="Remove this scripture?"
        message={toDelete ? `The ${ordinal(toDelete.dayNumber)} post will no longer show to participants.` : ''}
        confirmText="Remove"
        type="danger"
      />
    </div>
  );
};

export default AdminScripturesPage;
