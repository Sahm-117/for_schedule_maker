import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { supportNotesApi } from '../../services/api';
import type { SupportNote } from '../../types';
import { PERSON_OF_INTEREST_INFO } from './hubJobs';
import Spinner from '../Spinner';
import LinkText from '../LinkText';

// The ★ on a hub member card. Tapping it opens that support's note history,
// where notes can be read, edited and added (filed under this hub).
const dateLabel = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

const SupportNotesStar: React.FC<{ supportId: string; name: string; hubId: string }> = ({ supportId, name, hubId }) => {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState<SupportNote[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [noteBody, setNoteBody] = useState('');
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [error, setError] = useState('');

  const openNotes = () => {
    setOpen(true);
    setError('');
    setLoadError(false);
    supportNotesApi.getForSupport(supportId)
      .then((res) => setNotes(res.notes))
      .catch(() => { setNotes([]); setLoadError(true); });
  };

  const close = () => {
    setOpen(false);
    setEditingId(null);
    setNoteBody('');
    setError('');
  };

  const handleAdd = async () => {
    if (!noteBody.trim()) return;
    setAdding(true);
    setError('');
    try {
      const { note } = await supportNotesApi.create({ supportId, hubId, noteType: 'NOTE', body: noteBody.trim() });
      setNotes((prev) => [note, ...(prev ?? [])]);
      setNoteBody('');
    } catch {
      setError("Couldn't save the note. Try again.");
    } finally {
      setAdding(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editBody.trim()) return;
    setSavingEdit(true);
    setError('');
    try {
      const { note } = await supportNotesApi.update(editingId, editBody.trim());
      setNotes((prev) => (prev ?? []).map((n) => (n.id === note.id ? note : n)));
      setEditingId(null);
    } catch {
      setError("Couldn't save the change. Try again.");
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={openNotes}
        title={PERSON_OF_INTEREST_INFO.description}
        aria-label={`Notes about ${name}`}
        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${PERSON_OF_INTEREST_INFO.pill} hover:bg-amber-200/80`}
      >
        {PERSON_OF_INTEREST_INFO.label}
      </button>
      {open && createPortal(
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/30 p-3 sm:items-center" onClick={close}>
          <div className="mb-20 w-[92vw] max-w-[440px] rounded-[28px] bg-white p-5 shadow-[0_28px_80px_rgba(15,23,42,0.25)] sm:mb-0" onClick={(e) => e.stopPropagation()}>
            <p className="text-center text-xs font-semibold uppercase tracking-[0.12em] text-gray-400">Notes</p>
            <p className="mb-4 truncate text-center text-sm font-semibold text-gray-900">{name}</p>

            <div className="flex flex-col gap-2">
              <textarea
                value={noteBody}
                onChange={(e) => setNoteBody(e.target.value)}
                rows={2}
                placeholder="Add a note — only admin and this support's hub lead can see it."
                className="w-full resize-none rounded-2xl border border-orange-200 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              <button
                type="button"
                onClick={() => void handleAdd()}
                disabled={adding || !noteBody.trim()}
                className="self-end rounded-xl bg-primary px-3 py-1.5 text-xs font-semibold text-white active:scale-95 disabled:opacity-60"
              >
                {adding ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Saving…</span>) : 'Add note'}
              </button>
            </div>

            {error && <p className="mt-2 text-xs font-medium text-red-600">{error}</p>}

            <div className="mt-3 max-h-[50vh] overflow-y-auto overscroll-contain">
              {notes === null ? (
                <p className="flex items-center justify-center gap-1.5 py-4 text-xs text-gray-400"><Spinner className="h-3.5 w-3.5" />Loading…</p>
              ) : loadError ? (
                <p className="py-4 text-center text-xs text-red-600">Couldn't load notes.</p>
              ) : notes.length === 0 ? (
                <p className="py-4 text-center text-xs text-gray-400">No notes yet.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {notes.map((n) => (
                    <li key={n.id} className="rounded-2xl bg-gray-50 px-3.5 py-2.5">
                      {editingId === n.id ? (
                        <>
                          <textarea
                            value={editBody}
                            onChange={(e) => setEditBody(e.target.value)}
                            rows={3}
                            autoFocus
                            className="w-full resize-none rounded-xl border border-orange-200 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                          />
                          <div className="mt-1.5 flex justify-end gap-2">
                            <button type="button" onClick={() => setEditingId(null)} disabled={savingEdit} className="rounded-xl bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-200">Cancel</button>
                            <button
                              type="button"
                              onClick={() => void handleSaveEdit()}
                              disabled={savingEdit || !editBody.trim()}
                              className="rounded-xl bg-primary px-3 py-1.5 text-xs font-semibold text-white active:scale-95 disabled:opacity-60"
                            >
                              {savingEdit ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Saving…</span>) : 'Save'}
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <p className="whitespace-pre-line text-sm text-gray-800"><LinkText text={n.body} /></p>
                          <div className="mt-1 flex items-center justify-between gap-2">
                            <p className="text-[11px] text-gray-400">{n.authorName || 'Admin'} · {dateLabel(n.createdAt)}</p>
                            <button type="button" onClick={() => { setEditingId(n.id); setEditBody(n.body); setError(''); }} className="text-xs font-semibold text-primary hover:text-primary-dark">Edit</button>
                          </div>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <button type="button" onClick={close} className="mt-4 w-full rounded-2xl bg-gray-100 py-2.5 text-sm font-semibold text-gray-700">Close</button>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

export default SupportNotesStar;
