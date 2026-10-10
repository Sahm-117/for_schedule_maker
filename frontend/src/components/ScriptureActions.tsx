import { useCallback, useEffect, useRef, useState } from 'react';
import { scriptureEngagementApi } from '../services/api';

// Like, Download and Share for one Inspirational Scripture post, as three round icon buttons.
// Share opens the phone's own share sheet with the picture; Download saves it. Admins see the counts on the Scriptures page.

/** The posts this person has liked, and a way to flip one. Loads once per mount; a failed read just shows nothing liked. */
export const useScriptureLikes = () => {
  const [liked, setLiked] = useState<Set<number>>(new Set());
  useEffect(() => {
    let cancelled = false;
    scriptureEngagementApi.myLikes().then((days) => { if (!cancelled) setLiked(new Set(days)); }).catch(() => { /* hearts start empty */ });
    return () => { cancelled = true; };
  }, []);
  const toggle = useCallback(async (day: number) => {
    const wasLiked = liked.has(day);
    const flip = (on: boolean) => setLiked((prev) => { const next = new Set(prev); if (on) next.add(day); else next.delete(day); return next; });
    flip(!wasLiked); // instant; put back if the save fails
    try {
      const r = await scriptureEngagementApi.react(day, 'LIKE');
      if (typeof r.liked === 'boolean') flip(r.liked);
    } catch { flip(wasLiked); }
  }, [liked]);
  return { liked, toggle };
};

const Icon: React.FC<{ d: string; filled?: boolean }> = ({ d, filled }) => (
  <svg viewBox="0 0 24 24" className="h-[17px] w-[17px]" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
);
const HEART = 'M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.7c0 5.6-7.5 10.2-7.5 10.2Z';
const DOWNLOAD = 'M12 4v11m0 0-4-4m4 4 4-4M5 19.5h14';
const SHARE = 'M12 15V4m0 0L8.5 7.5M12 4l3.5 3.5M6 11H5.5A1.5 1.5 0 0 0 4 12.5v6A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5v-6a1.5 1.5 0 0 0-1.5-1.5H18';

const extensionOf = (type: string) => (type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : 'jpg');

const ScriptureActions: React.FC<{ day: number; imageUrl: string; liked: boolean; onToggleLike: () => void }> = ({ day, imageUrl, liked, onToggleLike }) => {
  const [note, setNote] = useState('');
  // The picture is fetched ahead of time so Share can open inside the tap (phones refuse it after a wait).
  const blobRef = useRef<Blob | null>(null);
  useEffect(() => {
    let cancelled = false;
    blobRef.current = null;
    fetch(imageUrl, { mode: 'cors' }).then((r) => (r.ok ? r.blob() : null)).then((b) => { if (!cancelled) blobRef.current = b; }).catch(() => { /* download falls back to opening the link */ });
    return () => { cancelled = true; };
  }, [imageUrl]);
  useEffect(() => { setNote(''); }, [day]);

  const flash = (text: string) => { setNote(text); window.setTimeout(() => setNote((n) => (n === text ? '' : n)), 2500); };
  const count = (action: 'DOWNLOAD' | 'SHARE') => { void scriptureEngagementApi.react(day, action).catch(() => { /* counting is best effort */ }); };
  const fileFor = (blob: Blob) => new File([blob], `inspirational-scripture-day-${day}.${extensionOf(blob.type)}`, { type: blob.type || 'image/jpeg' });

  const download = () => {
    const blob = blobRef.current;
    if (!blob) { window.open(imageUrl, '_blank', 'noopener'); count('DOWNLOAD'); return; }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileFor(blob).name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
    count('DOWNLOAD');
    flash('Saved to your device');
  };

  // No await before navigator.share: it has to start inside the tap.
  const share = () => {
    const blob = blobRef.current;
    const file = blob ? fileFor(blob) : null;
    const data: ShareData = file && navigator.canShare?.({ files: [file] }) ? { files: [file], title: 'Inspirational scripture' } : { url: imageUrl, title: 'Inspirational scripture' };
    if (!navigator.share) {
      navigator.clipboard?.writeText(imageUrl).then(() => flash('Link copied'), () => flash('Could not share this'));
      return;
    }
    navigator.share(data).then(() => count('SHARE')).catch((e) => { if (!(e instanceof DOMException && e.name === 'AbortError')) flash('Could not share this'); });
  };

  // Quiet on purpose: no frame or shadow, a pale icon, and a roomy invisible tap area.
  const btn = 'grid h-10 w-10 place-items-center rounded-full text-[#c9b8aa] transition hover:text-[#9a6a4b] active:scale-90';
  return (
    <div className="flex flex-col items-center pt-1">
      <div className="flex items-center justify-center gap-1">
        <button type="button" onClick={onToggleLike} aria-pressed={liked} aria-label={liked ? 'Remove like' : 'Like'} title="Like" className={`${btn} ${liked ? '!text-primary' : ''}`}><Icon d={HEART} filled={liked} /></button>
        <button type="button" onClick={download} aria-label="Download" title="Download" className={btn}><Icon d={DOWNLOAD} /></button>
        <button type="button" onClick={share} aria-label="Share" title="Share" className={btn}><Icon d={SHARE} /></button>
      </div>
      <p className="h-3.5 text-[11px] font-medium text-gray-400" role="status" aria-live="polite">{note}</p>
    </div>
  );
};

export default ScriptureActions;
