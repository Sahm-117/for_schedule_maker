import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface AvatarProps {
  name: string;
  avatarUrl?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  /** Tapping a real photo (not initials) opens a full-screen viewer. No-op when there's no photo. */
  enlargeable?: boolean;
}

const sizeMap = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-14 w-14 text-lg',
  xl: 'h-40 w-40 text-5xl',
};

// Full-screen photo viewer, portalled to document.body: dark backdrop, image
// contained, closes on tap/Esc/×.
const PhotoViewer: React.FC<{ src: string; alt: string; onClose: () => void }> = ({ src, alt, onClose }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={alt}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"
      >
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
      <img
        src={src}
        alt={alt}
        className="max-h-[85vh] max-w-[90vw] rounded-2xl object-contain shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
    </div>,
    document.body,
  );
};

const Avatar: React.FC<AvatarProps> = ({ name, avatarUrl, size = 'md', className = '', enlargeable = false }) => {
  const [errored, setErrored] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);

  // Reset the error state when the URL changes (e.g. after a re-upload).
  useEffect(() => { setErrored(false); }, [avatarUrl]);

  const initials = (name || '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('') || '?';

  if (avatarUrl && !errored) {
    const canEnlarge = enlargeable;
    return (
      <>
        <img
          src={avatarUrl}
          alt={name}
          className={`${sizeMap[size]} flex-shrink-0 rounded-full object-cover ${canEnlarge ? 'cursor-pointer' : ''} ${className}`}
          onError={() => setErrored(true)}
          onClick={canEnlarge ? (e) => {
            // Stop the tap reaching a wrapping button/link (e.g. a "change photo"
            // control, or a card that navigates) so enlarging always wins here.
            e.stopPropagation();
            e.preventDefault();
            setViewerOpen(true);
          } : undefined}
        />
        {canEnlarge && viewerOpen && (
          <PhotoViewer src={avatarUrl} alt={name} onClose={() => setViewerOpen(false)} />
        )}
      </>
    );
  }

  return (
    <div className={`${sizeMap[size]} flex flex-shrink-0 items-center justify-center rounded-full bg-primary font-semibold text-white ${className}`}>
      {initials}
    </div>
  );
};

export default Avatar;
