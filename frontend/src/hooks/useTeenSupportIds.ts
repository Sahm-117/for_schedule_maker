import { useCallback, useEffect, useRef, useState } from 'react';
import { supportTagsApi } from '../services/api';

// Who the Teen Supports are (the built-in TEEN_SUPPORT tag). A teen can only be handed to one of
// them, so the teen pickers list only these. Loaded when `enabled` turns on, and again on reload()
// (so a support added to the tag meanwhile shows up). Until it arrives, or if it fails, `ids` is
// null or empty and a teen's picker offers nobody new; `failed` says which, so the screen can say so.
export const useTeenSupportIds = (enabled: boolean) => {
  const [ids, setIds] = useState<Set<string> | null>(null);
  const [failed, setFailed] = useState(false);
  const request = useRef(0);

  const reload = useCallback(() => {
    const mine = ++request.current;
    setFailed(false);
    supportTagsApi.getAll()
      .then(({ tags }) => { if (mine === request.current) setIds(new Set(tags.find((t) => t.systemKey === 'TEEN_SUPPORT')?.userIds ?? [])); })
      .catch(() => { if (mine === request.current) { setIds(new Set()); setFailed(true); } });
  }, []);

  useEffect(() => {
    if (!enabled) { request.current += 1; setIds(null); setFailed(false); return; }
    reload();
    return () => { request.current += 1; };
  }, [enabled, reload]);

  return { ids, failed, reload };
};
