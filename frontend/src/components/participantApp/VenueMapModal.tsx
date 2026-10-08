import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Spinner from '../Spinner';

interface VenueMapModalProps {
  acknowledged: boolean;
  onAcknowledge: () => Promise<void>;
  onClose: () => void;
}

/** The FOF venue map, with a tick for "I understand" that completes the Get ready step. */
export default function VenueMapModal({ acknowledged, onAcknowledge, onClose }: VenueMapModalProps) {
  const [understood, setUnderstood] = useState(acknowledged);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Closing is ignored while the tick is being saved, so a failure is never lost.
  const savingRef = useRef(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const close = () => { if (!savingRef.current) closeRef.current(); };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !savingRef.current) closeRef.current(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, []);

  const done = async () => {
    if (acknowledged) { close(); return; }
    savingRef.current = true;
    setSaving(true);
    setError('');
    try {
      await onAcknowledge();
      savingRef.current = false;
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your step.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 sm:items-center" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div role="dialog" aria-modal="true" aria-label="FOF venue map" className="flex max-h-[94vh] w-full max-w-lg flex-col rounded-t-[24px] bg-white shadow-xl sm:rounded-[24px]">
        <div className="flex items-center gap-3 px-5 pb-2 pt-4">
          <h2 className="text-lg font-bold text-gray-900">Venue map</h2>
          <button type="button" onClick={close} aria-label="Close" className="ml-auto grid h-9 w-9 place-items-center rounded-full text-gray-500 hover:bg-gray-100">&#10005;</button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-5">
          <img src="/venue-map.webp" alt="FOF venue map: from the Dreampark entrance to the church entrance, then after first service walk from the church entrance to the New VIP Lounge." className="w-full rounded-[16px] border border-[#eef0f4]" />
          <p className="mt-3 text-sm text-gray-700">After first service, walk from the church entrance toward the New VIP Lounge.</p>
        </div>
        <div className="border-t border-[#f1f2f5] px-5 pb-5 pt-3">
          <label className="flex min-h-[44px] cursor-pointer items-center gap-3 text-sm font-semibold text-gray-900">
            <input type="checkbox" checked={understood} disabled={acknowledged} onChange={(e) => setUnderstood(e.target.checked)} className="h-5 w-5 flex-none accent-[#ff914d]" />
            <span>I understand where to go after first service</span>
          </label>
          {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
          <button type="button" onClick={() => void done()} disabled={(!understood && !acknowledged) || saving} className="mt-2 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-[14px] bg-primary px-4 text-sm font-semibold text-white disabled:bg-gray-100 disabled:text-gray-400">
            {saving && <Spinner className="h-4 w-4" />}{acknowledged ? 'Close' : 'Done'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
