import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import FollowUpContactsTable from '../components/followups/FollowUpContactsTable';
import FollowUpContactModal from '../components/followups/FollowUpContactModal';
import MessageTemplatePicker from '../components/followups/MessageTemplatePicker';
import { useAuth } from '../hooks/useAuth';
import {
  followUpContactsApi,
  messageTemplatesApi,
  settingsApi,
} from '../services/api';
import type { FollowUpContact, FollowUpContactUpdate, MessageTemplate } from '../types';

const SupportFollowUpsPage: React.FC = () => {
  const { user } = useAuth();

  const [contacts, setContacts] = useState<FollowUpContact[]>([]);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [registrationLink, setRegistrationLink] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [editingContact, setEditingContact] = useState<FollowUpContact | null>(null);
  const [messagingContact, setMessagingContact] = useState<FollowUpContact | null>(null);

  const loadAll = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setLoadError('');
    try {
      const [contactsRes, templatesRes, linkRes] = await Promise.all([
        followUpContactsApi.getAll({ ownerId: user.id }),
        messageTemplatesApi.getAll(),
        settingsApi.getRegistrationLink(),
      ]);
      setContacts(contactsRes.contacts);
      setTemplates(templatesRes.templates);
      setRegistrationLink(linkRes.url);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load your follow-ups.');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const visibleContacts = useMemo(
    () => contacts.filter((c) => (showArchived ? !!c.archivedAt : !c.archivedAt)),
    [contacts, showArchived]
  );

  if (user && user.role !== 'SUPPORT') {
    return <Navigate to="/dashboard" replace />;
  }

  const replaceContact = (updated: FollowUpContact) => {
    setContacts((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
  };

  const handleFieldChange = async (contact: FollowUpContact, patch: FollowUpContactUpdate) => {
    try {
      const { contact: updated } = await followUpContactsApi.update(contact.id, patch);
      replaceContact(updated);
    } catch {
      void loadAll();
    }
  };

  const handleMessageSent = async (contact: FollowUpContact) => {
    const { contact: marked } = await followUpContactsApi.update(contact.id, { messageStatus: 'SENT' });
    const { contact: logged } = await followUpContactsApi.logContact(marked.id);
    replaceContact(logged);
  };

  const handleLogContact = async (contact: FollowUpContact) => {
    const { contact: logged } = await followUpContactsApi.logContact(contact.id);
    replaceContact(logged);
  };

  return (
    <div>
      <PageHeader
        title="My Follow-ups"
        subtitle="People assigned to you — update statuses right after each message or call."
        action={(
          <button
            type="button"
            onClick={() => setShowArchived((v) => !v)}
            className={`inline-flex h-11 items-center justify-center rounded-2xl px-4 text-sm font-semibold ${showArchived ? 'bg-slate-700 text-white' : 'border border-orange-200 bg-white text-gray-600 hover:bg-orange-50'}`}
          >
            {showArchived ? 'Showing archived' : 'Show archived'}
          </button>
        )}
      />

      {loadError && <p className="mb-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{loadError}</p>}

      {loading ? (
        <p className="rounded-3xl bg-orange-50/60 px-4 py-12 text-center text-sm text-gray-500">Loading your follow-ups…</p>
      ) : (
        <FollowUpContactsTable
          contacts={visibleContacts}
          owners={[]}
          canAssign={false}
          onFieldChange={(c, patch) => { void handleFieldChange(c, patch); }}
          onMessage={setMessagingContact}
          onLogContact={(c) => { void handleLogContact(c); }}
          onEdit={setEditingContact}
        />
      )}

      <FollowUpContactModal
        isOpen={!!editingContact}
        onClose={() => setEditingContact(null)}
        onSaved={replaceContact}
        contact={editingContact}
        owners={[]}
        cohorts={[]}
        canEditOwner={false}
      />

      <MessageTemplatePicker
        isOpen={!!messagingContact}
        onClose={() => setMessagingContact(null)}
        contact={messagingContact}
        templates={templates}
        registrationLink={registrationLink}
        onMessageSent={handleMessageSent}
      />
    </div>
  );
};

export default SupportFollowUpsPage;
