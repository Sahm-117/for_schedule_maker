import React, { useEffect, useState } from 'react';
import type { Cohort, FollowUpContact, User } from '../../types';
import AppSelect from '../AppSelect';
import ModalShell from './ModalShell';
import { followUpContactsApi } from '../../services/api';
import { normalizeToIntlPhone } from '../../utils/phone';

interface FollowUpContactModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: (contact: FollowUpContact) => void;
  contact?: FollowUpContact | null;
  owners: User[];
  cohorts: Cohort[];
  defaultCohortId?: string | null;
  canEditOwner: boolean;
  existingContacts?: FollowUpContact[];
}

const inputClass =
  'w-full rounded-2xl border border-orange-100 bg-white px-4 py-3 text-sm shadow-sm outline-none transition focus:border-orange-300 focus:ring-2 focus:ring-orange-100';

const FollowUpContactModal: React.FC<FollowUpContactModalProps> = ({
  isOpen,
  onClose,
  onSaved,
  contact,
  owners,
  cohorts,
  defaultCohortId,
  canEditOwner,
}) => {
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [source, setSource] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [cohortId, setCohortId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [lastContactDate, setLastContactDate] = useState('');
  const [followUpCount, setFollowUpCount] = useState('0');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setFullName(contact?.fullName || '');
    setPhone(contact?.phone || '');
    setSource(contact?.source || '');
    setOwnerId(contact?.ownerId || '');
    setCohortId(contact?.cohortId || defaultCohortId || '');
    setDueDate(contact?.dueDate || '');
    setLastContactDate(contact?.lastContactDate || '');
    setFollowUpCount(String(contact?.followUpCount ?? 0));
    setNotes(contact?.notes || '');
    setError('');
  }, [isOpen, contact, defaultCohortId]);

  const phoneInvalid = phone.trim() !== '' && !normalizeToIntlPhone(phone);

  const handleSave = async () => {
    if (!fullName.trim()) {
      setError('Full name is required.');
      return;
    }
    if (contact) {
      const parsedCount = Number(followUpCount);
      if (!Number.isInteger(parsedCount) || parsedCount < 0) {
        setError('Follow-up count must be a non-negative whole number.');
        return;
      }
    }
    const normalized = normalizeToIntlPhone(phone);
    if (normalized && existingContacts) {
      const match = existingContacts.find(
        (c) => c.id !== contact?.id && normalizeToIntlPhone(c.phone) === normalized
      );
      if (match) {
        setError(`This phone number already belongs to ${match.fullName}.`);
        setSaving(false);
        return;
      }
    }
    setSaving(true);
    setError('');
    try {
      const input = {
        fullName: fullName.trim(),
        phone: phone.trim() || null,
        source: source.trim() || null,
        ownerId: canEditOwner ? (ownerId || null) : undefined,
        cohortId: cohortId || null,
        dueDate: dueDate || null,
        lastContactDate: contact ? (lastContactDate || null) : undefined,
        followUpCount: Number(followUpCount) || 0,
        notes: notes.trim() || null,
      };
      if (contact) {
        const { contact: updated } = await followUpContactsApi.update(contact.id, {
          ...input,
          previousOwnerId: contact.ownerId || null,
        });
        onSaved(updated);
      } else {
        const { contact: created } = await followUpContactsApi.create(input);
        onSaved(created);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save contact.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title={contact ? 'Edit contact' : 'Add contact'}
      subtitle="Follow-up contacts are leads — they never become app users."
      footer={(
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-orange-100 bg-white px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-orange-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-60"
          >
            {saving ? 'Saving…' : contact ? 'Save changes' : 'Add contact'}
          </button>
        </>
      )}
    >
      <div className="space-y-4">
        {error && <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Full name</label>
          <input className={inputClass} value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="e.g. Abigail Afeme" />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Phone (WhatsApp)</label>
          <input className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="e.g. 08012345678" />
          {phoneInvalid && <p className="mt-1 text-xs text-amber-600">This number can't be used for WhatsApp links — check the format.</p>}
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Source</label>
          {canEditOwner ? (
            <input className={inputClass} value={source} onChange={(e) => setSource(e.target.value)} placeholder="e.g. Selfie Sunday / First Timers Hangout" />
          ) : (
            <p className="w-full rounded-2xl border border-orange-100 bg-orange-50/50 px-4 py-3 text-sm text-gray-600">{source || '—'}</p>
          )}
        </div>
        {canEditOwner && (
          <AppSelect
            label="Assigned to"
            value={ownerId}
            onChange={setOwnerId}
            options={[{ value: '', label: 'Unassigned' }, ...owners.map((o) => ({ value: o.id, label: o.name }))]}
            placeholder="Unassigned"
          />
        )}
        {canEditOwner ? (
          <AppSelect
            label="Target cohort"
            value={cohortId}
            onChange={setCohortId}
            options={[{ value: '', label: 'No cohort' }, ...cohorts.map((c) => ({ value: c.id, label: c.name }))]}
            placeholder="No cohort"
          />
        ) : (
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Target cohort</label>
            <p className="w-full rounded-2xl border border-orange-100 bg-orange-50/50 px-4 py-3 text-sm text-gray-600">
              {cohorts.find((c) => c.id === cohortId)?.name || cohortId || 'No cohort'}
            </p>
          </div>
        )}
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Due date</label>
          <input type="date" className={inputClass} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          <p className="mt-1 text-xs text-gray-400">The assigned support gets a push reminder when this date arrives.</p>
        </div>
        {contact && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Follow-up count</label>
              <div className="flex items-center gap-3 rounded-2xl border border-orange-100 bg-white px-3 py-2">
                <button
                  type="button"
                  disabled={Number(followUpCount) <= 0}
                  onClick={() => setFollowUpCount(String(Math.max(0, Number(followUpCount) - 1)))}
                  className="grid h-9 w-9 place-items-center rounded-full bg-orange-100 text-lg font-bold text-primary transition hover:bg-orange-200 disabled:opacity-30"
                >
                  −
                </button>
                <span className="min-w-[3ch] text-center text-lg font-bold tabular-nums text-gray-900">
                  {followUpCount}
                </span>
                <button
                  type="button"
                  onClick={() => setFollowUpCount(String(Number(followUpCount) + 1))}
                  className="grid h-9 w-9 place-items-center rounded-full bg-primary text-lg font-bold text-white transition hover:bg-primary-dark"
                >
                  +
                </button>
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Last contact date</label>
              <input type="date" className={inputClass} value={lastContactDate} onChange={(e) => setLastContactDate(e.target.value)} />
            </div>
          </div>
        )}
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Notes</label>
          <textarea className={`${inputClass} min-h-[80px]`} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything worth remembering" />
        </div>
      </div>
    </ModalShell>
  );
};

export default FollowUpContactModal;
