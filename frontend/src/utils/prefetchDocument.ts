// Warms the browser up for the in-app document viewer, so a recap or manual opens quickly.
// The PDF reader (a few hundred KB, plus its worker) and the file itself are fetched in the
// background; the viewer then finds them in the browser cache. Skipped on Data Saver / 2G.

const canPrefetch = () => {
  const connection = (navigator as unknown as { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (connection?.saveData) return false;
  if (connection?.effectiveType && /(^|-)2g$/.test(connection.effectiveType)) return false;
  return true;
};

const idle = (work: () => void) => {
  const w = window as unknown as { requestIdleCallback?: (cb: () => void) => void };
  if (w.requestIdleCallback) w.requestIdleCallback(work);
  else window.setTimeout(work, 300);
};

let engineWarmed = false;
export const prefetchPdfEngine = () => {
  if (engineWarmed || !canPrefetch()) return;
  engineWarmed = true;
  idle(() => {
    void import('pdfjs-dist').catch(() => undefined);
    void import('pdfjs-dist/build/pdf.worker.min.mjs?url')
      .then((mod) => fetch(mod.default as string).catch(() => undefined))
      .catch(() => undefined);
  });
};

const warmedFiles = new Set<string>();
export const prefetchDocumentFile = (url: string | null | undefined) => {
  if (!url || warmedFiles.has(url) || !canPrefetch()) return;
  warmedFiles.add(url);
  idle(() => { void fetch(url).then((response) => response.arrayBuffer()).catch(() => undefined); });
};
