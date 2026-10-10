import React, { useEffect, useMemo, useState } from 'react';
import Avatar from '../Avatar';
import ModalShell from '../followups/ModalShell';
import Spinner from '../Spinner';
import { useToast } from '../Toast';
import { supportTagsApi } from '../../services/api';
import { usePermissions } from '../../hooks/usePermissions';
import type { SupportTag, User } from '../../types';

interface SupportTagsModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Every support an admin may put on a tag. */
  supports: User[];
  /** Called after any change, so the builder or page can reload its tags. */
  onChanged?: () => void;
}

const inputClass = 'w-full rounded-2xl bg-gray-50 px-4 py-2.5 text-sm text-gray-900 outline-none ring-1 ring-transparent focus:bg-white focus:ring-primary/40';
const quiet = 'rounded-2xl bg-gray-100 px-5 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-200 active:scale-95';
const primary = 'rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-white active:scale-95 disabled:opacity-60';

/** Admin-made labels for supports ("Teen support"). The group builder decides what each one does. */
const SupportTagsModal: React.FC<SupportTagsModalProps> = ({ isOpen, onClose, supports, onChanged }) => {
  const toast = useToast();
  const { can } = usePermissions();
  const canAdd = can('supports', 'add');
  const canEdit = can('supports', 'edit');
  const canDelete = can('supports', 'delete');
  const [tags, setTags] = useState<SupportTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [editing, setEditing] = useState<SupportTag | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');

  const load = () => supportTagsApi.getAll()
    .then((res) => setTags(res.tags))
    .catch((err) => toast({ message: err instanceof Error ? err.message : 'Could not load the tags.', tone: 'error' }))
    .finally(() => setLoading(false));

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setEditing(null);
    setRenaming(null);
    setConfirmDelete(null);
    setNewName('');
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const run = async (work: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await work();
      toast({ message: done, tone: 'success' });
      await load();
      onChanged?.();
      return true;
    } catch (err) {
      toast({ message: err instanceof Error ? err.message : 'That did not save.', tone: 'error' });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const add = async () => {
    const name = newName.trim();
    if (!name) return;
    if (await run(() => supportTagsApi.save(null, name), 'Tag added.')) setNewName('');
  };

  const rename = async () => {
    if (!renaming || !renaming.name.trim()) return;
    if (await run(() => supportTagsApi.save(renaming.id, renaming.name.trim()), 'Tag renamed.')) setRenaming(null);
  };

  const remove = async (id: string) => {
    if (await run(() => supportTagsApi.remove(id), 'Tag deleted.')) setConfirmDelete(null);
  };

  const openMembers = (tag: SupportTag) => {
    setEditing(tag);
    setPicked(new Set(tag.userIds));
    setSearch('');
  };

  const saveMembers = async () => {
    if (!editing) return;
    if (await run(() => supportTagsApi.setMembers(editing.id, [...picked]), 'Supports updated.')) setEditing(null);
  };

  const sortedSupports = useMemo(() => [...supports].sort((a, b) => a.name.localeCompare(b.name)), [supports]);
  const shown = sortedSupports.filter((s) => s.name.toLowerCase().includes(search.trim().toLowerCase()));
  const nameOf = (id: string) => supports.find((s) => s.id === id)?.name;

  const footer = editing ? (
    <>
      <button type="button" onClick={() => setEditing(null)} className={quiet}>Back</button>
      <button type="button" onClick={() => void saveMembers()} disabled={busy} className={primary}>
        {busy ? <span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Saving…</span> : 'Save supports'}
      </button>
    </>
  ) : <button type="button" onClick={onClose} className={quiet}>Done</button>;

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title={editing ? `Supports on “${editing.name}”` : 'Support tags'}
      subtitle={editing ? `${picked.size} selected` : 'Label supports, then choose in the group builder what each tag is for.'}
      footer={footer}
    >
      {editing ? (
        <div className="flex flex-col gap-3">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search supports" aria-label="Search supports" className={inputClass} />
          <div className="flex flex-col">
            {shown.map((s) => {
              const on = picked.has(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  onClick={() => setPicked((prev) => { const next = new Set(prev); if (on) next.delete(s.id); else next.add(s.id); return next; })}
                  className="flex items-center gap-2.5 rounded-2xl px-2 py-2 text-left hover:bg-gray-50"
                >
                  <Avatar name={s.name} avatarUrl={s.avatarUrl} size="xs" />
                  <span className="min-w-0 flex-1 truncate text-sm text-gray-900">{s.name}</span>
                  <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold ${on ? 'bg-primary text-white' : 'bg-gray-100 text-transparent'}`}>✓</span>
                </button>
              );
            })}
            {shown.length === 0 && <p className="px-2 py-4 text-sm text-gray-500">No supports match.</p>}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {canAdd && (
            <div className="flex gap-2">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void add(); }}
                placeholder="New tag, e.g. Men only"
                aria-label="New tag name"
                maxLength={40}
                className={inputClass}
              />
              <button type="button" onClick={() => void add()} disabled={busy || !newName.trim()} className={primary}>Add</button>
            </div>
          )}
          {loading ? (
            <p className="flex items-center gap-2 text-sm text-gray-500"><Spinner className="h-4 w-4" />Loading…</p>
          ) : tags.length === 0 ? (
            <p className="rounded-2xl bg-gray-50 p-4 text-sm text-gray-500">No tags yet. Add one above, then put supports on it.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {tags.map((tag) => (
                <div key={tag.id} className="rounded-2xl bg-gray-50 p-3.5">
                  {renaming?.id === tag.id ? (
                    <div className="flex gap-2">
                      <input value={renaming.name} onChange={(e) => setRenaming({ id: tag.id, name: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') void rename(); }} aria-label="Tag name" maxLength={40} className={inputClass} />
                      <button type="button" onClick={() => void rename()} disabled={busy} className={primary}>Save</button>
                      <button type="button" onClick={() => setRenaming(null)} className={quiet}>Cancel</button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between gap-2">
                        <p className="flex min-w-0 items-center gap-1.5 truncate text-sm font-semibold text-gray-900">
                          {tag.name}
                          {tag.systemKey && (
                            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-semibold text-neutral-600">
                              <svg viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3" aria-hidden="true"><path fillRule="evenodd" d="M10 2a4 4 0 00-4 4v2H5a1 1 0 00-1 1v7a1 1 0 001 1h10a1 1 0 001-1V9a1 1 0 00-1-1h-1V6a4 4 0 00-4-4zm2 6V6a2 2 0 10-4 0v2h4z" clipRule="evenodd" /></svg>
                              Built in
                            </span>
                          )}
                        </p>
                        <span className="rounded-full bg-violet-100/80 px-2.5 py-0.5 text-[11px] font-semibold text-violet-700">{tag.userIds.length} {tag.userIds.length === 1 ? 'support' : 'supports'}</span>
                      </div>
                      {tag.userIds.length > 0 && (
                        <p className="mt-1 text-xs text-gray-500">{tag.userIds.map(nameOf).filter(Boolean).join(', ')}</p>
                      )}
                      <div className="mt-2.5 flex flex-wrap gap-2">
                        {canEdit && <button type="button" onClick={() => openMembers(tag)} className="rounded-full bg-white px-3 py-1 text-[12px] font-semibold text-gray-700 shadow-[0_1px_2px_rgba(17,24,39,0.10)]">Choose supports</button>}
                        {canEdit && !tag.systemKey && (
                          <button type="button" onClick={() => setRenaming({ id: tag.id, name: tag.name })} className="rounded-full bg-white px-3 py-1 text-[12px] font-semibold text-gray-700 shadow-[0_1px_2px_rgba(17,24,39,0.10)]">Rename</button>
                        )}
                        {!canDelete || tag.systemKey ? null : confirmDelete === tag.id ? (
                          <>
                            <button type="button" onClick={() => void remove(tag.id)} disabled={busy} className="rounded-full bg-red-100/80 px-3 py-1 text-[12px] font-semibold text-red-700">Yes, delete</button>
                            <button type="button" onClick={() => setConfirmDelete(null)} className="rounded-full bg-white px-3 py-1 text-[12px] font-semibold text-gray-600">Keep</button>
                          </>
                        ) : (
                          <button type="button" onClick={() => setConfirmDelete(tag.id)} className="rounded-full bg-white px-3 py-1 text-[12px] font-semibold text-red-600 shadow-[0_1px_2px_rgba(17,24,39,0.10)]">Delete</button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </ModalShell>
  );
};

export default SupportTagsModal;
