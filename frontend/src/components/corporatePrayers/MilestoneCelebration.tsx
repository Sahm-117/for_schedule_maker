import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { prayerStreakApi } from '../../services/api';
import { milestoneTier } from '../../utils/prayerMilestones';
import { drawStreakGraphic } from '../../utils/streakGraphic';
import { GRAPHIC_H, GRAPHIC_W } from '../../utils/birthdayGraphic';
import ConfettiBurst from '../participantApp/ConfettiBurst';
import Spinner from '../Spinner';

// The screen a person sees the first time they reach a prayer streak badge: the badge, a picture they can share, and a switch to
// tell their group (off unless they turn it on). Their support is always told. `replay` opens a badge already earned from the
// badge row: the same picture, no switch, nothing saved.

interface Props {
  milestone: number;
  name: string;
  photoUrl?: string | null;
  cohortName?: string | null;
  /** Supports have no group to tell. */
  canTellGroup: boolean;
  replay?: boolean;
  onClose: () => void;
}

const fileName = (name: string, n: number) => `${n}-days-of-prayer-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'picture'}.png`;

const MilestoneCelebration: React.FC<Props> = ({ milestone, name, photoUrl, cohortName, canTellGroup, replay = false, onClose }) => {
  const tier = milestoneTier(milestone);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const blobRef = useRef<Blob | null>(null);
  const [drawing, setDrawing] = useState(true);
  const [note, setNote] = useState('');
  const [tell, setTell] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confetti, setConfetti] = useState(!replay);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    let cancelled = false;
    setDrawing(true);
    blobRef.current = null;
    drawStreakGraphic(canvas, { name, photoUrl, cohortName, tier }, () => cancelled)
      .then(() => {
        if (cancelled) return;
        canvas.toBlob((b) => { if (cancelled) return; blobRef.current = b; setDrawing(false); }, 'image/png');
      })
      .catch((e) => { if (!cancelled) { setNote(e instanceof Error ? e.message : 'Could not make the picture.'); setDrawing(false); } });
    return () => { cancelled = true; };
  }, [name, photoUrl, cohortName, tier]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const download = () => {
    const blob = blobRef.current;
    if (!blob) { setNote('The picture is not ready yet.'); return; }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName(name, milestone);
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
  // No await before navigator.share: it has to start inside the tap.
  const share = () => {
    const blob = blobRef.current;
    if (!blob) { setNote('The picture is not ready yet.'); return; }
    const file = new File([blob], fileName(name, milestone), { type: 'image/png' });
    if (!navigator.canShare?.({ files: [file] })) { download(); return; }
    navigator.share({ files: [file], title: tier.pic }).catch((e) => { if (!(e instanceof DOMException && e.name === 'AbortError')) setNote('Could not share the picture.'); });
  };

  const done = async () => {
    if (replay) { onClose(); return; }
    setSaving(true);
    setNote('');
    try {
      await prayerStreakApi.milestoneSeen(milestone, canTellGroup && tell);
      onClose();
    } catch (err) {
      setNote(err instanceof Error ? err.message : 'Could not save that. Please try again.');
      setSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[160] overflow-y-auto text-white" style={{ background: tier.bg }} role="dialog" aria-modal="true" aria-label={tier.title}>
      <div className="mx-auto flex min-h-full max-w-md flex-col items-center px-6 pb-8 pt-[max(32px,env(safe-area-inset-top))] text-center">
        <div className="relative mt-4 grid h-36 w-36 place-items-center rounded-full" style={{ background: tier.ring2 }} aria-hidden="true">
          <span className="absolute inset-4 rounded-full" style={{ background: tier.ring1 }} />
          <span className="relative grid h-[88px] w-[88px] place-items-center rounded-full" style={{ background: tier.badge }}>
            <svg width="46" height="46" viewBox="0 0 24 24" fill={tier.fg}><path d={tier.icon} /></svg>
          </span>
        </div>
        <p className="mt-5 text-[13px] font-bold uppercase tracking-[0.14em]" style={{ color: tier.light }}>{tier.name} badge</p>
        <h1 className="mt-1.5 text-[30px] font-extrabold leading-tight tracking-[-0.02em]">{tier.title}</h1>
        <p className="mt-2 max-w-xs text-[15.5px] leading-relaxed" style={{ color: tier.light }}>{tier.text}</p>

        <div className="mt-6 w-full max-w-[300px] overflow-hidden rounded-2xl bg-black/20 shadow-[0_12px_32px_-12px_rgba(0,0,0,0.6)]" style={{ aspectRatio: `${GRAPHIC_W} / ${GRAPHIC_H}` }}>
          <canvas ref={canvasRef} className={`h-full w-full transition-opacity ${drawing ? 'opacity-40' : 'opacity-100'}`} aria-label={`${tier.pic} for ${name}`} />
        </div>
        {note && <p className="mt-3 rounded-xl bg-red-500/25 px-3 py-2 text-[13px]">{note}</p>}

        <div className="mt-4 flex w-full max-w-[300px] gap-2">
          <button type="button" disabled={drawing} onClick={share} className="min-h-[48px] flex-1 rounded-full px-4 text-[15px] font-bold disabled:opacity-50" style={{ background: tier.badge, color: tier.fg }}>Share my picture</button>
          <button type="button" disabled={drawing} onClick={download} className="min-h-[48px] rounded-full bg-white/15 px-4 text-[15px] font-semibold">Save</button>
        </div>

        {!replay && canTellGroup && (
          <div className="mt-5 w-full max-w-[300px] text-left">
            <button type="button" role="switch" aria-checked={tell} onClick={() => setTell((v) => !v)} className="flex min-h-[52px] w-full items-center gap-3 rounded-2xl bg-white/10 px-4 py-2">
              <span className={`relative h-6 w-11 flex-none rounded-full transition ${tell ? '' : 'bg-white/25'}`} style={tell ? { background: tier.badge } : undefined} aria-hidden="true">
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${tell ? 'left-[22px]' : 'left-0.5'}`} />
              </span>
              <span className="text-[15px] font-semibold">{tell ? 'Group will be told' : 'Tell my group'}</span>
            </button>
            <p className="mt-2 text-[12.5px] leading-snug" style={{ color: tier.light }}>Your support is always told. Your group only hears if you choose.</p>
          </div>
        )}

        <button type="button" onClick={() => { void done(); }} disabled={saving} className="mt-auto flex min-h-[54px] w-full max-w-[300px] items-center justify-center rounded-full bg-white text-[16px] font-bold disabled:opacity-60" style={{ color: tier.fg, marginTop: 28 }}>
          {saving ? <span className="inline-flex items-center gap-2"><Spinner className="h-4 w-4" />Saving…</span> : replay ? 'Close' : 'Done'}
        </button>
      </div>
      {confetti && <ConfettiBurst onDone={() => setConfetti(false)} />}
    </div>,
    document.body,
  );
};

export default MilestoneCelebration;
