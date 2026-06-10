import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import FollowUpContactsTable from '../components/followups/FollowUpContactsTable';
import FollowUpContactModal from '../components/followups/FollowUpContactModal';
import FollowUpIssuesPanel from '../components/followups/FollowUpIssuesPanel';
import { useAuth } from '../hooks/useAuth';
import { useAppData } from '../context/AppDataContext';
import {
  followUpContactsApi,
  followUpIssuesApi,
  settingsApi,
} from '../services/api';
import type { FollowUpContact, FollowUpContactUpdate, FollowUpIssue } from '../types';

type Tab = 'contacts' | 'issues';

const SupportFollowUpsPage: React.FC = () => {
  const { user } = useAuth();
  const { cohorts } = useAppData();

  const [tab, setTab] = useState<Tab>('contacts');
  const [contacts, setContacts] = useState<FollowUpContact[]>([]);
  const [issues, setIssues] = useState<FollowUpIssue[]>([]);
  const [registrationLink, setRegistrationLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [showLinkTip, setShowLinkTip] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [editingContact, setEditingContact] = useState<FollowUpContact | null>(null);
  const [messagingContact, setMessagingContact] = useState<FollowUpContact | null>(null);

  const loadAll = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setLoadError('');
    try {
      const [contactsRes, linkRes] = await Promise.all([
        followUpContactsApi.getAll({ ownerId: user.id }),
        settingsApi.getRegistrationLink(),
      ]);
      const issuesRes = await followUpIssuesApi.getAll();
      setContacts(contactsRes.contacts);
      setIssues(issuesRes.issues);
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

  const visibleIssues = useMemo(() => {
    const contactIds = new Set(contacts.map((contact) => contact.id));
    return issues.filter((issue) => issue.reportedById === user?.id || (issue.contactId ? contactIds.has(issue.contactId) : false));
  }, [contacts, issues, user?.id]);

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

  const handleLogContact = async (contact: FollowUpContact) => {
    const { contact: logged } = await followUpContactsApi.logContact(contact.id);
    replaceContact(logged);
  };

  const handleCopyLink = async () => {
    if (!registrationLink) return;
    try {
      await navigator.clipboard.writeText(registrationLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: select the text manually
    }
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

      {registrationLink && (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-3xl border border-sky-100 bg-sky-50/60 px-4 py-3">
          <span className="text-xs font-semibold uppercase tracking-[0.08em] text-sky-700">Registration link</span>
          <div className="relative inline-flex">
            <button
              type="button"
              onClick={() => setShowLinkTip((v) => !v)}
              onBlur={() => setShowLinkTip(false)}
              className="inline-flex h-4 w-4 cursor-pointer items-center justify-center rounded-full bg-sky-200 text-[10px] font-bold text-sky-800 transition hover:bg-sky-300"
              aria-label="Show registration link"
            >
              i
            </button>
            {showLinkTip && (
              <div className="absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2">
                <div className="max-w-[320px] rounded-xl bg-slate-800 px-3 py-2 text-xs text-white shadow-lg break-words sm:max-w-md">
                  {registrationLink}
                </div>
                <div className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-slate-800" />
              </div>
            )}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyLink}
              className="rounded-2xl border border-sky-200 bg-white px-3 py-1.5 text-xs font-semibold text-sky-700 transition hover:bg-sky-100 active:scale-95"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
            <a
              href={registrationLink}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-2xl bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-700 active:scale-95"
            >
              Open
            </a>
          </div>
        </div>
      )}

      <div className="mb-5 flex flex-wrap items-center gap-2">
        {[
          { key: 'contacts', label: 'Contacts' },
          { key: 'issues', label: 'Issues' },
        ].map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key as Tab)}
            className={`rounded-2xl px-4 py-2 text-sm font-semibold transition ${tab === item.key ? 'bg-primary text-white' : 'bg-white text-gray-600 hover:bg-orange-50'}`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {loadError && <p className="mb-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{loadError}</p>}

      {loading ? (
        <p className="rounded-3xl bg-orange-50/60 px-4 py-12 text-center text-sm text-gray-500">Loading your follow-ups…</p>
      ) : (
        <>
          {tab === 'contacts' && (
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
          {tab === 'issues' && (
            <FollowUpIssuesPanel
              issues={visibleIssues}
              onIssuesChanged={setIssues}
              contacts={visibleContacts}
              owners={[]}
              currentUserId={user?.id}
              canResolve={false}
              canAssignOwner={false}
            />
          )}
        </>
      )}

      <FollowUpContactModal
        isOpen={!!editingContact}
        onClose={() => setEditingContact(null)}
        onSaved={replaceContact}
        contact={editingContact}
        owners={[]}
        cohorts={cohorts}
        canEditOwner={false}
      />
    </div>
  );
};

export default SupportFollowUpsPage;
