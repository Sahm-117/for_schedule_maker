import React, { useEffect, useMemo, useState } from 'react';
import AppMultiSelect from '../AppMultiSelect';
import ModalShell from './ModalShell';
import { followUpContactsApi } from '../../services/api';
import type { FollowUpContact, User } from '../../types';
import Spinner from '../Spinner';

// People marked "Will join next cohort" get moved into the new cohort's
// follow-up list (back to "To contact") and, if supports are picked, split
// evenly between them. Used right after creating a cohort and from the home page.

interface Props {
  isOpen: boolean;
  contacts: FollowUpContact[];
  targetCohortId: string;
  targetCohortName?: string;
  supports: User[];
  onClose: () => void;
  onDone: (message: string) => void;
}

const firstName = (name: string) => name.trim().split(/\s+/)[0];

const NextCohortAssignModal: React.FC<Props> = ({ isOpen, contacts, targetCohortId, targetCohortName, supports, onClose, onDone }) => {
  const [supportIds, setSupportIds] = useState<string[]>([]);
  const [dueDate, setDueDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setSupportIds([]);
    setDueDate('');
    setError('');
  }, [isOpen]);

  const sorted = useMemo(
    () => [...contacts].sort((a, b) => a.fullName.localeCompare(b.fullName)),
    [contacts],
  );

  // Round-robin in name order, so the split is even and predictable.
  const plan = useMemo(() => {
    const byOwner = new Map<string, FollowUpContact[]>();
    supportIds.forEach((id) => byOwner.set(id, []));
    sorted.forEach((contact, i) => {
      if (supportIds.length === 0) return;
      byOwner.get(supportIds[i % supportIds.length])!.push(contact);
    });
    return byOwner;
  }, [sorted, supportIds]);

  const count = contacts.length;
  const people = `${count} ${count === 1 ? 'person' : 'people'}`;

  const handleSubmit = async () => {
    setSaving(true);
    setError('');
    try {
      await followUpContactsApi.bulkMoveNextCohortContacts(sorted.map((c) => c.id), targetCohortId);
      for (const [ownerId, owned] of plan) {
        if (owned.length > 0) await followUpContactsApi.assignMany(owned.map((c) => c.id), ownerId, dueDate || null);
      }
      const where = targetCohortName ? `${targetCohortName}'s` : "the new cohort's";
      onDone(supportIds.length > 0
        ? `Moved ${people} to ${where} follow-ups and assigned them to ${supportIds.length} support${supportIds.length === 1 ? '' : 's'}.`
        : `Moved ${people} to ${where} follow-ups. They're unassigned for now.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not move them. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={() => { if (!saving) onClose(); }}
      title={`${people} said they'd join the next cohort`}
      subtitle="Assign them to supports to follow up."
      footer={(
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-2xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            Later
          </button>
          <button
            type="button"
            onClick={() => { void handleSubmit(); }}
            disabled={saving || count === 0}
            className="rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-60"
          >
            {saving ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Saving…</span>) : supportIds.length > 0 ? 'Assign now' : 'Move without assigning'}
          </button>
        </>
      )}
    >
      <div className="space-y-4">
        <div className="rounded-2xl bg-sky-50/70 px-4 py-3">
          <ul className="space-y-1">
            {sorted.slice(0, 5).map((c) => (
              <li key={c.id} className="text-sm text-sky-900">
                {c.fullName}
                {c.phone ? <span className="ml-2 text-xs text-sky-600">{c.phone}</span> : null}
              </li>
            ))}
            {count > 5 && <li className="text-xs text-sky-600">…and {count - 5} more</li>}
          </ul>
        </div>

        <p className="text-sm text-gray-600">
          They'll move to {targetCohortName ?? 'the new cohort'}'s follow-up list as <span className="font-semibold">To contact</span>.
        </p>

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600">Supports to follow up</label>
          <AppMultiSelect
            values={supportIds}
            onChange={setSupportIds}
            options={supports.map((s) => ({ value: s.id, label: s.name }))}
            placeholder="Pick one or more supports"
          />
          {supportIds.length > 0 && (
            <p className="mt-2 text-xs text-gray-500">
              Split evenly:{' '}
              {Array.from(plan.entries()).map(([id, owned], i) => {
                const name = supports.find((s) => s.id === id)?.name ?? 'Support';
                return <span key={id}>{i > 0 ? ' · ' : ''}{firstName(name)} {owned.length}</span>;
              })}
            </p>
          )}
        </div>

        {supportIds.length > 0 && (
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-600" htmlFor="next-cohort-due">Follow up by (optional)</label>
            <input
              id="next-cohort-due"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-primary"
            />
          </div>
        )}

        {error && <p className="rounded-2xl bg-red-100/80 px-4 py-2.5 text-sm text-red-700">{error}</p>}
      </div>
    </ModalShell>
  );
};

export default NextCohortAssignModal;
