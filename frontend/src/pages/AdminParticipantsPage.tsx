import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import PageLoader from '../components/PageLoader';
import { useAuth } from '../hooks/useAuth';
import { useAppData } from '../context/AppDataContext';
import { participantsApi, groupsApi } from '../services/api';
import type { Participant, Group } from '../types';
import ModalShell from '../components/followups/ModalShell';
import AppOverflowMenu from '../components/AppOverflowMenu';
import AppSelect from '../components/AppSelect';
import ConfirmationModal from '../components/ConfirmationModal';
import {
  parseBulkPaste,
  buildExistingPhoneSet,
  type ParsedContactRow,
} from '../utils/contactImport';

// ── Helpers ───────────────────────────────────────────────────────────────────

const SOURCE_LABEL: Record<string, string> = {
  FOLLOW_UP: 'Follow-up',
  MANUAL: 'Manual',
  IMPORT: 'Import',
};

const STATUS_PILL: Record<string, string> = {
  ACTIVE: 'bg-emerald-100/80 text-emerald-700',
  ARCHIVED: 'bg-neutral-100 text-neutral-600',
};

// ── Add/Edit Modal ────────────────────────────────────────────────────────────

interface ParticipantModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: (p: Participant) => void;
  cohortId: string;
  existing?: Participant | null;
}

const ParticipantModal: React.FC<ParticipantModalProps> = ({ isOpen, onClose, onSaved, cohortId, existing }) => {
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (isOpen) {
      setFullName(existing?.fullName ?? '');
      setPhone(existing?.phone ?? '');
      setNotes(existing?.notes ?? '');
      setErr('');
    }
  }, [isOpen, existing]);

  const handleSave = async () => {
    if (!fullName.trim()) { setErr('Name is required'); return; }
    setSaving(true);
    setErr('');
    try {
      let result: Participant;
      if (existing) {
        ({ participant: result } = await participantsApi.update(existing.id, {
          fullName: fullName.trim(),
          phone: phone.trim() || null,
          notes: notes.trim() || null,
        }));
      } else {
        ({ participant: result } = await participantsApi.create({
          fullName: fullName.trim(),
          phone: phone.trim() || null,
          cohortId,
          notes: notes.trim() || null,
          source: 'MANUAL',
        }));
      }
      onSaved(result);
      onClose();
    } catch (e: any) {
      setErr(e.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title={existing ? 'Edit Participant' : 'Add Participant'}
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded-2xl border border-orange-200 px-5 py-2.5 text-sm font-semibold text-gray-600 hover:bg-orange-50 active:scale-95">Cancel</button>
          <button type="button" onClick={() => void handleSave()} disabled={saving} className="rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-white active:scale-95 disabled:opacity-60">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {err && <p className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-600">{err}</p>}
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Full name *</label>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="w-full rounded-xl border border-orange-200 px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            placeholder="e.g. Adaeze Obi"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Phone (WhatsApp)</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full rounded-xl border border-orange-200 px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            placeholder="e.g. 08012345678"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="w-full rounded-xl border border-orange-200 px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
      </div>
    </ModalShell>
  );
};

// ── Import Modal ──────────────────────────────────────────────────────────────

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImported: (ps: Participant[]) => void;
  cohortId: string;
  existingParticipants: Participant[];
}

const ImportModal: React.FC<ImportModalProps> = ({ isOpen, onClose, onImported, cohortId, existingParticipants }) => {
  const [pasteText, setPasteText] = useState('');
  const [preview, setPreview] = useState<{ rows: ParsedContactRow[]; skipped: number; duplicates: number } | null>(null);
  const [importing, setImporting] = useState(false);
  const [err, setErr] = useState('');

  const existingPhones = useMemo(
    () => buildExistingPhoneSet(existingParticipants.map((p) => p.phone)),
    [existingParticipants]
  );

  const handleClose = () => { setPasteText(''); setPreview(null); setErr(''); onClose(); };

  const handlePreview = () => {
    setPreview(parseBulkPaste(pasteText, existingPhones));
    setErr('');
  };

  const handleImport = async () => {
    if (!preview || preview.rows.length === 0) return;
    setImporting(true);
    setErr('');
    try {
      const { participants } = await participantsApi.createMany(
        preview.rows.map((r) => ({ fullName: r.fullName, phone: r.phone || null, cohortId, source: r.source ?? 'IMPORT' }))
      );
      onImported(participants);
      handleClose();
    } catch (e: any) {
      setErr(e.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={handleClose}
      title="Import Participants"
      subtitle="Paste names and numbers — one per line"
      wide
      footer={
        preview && preview.rows.length > 0
          ? <>
              <button type="button" onClick={handleClose} className="rounded-2xl border border-orange-200 px-5 py-2.5 text-sm font-semibold text-gray-600 hover:bg-orange-50">Cancel</button>
              <button type="button" onClick={() => void handleImport()} disabled={importing} className="rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
                {importing ? 'Importing…' : `Import ${preview.rows.length} participants`}
              </button>
            </>
          : undefined
      }
    >
      <div className="flex flex-col gap-4">
        {err && <p className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-600">{err}</p>}
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Paste list</label>
          <p className="mb-2 text-xs text-gray-500">Each line: <span className="font-mono">Name  08012345678</span> (tab, pipe, or 2+ spaces as separator)</p>
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            rows={8}
            className="w-full rounded-xl border border-orange-200 px-3.5 py-2.5 font-mono text-xs focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            placeholder={"Adaeze Obi\t08012345678\nTunde Balogun\t07098765432"}
          />
        </div>
        <button
          type="button"
          onClick={handlePreview}
          disabled={!pasteText.trim()}
          className="self-start rounded-2xl bg-orange-100 px-5 py-2.5 text-sm font-semibold text-orange-700 active:scale-95 disabled:opacity-60"
        >
          Preview
        </button>
        {preview && (
          <div className="rounded-2xl border border-orange-100 bg-orange-50/50 p-4">
            <p className="mb-2 text-sm font-semibold text-gray-700">
              {preview.rows.length} to import
              {preview.skipped > 0 && <span className="ml-2 text-xs text-amber-600">· {preview.skipped} unparseable skipped</span>}
              {preview.duplicates > 0 && <span className="ml-2 text-xs text-amber-600">· {preview.duplicates} duplicates skipped</span>}
            </p>
            <ul className="max-h-48 overflow-y-auto text-xs text-gray-600">
              {preview.rows.map((r, i) => (
                <li key={i} className="flex gap-2 py-0.5">
                  <span className="font-medium text-gray-800">{r.fullName}</span>
                  <span className="text-gray-400">{r.phone}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </ModalShell>
  );
};

// ── Main Page ─────────────────────────────────────────────────────────────────

const AdminParticipantsPage: React.FC = () => {
  const { isAdmin } = useAuth();
  const { activeCohort, liveRevision } = useAppData();

  const [participants, setParticipants] = useState<Participant[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState('');
  const [groupFilter, setGroupFilter] = useState(''); // '' = all, '__UNASSIGNED__' = no group, else groupId
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<Participant | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Participant | null>(null);

  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  const load = useCallback(async () => {
    if (!activeCohort) { setLoading(false); return; }
    setLoading(true);
    try {
      const [{ participants: ps }, { groups: gs }] = await Promise.all([
        participantsApi.getAll({ cohortId: activeCohort.id, includeArchived: true }),
        groupsApi.getAll({ cohortId: activeCohort.id }),
      ]);
      setParticipants(ps);
      setGroups(gs);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [activeCohort]);

  useEffect(() => { void load(); }, [load, liveRevision]);

  const groupOptions = useMemo(
    () => [
      { value: '', label: 'All groups' },
      { value: '__UNASSIGNED__', label: 'Unassigned' },
      ...[...groups].sort((a, b) => new Intl.Collator(undefined, { numeric: true }).compare(a.name, b.name)).map((g) => ({ value: g.id, label: g.name })),
    ],
    [groups]
  );

  const displayed = useMemo(() => {
    let ps = showArchived ? participants : participants.filter((p) => p.status === 'ACTIVE');
    if (groupFilter === '__UNASSIGNED__') {
      ps = ps.filter((p) => !p.groupId);
    } else if (groupFilter) {
      ps = ps.filter((p) => p.groupId === groupFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      ps = ps.filter((p) => p.fullName.toLowerCase().includes(q) || (p.phone ?? '').includes(q));
    }
    return ps;
  }, [participants, showArchived, search, groupFilter]);

  const unassignedCount = useMemo(
    () => participants.filter((p) => p.status === 'ACTIVE' && !p.groupId).length,
    [participants]
  );

  const handleArchive = async () => {
    if (!archiveTarget) return;
    const p = archiveTarget;
    try {
      await participantsApi.archive(p.id);
      setParticipants((prev) => prev.map((x) => x.id === p.id ? { ...x, status: 'ARCHIVED' } : x));
    } catch { /* ignore */ }
    finally { setArchiveTarget(null); }
  };

  const activeCount = participants.filter((p) => p.status === 'ACTIVE').length;

  return (
    <div className="page-content">
      <PageHeader
        title="Participants"
        subtitle={activeCohort ? `${activeCount} active · ${unassignedCount} unassigned · ${activeCohort.name}` : 'No active cohort'}
        action={
          activeCohort && (
            <div className="flex gap-2">
              <button type="button" onClick={() => setImportOpen(true)} className="rounded-2xl border border-orange-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-orange-50 active:scale-95">
                Import
              </button>
              <button type="button" onClick={() => { setEditing(null); setAddOpen(true); }} className="rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-white active:scale-95">
                + Add
              </button>
            </div>
          )
        }
      />

      {!activeCohort ? (
        <p className="text-sm text-gray-500">Select or create a cohort first.</p>
      ) : (
        <>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center">
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name or phone…"
                className="w-full rounded-xl border border-orange-200 px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 sm:max-w-xs"
              />
              <div className="w-full sm:w-52">
                <AppSelect
                  value={groupFilter}
                  onChange={setGroupFilter}
                  options={groupOptions}
                  placeholder="All groups"
                  compact
                />
              </div>
            </div>
            <label className="flex items-center gap-2 whitespace-nowrap text-sm text-gray-600">
              <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="accent-primary" />
              Show archived
            </label>
          </div>

          {loading ? (
            <PageLoader />
          ) : displayed.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-orange-200 py-12 text-center">
              <p className="text-sm text-gray-500">No participants yet. Add one or import a list.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-orange-100 bg-white shadow-sm">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-orange-100 bg-orange-50/60">
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Name</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Phone</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Group</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Source</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Status</th>
                    <th className="sticky right-0 bg-orange-50/60 px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-orange-50">
                  {displayed.map((p) => (
                    <tr key={p.id} className="hover:bg-orange-50/30">
                      <td className="px-4 py-3 font-medium text-gray-900">{p.fullName}</td>
                      <td className="px-4 py-3 text-gray-500">{p.phone ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-500">{p.groupName ?? '—'}</td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-sky-100/80 px-2.5 py-0.5 text-xs font-semibold text-sky-700">
                          {SOURCE_LABEL[p.source] ?? p.source}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_PILL[p.status] ?? 'bg-neutral-100 text-neutral-600'}`}>
                          {p.status === 'ACTIVE' ? 'Active' : 'Archived'}
                        </span>
                      </td>
                      <td className="sticky right-0 bg-white px-4 py-3 text-right">
                        <div className="flex justify-end">
                          {p.status === 'ACTIVE' ? (
                            <AppOverflowMenu
                              align="right"
                              items={[
                                { label: 'Edit', onClick: () => { setEditing(p); setAddOpen(true); } },
                                { label: 'Archive', onClick: () => setArchiveTarget(p), tone: 'danger' },
                              ]}
                            />
                          ) : (
                            <button type="button" onClick={() => { setEditing(p); setAddOpen(true); }} className="rounded-xl border border-orange-200 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-orange-50 active:scale-95">
                              Edit
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <ParticipantModal
        isOpen={addOpen}
        onClose={() => { setAddOpen(false); setEditing(null); }}
        onSaved={(p) => {
          setParticipants((prev) => {
            const idx = prev.findIndex((x) => x.id === p.id);
            return idx >= 0 ? prev.map((x) => x.id === p.id ? p : x) : [p, ...prev];
          });
        }}
        cohortId={activeCohort?.id ?? ''}
        existing={editing}
      />

      <ImportModal
        isOpen={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={(ps) => setParticipants((prev) => [...ps, ...prev])}
        cohortId={activeCohort?.id ?? ''}
        existingParticipants={participants}
      />

      <ConfirmationModal
        isOpen={!!archiveTarget}
        onClose={() => setArchiveTarget(null)}
        onConfirm={() => { void handleArchive(); }}
        title="Archive participant"
        message={`Archive ${archiveTarget?.fullName}? They will no longer appear in attendance.`}
        confirmText="Archive"
      />
    </div>
  );
};

export default AdminParticipantsPage;
