import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// In-app document viewer: opens as a sheet over most of the screen so supports never leave the app.
// PDFs are drawn page by page with pdf.js (phone browsers can't scroll embedded PDFs reliably).
// The sheet can be minimised to a small pill and reopened.

interface DocumentViewerSheetProps {
  open: boolean;
  url: string | null;
  title: string;
  fileName?: string | null;
  onClose: () => void;
}

const isPdf = (url: string, fileName?: string | null) => /\.pdf($|\?)/i.test(fileName || '') || /\.pdf($|\?)/i.test(url);
const isImage = (url: string, fileName?: string | null) => /\.(png|jpe?g|gif|webp)($|\?)/i.test(fileName || url);

const PdfPages: React.FC<{ url: string }> = ({ url }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;
    let destroy: (() => void) | null = null;
    const container = containerRef.current;
    if (!container) return undefined;
    container.innerHTML = '';
    setState('loading');

    (async () => {
      try {
        const pdfjs = await import('pdfjs-dist');
        const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
        const task = pdfjs.getDocument({ url });
        destroy = () => { void task.destroy(); };
        const doc = await task.promise;
        if (cancelled) return;
        const width = container.clientWidth || 360;
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
          if (cancelled) return;
          const page = await doc.getPage(pageNumber);
          const base = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: (width / base.width) * ratio });
          const canvas = document.createElement('canvas');
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.style.width = '100%';
          canvas.style.height = 'auto';
          canvas.className = 'block rounded-lg bg-white shadow-sm';
          container.appendChild(canvas);
          const context = canvas.getContext('2d');
          if (context) await page.render({ canvasContext: context, viewport }).promise;
          if (pageNumber === 1 && !cancelled) setState('ready');
        }
      } catch {
        if (!cancelled) setState('error');
      }
    })();

    return () => {
      cancelled = true;
      destroy?.();
    };
  }, [url]);

  return (
    <>
      {state === 'loading' && <p className="py-10 text-center text-sm text-gray-400">Opening document…</p>}
      {state === 'error' && <p className="py-10 text-center text-sm text-gray-500">This document could not be opened.</p>}
      <div ref={containerRef} className="flex flex-col gap-3" />
    </>
  );
};

const DocumentViewerSheet: React.FC<DocumentViewerSheetProps> = ({ open, url, title, fileName, onClose }) => {
  const [minimised, setMinimised] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (open) setMinimised(false);
  }, [open, url]);

  useEffect(() => {
    if (!open || minimised) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [open, minimised]);

  if (!open || !url) return null;

  const download = async () => {
    setDownloading(true);
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = fileName || `${title}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } finally {
      setDownloading(false);
    }
  };

  const iconButton = 'grid h-9 w-9 place-items-center rounded-full text-gray-500 transition hover:bg-gray-100 hover:text-gray-800';

  return createPortal(
    <>
      {minimised ? (
        <button
          type="button"
          onClick={() => setMinimised(false)}
          className="fixed bottom-[calc(env(safe-area-inset-bottom,0px)+96px)] right-4 z-[130] flex max-w-[70vw] items-center gap-2 rounded-full bg-[#3f4757] py-2.5 pl-3.5 pr-4 text-[13px] font-semibold text-white shadow-lg md:bottom-6"
        >
          <svg className="h-4 w-4 flex-none" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 3h7l5 5v13H7zM14 3v5h5" /></svg>
          <span className="truncate">{title}</span>
        </button>
      ) : (
        <div className="fixed inset-0 z-[130] flex items-end justify-center bg-black/40 md:items-center" onClick={() => setMinimised(true)}>
          <div
            role="dialog"
            aria-label={title}
            onClick={(event) => event.stopPropagation()}
            className="flex h-[88vh] w-full flex-col overflow-hidden rounded-t-[22px] bg-[#f4f5f7] shadow-2xl md:h-[90vh] md:max-w-3xl md:rounded-[22px]"
          >
            <div className="flex items-center gap-1 border-b border-gray-200 bg-white px-3 py-2">
              <p className="min-w-0 flex-1 truncate pl-1 text-sm font-bold text-gray-900">{title}</p>
              <button type="button" onClick={() => { void download(); }} disabled={downloading} className={`${iconButton} disabled:opacity-40`} aria-label="Download" title="Download">
                <svg className="h-[17px] w-[17px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M12 4v11m0 0-4-4m4 4 4-4M5 19h14" /></svg>
              </button>
              <button type="button" onClick={() => setMinimised(true)} className={iconButton} aria-label="Minimise" title="Minimise">
                <svg className="h-[17px] w-[17px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 12h12" /></svg>
              </button>
              <button type="button" onClick={onClose} className={iconButton} aria-label="Close document" title="Close">
                <svg className="h-[17px] w-[17px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18 18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
              {isPdf(url, fileName) ? (
                <PdfPages url={url} />
              ) : isImage(url, fileName) ? (
                <img src={url} alt={title} className="mx-auto block rounded-lg bg-white" />
              ) : (
                <p className="py-10 text-center text-sm text-gray-500">A preview isn’t available for this file type. Use download to open it.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </>,
    document.body,
  );
};

export default DocumentViewerSheet;
