import React, { useEffect, useState } from 'react';
import ModalShell from '../followups/ModalShell';
import Spinner from '../Spinner';
import { resourcesApi } from '../../services/api';
import type { Resource, ResourceVersionEntry, ResourceVersions } from '../../types';

const when = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const label = (v: ResourceVersionEntry) => (v.type === 'link' ? v.url : v.fileName || 'File');

const Row: React.FC<{ v: ResourceVersionEntry; current?: boolean }> = ({ v, current }) => (
  <li className="flex items-start gap-3 border-t border-gray-100 py-3 first:border-t-0">
    <div className="min-w-0 flex-1">
      <p className="text-[14px] font-semibold text-gray-900">{current ? 'Current' : `Version ${v.versionNo}`}</p>
      <p className="mt-0.5 break-words text-[12px] text-gray-500">{label(v)} · {when(v.at)}{v.by ? ` · ${v.by}` : ''}</p>
      {v.note && <p className="mt-0.5 text-[12px] italic text-gray-500">&ldquo;{v.note}&rdquo;</p>}
    </div>
    {current
      ? <span className="flex-none rounded-full bg-emerald-100/80 px-2.5 py-1 text-xs font-semibold text-emerald-700">Live</span>
      : <a href={v.url} target="_blank" rel="noopener noreferrer" className="flex-none text-[13px] font-semibold text-primary">Open</a>}
  </li>
);

// Every file or link a resource has had. Admins only.
const ResourceHistorySheet: React.FC<{ resource: Resource | null; onClose: () => void }> = ({ resource, onClose }) => {
  const [data, setData] = useState<ResourceVersions | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!resource) return undefined;
    let cancelled = false;
    setData(null);
    setError('');
    resourcesApi.getVersions(resource.id)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load the history.'); });
    return () => { cancelled = true; };
  }, [resource]);

  return (
    <ModalShell isOpen={!!resource} onClose={onClose} title="Version history" subtitle={resource?.title}>
      <div>
        {error ? <p className="text-sm text-gray-500">{error}</p> : !data ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : (
          <ul>
            <Row v={data.current} current />
            {data.earlier.map((v) => <Row key={v.versionNo} v={v} />)}
            {data.earlier.length === 0 && <li className="border-t border-gray-100 py-3 text-[13px] text-gray-500">No earlier versions yet.</li>}
          </ul>
        )}
      </div>
    </ModalShell>
  );
};

export default ResourceHistorySheet;
