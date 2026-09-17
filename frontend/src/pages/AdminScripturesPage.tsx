import React, { useEffect, useRef, useState } from 'react';
import PageHeader from '../components/PageHeader';
import ConfirmationModal from '../components/ConfirmationModal';
import { useToast } from '../components/Toast';
import { useAuth } from '../hooks/useAuth';
import { scripturesApi } from '../services/api';
import type { Scripture } from '../types';

// Daily Inspirational Scripture designs for the participant app. Day N shows from
// 2:00 PM on day N of the cohort, and the set starts again after the last day.
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
  day: string;
  status: 'ready' | 'uploading' | 'done' | 'error';
  error?: string;
}

const dayFromName = (name: string) => {
  const match = name.replace(/\.[^.]+$/, '').match(/^\s*(\d{1,3})\s*$/);
  return match ? match[1] : '';
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

  const load = async () => {
    try {
      setScriptures((await scripturesApi.getAll()).scriptures);
    } catch (err) {
      toast({ message: err instanceof Error ? err.message : 'Could not load scriptures.', tone: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const addFiles = (files: FileList | null) => {
    if (!files?.length) return;
    const taken = new Set([...scriptures.map((s) => s.dayNumber), ...pending.map((p) => Number(p.day)).filter(Boolean)]);
    let next = 1;
    const items = Array.from(files)
      .sort((a, b) => (Number(dayFromName(a.name)) || Infinity) - (Number(dayFromName(b.name)) || Infinity))
      .map((file, index) => {
        let day = dayFromName(file.name);
        if (!day) {
          while (taken.has(next)) next += 1;
          day = String(next);
        }
        taken.add(Number(day));
        return { key: `${Date.now()}-${index}-${file.name}`, file, preview: URL.createObjectURL(file), day, status: 'ready' as const };
      });
    setPending((prev) => [...prev, ...items]);
  };

  const uploadAll = async () => {
    if (!user) return;
    const invalid = pending.find((p) => p.status !== 'done' && !(Number(p.day) > 0));
    if (invalid) { toast({ message: 'Give every design a day number.', tone: 'error' }); return; }
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
      toast({ message: `Day ${day} replaced` });
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
      setScriptures((prev) => prev.filter((s) => s.id !== target.id));
      toast({ message: `Day ${target.dayNumber} removed` });
    } catch (err) {
      toast({ message: err instanceof Error ? err.message : 'Could not remove this design.', tone: 'error' });
    }
  };

  const existingDays = new Set(scriptures.map((s) => s.dayNumber));

  return (
    <div>
      <PageHeader
        title="Scriptures"
        tourId="admin:scriptures"
        subtitle="The daily Inspirational Scripture on the participant Home. Day 1 shows from 2:00 PM on the cohort's first day; after the last design the set starts again."
        action={(
          <button type="button" onClick={() => addInput.current?.click()} className="rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-white active:scale-95">
            + Upload
          </button>
        )}
      />
      <input ref={addInput} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
      <input ref={replaceInput} type="file" accept="image/*" className="hidden" onChange={(e) => { void replace(e.target.files?.[0]); e.target.value = ''; }} />

      {pending.length > 0 && (
        <section className="surface-card mb-6 p-5">
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-semibold text-gray-900">Ready to upload ({pending.length})</h2>
              <p className="text-xs text-gray-500">Files named with a number (e.g. 12.png) get that day. Check the rest before uploading.</p>
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
                <label className="mt-2 flex items-center gap-2 text-xs font-semibold text-gray-600">
                  Day
                  <input
                    type="number"
                    min={1}
                    value={item.day}
                    disabled={uploading}
                    onChange={(e) => setPending((prev) => prev.map((p) => (p.key === item.key ? { ...p, day: e.target.value } : p)))}
                    className="w-16 rounded-lg border border-gray-200 px-2 py-1 text-sm"
                  />
                </label>
                <p className={`mt-1 truncate text-[11px] ${item.status === 'error' ? 'text-red-700' : 'text-gray-400'}`} title={item.error || item.file.name}>
                  {item.status === 'uploading' ? 'Uploading…' : item.status === 'error' ? item.error : existingDays.has(Number(item.day)) ? `Replaces day ${item.day}` : item.file.name}
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
        <div data-wt="scriptures-grid" className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {scriptures.map((scripture) => (
            <div key={scripture.id} className="surface-card p-2">
              <img src={scripture.imageUrl} alt={`Scripture for day ${scripture.dayNumber}`} className="aspect-[4/5] w-full rounded-xl bg-gray-50 object-cover" loading="lazy" />
              <div className="mt-2 flex items-center gap-2 px-1">
                <span className="text-sm font-semibold text-gray-900">Day {scripture.dayNumber}</span>
                <button type="button" onClick={() => { setReplaceDay(scripture.dayNumber); replaceInput.current?.click(); }} className="ml-auto text-xs font-semibold text-primary">Replace</button>
                <button type="button" onClick={() => setToDelete(scripture)} className="text-xs font-semibold text-red-700">Remove</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmationModal
        isOpen={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={() => { void confirmDelete(); }}
        title="Remove this scripture?"
        message={toDelete ? `Day ${toDelete.dayNumber} will no longer show to participants.` : ''}
        confirmText="Remove"
        type="danger"
      />
    </div>
  );
};

export default AdminScripturesPage;
