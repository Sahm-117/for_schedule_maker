import { useCallback, useEffect, useRef, useState } from 'react';
import { scriptureEngagementApi } from '../services/api';

// Like, Download and Share for one Inspirational Scripture post, as three round icon buttons.
// Share opens the phone's own share sheet with the picture; Download saves it. Admins see the counts on the Scriptures page.

type PostCounts = { likes: number; downloads: number; shares: number };
const NO_COUNTS: PostCounts = { likes: 0, downloads: 0, shares: 0 };

/** The posts this person has liked, a way to flip one, and everyone's all-time totals per post (shown as social proof).
 *  Loads once per mount; a failed read just shows nothing liked and no numbers. */
export const useScriptureLikes = () => {
  const [liked, setLiked] = useState<Set<number>>(new Set());
  const [counts, setCounts] = useState<Map<number, PostCounts>>(new Map());
  const likedRef = useRef(liked);
  likedRef.current = liked;
  const pending = useRef<Set<number>>(new Set());
  const lastBump = useRef<Map<string, number>>(new Map());
  const alive = useRef(true);
  // Everyone's totals from the server. Also used after a tap: the number moves at once, then this puts the true figure
  // back (the server leaves practice and test accounts out, so the guess can be one too high).
  const loadCounts = useCallback(() => {
    scriptureEngagementApi.publicCounts()
      .then((rows) => { if (alive.current) setCounts(new Map(rows.map((r) => [r.dayNumber, { likes: r.likes, downloads: r.downloads, shares: r.shares }]))); })
      .catch(() => { /* keep what is shown */ });
  }, []);
  useEffect(() => {
    alive.current = true;
    scriptureEngagementApi.myLikes().then((days) => { if (alive.current) setLiked(new Set(days)); }).catch(() => { /* hearts start empty */ });
    loadCounts();
    return () => { alive.current = false; };
  }, [loadCounts]);
  const bump = useCallback((day: number, key: keyof PostCounts, by: number) => {
    setCounts((prev) => {
      const next = new Map(prev);
      const row = next.get(day) ?? NO_COUNTS;
      next.set(day, { ...row, [key]: Math.max(0, row[key] + by) });
      return next;
    });
  }, []);
  const toggle = useCallback(async (day: number) => {
    if (pending.current.has(day)) return; // a save for this post is still on its way
    pending.current.add(day);
    const wasLiked = likedRef.current.has(day);
    const flip = (on: boolean) => {
      setLiked((prev) => { const next = new Set(prev); if (on) next.add(day); else next.delete(day); return next; });
      bump(day, 'likes', on ? 1 : -1);
    };
    flip(!wasLiked); // instant; put back if the save fails
    try {
      const r = await scriptureEngagementApi.react(day, 'LIKE');
      if (typeof r.liked === 'boolean' && r.liked !== !wasLiked) flip(r.liked);
      loadCounts();
    } catch { flip(wasLiked); } finally { pending.current.delete(day); }
  }, [bump, loadCounts]);
  /** A download or share was saved on the server: add it to the number shown. The server counts a repeat within 10 seconds once, so do the same here. */
  const counted = useCallback((day: number, action: 'DOWNLOAD' | 'SHARE') => {
    const key = `${day}:${action}`;
    const now = Date.now();
    if (now - (lastBump.current.get(key) ?? 0) < 10000) return;
    lastBump.current.set(key, now);
    bump(day, action === 'DOWNLOAD' ? 'downloads' : 'shares', 1);
    loadCounts();
  }, [bump, loadCounts]);
  return { liked, toggle, counts, counted };
};

const Icon: React.FC<{ d: string; filled?: boolean }> = ({ d, filled }) => (
  <svg viewBox="0 0 24 24" className="h-[17px] w-[17px]" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
);
const HEART = 'M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.7c0 5.6-7.5 10.2-7.5 10.2Z';
const DOWNLOAD = 'M12 4v11m0 0-4-4m4 4 4-4M5 19.5h14';
const SHARE = 'M12 15V4m0 0L8.5 7.5M12 4l3.5 3.5M6 11H5.5A1.5 1.5 0 0 0 4 12.5v6A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5v-6a1.5 1.5 0 0 0-1.5-1.5H18';

// Each picture is fetched once and kept, so flipping through posts does not download them again.
const pictures = new Map<string, Blob | null>();
const fetchPicture = async (url: string): Promise<Blob | null> => {
  if (pictures.has(url)) return pictures.get(url) ?? null;
  try {
    const r = await fetch(url, { mode: 'cors' });
    const blob = r.ok ? await r.blob() : null;
    pictures.set(url, blob);
    return blob;
  } catch { return null; }
};

const extensionOf = (type: string) => (type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : 'jpg');

const ScriptureActions: React.FC<{ day: number; imageUrl: string; liked: boolean; onToggleLike: () => void; counts?: PostCounts; onCounted?: (action: 'DOWNLOAD' | 'SHARE') => void }> = ({ day, imageUrl, liked, onToggleLike, counts, onCounted }) => {
  const [note, setNote] = useState('');
  // The picture is fetched ahead of time so Share can open inside the tap (phones refuse it after a wait).
  const blobRef = useRef<Blob | null>(null);
  useEffect(() => {
    let cancelled = false;
    blobRef.current = pictures.get(imageUrl) ?? null;
    if (!blobRef.current) void fetchPicture(imageUrl).then((b) => { if (!cancelled) blobRef.current = b; });
    return () => { cancelled = true; };
  }, [imageUrl]);
  useEffect(() => { setNote(''); }, [day]);

  const flash = (text: string) => { setNote(text); window.setTimeout(() => setNote((n) => (n === text ? '' : n)), 2500); };
  const count = (action: 'DOWNLOAD' | 'SHARE') => { void scriptureEngagementApi.react(day, action).then(() => onCounted?.(action)).catch(() => { /* counting is best effort */ }); };
  const fileFor = (blob: Blob) => new File([blob], `inspirational-scripture-day-${day}.${extensionOf(blob.type)}`, { type: blob.type || 'image/jpeg' });

  const download = async () => {
    const blob = blobRef.current ?? await fetchPicture(imageUrl);
    if (!blob) { flash('Could not save the picture'); return; } // not saved, so not counted
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

  // Quiet on purpose: no frame or shadow, a pale icon, and a roomy invisible tap area. The totals (everyone, all time)
  // sit beside each icon once there is at least one.
  const btn = 'flex h-10 min-w-[40px] items-center justify-center gap-1 rounded-full px-2.5 text-[#c9b8aa] transition hover:text-[#9a6a4b] active:scale-90';
  const total = (n: number | undefined) => (n && n > 0 ? <span className="text-[11px] font-semibold tabular-nums" aria-hidden="true">{n > 999 ? `${Math.floor(n / 100) / 10}k` : n}</span> : null);
  const said = (n: number | undefined, one: string, many: string) => (n && n > 0 ? `, ${n} ${n === 1 ? one : many}` : '');
  return (
    <div className="flex flex-col items-center pt-1">
      <div className="flex items-center justify-center">
        <button type="button" onClick={onToggleLike} aria-pressed={liked} aria-label={`${liked ? 'Remove like' : 'Like'}${said(counts?.likes, 'like', 'likes')}`} title="Like" className={`${btn} ${liked ? '!text-primary' : ''}`}><Icon d={HEART} filled={liked} />{total(counts?.likes)}</button>
        <button type="button" onClick={() => void download()} aria-label={`Download${said(counts?.downloads, 'download', 'downloads')}`} title="Download" className={btn}><Icon d={DOWNLOAD} />{total(counts?.downloads)}</button>
        <button type="button" onClick={share} aria-label={`Share${said(counts?.shares, 'share', 'shares')}`} title="Share" className={btn}><Icon d={SHARE} />{total(counts?.shares)}</button>
      </div>
      <p className="h-3.5 text-[11px] font-medium text-gray-400" role="status" aria-live="polite">{note}</p>
    </div>
  );
};

export default ScriptureActions;
