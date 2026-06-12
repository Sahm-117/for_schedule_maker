import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { FollowUpContact, FollowUpStatus, User } from '../../types';
import AppSelect from '../AppSelect';
import AppOverflowMenu from '../AppOverflowMenu';
import NotInterestedPopup from './NotInterestedPopup';
import {
  computeFollowUpStatus,
  followUpStatusOptions,
  isOverdue,
  buildStatusPatch,
} from '../../utils/followUps';

interface FollowUpContactsTableProps {
  contacts: FollowUpContact[];
  owners: User[];
  canAssign: boolean; // admins: owner editing + bulk assign + delete
  onFieldChange: (contact: FollowUpContact, patch: Record<string, unknown>) => void;
  onMessage: (contact: FollowUpContact) => void;
  onLogContact: (contact: FollowUpContact) => void;
  onEdit: (contact: FollowUpContact) => void;
  onDelete?: (contact: FollowUpContact) => void;
  onBulkAssign?: (contactIds: string[], ownerId: string, dueDate: string | null) => Promise<void> | void;
}

const dateLabel = (value?: string | null) => {
  if (!value) return '—';
  const d = new Date(`${value}T12:00:00`);
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(d);
};

const WhatsAppIcon = (
  <svg viewBox="0 0 24 24" fill="currentColor" className="h-full w-full">
    <path d="M12.032 21.965c-1.922 0-3.805-.537-5.414-1.556l-3.633.954.995-3.513a9.939 9.939 0 0 1-1.653-5.534c0-5.523 4.5-10.023 10.023-10.023 2.685 0 5.208 1.045 7.104 2.942a9.975 9.975 0 0 1 2.941 7.104c0 5.522-4.5 10.022-10.023 10.022l-.34-.003v-.001Zm0-18.524c-4.7 0-8.524 3.823-8.524 8.523 0 1.87.606 3.674 1.741 5.16l-1.144 4.035 4.172-1.115a8.54 8.54 0 0 0 4.755 1.443c4.7 0 8.523-3.823 8.523-8.523 0-2.278-.888-4.419-2.5-6.03a8.534 8.534 0 0 0-6.023-2.493Z" />
    <path d="M17.507 14.307c-.269-.134-1.592-.785-1.838-.874-.247-.09-.427-.134-.607.134-.179.27-.696.875-.854 1.055-.157.18-.314.202-.583.067-.27-.134-1.137-.418-2.165-1.335-.8-.713-1.34-1.594-1.497-1.863-.157-.27-.016-.415.118-.55.12-.119.27-.313.404-.47.135-.156.18-.269.27-.448.09-.18.045-.336-.022-.47-.067-.135-.607-1.46-.832-2-.22-.525-.445-.437-.607-.445-.157-.008-.336-.01-.516-.01-.18 0-.472.067-.72.336-.247.27-.944.923-.944 2.252 0 1.33.966 2.614 1.102 2.794.135.18 1.902 2.906 4.61 4.075 2.707 1.168 2.707.78 3.195.73.494-.05 1.588-.645 1.812-1.27.224-.623.224-1.157.157-1.27-.067-.112-.247-.18-.516-.314Z" />
  </svg>
);

const FollowUpContactsTable: React.FC<FollowUpContactsTableProps> = ({
  contacts,
  owners,
  canAssign,
  onFieldChange,
  onMessage,
  onLogContact,
  onEdit,
  onDelete,
  onBulkAssign,
}) => {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOwnerId, setBulkOwnerId] = useState('');
  const [bulkDueDate, setBulkDueDate] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [adjustingCount, setAdjustingCount] = useState<FollowUpContact | null>(null);
  const [editingDueDate, setEditingDueDate] = useState<FollowUpContact | null>(null);
  const [dueDateValue, setDueDateValue] = useState('');
  const [editingNotes, setEditingNotes] = useState<FollowUpContact | null>(null);
  const [notesValue, setNotesValue] = useState('');
  const [editingLastContact, setEditingLastContact] = useState<FollowUpContact | null>(null);
  const [lastContactValue, setLastContactValue] = useState('');
  const [viewingInfo, setViewingInfo] = useState<string | null>(null);
  const [savingFields, setSavingFields] = useState<Set<string>>(new Set());
  const [notInterestedContact, setNotInterestedContact] = useState<FollowUpContact | null>(null);
  const [pendingClose, setPendingClose] = useState<{ contact: FollowUpContact; status: 'REGISTERED' | 'WRONG_NUMBER' } | null>(null);
  const [closeNotes, setCloseNotes] = useState('');
  const stepperRef = useRef<HTMLDivElement | null>(null);
  const dueDateInputRef = useRef<HTMLInputElement | null>(null);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected((prev) => (prev.size === contacts.length ? new Set() : new Set(contacts.map((c) => c.id))));
  };

  const handleBulkAssign = async () => {
    if (!bulkOwnerId || selected.size === 0 || !onBulkAssign) return;
    setAssigning(true);
    try {
      await onBulkAssign(Array.from(selected), bulkOwnerId, bulkDueDate || null);
      setSelected(new Set());
      setBulkOwnerId('');
      setBulkDueDate('');
    } finally {
      setAssigning(false);
    }
  };

  const ownerOptions = [{ value: '', label: 'Unassigned' }, ...owners.map((o) => ({ value: o.id, label: o.name }))];

  const statusDropdown = (contact: FollowUpContact) => {
    const key = `${contact.id}:followUpStatus`;
    const currentStatus = computeFollowUpStatus(contact);
    return (
      <AppSelect
        value={currentStatus}
        loading={savingFields.has(key)}
        onChange={async (v) => {
          const status = v as FollowUpStatus;
          if (status === 'NOT_INTERESTED') {
            setNotInterestedContact(contact);
            return;
          }
          if (status === 'REGISTERED' || status === 'WRONG_NUMBER') {
            setCloseNotes(contact.notes || '');
            setPendingClose({ contact, status });
            return;
          }
          setSavingFields((prev) => new Set(prev).add(key));
          try {
            const patch = buildStatusPatch(status);
            patch.followUpCount = contact.followUpCount;
            await (onFieldChange(contact, patch) as unknown as Promise<unknown>);
          } finally {
            setSavingFields((prev) => {
              const next = new Set(prev);
              next.delete(key);
              return next;
            });
          }
        }}
        options={followUpStatusOptions}
        placeholder="—"
        compact
        className="min-w-[160px]"
      />
    );
  };

  const actions = (contact: FollowUpContact) => (
    <AppOverflowMenu
      items={[
        { label: 'Send message', onClick: () => onMessage(contact), icon: WhatsAppIcon },
        { label: 'Log an issue', onClick: () => onLogContact(contact) },
        { label: 'Edit contact', onClick: () => onEdit(contact) },
        { label: `Number of follow ups (${contact.followUpCount})`, onClick: () => setAdjustingCount(contact) },
        { label: `Due date: ${contact.dueDate ? dateLabel(contact.dueDate) : 'none'}`, onClick: () => { setDueDateValue(contact.dueDate || ''); setEditingDueDate(contact); } },
        { label: `Last contact: ${contact.lastContactDate ? dateLabel(contact.lastContactDate) : 'none'}`, onClick: () => { setLastContactValue(contact.lastContactDate || ''); setEditingLastContact(contact); } },
        { label: contact.notes ? `View note` : `Add note`, onClick: () => { setNotesValue(contact.notes || ''); setEditingNotes(contact); } },
        ...(canAssign && onDelete ? [{ label: 'Delete contact', onClick: () => onDelete(contact), tone: 'danger' as const }] : []),
      ]}
    />
  );

  const handleStepperChange = (delta: number) => {
    setAdjustingCount((prev) => {
      if (!prev) return prev;
      const newCount = Math.max(0, prev.followUpCount + delta);
      onFieldChange(prev, { followUpCount: newCount });
      return { ...prev, followUpCount: newCount };
    });
  };

  const handleDueDateSave = () => {
    if (!editingDueDate) return;
    onFieldChange(editingDueDate, { dueDate: dueDateValue || null });
    setEditingDueDate(null);
  };

  const handleNotesSave = () => {
    if (!editingNotes) return;
    onFieldChange(editingNotes, { notes: notesValue.trim() || null });
    setEditingNotes(null);
  };

  const handleLastContactSave = () => {
    if (!editingLastContact) return;
    onFieldChange(editingLastContact, { lastContactDate: lastContactValue || null });
    setEditingLastContact(null);
  };

  if (contacts.length === 0) {
    return <p className="rounded-3xl bg-orange-50/60 px-4 py-12 text-center text-sm text-gray-500">No contacts here yet.</p>;
  }

  return (
    <div className="space-y-3">
      {canAssign && selected.size > 0 && (
        <div className="surface-card sticky top-16 z-40 flex flex-wrap items-center gap-2 rounded-[28px] px-3.5 py-3">
          <span className="text-sm font-semibold text-gray-900">{selected.size} selected</span>
          <div className="w-44">
            <AppSelect value={bulkOwnerId} onChange={setBulkOwnerId} options={ownerOptions.slice(1)} placeholder="Assign to…" compact />
          </div>
          <input
            type="date"
            value={bulkDueDate}
            onChange={(e) => setBulkDueDate(e.target.value)}
            className="rounded-2xl border border-orange-100 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-orange-300"
            title="Initial due date (optional)"
          />
          <button
            type="button"
            onClick={() => { void handleBulkAssign(); }}
            disabled={!bulkOwnerId || assigning}
            className="rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
          >
            {assigning ? 'Assigning…' : 'Assign'}
          </button>
          <button type="button" onClick={() => setSelected(new Set())} className="text-xs font-semibold text-gray-500 hover:text-gray-700">
            Clear
          </button>
        </div>
      )}

      {/* Desktop table */}
      <div className="surface-card hidden overflow-x-auto overflow-y-visible rounded-3xl lg:block">
        <table className="w-full text-left text-sm">
          <thead className="bg-orange-50/60 text-[11px] uppercase tracking-wide text-gray-500">
            <tr>
              {canAssign && (
                <th className="px-3 py-3">
                  <input type="checkbox" checked={selected.size === contacts.length && contacts.length > 0} onChange={toggleAll} className="h-4 w-4 rounded border-orange-200 text-primary" />
                </th>
              )}
              <th className="px-4 py-3">Person</th>
              {canAssign && <th className="px-4 py-3">Owner</th>}
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Due</th>
              <th className="sticky right-0 z-10 w-24 bg-orange-50/60 px-4 py-3 text-right shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.08)]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {contacts.map((contact) => (
              <tr key={contact.id} className="border-t border-orange-50 align-middle">
                {canAssign && (
                  <td className="px-3 py-3.5">
                    <input type="checkbox" checked={selected.has(contact.id)} onChange={() => toggle(contact.id)} className="h-4 w-4 rounded border-orange-200 text-primary" />
                  </td>
                )}
                <td className="px-4 py-3.5">
                  <div className="min-w-[240px]">
                    <p className="font-semibold leading-5 text-gray-900">
                      {contact.fullName}
                      <button
                        type="button"
                        onClick={() => setViewingInfo(viewingInfo === contact.id ? null : contact.id)}
                        className="ml-2 inline-flex h-5 w-5 -translate-y-px items-center justify-center rounded-full bg-gray-200 text-[11px] font-bold text-gray-600 transition hover:bg-gray-300"
                      >
                        i
                      </button>
                      {contact.notes && (
                        <button
                          type="button"
                          onClick={() => { setNotesValue(contact.notes || ''); setEditingNotes(contact); }}
                          className="ml-2.5 inline-flex h-5 w-5 -translate-y-px items-center justify-center rounded-full bg-amber-200 text-[11px] font-bold text-amber-800 transition hover:bg-amber-300"
                        >
                            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                        </button>
                      )}
                    </p>
                    {viewingInfo === contact.id && (
                      <div className="mt-1.5 rounded-xl bg-slate-800 px-3 py-2 text-xs text-white shadow-lg">
                        <p>{contact.phone || 'No phone'}</p>
                        {contact.source && <p className="mt-0.5 text-gray-300">{contact.source}</p>}
                      </div>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {contact.ownerName && (
                        <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">
                          {contact.ownerName}
                        </span>
                      )}

                    </div>
                  </div>
                </td>
                {canAssign && (
                  <td className="px-4 py-3.5">
                    <AppSelect
                      value={contact.ownerId || ''}
                      onChange={(v) => onFieldChange(contact, { ownerId: v || null, previousOwnerId: contact.ownerId || null })}
                      options={ownerOptions}
                      placeholder="Unassigned"
                      compact
                      className="min-w-[136px]"
                    />
                  </td>
                )}
                <td className="px-4 py-3.5" data-wt="fu-status-dropdown">{statusDropdown(contact)}</td>
                <td className="px-4 py-3.5">
                  <span className={`text-xs font-semibold ${isOverdue(contact) ? 'text-rose-600' : 'text-gray-600'}`}>
                    {dateLabel(contact.dueDate)}
                  </span>
                </td>
                <td className="sticky right-0 z-10 bg-white px-4 py-3.5 shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.08)]">
                  <div className="flex justify-end gap-1.5">
                    {actions(contact)}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="space-y-2 lg:hidden">
        {contacts.map((contact) => (
          <div key={contact.id} className="surface-card overflow-hidden rounded-[24px]">
            {/* Header */}
            <div className="flex items-start justify-between px-4 pt-3.5">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1">
                  {canAssign && (
                    <input type="checkbox" checked={selected.has(contact.id)} onChange={() => toggle(contact.id)} className="mr-1 h-4 w-4 shrink-0 rounded border-orange-200 text-primary" />
                  )}
                  <span className="truncate text-[16px] font-bold leading-5 text-gray-900">{contact.fullName}</span>
                  <button
                    type="button"
                    onClick={() => setViewingInfo(viewingInfo === contact.id ? null : contact.id)}
                    className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-200 text-[11px] font-bold text-gray-600 transition hover:bg-gray-300"
                  >
                    i
                  </button>
                  {contact.notes && (
                    <button
                      type="button"
                      onClick={() => { setNotesValue(contact.notes || ''); setEditingNotes(contact); }}
                      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-200 text-[11px] font-bold text-amber-800 transition hover:bg-amber-300"
                    >
                      <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    </button>
                  )}
                </div>
                {viewingInfo === contact.id && (
                  <div className="mt-1.5 rounded-xl bg-slate-800 px-3 py-2 text-xs text-white shadow-lg">
                    <p>{contact.phone || 'No phone'}</p>
                    {contact.source && <p className="mt-0.5 text-gray-300">{contact.source}</p>}
                  </div>
                )}
                {canAssign && contact.ownerName && (
                  <p className="mt-0.5 text-xs text-gray-500">{contact.ownerName}</p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ${isOverdue(contact) ? 'bg-rose-100 text-rose-700' : 'bg-gray-100 text-gray-500'}`}>
                  {contact.dueDate ? dateLabel(contact.dueDate) : 'No date'}
                </span>
                {actions(contact)}
              </div>
            </div>

            {/* Status dropdown */}
            <div className="mt-2.5 px-4">
              <div>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-300">Status</p>
                {statusDropdown(contact)}
              </div>
            </div>

            {/* Action */}
            <div className="mt-2.5 border-t border-orange-50 px-4 py-2.5">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  data-wt="fu-whatsapp"
                  onPointerDown={() => onMessage(contact)}
                  className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 active:scale-95"
                >
                  <span className="h-3.5 w-3.5">{WhatsAppIcon}</span>
                  Message
                </button>
                <button
                  type="button"
                  onPointerDown={() => setAdjustingCount(contact)}
                  className="inline-flex items-center gap-1 rounded-full border border-orange-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-orange-50 active:scale-95"
                >
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
                  {contact.followUpCount}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {adjustingCount && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center" onClick={() => setAdjustingCount(null)}>
          <div className="absolute inset-0 bg-slate-900/35" />
          <div ref={stepperRef} className="relative mb-20 w-[90vw] max-w-[300px] rounded-[28px] bg-white p-5 shadow-[0_28px_80px_rgba(15,23,42,0.25)] sm:mb-0" onClick={(e) => e.stopPropagation()}>
            <p className="mb-1 text-center text-xs font-semibold uppercase tracking-[0.12em] text-gray-400">How many times have you followed up?</p>
            <p className="mb-4 truncate text-center text-sm font-semibold text-gray-900">{adjustingCount.fullName}</p>
            <div className="flex items-center justify-center gap-5">
              <button
                type="button"
                disabled={adjustingCount.followUpCount <= 0}
                onPointerDown={() => handleStepperChange(-1)}
                className="grid h-12 w-12 place-items-center rounded-2xl bg-orange-100 text-2xl font-bold text-primary shadow-sm transition active:scale-95 hover:bg-orange-200 disabled:opacity-30 disabled:active:scale-100"
              >
                −
              </button>
              <span className="min-w-[4ch] text-center text-4xl font-bold tabular-nums tracking-tight text-gray-900">
                {adjustingCount.followUpCount}
              </span>
              <button
                type="button"
                onPointerDown={() => handleStepperChange(1)}
                className="grid h-12 w-12 place-items-center rounded-2xl bg-primary text-2xl font-bold text-white shadow-sm transition active:scale-95 hover:bg-primary-dark"
              >
                +
              </button>
            </div>
            <button
              type="button"
              onClick={() => setAdjustingCount(null)}
              className="mx-auto mt-5 block rounded-2xl bg-gray-100 px-6 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-200 active:scale-95"
            >
              Done
            </button>
          </div>
        </div>,
        document.body
      )}

      {editingDueDate && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center" onClick={() => setEditingDueDate(null)}>
          <div className="absolute inset-0 bg-slate-900/35" />
          <div className="relative mb-20 w-[90vw] max-w-[320px] rounded-[28px] bg-white p-5 shadow-[0_28px_80px_rgba(15,23,42,0.25)] sm:mb-0" onClick={(e) => e.stopPropagation()}>
            <p className="mb-1 text-center text-xs font-semibold uppercase tracking-[0.12em] text-gray-400">Due date</p>
            <p className="mb-4 truncate text-center text-sm font-semibold text-gray-900">{editingDueDate.fullName}</p>
            <input
              ref={dueDateInputRef}
              type="date"
              value={dueDateValue}
              onChange={(e) => setDueDateValue(e.target.value)}
              className="w-full rounded-2xl border border-orange-100 bg-white px-4 py-3 text-sm shadow-sm outline-none transition focus:border-orange-300"
            />
            {!dueDateValue && <p className="mt-2 text-center text-xs text-gray-400">Select date</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setEditingDueDate(null)} className="rounded-2xl border border-orange-100 bg-white px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-orange-50">Cancel</button>
              <button type="button" onClick={handleDueDateSave} className="rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark">Save</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {editingLastContact && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center" onClick={() => setEditingLastContact(null)}>
          <div className="absolute inset-0 bg-slate-900/35" />
          <div className="relative mb-20 w-[90vw] max-w-[320px] rounded-[28px] bg-white p-5 shadow-[0_28px_80px_rgba(15,23,42,0.25)] sm:mb-0" onClick={(e) => e.stopPropagation()}>
            <p className="mb-1 text-center text-xs font-semibold uppercase tracking-[0.12em] text-gray-400">Last contact date</p>
            <p className="mb-4 truncate text-center text-sm font-semibold text-gray-900">{editingLastContact.fullName}</p>
            <input
              type="date"
              value={lastContactValue}
              onChange={(e) => setLastContactValue(e.target.value)}
              className="w-full rounded-2xl border border-orange-100 bg-white px-4 py-3 text-sm shadow-sm outline-none transition focus:border-orange-300"
            />
            {!lastContactValue && <p className="mt-2 text-center text-xs text-gray-400">Select date</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setEditingLastContact(null)} className="rounded-2xl border border-orange-100 bg-white px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-orange-50">Cancel</button>
              <button type="button" onClick={handleLastContactSave} className="rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark">Save</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {notInterestedContact && (
        <NotInterestedPopup
          contactName={notInterestedContact.fullName}
          existingNotes={notInterestedContact.notes}
          onSave={(subReason, notes) => {
            const key = `${notInterestedContact.id}:followUpStatus`;
            setSavingFields((prev) => new Set(prev).add(key));
            const patch = buildStatusPatch('NOT_INTERESTED', subReason);
            patch.notes = notes || notInterestedContact.notes || null;
            patch.followUpCount = notInterestedContact.followUpCount;
            onFieldChange(notInterestedContact, patch);
            setSavingFields((prev) => {
              const next = new Set(prev);
              next.delete(key);
              return next;
            });
            setNotInterestedContact(null);
          }}
          onCancel={() => setNotInterestedContact(null)}
        />
      )}

      {pendingClose && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[140] flex items-end justify-center sm:items-center" onClick={() => setPendingClose(null)}>
          <div className="absolute inset-0 bg-slate-900/35" />
          <div className="relative mb-20 w-[90vw] max-w-[340px] rounded-[28px] bg-white p-5 shadow-[0_28px_80px_rgba(15,23,42,0.25)] sm:mb-0" onClick={(e) => e.stopPropagation()}>
            <p className="text-center text-xs font-semibold uppercase tracking-[0.12em] text-gray-400">Any notes?</p>
            <p className="mb-4 truncate text-center text-sm font-semibold text-gray-900">{pendingClose.contact.fullName}</p>
            <textarea
              value={closeNotes}
              onChange={(e) => setCloseNotes(e.target.value)}
              placeholder="Optional — context for this status update."
              className="min-h-[100px] w-full rounded-2xl border border-orange-100 bg-white px-4 py-3 text-sm shadow-sm outline-none transition focus:border-orange-300"
            />
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setPendingClose(null)} className="rounded-2xl border border-orange-100 bg-white px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-orange-50">Cancel</button>
              <button type="button" onClick={async () => {
                const { contact, status } = pendingClose;
                const key = `${contact.id}:followUpStatus`;
                setSavingFields((prev) => new Set(prev).add(key));
                try {
                  const patch = buildStatusPatch(status);
                  patch.notes = closeNotes.trim() || contact.notes || null;
                  patch.followUpCount = contact.followUpCount;
                  await (onFieldChange(contact, patch) as unknown as Promise<unknown>);
                } finally {
                  setSavingFields((prev) => {
                    const next = new Set(prev);
                    next.delete(key);
                    return next;
                  });
                  setPendingClose(null);
                  setCloseNotes('');
                }
              }} className="rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark">Save</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {editingNotes && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center" onClick={() => setEditingNotes(null)}>
          <div className="absolute inset-0 bg-slate-900/35" />
          <div className="relative mb-20 w-[90vw] max-w-[320px] rounded-[28px] bg-white p-5 shadow-[0_28px_80px_rgba(15,23,42,0.25)] sm:mb-0" onClick={(e) => e.stopPropagation()}>
            <p className="mb-1 text-center text-xs font-semibold uppercase tracking-[0.12em] text-gray-400">Note</p>
            <p className="mb-4 truncate text-center text-sm font-semibold text-gray-900">{editingNotes.fullName}</p>
            <textarea
              value={notesValue}
              onChange={(e) => setNotesValue(e.target.value)}
              placeholder="Anything worth remembering"
              className="min-h-[100px] w-full rounded-2xl border border-orange-100 bg-white px-4 py-3 text-sm shadow-sm outline-none transition focus:border-orange-300"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setEditingNotes(null)} className="rounded-2xl border border-orange-100 bg-white px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-orange-50">Cancel</button>
              <button type="button" onClick={handleNotesSave} className="rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark">Save</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default FollowUpContactsTable;
