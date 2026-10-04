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
  fileType?: string | null;
  onClose: () => void;
}

const isPdf = (url: string, fileName?: string | null) => /\.pdf($|[?#])/i.test(fileName || '') || /\.pdf($|[?#])/i.test(url);
const isImage = (url: string, fileName?: string | null) => /\.(png|jpe?g|gif|webp|avif|svg|bmp)($|[?#])/i.test(fileName || '') || /\.(png|jpe?g|gif|webp|avif|svg|bmp)($|[?#])/i.test(url);

const ImagePreview: React.FC<{ url: string; title: string }> = ({ url, title }) => {
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  return (
    <>
      {state === 'loading' && <p role="status" className="py-10 text-center text-sm text-gray-500">Opening image…</p>}
      {state === 'error' && <p role="alert" className="py-10 text-center text-sm text-gray-500">This image could not be opened. You can try downloading it instead.</p>}
      <img src={url} alt={title} onLoad={() => setState('ready')} onError={() => setState('error')} className={`mx-auto h-auto max-w-full rounded-lg bg-white object-contain ${state === 'ready' ? 'block' : 'hidden'}`} />
    </>
  );
};

const PdfPages: React.FC<{ url: string }> = ({ url }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [percent, setPercent] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    let destroy: (() => void) | null = null;
    const container = containerRef.current;
    if (!container) return undefined;
    container.innerHTML = '';
    setState('loading');
    setPercent(null);

    (async () => {
      try {
        const pdfjs = await import('pdfjs-dist');
        const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
        // Range requests + no read-ahead: the first page can show before the whole file has arrived.
        const task = pdfjs.getDocument({ url, disableAutoFetch: true });
        task.onProgress = ({ loaded, total }: { loaded: number; total?: number }) => {
          if (!cancelled && total) setPercent(Math.min(99, Math.round((loaded / total) * 100)));
        };
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
      {state === 'loading' && (
        <div className="py-10 text-center">
          <p className="text-sm text-gray-400">Opening document…{percent !== null ? ` ${percent}%` : ''}</p>
          <div className="mx-auto mt-3 h-1 w-40 overflow-hidden rounded-full bg-gray-200">
            <div className={`h-full rounded-full bg-primary transition-all ${percent === null ? 'w-1/3 animate-pulse' : ''}`} style={percent === null ? undefined : { width: `${percent}%` }} />
          </div>
        </div>
      )}
      {state === 'error' && <p className="py-10 text-center text-sm text-gray-500">This document could not be opened.</p>}
      <div ref={containerRef} className="flex flex-col gap-3" />
    </>
  );
};

const DocumentViewerSheet: React.FC<DocumentViewerSheetProps> = ({ open, url, title, fileName, fileType, onClose }) => {
  const [minimised, setMinimised] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);

  useEffect(() => {
    if (open) setMinimised(false);
    else openerRef.current = null;
    setDownloadError(null);
  }, [open, url]);

  useEffect(() => {
    if (!open || !url || minimised) return undefined;
    const previous = document.body.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!openerRef.current && previousFocus !== document.body) openerRef.current = previousFocus;
    document.body.style.overflow = 'hidden';
    const dialog = dialogRef.current;
    dialog?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
      } else if (event.key === 'Tab' && dialog) {
        const buttons = Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], [tabindex="0"]'));
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        if (!first) { event.preventDefault(); dialog.focus(); }
        else if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog || !dialog.contains(document.activeElement))) {
          event.preventDefault(); last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
          event.preventDefault(); first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener('keydown', onKeyDown, true);
      if (previousFocus?.isConnected) previousFocus.focus();
      else if (openerRef.current?.isConnected) openerRef.current.focus();
    };
  }, [open, url, minimised]);

  if (!open || !url) return null;

  const type = fileType?.toLowerCase();
  const explicitPdf = type === 'pdf' || type === 'application/pdf';
  const explicitImage = type === 'image' || Boolean(type?.startsWith('image/'));
  const pdf = explicitPdf || (!explicitImage && isPdf(url, fileName));
  const image = explicitImage || (!explicitPdf && isImage(url, fileName));

  const download = async () => {
    setDownloading(true);
    setDownloadError(null);
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error('Download failed');
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      const mimeExtension: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'image/avif': 'avif', 'image/svg+xml': 'svg', 'image/bmp': 'bmp', 'application/pdf': 'pdf' };
      const extension = mimeExtension[blob.type.split(';')[0]] || (pdf ? 'pdf' : url.split(/[?#]/)[0].match(/\.([a-z0-9]{2,5})$/i)?.[1]);
      link.download = fileName || `${title.replace(/[\\/:*?"<>|]/g, '-')}${extension && !title.toLowerCase().endsWith(`.${extension.toLowerCase()}`) ? `.${extension}` : ''}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch {
      setDownloadError('Download failed. Check your connection and try again.');
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
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            tabIndex={-1}
            onClick={(event) => event.stopPropagation()}
            className="flex h-[88vh] w-full flex-col overflow-hidden rounded-t-[22px] bg-[#f4f5f7] shadow-2xl md:h-[90vh] md:max-w-3xl md:rounded-[22px]"
          >
            <div className="flex items-center gap-1 border-b border-gray-200 bg-white px-3 py-2">
              <p className="min-w-0 flex-1 truncate pl-1 text-sm font-bold text-gray-900">{title}</p>
              <button type="button" onClick={() => { void download(); }} disabled={downloading} className="flex h-9 shrink-0 items-center gap-1.5 rounded-full px-2 text-xs font-semibold text-gray-600 transition hover:bg-gray-100 hover:text-gray-800 disabled:opacity-40" aria-label={downloading ? 'Downloading' : 'Download'} title="Download">
                <svg className="h-[17px] w-[17px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M12 4v11m0 0-4-4m4 4 4-4M5 19h14" /></svg>
                <span>{downloading ? 'Saving…' : 'Download'}</span>
              </button>
              <button type="button" onClick={() => setMinimised(true)} className={iconButton} aria-label="Minimise" title="Minimise">
                <svg className="h-[17px] w-[17px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 12h12" /></svg>
              </button>
              <button type="button" onClick={onClose} className={iconButton} aria-label="Close document" title="Close">
                <svg className="h-[17px] w-[17px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18 18 6M6 6l12 12" /></svg>
              </button>
            </div>
            {downloadError && <p role="alert" className="border-b border-red-100 bg-red-50 px-4 py-2 text-xs text-red-700">{downloadError}</p>}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
              {pdf ? (
                <PdfPages url={url} />
              ) : image ? (
                <ImagePreview key={url} url={url} title={title} />
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
