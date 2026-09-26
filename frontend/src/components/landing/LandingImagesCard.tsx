import React, { useEffect, useRef, useState } from 'react';
import { settingsApi, landingImagesApi } from '../../services/api';
import type { LandingImages } from '../../services/supabase-api';
import Spinner from '../Spinner';
import { useToast } from '../Toast';

// Photos for the public fof.tcnikorodu.org landing page (Settings > Website
// > Photos tab). Moved here unchanged from AdminSettingsPage.tsx — the
// "Website photos" card previously lived under Settings > Programme.

type LandingSlot = keyof LandingImages;

const LANDING_SLOTS: Array<{ key: LandingSlot; label: string; hint: string; maxWidth: number; aspect: string }> = [
  { key: 'hero', label: 'Hero', hint: 'Wide worship photo behind the headline.', maxWidth: 2400, aspect: 'aspect-video' },
  { key: 'group', label: 'Small group', hint: 'A small group meeting together.', maxWidth: 1600, aspect: 'aspect-[4/3]' },
  { key: 'class', label: 'Class', hint: 'A Sunday FOF class in session.', maxWidth: 1600, aspect: 'aspect-[4/3]' },
];

const LANDING_IMAGE_QUALITY = 0.82;
const EMPTY_LANDING_IMAGES: LandingImages = { hero: null, group: null, class: null };

// Resize to at most `maxWidth` wide and re-encode as WebP (JPEG where WebP
// isn't supported) — same client-side compression as the Scriptures uploader.
const shrinkLandingImage = (file: File, maxWidth: number): Promise<Blob> => new Promise((resolve, reject) => {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    const scale = Math.min(1, maxWidth / img.naturalWidth);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) { URL.revokeObjectURL(url); reject(new Error('Could not read this image.')); return; }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);
    canvas.toBlob((webp) => {
      if (webp && webp.type === 'image/webp') { resolve(webp); return; }
      canvas.toBlob((jpeg) => (jpeg ? resolve(jpeg) : reject(new Error('Could not compress this image.'))), 'image/jpeg', LANDING_IMAGE_QUALITY);
    }, 'image/webp', LANDING_IMAGE_QUALITY);
  };
  img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read this image.')); };
  img.src = url;
});

// Each slot uploads (and saves) immediately, like the Scriptures uploader —
// there's no separate edit/save step since a wrong photo is a one-tap
// Replace away.
const LandingImagesCard: React.FC = () => {
  const toast = useToast();
  const [images, setImages] = useState<LandingImages>(EMPTY_LANDING_IMAGES);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<LandingSlot | null>(null);
  const [savedSlot, setSavedSlot] = useState<LandingSlot | null>(null);
  const fileInputs = useRef<Record<LandingSlot, HTMLInputElement | null>>({ hero: null, group: null, class: null });

  useEffect(() => {
    let cancelled = false;
    settingsApi.getLandingImages()
      .then((v) => { if (!cancelled) setImages(v); })
      .catch(() => { /* keep blank */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const flashSaved = (slot: LandingSlot) => {
    setSavedSlot(slot);
    setTimeout(() => setSavedSlot((s) => (s === slot ? null : s)), 2000);
  };

  const handleUpload = async (slot: LandingSlot, file: File | undefined) => {
    if (!file) return;
    const config = LANDING_SLOTS.find((s) => s.key === slot)!;
    setBusy(slot);
    try {
      const image = await shrinkLandingImage(file, config.maxWidth);
      const url = await landingImagesApi.upload(slot, image);
      const previous = images[slot];
      const next = { ...images, [slot]: url };
      await settingsApi.setLandingImages(next);
      setImages(next);
      if (previous) void landingImagesApi.removeByUrl(previous);
      flashSaved(slot);
    } catch (err) {
      toast({ message: err instanceof Error ? err.message : 'Could not upload this photo.', tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const handleRemove = async (slot: LandingSlot) => {
    const previous = images[slot];
    if (!previous) return;
    setBusy(slot);
    try {
      const next = { ...images, [slot]: null };
      await settingsApi.setLandingImages(next);
      setImages(next);
      void landingImagesApi.removeByUrl(previous);
      flashSaved(slot);
    } catch (err) {
      toast({ message: err instanceof Error ? err.message : 'Could not remove this photo.', tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="surface-card p-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Website photos</h3>
        <p className="mt-1 text-sm text-gray-500">Shown on the public fof.tcnikorodu.org landing page. Falls back to a plain colour until each is set.</p>
      </div>
      {loading ? (
        <div className="h-40 animate-pulse rounded-2xl bg-gray-50" />
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          {LANDING_SLOTS.map((slot) => {
            const url = images[slot.key];
            const isBusy = busy === slot.key;
            return (
              <div key={slot.key}>
                <div className={`relative ${slot.aspect} overflow-hidden rounded-2xl border border-gray-200 bg-gray-50`}>
                  {url ? (
                    <img src={url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs text-gray-400">No photo</div>
                  )}
                  {isBusy && (
                    <div className="absolute inset-0 flex items-center justify-center bg-white/70">
                      <Spinner className="h-5 w-5" />
                    </div>
                  )}
                </div>
                <p className="mt-2 text-sm font-semibold text-gray-900">{slot.label}</p>
                <p className="text-xs text-gray-500">{slot.hint}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input
                    ref={(el) => { fileInputs.current[slot.key] = el; }}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => { void handleUpload(slot.key, e.target.files?.[0]); e.target.value = ''; }}
                  />
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => fileInputs.current[slot.key]?.click()}
                    className="rounded-xl bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-200 disabled:opacity-50"
                  >
                    {url ? 'Replace' : 'Upload'}
                  </button>
                  {url && (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void handleRemove(slot.key)}
                      className="rounded-xl px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      Remove
                    </button>
                  )}
                  {savedSlot === slot.key && <span className="text-xs font-medium text-emerald-600">Saved</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default LandingImagesCard;
