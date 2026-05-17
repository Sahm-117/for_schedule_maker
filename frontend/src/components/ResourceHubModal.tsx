import React, { useState, useEffect, useRef } from 'react';
import { resourcesApi, announcementsApi } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import type { Resource } from '../types';

const LAST_SEEN_KEY = 'fof_resources_last_seen';

interface ResourceHubModalProps {
  isOpen: boolean;
  onClose: () => void;
  onViewed?: () => void;
}

type AddMode = 'link' | 'file';

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

const ResourceHubModal: React.FC<ResourceHubModalProps> = ({ isOpen, onClose, onViewed }) => {
  const { user, isAdmin } = useAuth();
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [addMode, setAddMode] = useState<AddMode>('link');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [url, setUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [notifyUsers, setNotifyUsers] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () => {
    setLoading(true);
    resourcesApi.getAll()
      .then((res) => setResources(res.resources))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!isOpen) return;
    setShowAdd(false);
    setError('');
    load();
    // Mark as seen
    localStorage.setItem(LAST_SEEN_KEY, new Date().toISOString());
    onViewed?.();
  }, [isOpen]);

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setUrl('');
    setFile(null);
    setError('');
    setNotifyUsers(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    setError('');
    try {
      if (addMode === 'link') {
        let finalUrl = url.trim();
        if (finalUrl && !finalUrl.startsWith('http')) finalUrl = 'https://' + finalUrl;
        await resourcesApi.addLink({ title: title.trim(), description: description.trim() || undefined, url: finalUrl, addedBy: user.id });
      } else {
        if (!file) { setError('Please select a file.'); setSaving(false); return; }
        await resourcesApi.uploadFile({ title: title.trim(), description: description.trim() || undefined, file, addedBy: user.id });
      }
      if (notifyUsers && user) {
        try {
          await announcementsApi.send(
            'New resource added',
            `"${title.trim()}" has been added to the Resource Hub. Open the app to view it.`,
            user.id,
          );
        } catch {
          // notification failure is non-blocking
        }
      }
      resetForm();
      setShowAdd(false);
      load();
    } catch (err: any) {
      setError(err.message || 'Failed to add resource.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await resourcesApi.delete(id);
      setResources((prev) => prev.filter((r) => r.id !== id));
    } catch {}
    finally { setDeletingId(null); }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Resource Hub</h2>
            <p className="text-xs text-gray-500 mt-0.5">Guides, links, and files for the team</p>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && !showAdd && (
              <button
                onClick={() => { setShowAdd(true); resetForm(); }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white text-xs font-semibold rounded-lg hover:bg-primary-dark"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                </svg>
                Add
              </button>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Add form */}
          {showAdd && (
            <form onSubmit={handleAdd} className="border border-gray-200 rounded-xl p-4 space-y-3 bg-gray-50">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-800">New Resource</p>
                <button type="button" onClick={() => { setShowAdd(false); resetForm(); }} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
              </div>

              {/* Type toggle */}
              <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setAddMode('link')}
                  className={`flex-1 py-1.5 text-xs font-medium transition-colors ${addMode === 'link' ? 'bg-primary text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                >
                  🔗 Link / URL
                </button>
                <button
                  type="button"
                  onClick={() => setAddMode('file')}
                  className={`flex-1 py-1.5 text-xs font-medium transition-colors ${addMode === 'file' ? 'bg-primary text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                >
                  📎 Upload File
                </button>
              </div>

              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Title (e.g. Role Guide)"
                maxLength={80}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />

              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Short description (optional)"
                maxLength={120}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />

              {addMode === 'link' ? (
                <input
                  type="text"
                  required
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              ) : (
                <div>
                  <input
                    ref={fileRef}
                    type="file"
                    required
                    accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.xlsx,.pptx,.zip"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                    className="w-full text-sm text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-primary file:text-white hover:file:bg-primary-dark"
                  />
                  <p className="text-xs text-gray-400 mt-1">PDF, Word, Excel, PowerPoint, images, ZIP</p>
                </div>
              )}

              {error && <p className="text-xs text-red-600">{error}</p>}

              {/* Notify toggle */}
              <button
                type="button"
                onClick={() => setNotifyUsers((v) => !v)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg border text-sm transition-colors ${
                  notifyUsers
                    ? 'bg-orange-50 border-primary text-orange-900'
                    : 'bg-white border-gray-200 text-gray-500'
                }`}
              >
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                  <span className="font-medium">Notify all users</span>
                </span>
                <span className={`w-9 h-5 rounded-full relative transition-colors ${notifyUsers ? 'bg-primary' : 'bg-gray-300'}`}>
                  <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${notifyUsers ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </span>
              </button>

              <button
                type="submit"
                disabled={saving}
                className="w-full py-2 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary-dark disabled:opacity-50"
              >
                {saving ? 'Adding...' : 'Add Resource'}
              </button>
            </form>
          )}

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
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                      title={r.type === 'link' ? 'Open' : 'Download'}
                    >
                      {r.type === 'link' ? (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      )}
                    </a>
                    {isAdmin && (
                      <button
                        onClick={() => handleDelete(r.id)}
                        disabled={deletingId === r.id}
                        className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40"
                        title="Delete"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ResourceHubModal;
