import React, { useState } from 'react';
import type { Resource } from '../../types';

/** Real image previews and distinct paper/browser illustrations for other resources. */
const ResourceArtwork: React.FC<{ resource: Resource; compact?: boolean }> = ({ resource, compact = false }) => {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const image = resource.type === 'image';
  const link = resource.type === 'link';
  const tone = resource.type === 'pdf' ? 'bg-[#fff1ec] text-[#bd5037]' : link ? 'bg-[#eef4fb] text-[#47759a]' : image ? 'bg-[#f1f3ef] text-[#71826b]' : 'bg-[#f0f1f6] text-[#69738e]';
  return (
    <span aria-hidden="true" className={`relative flex shrink-0 items-center justify-center overflow-hidden ${tone} ${compact ? 'h-16 w-14 rounded-xl' : 'h-40 w-full rounded-t-[19px] border-b border-black/[0.04]'}`}>
      {image && failedUrl !== resource.url ? (
        <img src={resource.url} alt="" loading="lazy" decoding="async" onError={() => setFailedUrl(resource.url)} className={`h-full w-full object-contain ${compact ? 'p-1' : 'p-3'}`} />
      ) : link ? (
        <svg viewBox="0 0 120 100" className={compact ? 'w-12' : 'w-32'} fill="none">
          <rect x="12" y="16" width="96" height="70" rx="9" fill="white" stroke="currentColor" strokeOpacity=".25" />
          <path d="M12 34h96" stroke="currentColor" strokeOpacity=".2" />
          <circle cx="23" cy="25" r="2" fill="currentColor" opacity=".5" /><circle cx="31" cy="25" r="2" fill="currentColor" opacity=".3" /><circle cx="39" cy="25" r="2" fill="currentColor" opacity=".2" />
          <path d="m55 65 10-10m-17 4-4 4a8 8 0 0 0 11 11l7-7m-4-15 7-7a8 8 0 0 1 11 11l-4 4" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
        </svg>
      ) : image ? (
        <svg viewBox="0 0 100 90" className={compact ? 'w-10' : 'w-28'} fill="none"><rect x="10" y="12" width="80" height="65" rx="8" fill="white" stroke="currentColor" strokeOpacity=".3" /><circle cx="68" cy="32" r="8" fill="currentColor" opacity=".3" /><path d="m15 68 22-26 19 20 12-11 17 17" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
      ) : (
        <svg viewBox="0 0 100 110" className={compact ? 'w-10' : 'w-[88px]'} fill="none">
          <rect x="20" y="14" width="65" height="88" rx="7" fill="currentColor" opacity=".09" transform="rotate(7 52 58)" />
          <path d="M22 7h40l19 19v68a7 7 0 0 1-7 7H22a7 7 0 0 1-7-7V14a7 7 0 0 1 7-7Z" fill="white" stroke="currentColor" strokeOpacity=".25" />
          <path d="M62 7v15a4 4 0 0 0 4 4h15" fill="currentColor" fillOpacity=".1" stroke="currentColor" strokeOpacity=".2" />
          <path d="M29 71h38M29 81h27" stroke="currentColor" strokeOpacity=".2" strokeWidth="3" strokeLinecap="round" />
          <text x="48" y="55" textAnchor="middle" fill="currentColor" fontSize="15" fontWeight="700" fontFamily="system-ui, sans-serif">{resource.type === 'pdf' ? 'PDF' : resource.type === 'doc' ? 'DOC' : 'FILE'}</text>
        </svg>
      )}
      {!compact && <span className="absolute bottom-2.5 left-3 rounded-md bg-white/95 px-2 py-1 text-[10px] font-bold tracking-wide shadow-sm">{resource.type === 'image' ? 'IMAGE' : resource.type === 'link' ? 'WEB LINK' : resource.type.toUpperCase()}</span>}
    </span>
  );
};

export default ResourceArtwork;
