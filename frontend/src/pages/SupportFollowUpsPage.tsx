import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Navigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import FollowUpContactsTable from '../components/followups/FollowUpContactsTable';
import FollowUpContactModal from '../components/followups/FollowUpContactModal';
import FollowUpIssuesPanel from '../components/followups/FollowUpIssuesPanel';
import MessageTemplatePicker from '../components/followups/MessageTemplatePicker';
import { useAuth } from '../hooks/useAuth';
import { useAppData } from '../context/AppDataContext';
import {
  followUpContactsApi,
  followUpIssuesApi,
  messageTemplatesApi,
  settingsApi,
} from '../services/api';
import type { FollowUpContact, FollowUpContactUpdate, FollowUpIssue, MessageTemplate } from '../types';
import {
  REPLY_STATUS_META,
  CALL_STATUS_META,
  REGISTRATION_STATUS_META,
  NEXT_ACTION_META,
} from '../utils/followUps';

type Tab = 'contacts' | 'issues';

const READ_KEY = 'fof_issue_read';

function getReadTimestamps(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(READ_KEY) || '{}');
  } catch { return {}; }
}

function markIssueRead(issueId: string) {
  const map = getReadTimestamps();
  map[issueId] = new Date().toISOString();
  localStorage.setItem(READ_KEY, JSON.stringify(map));
}

function unreadCount(issues: FollowUpIssue[]): number {
  const map = getReadTimestamps();
  return issues.filter((i) => i.updatedAt && i.updatedAt > (map[i.id] || '')).length;
}

function activeFilterCount(reply: string, call: string, reg: string, next: string, archived: boolean): number {
  let n = 0;
  if (reply) n++;
  if (call) n++;
  if (reg) n++;
  if (next) n++;
  if (archived) n++;
  return n;
}

const pillBtn = (active: boolean) =>
  `rounded-full px-3 py-1.5 text-xs font-semibold transition active:scale-95 ${
    active ? 'bg-primary text-white shadow-sm' : 'border border-orange-100 bg-white text-gray-600 hover:bg-orange-50'
  }`;

const FilterIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-full w-full">
    <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
  </svg>
);

interface FilterState {
  reply: string;
  call: string;
  reg: string;
  next: string;
  archived: boolean;
}

const statusGroups: Array<{ key: keyof FilterState; label: string; options: Array<{ value: string; label: string }> }> = [
  { key: 'reply', label: 'Reply', options: Object.entries(REPLY_STATUS_META).map(([v, m]) => ({ value: v, label: m.label })) },
  { key: 'call', label: 'Call', options: Object.entries(CALL_STATUS_META).map(([v, m]) => ({ value: v, label: m.label })) },
  { key: 'reg', label: 'Registration', options: Object.entries(REGISTRATION_STATUS_META).map(([v, m]) => ({ value: v, label: m.label })) },
  { key: 'next', label: 'Next action', options: Object.entries(NEXT_ACTION_META).map(([v, m]) => ({ value: v, label: m.label })) },
];

const SupportFollowUpsPage: React.FC = () => {
  const { user } = useAuth();
  const { cohorts, liveRevision } = useAppData();

  const [tab, setTab] = useState<Tab>('contacts');
  const [contacts, setContacts] = useState<FollowUpContact[]>([]);
  const [issues, setIssues] = useState<FollowUpIssue[]>([]);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [registrationLink, setRegistrationLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [showLinkTip, setShowLinkTip] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const initialLoadRef = useRef(true);

  const [filters, setFilters] = useState<FilterState>({ reply: '', call: '', reg: '', next: '', archived: false });
  const [draft, setDraft] = useState<FilterState>({ reply: '', call: '', reg: '', next: '', archived: false });

  const [editingContact, setEditingContact] = useState<FollowUpContact | null>(null);
  const [messagingContact, setMessagingContact] = useState<FollowUpContact | null>(null);

  const loadAll = useCallback(async () => {
    if (!user?.id) return;
    if (initialLoadRef.current) setLoading(true);
    setLoadError('');
    try {
      const [contactsRes, templatesRes, linkRes] = await Promise.all([
        followUpContactsApi.getAll({ ownerId: user.id }),
        messageTemplatesApi.getAll(),
        settingsApi.getRegistrationLink(),
      ]);
      const issuesRes = await followUpIssuesApi.getAll();
      setContacts(contactsRes.contacts);
      setIssues(issuesRes.issues);
      setTemplates(templatesRes.templates);
      setRegistrationLink(linkRes.url);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load your follow-ups.');
    } finally {
      setLoading(false);
      initialLoadRef.current = false;
    }
  }, [user?.id, liveRevision]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    const interval = setInterval(() => void loadAll(), 30000);
    return () => clearInterval(interval);
  }, [loadAll]);

  const visibleContacts = useMemo(
    () => contacts.filter((c) => {
      if (filters.archived) return !!c.archivedAt;
      if (c.archivedAt) return false;
      if (filters.reply && c.replyStatus !== filters.reply) return false;
      if (filters.call && c.callStatus !== filters.call) return false;
      if (filters.reg && c.registrationStatus !== filters.reg) return false;
      if (filters.next && c.nextAction !== filters.next) return false;
      return true;
    }),
    [contacts, filters]
  );

  const visibleIssues = useMemo(() => {
    const contactIds = new Set(contacts.map((contact) => contact.id));
    return issues.filter((issue) => issue.reportedById === user?.id || (issue.contactId ? contactIds.has(issue.contactId) : false));
  }, [contacts, issues, user?.id]);

  const filterCount = activeFilterCount(filters.reply, filters.call, filters.reg, filters.next, filters.archived);
  const unread = unreadCount(visibleIssues);

  if (user && user.role !== 'SUPPORT') {
    return <Navigate to="/dashboard" replace />;
  }

  const replaceContact = (updated: FollowUpContact) => {
    setContacts((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
  };

  const handleFieldChange = async (contact: FollowUpContact, patch: FollowUpContactUpdate) => {
    try {
      if (patch.registrationStatus) {
        if (patch.registrationStatus === 'REGISTERED') {
          patch.replyStatus = 'REPLIED';
          patch.nextAction = 'CLOSE';
        } else if (patch.registrationStatus === 'NOT_INTERESTED' || patch.registrationStatus === 'NOT_A_TCN_MEMBER' || patch.registrationStatus === 'NOT_A_GOOD_TIME') {
          patch.replyStatus = 'REPLIED';
          patch.nextAction = 'CLOSE';
        }
      }
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

  const handleMessageSent = async (contact: FollowUpContact) => {
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
      // fallback
    }
  };

  const openFilterPanel = () => {
    setDraft({ ...filters });
    setShowFilterPanel(true);
  };

  const applyFilters = () => {
    setFilters({ ...draft });
    setShowFilterPanel(false);
  };

  const clearFilters = () => {
    setDraft({ reply: '', call: '', reg: '', next: '', archived: false });
    setFilters({ reply: '', call: '', reg: '', next: '', archived: false });
    setShowFilterPanel(false);
  };

  const togglePill = (group: keyof FilterState, value: string) => {
    setDraft((prev) => ({ ...prev, [group]: prev[group] === value ? '' : value }));
  };

  const handleTabChange = (t: Tab) => {
    setTab(t);
    if (t === 'issues') {
      visibleIssues.forEach((i) => markIssueRead(i.id));
    }
  };

  return (
    <div>
      <PageHeader
        title="My Follow-ups"
        subtitle="People assigned to you — update statuses right after each message or call."
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
          { key: 'contacts', label: `Contacts (${contacts.filter((c) => !c.archivedAt).length})` },
          { key: 'issues', label: 'Issues' },
        ].map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => handleTabChange(item.key as Tab)}
            className={`relative rounded-2xl px-4 py-2 text-sm font-semibold transition ${tab === item.key ? 'bg-primary text-white' : 'bg-white text-gray-600 hover:bg-orange-50'}`}
          >
            {item.label}
            {item.key === 'issues' && unread > 0 && tab !== 'issues' && (
              <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[9px] font-bold leading-none text-white shadow-sm">
                {unread}
              </span>
            )}
          </button>
        ))}
        <button
          type="button"
          onPointerDown={openFilterPanel}
          className="ml-auto relative inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-orange-200 bg-white text-gray-600 hover:bg-orange-50"
        >
          <span className="h-5 w-5">{FilterIcon}</span>
          {filterCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold leading-none text-white shadow-sm">
              {filterCount}
            </span>
          )}
        </button>
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
              onFieldChange={(c, patch) => handleFieldChange(c, patch)}
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
              onIssuesOpen={() => visibleIssues.forEach((i) => markIssueRead(i.id))}
              canResolve
              canDelete
              canAssignOwner={false}
              canReply={false}
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
        existingContacts={contacts}
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

      {showFilterPanel && createPortal(
        <div className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center">
          <div className="absolute inset-0 bg-slate-900/35" />
          <div className="relative mb-0 w-full max-w-md rounded-t-[28px] bg-white p-6 pb-8 shadow-[0_-8px_40px_rgba(15,23,42,0.15)] sm:mb-0 sm:rounded-[28px]">
            <div className="mx-auto mb-6 h-1 w-10 rounded-full bg-gray-200 sm:hidden" />
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">Filters</h3>
              <button type="button" onClick={(e) => { e.stopPropagation(); setShowFilterPanel(false); }} className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="mt-5 space-y-5">
              {statusGroups.map((group) => (
                <div key={group.key}>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{group.label}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {group.options.map((opt) => (
                      <button key={opt.value} type="button" onClick={(e) => { e.stopPropagation(); togglePill(group.key as keyof FilterState, opt.value); }} className={pillBtn(draft[group.key as keyof FilterState] === opt.value)}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between rounded-2xl bg-orange-50/60 px-4 py-3">
                <span className="text-sm font-semibold text-gray-700">Show archived contacts</span>
                <button type="button" onClick={(e) => { e.stopPropagation(); setDraft((prev) => ({ ...prev, archived: !prev.archived })); }} className={`relative h-6 w-11 rounded-full transition ${draft.archived ? 'bg-primary' : 'bg-gray-300'}`}>
                  <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition ${draft.archived ? 'translate-x-5' : ''}`} />
                </button>
              </div>
            </div>
            <div className="mt-6 flex gap-3">
              <button type="button" onClick={(e) => { e.stopPropagation(); clearFilters(); }} className="flex-1 rounded-2xl border border-orange-200 bg-white py-3 text-sm font-semibold text-gray-600 transition hover:bg-orange-50 active:scale-[0.98]">Clear filters</button>
              <button type="button" onClick={(e) => { e.stopPropagation(); applyFilters(); }} className="flex-1 rounded-2xl bg-primary py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-dark active:scale-[0.98]">Apply</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default SupportFollowUpsPage;
