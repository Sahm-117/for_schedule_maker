import { useEffect, useState } from 'react';
import { followUpRelatedApi } from '../services/api';
import type { FollowUpRelatedContact } from '../types';

const cache = new Map<string, FollowUpRelatedContact[]>();

// Other sign-ups that used the same email as this contact. Only asked for when enabled
// (a contact with no working number), and remembered for the session.
export const useRelatedContacts = (contactId: string | undefined, enabled: boolean): FollowUpRelatedContact[] => {
  const [list, setList] = useState<FollowUpRelatedContact[]>(() => (contactId ? cache.get(contactId) ?? [] : []));
  useEffect(() => {
    if (!contactId || !enabled) { setList([]); return; }
    const hit = cache.get(contactId);
    if (hit) { setList(hit); return; }
    let cancelled = false;
    followUpRelatedApi.forContact(contactId).then((rows) => {
      cache.set(contactId, rows);
      if (!cancelled) setList(rows);
    });
    return () => { cancelled = true; };
  }, [contactId, enabled]);
  return list;
};
