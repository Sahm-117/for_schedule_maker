import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { FollowUpContact, User } from '../../types';
import AppSelect from '../AppSelect';
import AppOverflowMenu from '../AppOverflowMenu';
import FollowUpStatusPill from './FollowUpStatusPill';
import {
  MESSAGE_STATUS_META,
  REPLY_STATUS_META,
  CALL_STATUS_META,
  REGISTRATION_STATUS_META,
  NEXT_ACTION_META,
  statusOptions,
  isOverdue,
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

const compactMeta = (primary: string, secondary?: string | null) =>
  secondary ? `${primary} • ${secondary}` : primary;

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
  const stepperRef = useRef<HTMLDivElement | null>(null);

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

  const statusCell = (contact: FollowUpContact, field: string, meta: Record<string, { label: string; tone: string }>, value: string) => (
    <AppSelect
      value={value}
      onChange={(v) => onFieldChange(contact, { [field]: v })}
      options={statusOptions(meta)}
      placeholder="—"
      compact
      className="min-w-[122px]"
    />
  );

  const actions = (contact: FollowUpContact) => (
    <AppOverflowMenu
      items={[
        { label: 'Send message', onClick: () => onMessage(contact) },
        { label: 'Log an issue', onClick: () => onLogContact(contact) },
        { label: 'Edit contact', onClick: () => onEdit(contact) },
        { label: `Number of follow ups (${contact.followUpCount})`, onClick: () => setAdjustingCount(contact) },
        ...(canAssign && onDelete ? [{ label: 'Delete contact', onClick: () => onDelete(contact), tone: 'danger' as const }] : []),
      ]}
    />
  );

  const handleStepperChange = (delta: number) => {
    if (!adjustingCount) return;
    const newCount = Math.max(0, adjustingCount.followUpCount + delta);
    onFieldChange(adjustingCount, { followUpCount: newCount });
    setAdjustingCount(null);
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
              <th className="px-4 py-3">Message</th>
              <th className="px-4 py-3">Reply</th>
              <th className="px-4 py-3">Call</th>
              <th className="px-4 py-3">Registration</th>
              <th className="px-4 py-3">Next action</th>
              <th className="px-4 py-3">Due</th>
              <th className="w-24 px-4 py-3 text-right">Actions</th>
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
                    <p className="font-semibold leading-5 text-gray-900">{contact.fullName}</p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {compactMeta(contact.phone || 'No phone', contact.source || '')}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <FollowUpStatusPill label={MESSAGE_STATUS_META[contact.messageStatus].label} tone={MESSAGE_STATUS_META[contact.messageStatus].tone} />
                      {contact.ownerName && (
                        <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">
                          {contact.ownerName}
                        </span>
                      )}
                      {contact.notes && (
                        <span className="max-w-[180px] truncate rounded-full bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700" title={contact.notes}>
                          {contact.notes}
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
                <td className="px-4 py-3.5">{statusCell(contact, 'messageStatus', MESSAGE_STATUS_META, contact.messageStatus)}</td>
                <td className="px-4 py-3.5">{statusCell(contact, 'replyStatus', REPLY_STATUS_META, contact.replyStatus)}</td>
                <td className="px-4 py-3.5">{statusCell(contact, 'callStatus', CALL_STATUS_META, contact.callStatus)}</td>
                <td className="px-4 py-3.5">{statusCell(contact, 'registrationStatus', REGISTRATION_STATUS_META, contact.registrationStatus)}</td>
                <td className="px-4 py-3.5">{statusCell(contact, 'nextAction', NEXT_ACTION_META, contact.nextAction)}</td>
                <td className="px-4 py-3.5">
                  <span className={`text-xs font-semibold ${isOverdue(contact) ? 'text-rose-600' : 'text-gray-600'}`}>
                    {dateLabel(contact.dueDate)}
                  </span>
                </td>
                <td className="px-4 py-3.5">
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
      <div className="space-y-2.5 lg:hidden">
        {contacts.map((contact) => (
          <div key={contact.id} className="surface-card relative overflow-visible rounded-[28px] p-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-start gap-2">
                  {canAssign && (
                    <input type="checkbox" checked={selected.has(contact.id)} onChange={() => toggle(contact.id)} className="mt-1 h-4 w-4 rounded border-orange-200 text-primary" />
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-[17px] font-semibold leading-5 text-gray-900">{contact.fullName}</p>
                    <p className="mt-1 text-xs text-gray-500">{compactMeta(contact.phone || 'No phone', contact.source || '')}</p>
                    {canAssign && (
                      <p className="mt-1 text-xs text-gray-500">Owner: {contact.ownerName || 'Unassigned'}</p>
                    )}
                  </div>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <span className={`block text-xs font-semibold ${isOverdue(contact) ? 'text-rose-600' : 'text-gray-500'}`}>
                  {contact.dueDate ? `Due ${dateLabel(contact.dueDate)}` : 'No due date'}
                </span>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <FollowUpStatusPill label={MESSAGE_STATUS_META[contact.messageStatus].label} tone={MESSAGE_STATUS_META[contact.messageStatus].tone} />
              <FollowUpStatusPill label={REPLY_STATUS_META[contact.replyStatus].label} tone={REPLY_STATUS_META[contact.replyStatus].tone} />
              <FollowUpStatusPill label={CALL_STATUS_META[contact.callStatus].label} tone={CALL_STATUS_META[contact.callStatus].tone} />
              <FollowUpStatusPill label={REGISTRATION_STATUS_META[contact.registrationStatus].label} tone={REGISTRATION_STATUS_META[contact.registrationStatus].tone} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {canAssign && (
                <AppSelect
                  value={contact.ownerId || ''}
                  onChange={(v) => onFieldChange(contact, { ownerId: v || null, previousOwnerId: contact.ownerId || null })}
                  options={ownerOptions}
                  placeholder="Owner"
                  compact
                  className="col-span-2"
                />
              )}
              {statusCell(contact, 'replyStatus', REPLY_STATUS_META, contact.replyStatus)}
              {statusCell(contact, 'callStatus', CALL_STATUS_META, contact.callStatus)}
              {statusCell(contact, 'registrationStatus', REGISTRATION_STATUS_META, contact.registrationStatus)}
              {statusCell(contact, 'nextAction', NEXT_ACTION_META, contact.nextAction)}
            </div>
            {contact.notes && (
              <p className="mt-3 rounded-2xl bg-amber-50 px-3 py-2 text-xs text-amber-800">{contact.notes}</p>
            )}
            <div className="mt-3 flex items-center justify-between border-t border-orange-50 pt-3">
              <button
                type="button"
                onClick={() => onMessage(contact)}
                className="rounded-full bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-100"
              >
                Send message
              </button>
              {actions(contact)}
            </div>
          </div>
        ))}
      </div>

      {adjustingCount && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center">
          <button type="button" className="absolute inset-0 bg-slate-900/35" onClick={() => setAdjustingCount(null)} aria-label="Close" />
          <div ref={stepperRef} className="relative mb-20 w-[90vw] max-w-[300px] rounded-[28px] bg-white p-5 shadow-[0_28px_80px_rgba(15,23,42,0.25)] sm:mb-0">
            <p className="mb-1 text-center text-xs font-semibold uppercase tracking-[0.12em] text-gray-400">Follow-up count</p>
            <p className="mb-4 truncate text-center text-sm font-semibold text-gray-900">{adjustingCount.fullName}</p>
            <div className="flex items-center justify-center gap-5">
              <button
                type="button"
                disabled={adjustingCount.followUpCount <= 0}
                onClick={() => handleStepperChange(-1)}
                className="grid h-12 w-12 place-items-center rounded-2xl bg-orange-100 text-2xl font-bold text-primary shadow-sm transition active:scale-95 hover:bg-orange-200 disabled:opacity-30 disabled:active:scale-100"
              >
                −
              </button>
              <span className="min-w-[4ch] text-center text-4xl font-bold tabular-nums tracking-tight text-gray-900">
                {adjustingCount.followUpCount}
              </span>
              <button
                type="button"
                onClick={() => handleStepperChange(1)}
                className="grid h-12 w-12 place-items-center rounded-2xl bg-primary text-2xl font-bold text-white shadow-sm transition active:scale-95 hover:bg-primary-dark"
              >
                +
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default FollowUpContactsTable;
