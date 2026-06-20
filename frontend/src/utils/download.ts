// Shared helpers to make file downloads save directly to the user's device
// rather than opening a browser tab/viewer.

// Force a Supabase Storage URL to be served as an attachment ("save", not "view")
// by appending its native ?download=<filename> param. No-op for non-Supabase URLs.
export function forceDownloadUrl(url: string, name?: string): string {
  try {
    const u = new URL(url);
    if (u.hostname.includes('supabase') && !u.searchParams.has('download')) {
      u.searchParams.set('download', name || '');
    }
    return u.toString();
  } catch {
    return url;
  }
}

// Programmatically click an anchor with the download attribute set.
function triggerSave(href: string, name: string) {
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// Download any file URL straight to the device.
// Primary path fetches the file to a blob so the browser saves it directly;
// if that's blocked (e.g. cross-origin), it falls back to a forced-download URL
// so the file still saves instead of opening a tab.
export async function downloadFile(url: string, name?: string): Promise<void> {
  const fileName = name || (() => {
    try { return decodeURIComponent(new URL(url).pathname.split('/').pop() || 'download'); }
    catch { return 'download'; }
  })();

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('fetch failed');
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    triggerSave(objectUrl, fileName);
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  } catch {
    triggerSave(forceDownloadUrl(url, fileName), fileName);
  }
}
