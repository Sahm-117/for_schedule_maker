import { useEffect, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import HomeSheet from './HomeSheet';
import { GRAPHIC_H, GRAPHIC_W } from '../../utils/birthdayGraphic';
import { drawReadyGraphic } from '../../utils/readyGraphic';

// The reward for finishing every Get ready step: a picture with their photo and name saying they are fully ready.
// Download it or share it straight to WhatsApp and the like.

const fileName = (name: string) => `ready-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'graphic'}.png`;

const ReadyGraphicSheet: React.FC<{ name: string; photoUrl?: string | null; cohortName?: string | null; onClose: () => void }> = ({ name, photoUrl, cohortName, onClose }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const blobRef = useRef<Blob | null>(null);
  const [drawing, setDrawing] = useState(true);
  const [photoUsed, setPhotoUsed] = useState(true);
  const [note, setNote] = useState('');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    let cancelled = false;
    setDrawing(true);
    blobRef.current = null;
    drawReadyGraphic(canvas, { name, photoUrl, cohortName }, () => cancelled)
      .then((r) => {
        if (cancelled) return;
        canvas.toBlob((b) => { if (!cancelled) { blobRef.current = b; setPhotoUsed(r.photoUsed); setDrawing(false); } }, 'image/png');
      })
      .catch((e) => { if (!cancelled) { setNote(e instanceof Error ? e.message : 'Could not make the graphic.'); setDrawing(false); } });
    return () => { cancelled = true; };
  }, [name, photoUrl, cohortName]);

  const download = () => {
    const blob = blobRef.current;
    if (!blob) { setNote('The picture is not ready yet.'); return; }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName(name);
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
  // No await before navigator.share: it has to start inside the tap.
  const share = () => {
    const blob = blobRef.current;
    if (!blob) { setNote('The picture is not ready yet.'); return; }
    const file = new File([blob], fileName(name), { type: 'image/png' });
    if (!navigator.canShare?.({ files: [file] })) { download(); return; }
    navigator.share({ files: [file], title: "I'm fully ready" }).catch((e) => { if (!(e instanceof DOMException && e.name === 'AbortError')) setNote('Could not share the picture.'); });
  };

  return (
    <HomeSheet label="Your ready graphic" onClose={onClose}>
      <h2 className="pr-10 text-lg font-extrabold tracking-tight text-gray-900">Your gift</h2>
      <p className="mb-2.5 text-[12.5px] text-gray-500">You finished every step. Download it or share it with your friends.</p>
      <div className="overflow-hidden rounded-2xl bg-[#fff1e6] shadow-[0_8px_24px_-12px_rgba(17,24,39,0.25)]" style={{ aspectRatio: `${GRAPHIC_W} / ${GRAPHIC_H}` }}>
        <canvas ref={canvasRef} className={`h-full w-full transition-opacity ${drawing ? 'opacity-40' : 'opacity-100'}`} aria-label={`Ready graphic for ${name}`} />
      </div>
      {!drawing && !photoUsed && (
        <p className="mt-2 text-[12.5px] text-gray-500">Want your face on it? <NavLink to="/me/profile" className="font-semibold text-[#c2410c]">Add your photo</NavLink> and open this again.</p>
      )}
      {note && <p className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-[13px] text-red-600">{note}</p>}
      <div className="mt-3 flex gap-2">
        <button type="button" disabled={drawing} onClick={download} className="flex-1 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Download</button>
        <button type="button" disabled={drawing} onClick={share} className="flex-1 rounded-full bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Share</button>
      </div>
    </HomeSheet>
  );
};

export default ReadyGraphicSheet;
