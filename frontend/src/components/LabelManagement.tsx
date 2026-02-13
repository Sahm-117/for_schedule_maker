import React, { useEffect, useMemo, useState } from 'react';
import { labelsApi } from '../services/api';
import type { Label } from '../types';
import { deltaE76, getContrastingTextColor, normalizeHexColor } from '../utils/color';

interface LabelManagementProps {
  isOpen: boolean;
  onClose: () => void;
}

const DEFAULT_COLOR = '#FF914D';
const SIMILARITY_THRESHOLD = 12; // Delta-E 76. Lower = stricter.

const LabelManagement: React.FC<LabelManagementProps> = ({ isOpen, onClose }) => {
  const [labels, setLabels] = useState<Label[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showAdd, setShowAdd] = useState(false);

  const [newLabel, setNewLabel] = useState({ name: '', color: DEFAULT_COLOR });
  const [editing, setEditing] = useState<Label | null>(null);

  const sorted = useMemo(() => {
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
    return [...labels].sort((a, b) => collator.compare(a.name, b.name));
  }, [labels]);

  const loadLabels = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await labelsApi.getAll();
      setLabels(res.labels || []);
    } catch (e: any) {
      console.error('Failed to load labels:', e);
      setError(e?.message || 'Failed to load labels');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    setShowAdd(false);
    setNewLabel({ name: '', color: DEFAULT_COLOR });
    setEditing(null);
    setError('');
    setSuccess('');
    loadLabels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const normalizeOrError = (name: string, color: string): { name: string; color: string } => {
    const trimmedName = name.trim();
    const normalizedColor = normalizeHexColor(color);
    if (!trimmedName) {
      throw new Error('Label name is required');
    }
    if (!normalizedColor) {
      throw new Error('Color must be a hex value like #RRGGBB');
    }
    return { name: trimmedName, color: normalizedColor };
  };

  const findSimilarColorConflict = (candidateColor: string, excludeId?: string): { label: Label; distance: number } | null => {
    const normalizedCandidate = normalizeHexColor(candidateColor);
    if (!normalizedCandidate) return null;

    let best: { label: Label; distance: number } | null = null;
    for (const label of labels) {
      if (excludeId && label.id === excludeId) continue;
      const otherColor = normalizeHexColor(label.color);
      if (!otherColor) continue;
      const d = deltaE76(normalizedCandidate, otherColor);
      if (typeof d !== 'number') continue;
      if (!best || d < best.distance) {
        best = { label, distance: d };
      }
    }

    if (best && best.distance < SIMILARITY_THRESHOLD) {
      return best;
    }
    return null;
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const input = normalizeOrError(newLabel.name, newLabel.color);
      const conflict = findSimilarColorConflict(input.color);
      if (conflict) {
        throw new Error(
          `Color is too similar to "${conflict.label.name}" (${normalizeHexColor(conflict.label.color) || conflict.label.color}). Please pick a more distinct color.`
        );
      }
      await labelsApi.create(input);
      setSuccess('Label created');
      setNewLabel({ name: '', color: DEFAULT_COLOR });
      setShowAdd(false);
      await loadLabels();
    } catch (e: any) {
      const msg = e?.message || 'Failed to create label';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const input = normalizeOrError(editing.name, editing.color);
      const conflict = findSimilarColorConflict(input.color, editing.id);
      if (conflict) {
        throw new Error(
          `Color is too similar to "${conflict.label.name}" (${normalizeHexColor(conflict.label.color) || conflict.label.color}). Please pick a more distinct color.`
        );
      }
      await labelsApi.update(editing.id, input);
      setSuccess('Label updated');
      setEditing(null);
      await loadLabels();
    } catch (e: any) {
      const msg = e?.message || 'Failed to update label';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (label: Label) => {
    if (!confirm(`Delete label "${label.name}"? This removes it from all activities.`)) return;
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      await labelsApi.delete(label.id);
      setSuccess('Label deleted');
      await loadLabels();
    } catch (e: any) {
      const msg = e?.message || 'Failed to delete label';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold">Label Management</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
              aria-label="Close"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {error && (
            <div className="mb-4 text-red-600 text-sm bg-red-50 p-3 rounded">
              {error}
            </div>
          )}

          {success && (
            <div className="mb-4 text-green-700 text-sm bg-green-50 p-3 rounded">
              {success}
            </div>
          )}

          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-medium">Labels ({sorted.length})</h3>
            <button
              onClick={() => {
                setShowAdd((v) => !v);
                setEditing(null);
                setError('');
                setSuccess('');
              }}
              className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-dark disabled:opacity-50"
              disabled={loading}
            >
              {showAdd ? 'Cancel' : 'Add Label'}
            </button>
          </div>

          {showAdd && (
            <div className="mb-6 p-4 border border-gray-200 rounded-lg bg-gray-50">
              <h4 className="text-md font-medium mb-3">Create Label</h4>
              <form onSubmit={handleCreate} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Name
                    </label>
                    <input
                      type="text"
                      value={newLabel.name}
                      onChange={(e) => setNewLabel({ ...newLabel, name: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary focus:border-primary"
                      placeholder="e.g. Group 1"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Color
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={normalizeHexColor(newLabel.color) || DEFAULT_COLOR}
                        onChange={(e) => setNewLabel({ ...newLabel, color: e.target.value })}
                        className="h-10 w-12 p-1 border border-gray-300 rounded"
                        aria-label="Pick color"
                      />
                      <input
                        type="text"
                        value={newLabel.color}
                        onChange={(e) => setNewLabel({ ...newLabel, color: e.target.value })}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary focus:border-primary"
                        placeholder="#RRGGBB"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-600">
                    Preview:{' '}
                    <span
                      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                      style={{
                        backgroundColor: normalizeHexColor(newLabel.color) || '#E5E7EB',
                        color: getContrastingTextColor(normalizeHexColor(newLabel.color) || '#E5E7EB'),
                      }}
                    >
                      {newLabel.name || 'Label'}
                    </span>
                  </div>
                  <button
                    type="submit"
                    disabled={loading || !newLabel.name.trim()}
                    className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
                  >
                    {loading ? 'Creating...' : 'Create'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {editing && (
            <div className="mb-6 p-4 border border-gray-200 rounded-lg bg-gray-50">
              <h4 className="text-md font-medium mb-3">Edit Label</h4>
              <form onSubmit={handleUpdate} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Name
                    </label>
                    <input
                      type="text"
                      value={editing.name}
                      onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary focus:border-primary"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Color
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={normalizeHexColor(editing.color) || DEFAULT_COLOR}
                        onChange={(e) => setEditing({ ...editing, color: e.target.value })}
                        className="h-10 w-12 p-1 border border-gray-300 rounded"
                        aria-label="Pick color"
                      />
                      <input
                        type="text"
                        value={editing.color}
                        onChange={(e) => setEditing({ ...editing, color: e.target.value })}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary focus:border-primary"
                        placeholder="#RRGGBB"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-600">
                    Preview:{' '}
                    <span
                      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                      style={{
                        backgroundColor: normalizeHexColor(editing.color) || '#E5E7EB',
                        color: getContrastingTextColor(normalizeHexColor(editing.color) || '#E5E7EB'),
                      }}
                    >
                      {editing.name || 'Label'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setEditing(null)}
                      className="px-4 py-2 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
                      disabled={loading}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={loading || !editing.name.trim()}
                      className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
                    >
                      {loading ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          )}

          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="bg-gray-50 px-4 py-2 text-sm font-medium text-gray-700 flex">
              <div className="w-20">Color</div>
              <div className="flex-1">Name</div>
              <div className="w-40 text-right">Actions</div>
            </div>
            {loading && sorted.length === 0 ? (
              <div className="p-4 text-sm text-gray-600">Loading...</div>
            ) : sorted.length === 0 ? (
              <div className="p-4 text-sm text-gray-600">No labels yet.</div>
            ) : (
              sorted.map((label) => {
                const bg = normalizeHexColor(label.color) || '#E5E7EB';
                const fg = getContrastingTextColor(bg);
                return (
                  <div key={label.id} className="px-4 py-3 border-t border-gray-200 flex items-center">
                    <div className="w-20">
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                        style={{ backgroundColor: bg, color: fg }}
                      >
                        {label.color}
                      </span>
                    </div>
                    <div className="flex-1 text-sm text-gray-900">
                      {label.name}
                    </div>
                    <div className="w-40 flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditing(label);
                          setShowAdd(false);
                          setError('');
                          setSuccess('');
                        }}
                        className="px-3 py-1 text-sm text-primary hover:text-primary-dark border border-primary rounded-md hover:bg-primary/5 disabled:opacity-50"
                        disabled={loading}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(label)}
                        className="px-3 py-1 text-sm text-red-600 hover:text-red-700 border border-red-300 rounded-md hover:bg-red-50 disabled:opacity-50"
                        disabled={loading}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default LabelManagement;
