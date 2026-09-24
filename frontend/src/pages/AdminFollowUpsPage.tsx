import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Navigate, useSearchParams } from 'react-router-dom';
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
import SheetSyncBanner from '../components/followups/SheetSyncBanner';
import ExportContactsPopup from '../components/followups/ExportContactsPopup';
import { useAuth } from '../hooks/useAuth';
import { useAppData } from '../context/AppDataContext';
import {
  followUpContactsApi,
  followUpIssuesApi,
  messageTemplatesApi,
  settingsApi,
  usersApi,
} from '../services/api';
import type { FollowUpContact, FollowUpContactUpdate, FollowUpIssue, FollowUpStatus, MessageTemplate, User } from '../types';
import {
  REPLY_STATUS_META,
  CALL_STATUS_META,
  REGISTRATION_STATUS_META,
  NEXT_ACTION_META,
  isClosedContact,
  isClosedRegistrationStatus,
  computeFollowUpStatus,
  contactInCohortScope,
  FOLLOW_UP_STAGE,
  FOLLOW_UP_STATUS_META,
} from '../utils/followUps';
import { compareText, sortByText } from '../utils/sort';
import AppOverflowMenu from '../components/AppOverflowMenu';

type Tab = 'overview' | 'contacts' | 'messages' | 'issues';

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

const pillBtn = (active: boolean) =>
  `rounded-full px-3 py-1.5 text-xs font-semibold transition active:scale-95 ${
    active ? 'bg-primary text-white shadow-sm' : 'border border-orange-100 bg-white text-gray-600 hover:bg-orange-50'
  }`;

const FilterIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-full w-full">
    <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
  </svg>
);

function activeFilterCount(f: FilterState): number {
  let n = 0;
  if (f.reply) n++;
  if (f.call) n++;
  if (f.reg) n++;
  if (f.next) n++;
  if (f.archived) n++;
  return n;
}

const AdminFollowUpsPage: React.FC = () => {
  const { isAdmin, user } = useAuth();
  const { cohorts, activeCohort, liveRevision } = useAppData();

  // The Overview tiles link into this page (?tab=contacts&status=…), so the tab
  // and the status filter live in the URL rather than in state.
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const tab: Tab = tabParam === 'contacts' || tabParam === 'messages' || tabParam === 'issues' ? tabParam : 'overview';
  const statusParam = searchParams.get('status') ?? '';
  const setTab = (next: Tab) => {
    const params = new URLSearchParams(searchParams);
    if (next === 'overview') params.delete('tab'); else params.set('tab', next);
    if (next !== 'contacts') params.delete('status');
    setSearchParams(params, { replace: true });
  };
  const clearStatusParam = () => {
    const params = new URLSearchParams(searchParams);
    params.delete('status');
    setSearchParams(params, { replace: true });
  };
  // Overview's "nobody following up" callout jumps here: Contacts tab, owner
  // filter set to Unassigned. Cohort filter is left as-is.
  const showUnassigned = () => {
    setTab('contacts');
    setOwnerFilter('__unassigned__');
  };
  const [contacts, setContacts] = useState<FollowUpContact[]>([]);
  const [owners, setOwners] = useState<User[]>([]);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [issues, setIssues] = useState<FollowUpIssue[]>([]);
  const [registrationLink, setRegistrationLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [showLinkTip, setShowLinkTip] = useState(false);
  const [cohortFilter, setCohortFilter] = useState('');
  const cohortFilterInitRef = useRef(false);
  const cohortFilterTouchedRef = useRef(false);
  const [ownerFilter, setOwnerFilter] = useState('');
  // Contacts list order: newest additions first by default, or A–Z.
  const [contactSort, setContactSort] = useState<'newest' | 'alpha'>('newest');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const initialLoadRef = useRef(true);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [filters, setFilters] = useState<FilterState>({ reply: '', call: '', reg: '', next: '', archived: false });
  const [draft, setDraft] = useState<FilterState>({ reply: '', call: '', reg: '', next: '', archived: false });

  const [showContactModal, setShowContactModal] = useState(false);
  const [editingContact, setEditingContact] = useState<FollowUpContact | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [messagingContact, setMessagingContact] = useState<FollowUpContact | null>(null);
  const [deletingContact, setDeletingContact] = useState<FollowUpContact | null>(null);
  const [showExport, setShowExport] = useState(false);

  const loadAll = useCallback(async () => {
    if (initialLoadRef.current) setLoading(true);
    setLoadError('');
    try {
      const [contactsRes, usersRes, templatesRes, issuesRes, linkRes] = await Promise.all([
        followUpContactsApi.getAll(),
        usersApi.getAll(),
        messageTemplatesApi.getAll({ category: 'FOLLOW_UP' }),
        followUpIssuesApi.getAll(),
        settingsApi.getRegistrationLink(),
      ]);
      setContacts(sortByText(contactsRes.contacts, (contact) => contact.fullName));
      setOwners(sortByText(usersRes.users.filter((u) => u.role === 'SUPPORT' || u.role === 'ADMIN'), (owner) => owner.name));
      setTemplates(sortByText(templatesRes.templates, (template) => template.useCase));
      setIssues(issuesRes.issues);
      setRegistrationLink(linkRes.url);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load follow-ups.');
    } finally {
      setLoading(false);
      initialLoadRef.current = false;
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [liveRevision, loadAll]);

  useEffect(() => {
    const interval = setInterval(() => void loadAll(), 30000);
    return () => clearInterval(interval);
  }, [loadAll]);

  // Default the cohort filter to the active cohort once it's known, unless
  // the admin has already picked something from the dropdown themselves.
  useEffect(() => {
    if (!cohortFilterInitRef.current && !cohortFilterTouchedRef.current && activeCohort) {
      setCohortFilter(activeCohort.id);
      cohortFilterInitRef.current = true;
    }
  }, [activeCohort]);

  const replaceContact = (updated: FollowUpContact) => {
    setContacts((prev) => sortByText(prev.map((c) => (c.id === updated.id ? updated : c)), (contact) => contact.fullName));
  };

  const filteredContacts = useMemo(() => {
    const list = contacts.filter((c) => {
      if (cohortFilter && !contactInCohortScope(c, cohortFilter, activeCohort?.id)) return false;
      if (ownerFilter === '__unassigned__' && c.ownerId) return false;
      if (ownerFilter && ownerFilter !== '__unassigned__' && c.ownerId !== ownerFilter) return false;
      if (filters.archived && c.archivedAt) return false;
      if (filters.reply && c.replyStatus !== filters.reply) return false;
      if (filters.call && c.callStatus !== filters.call) return false;
      if (filters.reg && c.registrationStatus !== filters.reg) return false;
      if (filters.next && c.nextAction !== filters.next) return false;
      // Arrived from an Overview tile: a single derived status, or every status
      // that still counts as open work.
      if (statusParam) {
        const derived = computeFollowUpStatus(c);
        if (statusParam === 'open' ? FOLLOW_UP_STAGE[derived] !== 'open' : derived !== statusParam) return false;
      }
      return true;
    });
    list.sort((a, b) => {
      if (contactSort === 'newest') {
        return (b.createdAt || '').localeCompare(a.createdAt || '') || compareText(a.fullName, b.fullName);
      }
      const aClosed = isClosedContact(a) ? 1 : 0;
      const bClosed = isClosedContact(b) ? 1 : 0;
      return (aClosed - bClosed) || compareText(a.fullName, b.fullName);
    });
    return list;
  }, [contacts, cohortFilter, ownerFilter, filters, statusParam, contactSort, activeCohort?.id]);

  const ownerOptionCounts = useMemo(() => {
    const scoped = cohortFilter
      ? contacts.filter((c) => contactInCohortScope(c, cohortFilter, activeCohort?.id) && !c.archivedAt)
      : contacts.filter((c) => !c.archivedAt);
    const total = scoped.length;
    const unassigned = scoped.filter((c) => !c.ownerId).length;
    const perOwner: Record<string, number> = {};
    owners.forEach((o) => {
      perOwner[o.id] = scoped.filter((c) => c.ownerId === o.id).length;
    });
    return { total, unassigned, perOwner };
  }, [contacts, owners, cohortFilter, activeCohort?.id]);

  const dashboardContacts = useMemo(
    () => (cohortFilter ? contacts.filter((c) => contactInCohortScope(c, cohortFilter, activeCohort?.id)) : contacts),
    [contacts, cohortFilter, activeCohort?.id]
  );

  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleFieldChange = async (contact: FollowUpContact, patch: FollowUpContactUpdate) => {
    try {
      if (patch.registrationStatus) {
        if (patch.registrationStatus === 'REGISTERED') {
          // Signing up no longer closes the follow-up -- their app login is still
          // owed. LOGIN_SHARED is what closes it, and isClosedRegistrationStatus
          // covers that below.
          patch.replyStatus = 'REPLIED';
          patch.nextAction = 'SEND_MESSAGE';
          patch.archivedAt = null;
        } else if (isClosedRegistrationStatus(patch.registrationStatus)) {
          patch.replyStatus = 'REPLIED';
          patch.nextAction = 'CLOSE';
        } else if (
          isClosedRegistrationStatus(contact.registrationStatus) &&
          !isClosedRegistrationStatus(patch.registrationStatus)
        ) {
          patch.nextAction = 'SEND_MESSAGE';
          patch.archivedAt = null;
        }
      }
      if (patch.replyStatus && contact.replyStatus === 'INCORRECT_NUMBER' && patch.replyStatus !== 'INCORRECT_NUMBER') {
        patch.nextAction = 'SEND_MESSAGE';
        patch.archivedAt = null;
      }
      if (patch.callStatus && contact.callStatus === 'INCORRECT_NUMBER' && patch.callStatus !== 'INCORRECT_NUMBER') {
        patch.nextAction = 'SEND_MESSAGE';
        patch.archivedAt = null;
      }
      const { contact: updated } = await followUpContactsApi.update(contact.id, patch);
      replaceContact(updated);
    } catch {
      void loadAll();
    }
  };

  const handleBulkAssign = async (ids: string[], ownerId: string, dueDate: string | null) => {
    const { contacts: updated } = await followUpContactsApi.assignMany(ids, ownerId, dueDate);
    setContacts((prev) => {
      const map = new Map(updated.map((c) => [c.id, c]));
      return sortByText(prev.map((c) => map.get(c.id) || c), (contact) => contact.fullName);
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
        tourId="admin:follow-ups"
        subtitle="Track interested people, assign them to a support, and get them into the app."
        action={(
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => { setEditingContact(null); setShowContactModal(true); }}
              className="inline-flex h-11 items-center justify-center rounded-2xl bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-dark"
            >
              Add Contact
            </button>
            {tab === 'contacts' && (
              <AppOverflowMenu
                align="right"
                items={[
                  { label: 'Import contacts', onClick: () => setShowImport(true) },
                  { label: 'Export contacts', onClick: () => setShowExport(true) },
                ]}
              />
            )}
          </div>
        )}
      />

      <SheetSyncBanner contacts={contacts} onRetried={() => { void loadAll(); }} />

      {registrationLink && (
        <div data-wt="fu-link" className="mb-5 flex flex-wrap items-center gap-3 rounded-3xl border border-sky-100 bg-sky-50/60 px-4 py-3">
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
        <div data-wt="fu-tabs" className="flex flex-wrap items-center gap-2">
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
        </div>
        {(tab === 'overview' || tab === 'contacts') && (
          <div className="ml-auto flex items-center gap-2">
            <div className="w-52">
              <AppSelect
                value={cohortFilter}
                onChange={(v) => { cohortFilterTouchedRef.current = true; setCohortFilter(v); }}
                options={[{ value: '', label: 'All cohorts' }, ...sortByText(cohorts, (c) => c.name).map((c) => ({ value: c.id, label: c.name }))]}
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
                    { value: '', label: `All reps (${ownerOptionCounts.total})` },
                    { value: '__unassigned__', label: `Unassigned (${ownerOptionCounts.unassigned})` },
                    ...owners.map((o) => ({ value: o.id, label: `${o.name} (${ownerOptionCounts.perOwner[o.id] || 0})` })),
                  ]}
                  placeholder="All reps"
                  compact
                />
              </div>
            )}
            {tab === 'contacts' && (
              <div className="w-40">
                <AppSelect
                  value={contactSort}
                  onChange={(v) => setContactSort(v === 'alpha' ? 'alpha' : 'newest')}
                  options={[
                    { value: 'newest', label: 'Newest first' },
                    { value: 'alpha', label: 'A–Z' },
                  ]}
                  placeholder="Newest first"
                  compact
                />
              </div>
            )}
            <button
              type="button"
              onPointerDown={openFilterPanel}
              className="relative inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-orange-200 bg-white text-gray-600 hover:bg-orange-50"
            >
              <span className="h-5 w-5">{FilterIcon}</span>
              {activeFilterCount(filters) > 0 && (
                <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold leading-none text-white shadow-sm">
                  {activeFilterCount(filters)}
                </span>
              )}
            </button>
          </div>
        )}
      </div>

      {loadError && <p className="mb-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{loadError}</p>}

      {loading ? (
        <p className="rounded-3xl bg-orange-50/60 px-4 py-12 text-center text-sm text-gray-500">Loading follow-ups…</p>
      ) : (
        <>
          {tab === 'overview' && <FollowUpDashboard contacts={dashboardContacts} onShowUnassigned={showUnassigned} />}
          {tab === 'contacts' && statusParam && (
            <div className="mb-3 flex items-center gap-2">
              <span className="text-xs text-gray-500">Showing</span>
              <button
                type="button"
                onClick={clearStatusParam}
                className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-white"
              >
                {statusParam === 'open' ? 'Still open' : FOLLOW_UP_STATUS_META[statusParam as FollowUpStatus]?.label ?? statusParam}
                <span aria-hidden="true">×</span>
                <span className="sr-only">Clear this filter</span>
              </button>
              <span className="text-xs text-gray-500">{filteredContacts.length} contact{filteredContacts.length === 1 ? '' : 's'}</span>
            </div>
          )}
          {tab === 'contacts' && (
            <FollowUpContactsTable
              contacts={filteredContacts}
              owners={owners}
              canAssign
              onFieldChange={(c, patch) => handleFieldChange(c, patch)}
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
            const next = exists ? prev.map((c) => (c.id === contact.id ? contact : c)) : [...prev, contact];
            return sortByText(next, (entry) => entry.fullName);
          });
        }}
        contact={editingContact}
        owners={owners}
        cohorts={cohorts}
        defaultCohortId={activeCohort?.id}
        canEditOwner
        existingContacts={contacts}
      />

      <ContactImportModal
        isOpen={showImport}
        onClose={() => setShowImport(false)}
        onImported={(imported) => setContacts((prev) => sortByText([...prev, ...imported], (contact) => contact.fullName))}
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

      {showExport && (
        <ExportContactsPopup
          contacts={contacts}
          onClose={() => setShowExport(false)}
        />
      )}

      <ConfirmationModal
        isOpen={!!deletingContact}
        onClose={() => setDeletingContact(null)}
        onConfirm={() => { void handleDelete(); }}
        title="Delete contact"
        message={`Delete ${deletingContact?.fullName}? This removes their follow-up history and cannot be undone.`}
        confirmText="Delete"
      />

      {showFilterPanel && createPortal(
        <div className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center">
          <div className="absolute inset-0 bg-slate-900/35" />
          <div
            className="relative mb-0 w-full max-w-md rounded-t-[28px] bg-white p-6 pb-8 shadow-[0_-8px_40px_rgba(15,23,42,0.15)] sm:mb-0 sm:rounded-[28px]"
          >
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
                      <button
                        key={opt.value}
                        type="button"
                        onClick={(e) => { e.stopPropagation(); togglePill(group.key as keyof FilterState, opt.value); }}
                        className={pillBtn(draft[group.key as keyof FilterState] === opt.value)}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}

              <div className="flex items-center justify-between rounded-2xl bg-orange-50/60 px-4 py-3">
                <span className="text-sm font-semibold text-gray-700">Hide archived contacts</span>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setDraft((prev) => ({ ...prev, archived: !prev.archived })); }}
                  className={`relative h-6 w-11 rounded-full transition ${draft.archived ? 'bg-primary' : 'bg-gray-300'}`}
                >
                  <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition ${draft.archived ? 'translate-x-5' : ''}`} />
                </button>
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); clearFilters(); }}
                className="flex-1 rounded-2xl border border-orange-200 bg-white py-3 text-sm font-semibold text-gray-600 transition hover:bg-orange-50 active:scale-[0.98]"
              >
                Clear filters
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); applyFilters(); }}
                className="flex-1 rounded-2xl bg-primary py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-dark active:scale-[0.98]"
              >
                Apply
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default AdminFollowUpsPage;
