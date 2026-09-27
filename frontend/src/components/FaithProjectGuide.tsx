import { useEffect, useState } from 'react';
import ClassManualReader from './classManual/ClassManualReader';
import type { ManualContent } from './classManual/types';
import './FaithProjectGuide.css';

// Entry card for the Faith Project guide; opens the full-screen comic reader
// (same reader as the class manuals). The guide and its art load on first open.
// Pass className to render the trigger as a plain button (e.g. a pill).
export default function FaithProjectGuide({ className }: { className?: string } = {}) {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState<ManualContent | null>(null);

  useEffect(() => {
    if (!open || content) return;
    let cancelled = false;
    import('./classManual/manuals/faithGuide')
      .then((m) => { if (!cancelled) setContent(m.default); })
      .catch(() => { if (!cancelled) setOpen(false); });
    return () => { cancelled = true; };
  }, [open, content]);

  return <>
    {className ? (
      <button type="button" className={className} onClick={() => setOpen(true)} aria-haspopup="dialog">
        <span aria-hidden="true">✦</span>Explore the guide
      </button>
    ) : (
    <button type="button" className="faith-guide-entry" onClick={() => setOpen(true)} aria-haspopup="dialog">
      <span className="faith-guide-entry-mark" aria-hidden="true">✦</span>
      <span className="flex-1"><strong className="block text-sm">Explore the Faith Project guide</strong></span>
      <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" d="m9 5 7 7-7 7" /></svg>
    </button>
    )}
    {open && content && <ClassManualReader content={content} onClose={() => setOpen(false)} />}
  </>;
}
