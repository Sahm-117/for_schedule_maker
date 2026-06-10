import React, { useState } from 'react';
import type { FollowUpContact, User } from '../../types';
import AppSelect from '../AppSelect';
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
      className="min-w-[130px]"
    />
  );

  const actions = (contact: FollowUpContact) => (
    <div className="flex items-center justify-end gap-1">
      <button type="button" onClick={() => onMessage(contact)} className="rounded-xl px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50" title="Send WhatsApp message">
        Message
      </button>
      <button type="button" onClick={() => onLogContact(contact)} className="rounded-xl px-2.5 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-50" title="Log a contact attempt (bumps count + date)">
        Log
      </button>
      <button type="button" onClick={() => onEdit(contact)} className="rounded-xl px-2.5 py-1.5 text-xs font-semibold text-primary hover:bg-orange-50">
        Edit
      </button>
      {canAssign && onDelete && (
        <button type="button" onClick={() => onDelete(contact)} className="rounded-xl px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50">
          Delete
        </button>
      )}
    </div>
  );

  if (contacts.length === 0) {
    return <p className="rounded-3xl bg-orange-50/60 px-4 py-12 text-center text-sm text-gray-500">No contacts here yet.</p>;
  }

  return (
    <div className="space-y-3">
      {canAssign && selected.size > 0 && (
        <div className="surface-card sticky top-16 z-20 flex flex-wrap items-center gap-3 rounded-3xl px-4 py-3">
          <span className="text-sm font-semibold text-gray-900">{selected.size} selected</span>
          <div className="w-48">
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
      <div className="surface-card hidden overflow-x-auto rounded-3xl lg:block">
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
              <th className="px-4 py-3">Follow-ups</th>
              <th className="sticky right-0 bg-orange-50/95 px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {contacts.map((contact) => (
              <tr key={contact.id} className="border-t border-orange-50 align-middle">
                {canAssign && (
                  <td className="px-3 py-3">
                    <input type="checkbox" checked={selected.has(contact.id)} onChange={() => toggle(contact.id)} className="h-4 w-4 rounded border-orange-200 text-primary" />
                  </td>
                )}
                <td className="px-4 py-3">
                  <p className="font-semibold text-gray-900">{contact.fullName}</p>
                  <p className="text-xs text-gray-500">{contact.phone || 'No phone'}{contact.source ? ` • ${contact.source}` : ''}</p>
                  {contact.notes && <p className="mt-0.5 max-w-[220px] truncate text-xs text-amber-700" title={contact.notes}>{contact.notes}</p>}
                </td>
                {canAssign && (
                  <td className="px-4 py-3">
                    <AppSelect
                      value={contact.ownerId || ''}
                      onChange={(v) => onFieldChange(contact, { ownerId: v || null, previousOwnerId: contact.ownerId || null })}
                      options={ownerOptions}
                      placeholder="Unassigned"
                      compact
                      className="min-w-[140px]"
                    />
                  </td>
                )}
                <td className="px-4 py-3">{statusCell(contact, 'messageStatus', MESSAGE_STATUS_META, contact.messageStatus)}</td>
                <td className="px-4 py-3">{statusCell(contact, 'replyStatus', REPLY_STATUS_META, contact.replyStatus)}</td>
                <td className="px-4 py-3">{statusCell(contact, 'callStatus', CALL_STATUS_META, contact.callStatus)}</td>
                <td className="px-4 py-3">{statusCell(contact, 'registrationStatus', REGISTRATION_STATUS_META, contact.registrationStatus)}</td>
                <td className="px-4 py-3">{statusCell(contact, 'nextAction', NEXT_ACTION_META, contact.nextAction)}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-semibold ${isOverdue(contact) ? 'text-rose-600' : 'text-gray-600'}`}>
                    {dateLabel(contact.dueDate)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <p className="text-xs text-gray-600">{contact.followUpCount}× {contact.lastContactDate ? `• ${dateLabel(contact.lastContactDate)}` : ''}</p>
                </td>
                <td className="sticky right-0 bg-white px-4 py-3">{actions(contact)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="space-y-3 lg:hidden">
        {contacts.map((contact) => (
          <div key={contact.id} className="surface-card rounded-3xl p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {canAssign && (
                    <input type="checkbox" checked={selected.has(contact.id)} onChange={() => toggle(contact.id)} className="h-4 w-4 rounded border-orange-200 text-primary" />
                  )}
                  <p className="truncate font-semibold text-gray-900">{contact.fullName}</p>
                </div>
                <p className="mt-0.5 text-xs text-gray-500">{contact.phone || 'No phone'}{contact.source ? ` • ${contact.source}` : ''}</p>
                {canAssign && <p className="mt-0.5 text-xs text-gray-500">Owner: {contact.ownerName || 'Unassigned'}</p>}
              </div>
              <span className={`shrink-0 text-xs font-semibold ${isOverdue(contact) ? 'text-rose-600' : 'text-gray-500'}`}>
                {contact.dueDate ? `Due ${dateLabel(contact.dueDate)}` : ''}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <FollowUpStatusPill label={MESSAGE_STATUS_META[contact.messageStatus].label} tone={MESSAGE_STATUS_META[contact.messageStatus].tone} />
              <FollowUpStatusPill label={REPLY_STATUS_META[contact.replyStatus].label} tone={REPLY_STATUS_META[contact.replyStatus].tone} />
              <FollowUpStatusPill label={CALL_STATUS_META[contact.callStatus].label} tone={CALL_STATUS_META[contact.callStatus].tone} />
              <FollowUpStatusPill label={REGISTRATION_STATUS_META[contact.registrationStatus].label} tone={REGISTRATION_STATUS_META[contact.registrationStatus].tone} />
              <FollowUpStatusPill label={NEXT_ACTION_META[contact.nextAction].label} tone={NEXT_ACTION_META[contact.nextAction].tone} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {statusCell(contact, 'replyStatus', REPLY_STATUS_META, contact.replyStatus)}
              {statusCell(contact, 'registrationStatus', REGISTRATION_STATUS_META, contact.registrationStatus)}
              {statusCell(contact, 'callStatus', CALL_STATUS_META, contact.callStatus)}
              {statusCell(contact, 'nextAction', NEXT_ACTION_META, contact.nextAction)}
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-orange-50 pt-3">
              <span className="text-xs text-gray-500">{contact.followUpCount} follow-up{contact.followUpCount === 1 ? '' : 's'}{contact.lastContactDate ? ` • last ${dateLabel(contact.lastContactDate)}` : ''}</span>
              {actions(contact)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default FollowUpContactsTable;
