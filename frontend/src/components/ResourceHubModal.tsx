import React, { useState, useEffect, useRef } from 'react';
import { resourcesApi, supportHubsApi } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import { useAppData } from '../context/AppDataContext';
import type { Resource, SupportHub } from '../types';
import { downloadFile } from '../utils/download';
import DocumentViewerSheet from './DocumentViewerSheet';
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

const TYPE_ICONS: Record<Resource['type'], React.ReactNode> = {
  link: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
    </svg>
  ),
  pdf: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
    </svg>
  ),
  doc: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
  image: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  ),
  file: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
    </svg>
  ),
};

const TYPE_COLORS: Record<Resource['type'], string> = {
  link: 'bg-blue-50 text-blue-600',
  pdf: 'bg-red-50 text-red-600',
  doc: 'bg-indigo-50 text-indigo-600',
  image: 'bg-purple-50 text-purple-600',
  file: 'bg-gray-100 text-gray-600',
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const TYPE_KIND: Record<Resource['type'], string> = {
  link: 'LINK',
  pdf: 'PDF',
  doc: 'DOC',
  image: 'IMG',
  file: 'FILE',
};

const ResourceHubModal: React.FC<ResourceHubModalProps> = ({ isOpen, onClose, onViewed, embedded = false, layout = 'list' }) => {
  const { isAdmin } = useAuth();
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
          {isAdmin && (
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
              {isAdmin && <p className="text-xs text-gray-400 mt-1">Tap Add to upload files or add links</p>}
            </div>
          ) : layout === 'grid' ? (
            <div className="grid gap-3.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
              {resources.map((r) => {
                const meta = r.fileName && r.fileSize ? `${r.fileName} · ${formatBytes(r.fileSize)}` : r.description || (r.type === 'link' ? r.url : '');
                const inner = (
                  <>
                    <span className={`grid h-12 w-12 place-items-center rounded-full text-[11px] font-bold ${TYPE_COLORS[r.type]}`}>{TYPE_KIND[r.type]}</span>
                    <span className="min-w-0">
                      <span className="block text-[15px] font-bold text-gray-800">{r.title}</span>
                      {meta && <span className="mt-1 block truncate text-xs text-gray-400">{meta}</span>}
                    </span>
                  </>
                );
                const cardCls = 'flex flex-col gap-3.5 rounded-[20px] border border-[#eef0f4] bg-white p-5 text-left shadow-[0_2px_8px_-3px_rgba(17,24,39,0.10)] transition hover:border-[#ffdeca]';
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
              <DocumentViewerSheet
                open={!!viewing}
                url={viewing?.url ?? null}
                title={viewing?.title ?? ''}
                fileName={viewing?.fileName}
                onClose={() => setViewing(null)}
              />
            </div>
          ) : (
            <div className="space-y-2">
              {resources.map((r) => (
                <div key={r.id} className="flex items-start gap-3 p-3 border border-gray-100 rounded-xl hover:bg-gray-50 transition-colors">
                  <div className={`flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center ${TYPE_COLORS[r.type]}`}>
                    {TYPE_ICONS[r.type]}
                  </div>
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
                        onClick={() => { void downloadFile(r.url, r.fileName ?? r.title); }}
                        className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                        title="Download"
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
                          { label: 'Update document', onClick: () => setEditor({ mode: 'update', resource: r }) },
                          { label: 'Version history', onClick: () => setHistoryFor(r) },
                          { label: deletingId === r.id ? 'Deleting…' : 'Delete', onClick: () => { void handleDelete(r.id); }, tone: 'danger' },
                        ]}
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
      </div>
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
