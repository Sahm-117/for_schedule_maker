import React, { useEffect, useState } from 'react';
import type { Cohort, FollowUpContact, User } from '../../types';
import AppSelect from '../AppSelect';
import ModalShell from './ModalShell';
import { followUpContactsApi } from '../../services/api';
import { useTeenSupportIds } from '../../hooks/useTeenSupportIds';
import { canTakeTeen, isTeenContact, teenNumberOwner } from '../../utils/followUps';
import { normalizeToIntlPhone, toLocalNigerianPhone } from '../../utils/phone';
import { sortByText } from '../../utils/sort';
import Spinner from '../Spinner';
import { genderAgeLine } from '../../utils/people';

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
  /** Open follow-ups each support holds, and the max from Settings (load ring + "full" note). */
  ownerLoad?: Map<string, number>;
  maxLoad?: number;
  /** Show each support's open follow-ups ring in the owner list. Off once the cohort has started. */
  showLoadRing?: boolean;
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
  existingContacts,
  ownerLoad,
  maxLoad,
  showLoadRing = true,
}) => {
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  // A teen's numbers: the guardian's, and the teen's own if they have one (most do not).
  const [guardianName, setGuardianName] = useState('');
  const [guardianPhone, setGuardianPhone] = useState('');
  const [teenPhone, setTeenPhone] = useState('');
  const [source, setSource] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [cohortId, setCohortId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [lastContactDate, setLastContactDate] = useState('');
  const [followUpCount, setFollowUpCount] = useState('0');
  const [notes, setNotes] = useState('');
  const [email, setEmail] = useState('');
  const [gender, setGender] = useState('');
  const [ageRange, setAgeRange] = useState('');
  const [occupation, setOccupation] = useState('');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmNotTeen, setConfirmNotTeen] = useState(false);
  const isTeen = !!contact && isTeenContact(contact);

  // A teen can only be handed to a same-gender Teen Support, so the picker is limited to those.
  const { ids: teenSupportIds, failed: teenSupportsFailed } = useTeenSupportIds(isOpen && isTeen);

  useEffect(() => {
    if (!isOpen) return;
    setConfirmNotTeen(false);
    setFullName(contact?.fullName || '');
    setPhone(contact?.phone || '');
    setGuardianName(contact?.guardianName || '');
    setGuardianPhone(contact?.guardianPhone || '');
    setTeenPhone(contact && isTeenContact(contact) && teenNumberOwner(contact) === 'teen' ? contact.phone || '' : '');
    setSource(contact?.source || '');
    setOwnerId(contact?.ownerId || '');
    setCohortId(contact?.cohortId || defaultCohortId || '');
    setDueDate(contact?.dueDate || '');
    setLastContactDate(contact?.lastContactDate || '');
    setFollowUpCount(String(contact?.followUpCount ?? 0));
    setNotes(contact?.notes || '');
    setEmail(contact?.email || '');
    setGender(contact?.gender || '');
    setAgeRange(contact?.ageRange || '');
    setOccupation(contact?.occupation || '');
    setDetailsOpen(false);
    setError('');
    setSaving(false);
  }, [isOpen, contact, defaultCohortId]);

  const ownerChoices = isTeen
    ? owners.filter((o) => o.id === contact?.ownerId || canTakeTeen(o, teenSupportIds, contact?.gender))
    : owners;

  // Back to the normal flow: registered, no owner, so adult follow-up picks them up. The database
  // takes them out of the teen group.
  const handleNotTeen = async () => {
    if (!contact) return;
    setSaving(true);
    setError('');
    try {
      const { contact: updated } = await followUpContactsApi.update(contact.id, {
        registrationStatus: 'REGISTERED',
        ownerId: null,
        previousOwnerId: contact.ownerId || null,
        replyStatus: 'REPLIED',
        nextAction: 'SEND_MESSAGE',
      });
      onSaved(updated);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change this contact.');
    } finally {
      setSaving(false);
    }
  };

  const phoneInvalid = phone.trim() !== '' && !normalizeToIntlPhone(phone);
  const guardianInvalid = guardianPhone.trim() !== '' && !normalizeToIntlPhone(guardianPhone);
  const teenPhoneInvalid = teenPhone.trim() !== '' && !normalizeToIntlPhone(teenPhone);
  // An earlier teen: one number on file and nobody has said whose it is yet.
  const unsortedNumber = isTeen && !!contact && teenNumberOwner(contact) === 'unknown' && !!contact.phone?.trim()
    && !guardianPhone.trim() && !teenPhone.trim();

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
    // A teen has up to two numbers. The guardian's may be shared (brothers and sisters), so only the
    // teen's own number has to be unique; the contact's phone is the teen's number if they have one,
    // else the guardian's, which is how the form saves it.
    const guardianNumber = guardianPhone.trim();
    let teenNumber = teenPhone.trim();
    if (isTeen && teenNumber && normalizeToIntlPhone(teenNumber) === normalizeToIntlPhone(guardianNumber)) teenNumber = '';
    const phoneToSave = isTeen ? (teenNumber || guardianNumber || contact?.phone?.trim() || '') : phone.trim();
    if (isTeen) {
      if (guardianInvalid || teenPhoneInvalid) {
        setError('Check the number format. It must work for WhatsApp links.');
        return;
      }
      if (!phoneToSave) {
        setError("Add the parent or guardian's number, or the teen's number.");
        return;
      }
      // Without the guardian's number we could not tell whose number is saved, and the guardian is reached first.
      if (teenNumber && !guardianNumber) {
        setError("Add the parent or guardian's number too, so the guardian is always reached first.");
        return;
      }
    }
    const normalized = normalizeToIntlPhone(isTeen ? teenNumber : phone);
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
        phone: phoneToSave || null,
        ...(isTeen ? {
          guardianPhone: guardianNumber ? (toLocalNigerianPhone(guardianNumber) ?? guardianNumber) : null,
          guardianName: guardianName.trim() || null,
        } : {}),
        source: source.trim() || null,
        ownerId: canEditOwner ? (ownerId || null) : undefined,
        cohortId: cohortId || null,
        dueDate: dueDate || null,
        lastContactDate: contact ? (lastContactDate || null) : undefined,
        followUpCount: Number(followUpCount) || 0,
        notes: notes.trim() || null,
        email: email.trim() || null,
        gender: gender || null,
        ageRange: ageRange || null,
        occupation: occupation.trim() || null,
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
      subtitle="Follow-up contacts are prospects — they never become app users."
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
            {saving ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Saving…</span>) : contact ? 'Save changes' : 'Add contact'}
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
        {isTeen ? (
          <div className="space-y-4 rounded-2xl bg-pink-50/50 p-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Parent or guardian name</label>
              <input className={inputClass} value={guardianName} onChange={(e) => setGuardianName(e.target.value)} placeholder="e.g. Mrs Bello" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Parent or guardian number (WhatsApp)</label>
              <input className={inputClass} value={guardianPhone} onChange={(e) => setGuardianPhone(e.target.value)} placeholder="e.g. 08012345678" />
              {guardianInvalid && <p className="mt-1 text-xs text-amber-600">This number can't be used for WhatsApp links. Check the format.</p>}
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Teen's own number (optional)</label>
              <input className={inputClass} value={teenPhone} onChange={(e) => setTeenPhone(e.target.value)} placeholder="Only if the guardian says they have a phone" />
              {teenPhoneInvalid && <p className="mt-1 text-xs text-amber-600">This number can't be used for WhatsApp links. Check the format.</p>}
              <p className="mt-1 text-xs text-gray-500">Most teens have no phone of their own. Once you add one, the teen's own messages appear in Templates.</p>
            </div>
            {unsortedNumber && contact && (
              <div className="rounded-2xl bg-amber-50 px-3.5 py-3 text-xs text-amber-900">
                <p className="font-semibold">The number on file is {contact.phone}. Whose is it?</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button type="button" onClick={() => setGuardianPhone(contact.phone || '')} className="rounded-full bg-white px-3 py-1.5 font-semibold text-amber-800 shadow-sm">It's the guardian's</button>
                  <button type="button" onClick={() => setTeenPhone(contact.phone || '')} className="rounded-full bg-white px-3 py-1.5 font-semibold text-amber-800 shadow-sm">It's the teen's</button>
                </div>
                <p className="mt-1.5 text-amber-800/80">Add the guardian's number when you have it, so we always reach the guardian first.</p>
              </div>
            )}
          </div>
        ) : (
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Phone (WhatsApp)</label>
            <input className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="e.g. 08012345678" />
            {phoneInvalid && <p className="mt-1 text-xs text-amber-600">This number can't be used for WhatsApp links — check the format.</p>}
          </div>
        )}
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
            options={[{ value: '', label: 'Unassigned' }, ...sortByText(ownerChoices, (o) => o.name).map((o) => ({
              value: o.id,
              label: o.name,
              meta: genderAgeLine(o) || undefined,
              ring: showLoadRing && ownerLoad && maxLoad ? { value: ownerLoad.get(o.id) ?? 0, max: maxLoad } : undefined,
            }))]}
            placeholder="Unassigned"
          />
        )}
        {canEditOwner && isTeen && (
          <p className={`-mt-2 text-xs ${teenSupportsFailed ? 'font-medium text-red-600' : 'text-gray-500'}`}>
            {teenSupportsFailed ? 'Could not load the Teen Supports. Close this and open it again.' : 'Teens go only to a Teen Support of the same gender.'}
          </p>
        )}
        {canEditOwner && ownerId && ownerId !== (contact?.ownerId || '') && maxLoad && (ownerLoad?.get(ownerId) ?? 0) >= maxLoad && (
          <p className="-mt-2 rounded-2xl bg-amber-100/80 px-4 py-2.5 text-xs font-medium text-amber-700">
            {owners.find((o) => o.id === ownerId)?.name || 'This support'} already has {ownerLoad?.get(ownerId) ?? 0} open follow-ups (max {maxLoad}). You can still save.
          </p>
        )}
        {canEditOwner ? (
          <AppSelect
            label="Target cohort"
            value={cohortId}
            onChange={setCohortId}
            options={[{ value: '', label: 'No cohort' }, ...sortByText(cohorts, (c) => c.name).map((c) => ({ value: c.id, label: c.name }))]}
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
          <button
            type="button"
            onClick={() => setDetailsOpen((open) => !open)}
            className="mb-3 flex w-full items-center justify-between rounded-xl border border-orange-100 bg-orange-50/40 px-3.5 py-2.5 text-sm font-semibold text-gray-700"
          >
            <span>
              More details
              {email || gender || ageRange || occupation
                ? <span className="ml-1 text-xs font-normal text-primary">· added</span>
                : <span className="ml-1 text-xs font-normal text-gray-400">(optional)</span>}
            </span>
            <svg className={`h-4 w-4 flex-none text-gray-400 transition-transform ${detailsOpen ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m9 5 7 7-7 7" /></svg>
          </button>
          {detailsOpen && (
            <div className="mb-4 space-y-3">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Email</label>
                <input type="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Gender</label>
                  <AppSelect value={gender} onChange={setGender} options={[{ value: '', label: 'Not set' }, { value: 'Male', label: 'Male' }, { value: 'Female', label: 'Female' }]} placeholder="Not set" compact />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Age range</label>
                  <AppSelect
                    value={ageRange}
                    onChange={setAgeRange}
                    options={[{ value: '', label: 'Not set' }, ...[...(ageRange === '10 - 17' ? ['10 - 17'] : []), '18 - 24', '25 - 34', '35 - 44', '45 - 59', '60 and above'].map((value) => ({ value, label: value }))]}
                    placeholder="Not set"
                    compact
                  />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Occupation</label>
                <input type="text" className={inputClass} value={occupation} onChange={(e) => setOccupation(e.target.value)} placeholder="What they do for a living" />
              </div>
              {contact?.registeredByName && (
                <p className="text-xs text-gray-500">Added for follow up by {contact.registeredByName}</p>
              )}
            </div>
          )}
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Notes</label>
          <textarea className={`${inputClass} min-h-[80px]`} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything worth remembering" />
        </div>
        {canEditOwner && isTeen && (
          <div className="rounded-2xl bg-pink-50/70 p-4">
            {confirmNotTeen ? (
              <>
                <p className="text-sm text-gray-700">Move {contact?.fullName} back to the normal follow-up? They leave the Teen Support and the teen group, and wait to be assigned to a support.</p>
                <div className="mt-3 flex gap-2">
                  <button type="button" disabled={saving} onClick={() => void handleNotTeen()} className="rounded-full bg-primary px-4 py-2 text-xs font-bold text-white disabled:opacity-50">Yes, not a teen</button>
                  <button type="button" disabled={saving} onClick={() => setConfirmNotTeen(false)} className="rounded-full px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-white">Cancel</button>
                </div>
              </>
            ) : (
              <button type="button" onClick={() => setConfirmNotTeen(true)} className="text-xs font-semibold text-pink-700">This person is not a teen</button>
            )}
          </div>
        )}
      </div>
    </ModalShell>
  );
};

export default FollowUpContactModal;
