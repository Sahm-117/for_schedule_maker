import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import AppSelect from '../components/AppSelect';
import ConfirmationModal from '../components/ConfirmationModal';
import FollowUpDashboard from '../components/followups/FollowUpDashboard';
import FollowUpContactsTable from '../components/followups/FollowUpContactsTable';
import FollowUpContactModal from '../components/followups/FollowUpContactModal';
import ContactImportModal from '../components/followups/ContactImportModal';
import MessageTemplatePicker from '../components/followups/MessageTemplatePicker';
import MessageBankPanel from '../components/followups/MessageBankPanel';
import FollowUpIssuesPanel from '../components/followups/FollowUpIssuesPanel';
import { useAuth } from '../hooks/useAuth';
import { useAppData } from '../context/AppDataContext';
import {
  followUpContactsApi,
  followUpIssuesApi,
  messageTemplatesApi,
  settingsApi,
  usersApi,
} from '../services/api';
import type { FollowUpContact, FollowUpContactUpdate, FollowUpIssue, MessageTemplate, User } from '../types';

type Tab = 'overview' | 'contacts' | 'messages' | 'issues';

const AdminFollowUpsPage: React.FC = () => {
  const { isAdmin, user } = useAuth();
  const { cohorts, activeCohort, liveRevision } = useAppData();

  const [tab, setTab] = useState<Tab>('overview');
  const [contacts, setContacts] = useState<FollowUpContact[]>([]);
  const [owners, setOwners] = useState<User[]>([]);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [issues, setIssues] = useState<FollowUpIssue[]>([]);
  const [registrationLink, setRegistrationLink] = useState('');
  const [cohortFilter, setCohortFilter] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [showContactModal, setShowContactModal] = useState(false);
  const [editingContact, setEditingContact] = useState<FollowUpContact | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [messagingContact, setMessagingContact] = useState<FollowUpContact | null>(null);
  const [deletingContact, setDeletingContact] = useState<FollowUpContact | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [contactsRes, usersRes, templatesRes, issuesRes, linkRes] = await Promise.all([
        followUpContactsApi.getAll(),
        usersApi.getAll(),
        messageTemplatesApi.getAll(),
        followUpIssuesApi.getAll(),
        settingsApi.getRegistrationLink(),
      ]);
      setContacts(contactsRes.contacts);
      setOwners(usersRes.users.filter((u) => u.role === 'SUPPORT' || u.role === 'ADMIN'));
      setTemplates(templatesRes.templates);
      setIssues(issuesRes.issues);
      setRegistrationLink(linkRes.url);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load follow-ups.');
    } finally {
      setLoading(false);
    }
  }, [liveRevision]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const replaceContact = (updated: FollowUpContact) => {
    setContacts((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
  };

  const filteredContacts = useMemo(() => {
    return contacts.filter((c) => {
      if (cohortFilter && c.cohortId !== cohortFilter) return false;
      if (ownerFilter === '__unassigned__' && c.ownerId) return false;
      if (ownerFilter && ownerFilter !== '__unassigned__' && c.ownerId !== ownerFilter) return false;
      if (showArchived) return !!c.archivedAt;
      return !c.archivedAt;
    });
  }, [contacts, cohortFilter, ownerFilter, showArchived]);

  const ownerOptionCounts = useMemo(() => {
    const scoped = cohortFilter ? contacts.filter((c) => c.cohortId === cohortFilter && !c.archivedAt) : contacts.filter((c) => !c.archivedAt);
    const total = scoped.length;
    const unassigned = scoped.filter((c) => !c.ownerId).length;
    const perOwner: Record<string, number> = {};
    owners.forEach((o) => {
      perOwner[o.id] = scoped.filter((c) => c.ownerId === o.id).length;
    });
    return { total, unassigned, perOwner };
  }, [contacts, owners, cohortFilter]);

  const dashboardContacts = useMemo(
    () => (cohortFilter ? contacts.filter((c) => c.cohortId === cohortFilter) : contacts),
    [contacts, cohortFilter]
  );

  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleFieldChange = async (contact: FollowUpContact, patch: FollowUpContactUpdate) => {
    try {
      if (patch.registrationStatus) {
        if (patch.registrationStatus === 'REGISTERED') {
          patch.replyStatus = 'REPLIED';
          patch.nextAction = 'CLOSE';
        } else if (patch.registrationStatus === 'NOT_INTERESTED' || patch.registrationStatus === 'NOT_A_TCN_MEMBER') {
          patch.replyStatus = 'REPLIED';
          patch.nextAction = 'CLOSE';
        }
      }
      const { contact: updated } = await followUpContactsApi.update(contact.id, patch);
      replaceContact(updated);
    } catch {
      // refetch to recover from a failed optimistic edit
      void loadAll();
    }
  };

  const handleBulkAssign = async (ids: string[], ownerId: string, dueDate: string | null) => {
    const { contacts: updated } = await followUpContactsApi.assignMany(ids, ownerId, dueDate);
    setContacts((prev) => {
      const map = new Map(updated.map((c) => [c.id, c]));
      return prev.map((c) => map.get(c.id) || c);
    });
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

  const handleDelete = async () => {
    if (!deletingContact) return;
    await followUpContactsApi.delete(deletingContact.id);
    setContacts((prev) => prev.filter((c) => c.id !== deletingContact.id));
    setDeletingContact(null);
  };

  const tabs: Array<{ key: Tab; label: string }> = [
    { key: 'overview', label: 'Overview' },
    { key: 'contacts', label: 'Contacts' },
    { key: 'messages', label: 'Message Bank' },
    { key: 'issues', label: 'Issues' },
  ];

  return (
    <div>
      <PageHeader
        title="Follow-ups"
        subtitle="Track interested people, assign owners, and move them to registration."
        action={(
          <div className="flex gap-2">
            {tab === 'contacts' && (
              <button
                type="button"
                onClick={() => setShowImport(true)}
                className="inline-flex h-11 items-center justify-center rounded-2xl border border-orange-200 bg-white px-4 text-sm font-semibold text-primary hover:bg-orange-50"
              >
                Import
              </button>
            )}
            <button
              type="button"
              onClick={() => { setEditingContact(null); setShowContactModal(true); }}
              className="inline-flex h-11 items-center justify-center rounded-2xl bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-dark"
            >
              Add Contact
            </button>
          </div>
        )}
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`rounded-2xl px-4 py-2 text-sm font-semibold transition ${tab === t.key ? 'bg-primary text-white' : 'bg-white text-gray-600 hover:bg-orange-50'}`}
          >
            {t.label}
          </button>
        ))}
        {(tab === 'overview' || tab === 'contacts') && (
          <div className="ml-auto flex items-center gap-2">
            <div className="w-52">
              <AppSelect
                value={cohortFilter}
                onChange={setCohortFilter}
                options={[{ value: '', label: 'All cohorts' }, ...cohorts.map((c) => ({ value: c.id, label: c.name }))]}
                placeholder="All cohorts"
                compact
              />
            </div>
            {tab === 'contacts' && (
              <div className="w-56">
                <AppSelect
                  value={ownerFilter}
                  onChange={setOwnerFilter}
                  options={[
                    { value: '', label: `All owners (${ownerOptionCounts.total})` },
                    { value: '__unassigned__', label: `Unassigned (${ownerOptionCounts.unassigned})` },
                    ...owners.map((o) => ({ value: o.id, label: `${o.name} (${ownerOptionCounts.perOwner[o.id] || 0})` })),
                  ]}
                  placeholder="All owners"
                  compact
                />
              </div>
            )}
            {tab === 'contacts' && (
              <button
                type="button"
                onClick={() => setShowArchived((v) => !v)}
                className={`rounded-2xl px-3 py-2 text-xs font-semibold ${showArchived ? 'bg-slate-700 text-white' : 'bg-white text-gray-600 hover:bg-orange-50'}`}
              >
                {showArchived ? 'Showing archived' : 'Show archived'}
              </button>
            )}
          </div>
        )}
      </div>

      {loadError && <p className="mb-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{loadError}</p>}

      {loading ? (
        <p className="rounded-3xl bg-orange-50/60 px-4 py-12 text-center text-sm text-gray-500">Loading follow-ups…</p>
      ) : (
        <>
          {tab === 'overview' && <FollowUpDashboard contacts={dashboardContacts} />}
          {tab === 'contacts' && (
            <FollowUpContactsTable
              contacts={filteredContacts}
              owners={owners}
              canAssign
              onFieldChange={(c, patch) => { void handleFieldChange(c, patch); }}
              onMessage={setMessagingContact}
              onLogContact={(c) => { void handleLogContact(c); }}
              onEdit={(c) => { setEditingContact(c); setShowContactModal(true); }}
              onDelete={setDeletingContact}
              onBulkAssign={handleBulkAssign}
            />
          )}
          {tab === 'messages' && (
            <MessageBankPanel
              templates={templates}
              onTemplatesChanged={setTemplates}
              registrationLink={registrationLink}
              onRegistrationLinkChanged={setRegistrationLink}
              currentUser={user}
            />
          )}
          {tab === 'issues' && (
            <FollowUpIssuesPanel
              issues={issues}
              onIssuesChanged={setIssues}
              contacts={contacts}
              owners={owners}
              currentUserId={user?.id}
            />
          )}
        </>
      )}

      <FollowUpContactModal
        isOpen={showContactModal}
        onClose={() => setShowContactModal(false)}
        onSaved={(contact) => {
          setContacts((prev) => {
            const exists = prev.some((c) => c.id === contact.id);
            return exists ? prev.map((c) => (c.id === contact.id ? contact : c)) : [contact, ...prev];
          });
        }}
        contact={editingContact}
        owners={owners}
        cohorts={cohorts}
        defaultCohortId={activeCohort?.id}
        canEditOwner
      />

      <ContactImportModal
        isOpen={showImport}
        onClose={() => setShowImport(false)}
        onImported={(imported) => setContacts((prev) => [...imported, ...prev])}
        existingContacts={contacts}
        cohorts={cohorts}
        defaultCohortId={activeCohort?.id}
      />

      <MessageTemplatePicker
        isOpen={!!messagingContact}
        onClose={() => setMessagingContact(null)}
        contact={messagingContact}
        templates={templates}
        registrationLink={registrationLink}
        currentUserName={user?.name}
        onMessageSent={handleMessageSent}
      />

      <ConfirmationModal
        isOpen={!!deletingContact}
        onClose={() => setDeletingContact(null)}
        onConfirm={() => { void handleDelete(); }}
        title="Delete contact"
        message={`Delete ${deletingContact?.fullName}? This removes their follow-up history and cannot be undone.`}
        confirmText="Delete"
      />
    </div>
  );
};

export default AdminFollowUpsPage;
