import { useEffect, useRef, useState } from 'react';
import HomeSheet from './participantApp/HomeSheet';
import { BIRTHDAY_QUOTES, GRAPHIC_H, GRAPHIC_W, drawBirthdayGraphic } from '../utils/birthdayGraphic';
import type { BirthdayPerson } from '../types';

// The birthday graphic for one person: their photo and name on a fixed template, with a quote bottom left.
// Admins can swap the quote, then download the picture or share it straight to WhatsApp and the like.

const hashOf = (s: string): number => { let h = 0; for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; };
const fileName = (name: string) => `birthday-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'graphic'}.png`;

const BirthdayGraphicSheet: React.FC<{ person: BirthdayPerson; onClose: () => void }> = ({ person, onClose }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [quoteIdx, setQuoteIdx] = useState(() => hashOf(person.id) % BIRTHDAY_QUOTES.length);
  const [drawing, setDrawing] = useState(true);
  const [photoUsed, setPhotoUsed] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    let cancelled = false;
    setDrawing(true);
    setError('');
    drawBirthdayGraphic(canvas, { name: person.name, photoUrl: person.avatarUrl, quote: BIRTHDAY_QUOTES[quoteIdx] })
      .then((r) => { if (!cancelled) { setPhotoUsed(r.photoUsed); setDrawing(false); } })
      .catch((e) => { if (!cancelled) { setError(e instanceof Error ? e.message : 'Could not make the graphic.'); setDrawing(false); } });
    return () => { cancelled = true; };
  }, [person.name, person.avatarUrl, quoteIdx]);

  const toBlob = (): Promise<Blob> => new Promise((resolve, reject) => {
    const canvas = canvasRef.current;
    if (!canvas) { reject(new Error('Nothing to save yet.')); return; }
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not save the picture.'))), 'image/png');
  });

  const download = async () => {
    try {
      const url = URL.createObjectURL(await toBlob());
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName(person.name);
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save the picture.'); }
  };

  const share = async () => {
    try {
      const file = new File([await toBlob()], fileName(person.name), { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file] });
      else await download();
    } catch (e) { if (!(e instanceof DOMException && e.name === 'AbortError')) setError(e instanceof Error ? e.message : 'Could not share the picture.'); }
  };

  return (
    <HomeSheet label={`Birthday graphic for ${person.name}`} onClose={onClose}>
      <p className="mb-2 pr-10 text-[15px] font-semibold text-gray-900">Birthday graphic</p>
      <div className="relative overflow-hidden rounded-2xl bg-[#fff1e6] shadow-[0_8px_24px_-12px_rgba(17,24,39,0.25)]" style={{ aspectRatio: `${GRAPHIC_W} / ${GRAPHIC_H}` }}>
        <canvas ref={canvasRef} className={`h-full w-full transition-opacity ${drawing ? 'opacity-40' : 'opacity-100'}`} aria-label={`Birthday graphic for ${person.name}`} />
      </div>
      {!drawing && !photoUsed && <p className="mt-2 text-[12.5px] text-gray-500">{person.avatarUrl ? 'Their photo would not load, so initials are shown.' : 'They have no photo yet, so initials are shown.'}</p>}
      {error && <p className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-[13px] text-red-600">{error}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={drawing} onClick={() => void download()} className="flex-1 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Download</button>
        <button type="button" disabled={drawing} onClick={() => void share()} className="flex-1 rounded-full bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Share</button>
        <button type="button" disabled={drawing} onClick={() => setQuoteIdx((i) => (i + 1) % BIRTHDAY_QUOTES.length)} className="w-full rounded-full bg-gray-100 px-4 py-2.5 text-sm font-semibold text-gray-700 disabled:opacity-50">Try another quote</button>
      </div>
    </HomeSheet>
  );
};

export default BirthdayGraphicSheet;
