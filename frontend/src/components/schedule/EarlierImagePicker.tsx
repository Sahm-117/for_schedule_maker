import React from 'react';
import Spinner from '../Spinner';
import type { EarlierClassImage } from '../../types';

interface EarlierImagePickerProps {
  open: boolean;
  images: EarlierClassImage[];
  loading: boolean;
  error: string;
  /** Round thumbnails for teacher photos, wide ones for class graphics. */
  round?: boolean;
  onChoose: (image: EarlierClassImage) => void;
  onCancel: () => void;
}

// "Use an earlier one" for a class picture: the pictures earlier classes already use, so a teacher who comes back
// does not have to be uploaded again. Only the pictures of this kind are listed.
const EarlierImagePicker: React.FC<EarlierImagePickerProps> = ({ open, images, loading, error, round = false, onChoose, onCancel }) => {
  if (!open) return null;
  return (
    <div className="mt-2 rounded-2xl border border-gray-200 p-3">
      {loading ? (
        <p className="flex items-center gap-1.5 py-3 text-sm text-gray-500"><Spinner className="h-3.5 w-3.5" />Loading earlier pictures…</p>
      ) : error ? (
        <p className="py-2 text-sm text-red-700">{error}</p>
      ) : images.length === 0 ? (
        <p className="py-2 text-sm text-gray-400">No earlier pictures yet.</p>
      ) : (
        <ul className={`grid max-h-64 gap-2 overflow-y-auto ${round ? 'grid-cols-3 sm:grid-cols-4' : 'grid-cols-2 sm:grid-cols-3'}`}>
          {images.map((image) => (
            <li key={image.url}>
              <button type="button" onClick={() => onChoose(image)} className="flex w-full flex-col items-center gap-1 rounded-xl p-1.5 text-center hover:bg-gray-50">
                <span className={`block overflow-hidden bg-neutral-100 ${round ? 'h-16 w-16 rounded-full' : 'h-16 w-full rounded-xl'}`}>
                  <img src={image.url} alt={image.label} loading="lazy" decoding="async" className="h-full w-full object-cover" />
                </span>
                <span className="w-full truncate text-[11.5px] font-semibold text-gray-800">{image.label}</span>
                <span className="w-full truncate text-[10.5px] text-gray-400">{image.cohortName} · Wk {image.weekNumber}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" onClick={onCancel} className="mt-2 text-xs font-semibold text-gray-500">Cancel</button>
    </div>
  );
};

export default EarlierImagePicker;
