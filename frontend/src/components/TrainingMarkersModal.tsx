import React, { useEffect, useMemo, useState } from 'react';
import ModalShell from './followups/ModalShell';
import Spinner from './Spinner';
import { cohortsApi, settingsApi } from '../services/api';
import { sortByText } from '../utils/sort';
import type { User } from '../types';

// Admin setting: which supports can mark trainings & get-togethers attendance
// (they get a Trainings switch on their Attendance page).
const TrainingMarkersModal: React.FC<{ isOpen: boolean; onClose: () => void; cohortId: string | null }> = ({ isOpen, onClose, cohortId }) => {
  const [supports, setSupports] = useState<User[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    setSearch('');
    Promise.all([
      settingsApi.getTrainingMarkers(),
      cohortId ? cohortsApi.getMembers(cohortId).then((res) => res.users) : Promise.resolve([] as User[]),
    ])
      .then(([{ userIds }, users]) => {
        if (cancelled) return;
        setSelected(new Set(userIds));
        setSupports(sortByText(users.filter((u) => u.role === 'SUPPORT' && u.isActive !== false), (u) => u.name));
      })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load supports'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [isOpen, cohortId]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q ? supports.filter((u) => u.name.toLowerCase().includes(q)) : supports;
    // Picked people first so the current list is easy to review.
    return [...list].sort((a, b) => Number(selected.has(b.id)) - Number(selected.has(a.id)));
  }, [supports, search, selected]);

  const toggle = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await settingsApi.setTrainingMarkers([...selected]);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={() => { if (!saving) onClose(); }}
      title="Who can mark trainings"
      subtitle="These supports can mark trainings & get-togethers attendance for every support, from their Attendance page."
      footer={(
        <>
          <button type="button" onClick={onClose} disabled={saving} className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 disabled:opacity-50">Cancel</button>
          <button type="button" onClick={() => void save()} disabled={saving || loading} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">{saving ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Saving…</span>) : `Save (${selected.size})`}</button>
        </>
      )}
    >
      {loading ? (
        <p className="flex items-center gap-1.5 text-sm text-gray-400"><Spinner className="h-3.5 w-3.5" />Loading…</p>
      ) : (
        <>
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search supports…" className="mb-3 w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
          {visible.length === 0 ? (
            <p className="text-sm text-gray-500">No supports found.</p>
          ) : (
            <ul className="space-y-1.5">
              {visible.map((u) => {
                const on = selected.has(u.id);
                return (
                  <li key={u.id}>
                    <button type="button" onClick={() => toggle(u.id)} aria-pressed={on} className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition ${on ? 'bg-primary/10 text-primary' : 'bg-gray-50 text-gray-700 hover:bg-gray-100'}`}>
                      <span className="truncate">{u.name}</span>
                      <span className={`grid h-5 w-5 flex-none place-items-center rounded-md text-xs ${on ? 'bg-primary text-white' : 'border border-gray-300 bg-white'}`}>{on ? '✓' : ''}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </ModalShell>
  );
};

export default TrainingMarkersModal;
