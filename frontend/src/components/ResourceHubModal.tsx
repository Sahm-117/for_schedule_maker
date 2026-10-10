import React, { useState, useEffect, useRef } from 'react';
import { resourcesApi, supportHubsApi } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import { usePermissions } from '../hooks/usePermissions';
import { useAppData } from '../context/AppDataContext';
import type { Resource, SupportHub } from '../types';
import { downloadFile } from '../utils/download';
import DocumentViewerSheet from './DocumentViewerSheet';
import ResourceArtwork from './resources/ResourceArtwork';
import { sortByText } from '../utils/sort';
import AppOverflowMenu from './AppOverflowMenu';
import ResourceEditorModal from './resources/ResourceEditorModal';
import ResourceHistorySheet from './resources/ResourceHistorySheet';
import { audienceFromResource } from './resources/audience';

const LAST_SEEN_KEY = 'fof_resources_last_seen';

interface ResourceHubModalProps {
  isOpen: boolean;
  onClose: () => void;
  onViewed?: () => void;
  embedded?: boolean;
  layout?: 'list' | 'grid';
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const ResourceHubModal: React.FC<ResourceHubModalProps> = ({ isOpen, onClose, onViewed, embedded = false, layout = 'list' }) => {
  const { isAdmin } = useAuth();
  const { can } = usePermissions();
  const canAdd = can('resources', 'add');
  const canEdit = can('resources', 'edit');
  const canDelete = can('resources', 'delete');
  const { activeCohort, liveRevision } = useAppData();
  const [resources, setResources] = useState<Resource[]>([]);
  const [viewing, setViewing] = useState<Resource | null>(null);
  const [loading, setLoading] = useState(false);
  const [editor, setEditor] = useState<{ mode: 'add' | 'update'; resource: Resource | null } | null>(null);
  const [historyFor, setHistoryFor] = useState<Resource | null>(null);
  const [hubs, setHubs] = useState<SupportHub[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Only the first load shows a spinner; live updates refresh the list quietly.
  const loadedOnce = useRef(false);
  const load = () => {
    if (!loadedOnce.current) setLoading(true);
    resourcesApi.getAll()
      .then((res) => setResources(sortByText(res.resources, (resource) => resource.title)))
      .catch(() => {})
      .finally(() => { loadedOnce.current = true; setLoading(false); });
  };

  const shouldRender = embedded || isOpen;

  useEffect(() => {
    if (!shouldRender) return;
    load();
    // Mark as seen
    localStorage.setItem(LAST_SEEN_KEY, new Date().toISOString());
    onViewed?.();
  }, [liveRevision, onViewed, shouldRender]);

  // Hubs are the audience choices for supports; only admins pick an audience.
  useEffect(() => {
    if (!isAdmin || !activeCohort?.id) { setHubs([]); return; }
    supportHubsApi.getAll(activeCohort.id).then((res) => setHubs(res.hubs)).catch(() => setHubs([]));
  }, [isAdmin, activeCohort?.id]);

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await resourcesApi.delete(id);
      setResources((prev) => prev.filter((r) => r.id !== id));
    } catch {}
    finally { setDeletingId(null); }
  };

  if (!shouldRender) return null;

  const editorModals = isAdmin ? (
    <>
      <ResourceEditorModal
        isOpen={!!editor}
        onClose={() => setEditor(null)}
        mode={editor?.mode ?? 'add'}
        resource={editor?.resource ?? null}
        hubs={hubs}
        onSaved={(saved) => setResources((prev) => sortByText([...prev.filter((item) => item.id !== saved.id), saved], (resource) => resource.title))}
      />
      <ResourceHistorySheet resource={historyFor} onClose={() => setHistoryFor(null)} />
    </>
  ) : null;

  const content = (
    <>
      <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Resources</h2>
          <p className="text-xs text-gray-500 mt-0.5">Guides, links, and files for the team</p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && canAdd && (
            <button
              onClick={() => setEditor({ mode: 'add', resource: null })}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white text-xs font-semibold rounded-lg hover:bg-primary-dark"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
              </svg>
              Add
            </button>
          )}
          {!embedded && (
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Resource list */}
          {loading ? (
            <div className="flex justify-center py-10">
              <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-primary" />
            </div>
          ) : resources.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
                <svg className="w-7 h-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </div>
              <p className="text-sm text-gray-500 font-medium">No resources yet</p>
              {isAdmin && canAdd && <p className="text-xs text-gray-400 mt-1">Tap Add to upload files or add links</p>}
            </div>
          ) : layout === 'grid' ? (
            <div className="grid gap-3.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 210px), 1fr))' }}>
              {resources.map((r) => {
                const meta = [r.type === 'image' ? 'Image' : r.type === 'pdf' ? 'PDF document' : r.type === 'link' ? 'Web link' : 'Document', r.fileSize ? formatBytes(r.fileSize) : null].filter(Boolean).join(' · ');
                const inner = (
                  <>
                    <ResourceArtwork resource={r} />
                    <span className="flex min-w-0 flex-1 flex-col p-4">
                      <span className="block text-[15px] font-semibold leading-snug text-gray-900 [overflow-wrap:anywhere]">{r.title}</span>
                      <span className="mt-1.5 block text-xs text-gray-500">{meta}</span>
                      {r.description && <span className="mt-2 line-clamp-2 text-xs leading-relaxed text-gray-500">{r.description}</span>}
                      <span className="mt-auto flex items-center justify-between gap-2 pt-4 text-xs font-semibold text-gray-600">
                        {r.type === 'link' ? 'Open link' : r.type === 'pdf' || r.type === 'image' ? 'View in app' : 'Download file'}
                        <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path strokeLinecap="round" strokeLinejoin="round" d={r.type === 'link' ? 'M7 17 17 7M7 7h10v10' : 'm9 5 7 7-7 7'} /></svg>
                      </span>
                    </span>
                  </>
                );
                const cardCls = 'group flex min-w-0 flex-col overflow-hidden rounded-[20px] border border-[#e9ebef] bg-white text-left shadow-sm transition hover:border-[#d3d7df] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2';
                return r.type === 'link' ? (
                  <a key={r.id} href={r.url} target="_blank" rel="noopener noreferrer" className={cardCls}>{inner}</a>
                ) : (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => { if (r.type === 'pdf' || r.type === 'image') setViewing(r); else void downloadFile(r.url, r.fileName ?? r.title); }}
                    className={cardCls}
                  >
                    {inner}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="space-y-2">
              {resources.map((r) => (
                <div key={r.id} className="flex items-start gap-3 p-3 border border-gray-100 rounded-xl hover:bg-gray-50 transition-colors">
                  <ResourceArtwork resource={r} compact />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{r.title}</p>
                    {r.description && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{r.description}</p>}
                    {r.fileName && r.fileSize && (
                      <p className="text-xs text-gray-400 mt-0.5">{r.fileName} · {formatBytes(r.fileSize)}</p>
                    )}
                    {isAdmin && (() => {
                      const aud = audienceFromResource(r);
                      const hubNames = aud.hubIds.map((id) => hubs.find((h) => h.id === id)?.name).filter(Boolean) as string[];
                      const who = [
                        aud.supports ? (aud.hubsOnly ? (hubNames.length ? hubNames.join(', ') : 'Hubs') : 'Supports') : '',
                        aud.participants ? 'Participants' : '',
                      ].filter(Boolean).join(' + ');
                      const cohortName = activeCohort?.id === r.cohortId ? activeCohort?.name ?? 'Cohort' : 'One cohort';
                      const pill = 'inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-semibold';
                      const history = [
                        r.updatedAt ? `Updated ${new Date(r.updatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : '',
                        (r.versionCount ?? 0) > 0 ? `${r.versionCount} earlier` : '',
                      ].filter(Boolean).join(' · ');
                      return (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          <span className={`${pill} bg-violet-100/80 text-violet-700`}>{who}</span>
                          <span className={`${pill} ${aud.cohortId ? 'bg-neutral-100 text-neutral-600' : 'bg-emerald-100/80 text-emerald-700'}`}>{aud.cohortId ? cohortName : 'All cohorts'}</span>
                          {history && <span className={`${pill} bg-orange-100/80 text-orange-700`}>{history}</span>}
                        </div>
                      );
                    })()}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {r.type === 'link' ? (
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                        title="Open"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                    ) : (
                      <button
                        type="button"
                        onClick={() => { if (r.type === 'pdf' || r.type === 'image') setViewing(r); else void downloadFile(r.url, r.fileName ?? r.title); }}
                        className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                        title={r.type === 'pdf' || r.type === 'image' ? 'View in app' : 'Download'}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </button>
                    )}
                    {isAdmin && (
                      <AppOverflowMenu
                        align="right"
                        items={[
                          ...(canEdit ? [{ label: 'Update document', onClick: () => setEditor({ mode: 'update', resource: r }) }] : []),
                          { label: 'Version history', onClick: () => setHistoryFor(r) },
                          ...(canDelete ? [{ label: deletingId === r.id ? 'Deleting…' : 'Delete', onClick: () => { void handleDelete(r.id); }, tone: 'danger' as const }] : []),
                        ]}
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
      </div>
      <DocumentViewerSheet open={!!viewing} url={viewing?.url ?? null} title={viewing?.title ?? ''} fileName={viewing?.fileName} fileType={viewing?.type} onClose={() => setViewing(null)} />
    </>
  );

  return embedded ? (
    <>
      <div className={layout === 'grid'
        ? 'flex min-h-[20rem] flex-col overflow-hidden rounded-[22px] border border-[#eef0f4] bg-white shadow-[0_2px_8px_-3px_rgba(17,24,39,0.10)]'
        : 'surface-card flex min-h-[32rem] flex-col overflow-hidden'}
      >
        {content}
      </div>
      {editorModals}
    </>
  ) : (
    <>
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-xl">
          {content}
        </div>
      </div>
      {editorModals}
    </>
  );
};

export default ResourceHubModal;
