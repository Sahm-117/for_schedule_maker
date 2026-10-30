import { useEffect, useState } from 'react';
import { privateFilesApi } from '../services/api';
import { PRIVATE_FILE_PREFIX } from '../services/supabase-api';

// Private files (FLOW_MAP rule 129) are stored as "fof-private:<path>". Screens that show files pass their items
// through this hook, which swaps each private one's url for a signed link that works for two hours (kept here for
// 90 minutes, so a link handed out is never close to expiring). Until the link arrives the url is empty, and
// screens must not open a file with an empty url.

const KEEP_MS = 90 * 60 * 1000;
// A file the server didn't sign (not allowed, or gone) isn't asked for again for a while.
const DECLINED_MS = 10 * 60 * 1000;
// Screens left open re-check their links this often, so one is renewed before it runs out.
const RECHECK_MS = 10 * 60 * 1000;
const signed = new Map<string, { url: string; until: number }>();

export const isPrivateFile = (url: string | null | undefined): boolean => !!url && url.startsWith(PRIVATE_FILE_PREFIX);

const keyOf = (kind: string, id: string) => `${kind}:${id}`;
const freshUrl = (kind: string, id: string): string | null => {
  const hit = signed.get(keyOf(kind, id));
  return hit && hit.until > Date.now() ? hit.url : null;
};

export function useSignedFileUrls<T extends { url: string; id?: string }>(items: T[], kind: 'resource' | 'version'): T[] {
  const [, setVersion] = useState(0);
  // Asked for already and still current (signed, or recently declined)?
  const known = (id: string) => (signed.get(keyOf(kind, id))?.until ?? 0) > Date.now();
  const missing = items.filter((i) => i.id && isPrivateFile(i.url) && !known(i.id)).map((i) => i.id as string);
  const missingKey = [...new Set(missing)].sort().join(',');

  useEffect(() => {
    if (!missingKey) return undefined;
    let cancelled = false;
    privateFilesApi.sign(kind, missingKey.split(','))
      .then((urls) => {
        const now = Date.now();
        missingKey.split(',').forEach((id) => {
          const url = urls[id];
          signed.set(keyOf(kind, id), url ? { url, until: now + KEEP_MS } : { url: '', until: now + DECLINED_MS });
        });
        if (!cancelled) setVersion((v) => v + 1);
      })
      .catch(() => { /* the file shows as unavailable; reopening the screen tries again */ });
    return () => { cancelled = true; };
  }, [missingKey, kind]);

  // A screen left open re-renders now and then, so links past their time are asked for again.
  useEffect(() => {
    const timer = window.setInterval(() => setVersion((v) => v + 1), RECHECK_MS);
    return () => window.clearInterval(timer);
  }, []);

  return items.map((i) => (isPrivateFile(i.url) ? { ...i, url: (i.id && freshUrl(kind, i.id)) || '' } : i));
}
