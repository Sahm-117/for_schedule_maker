import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Navigate, useSearchParams } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import Spinner from '../components/Spinner';
import AppSelect from '../components/AppSelect';
import ConfirmationModal from '../components/ConfirmationModal';
import FollowUpAssignmentSettings from '../components/followups/FollowUpAssignmentSettings';
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
  isWaitingForAssignment,
  isClosedRegistrationStatus,
  computeFollowUpStatus,
  contactInCohortScope,
  FOLLOW_UP_STAGE,
  FOLLOW_UP_STATUS_META,
  openLoadByOwner,
  unassignedFollowUpTag,
  genderCapacityOutlook,
  contactMatchesSearch,
} from '../utils/followUps';
import { DEFAULT_PROGRAMME_RULES } from '../utils/programmeRules';
import { compareText, sortByText } from '../utils/sort';
import { normalizeToIntlPhone } from '../utils/phone';
import AppOverflowMenu from '../components/AppOverflowMenu';

type Tab = 'overview' | 'contacts' | 'messages' | 'issues';

interface FilterState {
  reply: string;
  call: string;
  reg: string;
  next: string;
  archived: boolean;
  gender: string;
  assignment: string;
}

const EMPTY_FILTERS: FilterState = { reply: '', call: '', reg: '', next: '', archived: false, gender: '', assignment: '' };

const ASSIGNMENT_TAG_KEY: Record<string, string> = {
  'Waiting to be assigned': 'waiting',
  'No same gender to follow up': 'no_gender',
  'Gender not known': 'unknown_gender',
};

const statusGroups: Array<{ key: keyof FilterState; label: string; options: Array<{ value: string; label: string }> }> = [
  { key: 'reply', label: 'Reply', options: Object.entries(REPLY_STATUS_META).map(([v, m]) => ({ value: v, label: m.label })) },
  { key: 'call', label: 'Call', options: Object.entries(CALL_STATUS_META).map(([v, m]) => ({ value: v, label: m.label })) },
  { key: 'reg', label: 'Registration', options: Object.entries(REGISTRATION_STATUS_META).map(([v, m]) => ({ value: v, label: m.label })) },
  { key: 'next', label: 'Next action', options: Object.entries(NEXT_ACTION_META).map(([v, m]) => ({ value: v, label: m.label })) },
  { key: 'gender', label: 'Gender', options: [{ value: 'Male', label: 'Male' }, { value: 'Female', label: 'Female' }] },
  { key: 'assignment', label: 'Assignment', options: [
    { value: 'waiting', label: 'Waiting to be assigned' },
    { value: 'no_gender', label: 'No same gender to follow up' },
    { value: 'unknown_gender', label: 'Gender not known' },
  ] },
];

const pillBtn = (active: boolean) =>
  `rounded-full px-3 py-1.5 text-xs font-semibold transition active:scale-95 ${
    active ? 'bg-primary text-white shadow-sm' : 'border border-gray-100 bg-white text-gray-600 hover:bg-gray-50'
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
  if (f.gender) n++;
  if (f.assignment) n++;
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
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [draft, setDraft] = useState<FilterState>(EMPTY_FILTERS);
  const [assignStatus, setAssignStatus] = useState('');
  const [showAssignSettings, setShowAssignSettings] = useState(false);
  const [confirmAssignNow, setConfirmAssignNow] = useState(false);
  const [assigning, setAssigning] = useState(false);

  const [showContactModal, setShowContactModal] = useState(false);
  const [editingContact, setEditingContact] = useState<FollowUpContact | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [messagingContact, setMessagingContact] = useState<FollowUpContact | null>(null);
  const [messageChannel, setMessageChannel] = useState<'whatsapp' | 'email'>('whatsapp');
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

  // Test contacts stay listed (tagged) but are left out of every count.
  const realContacts = useMemo(() => contacts.filter((c) => !c.isTest), [contacts]);
  const realOwners = useMemo(() => owners.filter((o) => !o.isTest), [owners]);

  // Load ring: open follow-ups per support against the max set in Settings.
  const ownerLoad = useMemo(() => openLoadByOwner(realContacts, activeCohort?.id), [realContacts, activeCohort?.id]);
  const [maxLoad, setMaxLoad] = useState(DEFAULT_PROGRAMME_RULES.maxFollowUpsPerSupport);
  useEffect(() => {
    settingsApi.getProgrammeRules().then((rules) => setMaxLoad(rules.maxFollowUpsPerSupport)).catch(() => {});
  }, [liveRevision]);

  const [contactSearch, setContactSearch] = useState('');
  const searching = contactSearch.trim().length > 0;

  const filteredContacts = useMemo(() => {
    const list = contacts.filter((c) => {
      // A search looks across every cohort, so anyone can be found by name or number.
      if (searching) {
        if (!contactMatchesSearch(c, contactSearch)) return false;
      } else if (cohortFilter && !contactInCohortScope(c, cohortFilter, activeCohort?.id)) return false;
      if (ownerFilter === '__unassigned__' && c.ownerId) return false;
      if (ownerFilter && ownerFilter !== '__unassigned__' && c.ownerId !== ownerFilter) return false;
      if (filters.archived && c.archivedAt) return false;
      if (filters.reply && c.replyStatus !== filters.reply) return false;
      if (filters.call && c.callStatus !== filters.call) return false;
      if (filters.reg && c.registrationStatus !== filters.reg) return false;
      if (filters.next && c.nextAction !== filters.next) return false;
      if (filters.gender && c.gender !== filters.gender) return false;
      if (filters.assignment) {
        const tag = unassignedFollowUpTag(c, owners, ownerLoad, maxLoad);
        if (ASSIGNMENT_TAG_KEY[tag?.label ?? ''] !== filters.assignment) return false;
      }
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
  }, [contacts, cohortFilter, ownerFilter, filters, statusParam, contactSort, activeCohort?.id, owners, ownerLoad, maxLoad, searching, contactSearch]);

  const ownerOptionCounts = useMemo(() => {
    const scoped = cohortFilter
      ? realContacts.filter((c) => contactInCohortScope(c, cohortFilter, activeCohort?.id) && !c.archivedAt)
      : realContacts.filter((c) => !c.archivedAt);
    const total = scoped.length;
    const unassigned = scoped.filter((c) => !c.ownerId).length;
    const perOwner: Record<string, number> = {};
    owners.forEach((o) => {
      perOwner[o.id] = scoped.filter((c) => c.ownerId === o.id).length;
    });
    return { total, unassigned, perOwner };
  }, [realContacts, owners, cohortFilter, activeCohort?.id]);

  // Waiting to be assigned but their number isn't a phone number (e.g. "00"
  // on the form). Auto-assignment holds these back until the number is fixed.
  const invalidNumberContacts = useMemo(
    () => realContacts.filter((c) => !c.ownerId && !c.archivedAt && !normalizeToIntlPhone(c.phone)),
    [realContacts],
  );

  const dashboardContacts = useMemo(
    () => (cohortFilter ? realContacts.filter((c) => contactInCohortScope(c, cohortFilter, activeCohort?.id)) : realContacts),
    [realContacts, cohortFilter, activeCohort?.id]
  );

  const waitingCount = useMemo(() => realContacts.filter(isWaitingForAssignment).length, [realContacts]);

  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleFieldChange = async (contact: FollowUpContact, patch: FollowUpContactUpdate) => {
    try {
      // A contact with no cohort (from a prior cohort) joins the active cohort
      // once it's handed to a support.
      if (patch.ownerId && !contact.cohortId && activeCohort?.id) patch.cohortId = activeCohort.id;
      if (patch.registrationStatus) {
        if (patch.registrationStatus === 'ATTENDED') {
          // Filed away from the prior-cohort chip, which sets the cohort and the
          // close columns itself. Their contact history is left as it was.
        } else if (patch.registrationStatus === 'REGISTERED') {
          // Signing up no longer closes the follow-up -- their app login is still
          // owed. ACCESS_CONFIRMED is what closes it, and isClosedRegistrationStatus
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
    let { contacts: updated } = await followUpContactsApi.assignMany(ids, ownerId, dueDate);
    const untagged = activeCohort?.id ? updated.filter((c) => !c.cohortId) : [];
    if (untagged.length > 0) {
      const tagged = await Promise.all(untagged.map((c) => followUpContactsApi.update(c.id, { cohortId: activeCohort!.id }).then((r) => r.contact)));
      const byId = new Map(tagged.map((c) => [c.id, c]));
      updated = updated.map((c) => byId.get(c.id) || c);
    }
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
    setDraft(EMPTY_FILTERS);
    setFilters(EMPTY_FILTERS);
    setShowFilterPanel(false);
  };

  const togglePill = (group: keyof FilterState, value: string) => {
    setDraft((prev) => ({ ...prev, [group]: prev[group] === value ? '' : value }));
  };

  // Runs the same rule the 2-hour scheduled sweep uses, right now, for
  // everyone currently waiting -- see followUpContactsApi.assignPendingNow.
  const handleAssignNow = async () => {
    setAssigning(true);
    setAssignStatus('');
    try {
      const { assigned, stuckNoGender, stuckUnknownGender, stuckInvalidPhone } = await followUpContactsApi.assignPendingNow();
      const stuck = stuckNoGender + stuckUnknownGender + stuckInvalidPhone;
      const parts = [`Assigned ${assigned}.`];
      if (stuckNoGender > 0) parts.push(`${stuckNoGender} ${stuckNoGender === 1 ? 'has' : 'have'} no same-gender support with space.`);
      if (stuckUnknownGender > 0) parts.push(`${stuckUnknownGender} ${stuckUnknownGender === 1 ? "has no gender" : "have no gender"} on file.`);
      if (stuckInvalidPhone > 0) parts.push(`${stuckInvalidPhone} ${stuckInvalidPhone === 1 ? 'needs' : 'need'} a valid number first.`);
      if (assigned === 0 && stuck === 0) parts.push('Nobody was waiting.');
      setAssignStatus(parts.join(' '));
      void loadAll();
    } catch (err) {
      setAssignStatus(err instanceof Error ? err.message : 'Could not run assignment.');
    } finally {
      setAssigning(false);
    }
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
            <button
              type="button"
              onClick={() => setShowAssignSettings(true)}
              aria-label="Assignment settings"
              title="Assignment settings"
              className="grid h-11 w-11 place-items-center rounded-2xl bg-white text-gray-600 shadow-[0_1px_2px_rgba(17,24,39,0.06)] hover:text-gray-900"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M10.3 4.3c.4-1.7 3-1.7 3.4 0a1.7 1.7 0 0 0 2.6 1.1c1.5-.9 3.3.8 2.4 2.4a1.7 1.7 0 0 0 1 2.5c1.8.4 1.8 3 0 3.4a1.7 1.7 0 0 0-1 2.6c.9 1.5-.9 3.3-2.4 2.4a1.7 1.7 0 0 0-2.6 1c-.4 1.8-3 1.8-3.4 0a1.7 1.7 0 0 0-2.6-1c-1.5.9-3.3-.9-2.4-2.4a1.7 1.7 0 0 0-1-2.6c-1.8-.4-1.8-3 0-3.4a1.7 1.7 0 0 0 1-2.5c-.9-1.6.9-3.3 2.4-2.4a1.7 1.7 0 0 0 2.6-1.1Z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
              </svg>
            </button>
            <AppOverflowMenu
              align="right"
              items={[
                { label: assigning ? 'Assigning…' : 'Assign follow-ups now', onClick: () => { if (!assigning) setConfirmAssignNow(true); } },
                ...(tab === 'contacts' ? [
                  { label: 'Import contacts', onClick: () => setShowImport(true) },
                  { label: 'Export contacts', onClick: () => setShowExport(true) },
                ] : []),
              ]}
            />
          </div>
        )}
      />

      <SheetSyncBanner contacts={contacts} onRetried={() => { void loadAll(); }} />

      {assignStatus && (
        <div className="mb-5 flex items-center justify-between gap-3 rounded-3xl bg-primary/5 px-4 py-3 text-sm text-gray-700">
          <span>{assignStatus}</span>
          <button type="button" onClick={() => setAssignStatus('')} className="text-xs font-semibold text-gray-400 hover:text-gray-600">Dismiss</button>
        </div>
      )}

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

      <div data-wt="fu-filters" className="mb-5 space-y-3">
        <div data-wt="fu-tabs" className="flex flex-wrap items-center gap-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`rounded-2xl px-4 py-2 text-sm font-semibold transition ${tab === t.key ? 'bg-primary text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
          >
            {t.label}
          </button>
        ))}
        </div>
        {(tab === 'overview' || tab === 'contacts') && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="grid grid-cols-2 gap-2 sm:flex-1 sm:gap-3 lg:grid-cols-3">
              <div className="min-w-0">
                <AppSelect
                  value={cohortFilter}
                  onChange={(v) => { cohortFilterTouchedRef.current = true; setCohortFilter(v); }}
                  options={[{ value: '', label: 'All cohorts' }, ...sortByText(cohorts, (c) => c.name).map((c) => ({ value: c.id, label: c.name }))]}
                  placeholder="All cohorts"
                  compact
                />
              </div>
              {tab === 'contacts' && (
                <div className="min-w-0">
                  <AppSelect
                    value={ownerFilter}
                    onChange={setOwnerFilter}
                    options={[
                      { value: '', label: `All Supports (${ownerOptionCounts.total})` },
                      { value: '__unassigned__', label: `Unassigned (${ownerOptionCounts.unassigned})` },
                      ...owners.map((o) => ({ value: o.id, label: `${o.name} (${ownerOptionCounts.perOwner[o.id] || 0})` })),
                    ]}
                    placeholder="All Supports"
                    compact
                  />
                </div>
              )}
              {tab === 'contacts' && (
                <div className="min-w-0">
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
            </div>
            <button
              type="button"
              onPointerDown={openFilterPanel}
              className="relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 sm:ml-auto"
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
        {tab === 'contacts' && (
          <div>
            <input
              type="search"
              value={contactSearch}
              onChange={(e) => setContactSearch(e.target.value)}
              placeholder="Search by name, number or email"
              aria-label="Search contacts"
              className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            {searching && (
              <p className="mt-1.5 px-1 text-xs text-gray-500">
                {filteredContacts.length} match{filteredContacts.length === 1 ? '' : 'es'} across all cohorts
              </p>
            )}
          </div>
        )}
      </div>

      {loadError && <p className="mb-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{loadError}</p>}

      {loading ? (
        <p className="flex items-center justify-center gap-1.5 rounded-3xl bg-primary/5 px-4 py-12 text-center text-sm text-gray-500"><Spinner className="h-3.5 w-3.5" />Loading follow-ups…</p>
      ) : (
        <>
          {tab === 'overview' && invalidNumberContacts.length > 0 && (
            <section className="mb-4 rounded-[20px] border border-amber-100 bg-white p-4 shadow-[0_2px_8px_-3px_rgba(17,24,39,0.10)]">
              <div className="flex items-center gap-2">
                <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-amber-100 text-amber-700" aria-hidden="true">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01" /><circle cx="12" cy="12" r="9" /></svg>
                </span>
                <h2 className="flex-1 text-[14px] font-bold text-gray-900">
                  {invalidNumberContacts.length} sign-up{invalidNumberContacts.length === 1 ? ' needs' : 's need'} a valid number
                </h2>
              </div>
              <p className="mt-1.5 text-[12.5px] leading-normal text-gray-500">Held back from auto-assignment until the number is fixed, so no support gets someone they can&apos;t reach.</p>
              <ul className="mt-3 space-y-2">
                {invalidNumberContacts.map((c) => (
                  <li key={c.id} className="flex items-center gap-2 rounded-[12px] bg-[#f6f7f9] px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] font-semibold text-gray-900">{c.fullName}</p>
                      <p className="truncate text-[12px] text-gray-500">WhatsApp: {c.phone ? `“${c.phone}”` : 'none'}{c.email ? ` · ${c.email}` : ''}</p>
                    </div>
                    <button type="button" onClick={() => { setEditingContact(c); setShowContactModal(true); }} className="flex-none rounded-full bg-primary px-3 py-1.5 text-[12px] font-semibold text-white">
                      Fix number
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {tab === 'overview' && <FollowUpDashboard contacts={dashboardContacts} cohortId={cohortFilter || null} cohortName={cohorts.find((c) => c.id === cohortFilter)?.name} onShowUnassigned={showUnassigned} />}
          {tab === 'contacts' && (
            <FollowUpAssignmentSummary
              contacts={dashboardContacts}
              owners={realOwners}
              ownerLoad={ownerLoad}
              maxLoad={maxLoad}
              onSetAssignmentFilter={(value) => setFilters((f) => ({ ...f, assignment: f.assignment === value ? '' : value }))}
            />
          )}
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
              onMessage={(c) => { setMessageChannel('whatsapp'); setMessagingContact(c); }}
              onEmail={(c) => { setMessageChannel('email'); setMessagingContact(c); }}
              onLogContact={(c) => { void handleLogContact(c); }}
              onEdit={(c) => { setEditingContact(c); setShowContactModal(true); }}
              onDelete={setDeletingContact}
              onBulkAssign={handleBulkAssign}
              ownerLoad={ownerLoad}
              maxLoad={maxLoad}
              cohorts={cohorts}
              activeCohortId={activeCohort?.id}
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
        ownerLoad={ownerLoad}
        maxLoad={maxLoad}
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
        channel={messageChannel}
      />

      {showExport && (
        <ExportContactsPopup
          contacts={realContacts}
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

              <div className="flex items-center justify-between rounded-2xl bg-primary/5 px-4 py-3">
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
                className="flex-1 rounded-2xl border border-gray-200 bg-white py-3 text-sm font-semibold text-gray-600 transition hover:bg-gray-50 active:scale-[0.98]"
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
      {showAssignSettings && createPortal(
        <div className="fixed inset-0 z-[120] grid place-items-center bg-black/30 p-4 backdrop-blur-sm" onClick={() => setShowAssignSettings(false)}>
          <div className="w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <FollowUpAssignmentSettings waitingCount={waitingCount} onClose={() => setShowAssignSettings(false)} />
          </div>
        </div>,
        document.body
      )}
      <ConfirmationModal
        isOpen={confirmAssignNow}
        onClose={() => setConfirmAssignNow(false)}
        onConfirm={() => { setConfirmAssignNow(false); void handleAssignNow(); }}
        title="Assign follow-ups now?"
        message={`${waitingCount} ${waitingCount === 1 ? 'person is' : 'people are'} waiting. Each goes to a same-gender support with room, and that support gets the usual new follow-up alert. Anyone with no same-gender support or no gender stays waiting.`}
        confirmText="Assign now"
        type="warning"
      />
    </div>
  );
};

// Contacts tab summary cards: per-gender capacity outlook, supports at the
// limit, and how many are waiting / stuck. Tapping a number filters the list
// below via the same Assignment filter the drawer uses.
const FollowUpAssignmentSummary: React.FC<{
  contacts: FollowUpContact[];
  owners: User[];
  ownerLoad: Map<string, number>;
  maxLoad: number;
  onSetAssignmentFilter: (value: string) => void;
}> = ({ contacts, owners, ownerLoad, maxLoad, onSetAssignmentFilter }) => {
  const [showAtLimit, setShowAtLimit] = useState(false);
  const waitingContacts = useMemo(() => contacts.filter(isWaitingForAssignment), [contacts]);
  const tagCounts = useMemo(() => {
    const counts = { waiting: 0, no_gender: 0, unknown_gender: 0 };
    waitingContacts.forEach((c) => {
      const key = ASSIGNMENT_TAG_KEY[unassignedFollowUpTag(c, owners, ownerLoad, maxLoad)?.label ?? ''];
      if (key) counts[key as keyof typeof counts]++;
    });
    return counts;
  }, [waitingContacts, owners, ownerLoad, maxLoad]);
  const atLimitOwners = useMemo(() => owners.filter((o) => (ownerLoad.get(o.id) ?? 0) >= maxLoad), [owners, ownerLoad, maxLoad]);
  const outlooks = useMemo(
    () => (['Male', 'Female'] as const).map((g) => genderCapacityOutlook(g, waitingContacts, owners, ownerLoad, maxLoad)),
    [waitingContacts, owners, ownerLoad, maxLoad]
  );

  return (
    <div data-wt="fu-assignment-summary" className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {outlooks.map((o) => (
        <div key={o.gender} className="surface-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{o.gender} capacity</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{o.waiting} waiting</p>
          <p className="mt-0.5 text-xs text-gray-500">{o.spare} spare place{o.spare === 1 ? '' : 's'} among {o.gender.toLowerCase()} supports</p>
          {o.shortfall > 0 && (
            <p className="mt-1.5 text-xs font-semibold text-orange-700">
              Short {o.shortfall}: raise the limit to {o.limitNeeded ?? '—'}, or add {o.supportsNeeded} more support{o.supportsNeeded === 1 ? '' : 's'}.
            </p>
          )}
        </div>
      ))}
      <button type="button" onClick={() => setShowAtLimit((v) => !v)} className="surface-card p-4 text-left">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Supports at the limit</p>
        <p className="mt-1 text-2xl font-bold text-gray-900">{atLimitOwners.length}</p>
        {showAtLimit && <p className="mt-1 text-xs text-gray-500">{atLimitOwners.map((o) => o.name).join(', ') || 'None right now.'}</p>}
      </button>
      <div className="surface-card p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Waiting to be assigned</p>
        <button type="button" onClick={() => onSetAssignmentFilter('waiting')} className="mt-1 block text-2xl font-bold text-gray-900 hover:underline">{tagCounts.waiting}</button>
        <button type="button" onClick={() => onSetAssignmentFilter('no_gender')} className="mt-1.5 block text-xs font-semibold text-orange-700 hover:underline">{tagCounts.no_gender} no same gender to follow up</button>
        {tagCounts.unknown_gender > 0 && (
          <button type="button" onClick={() => onSetAssignmentFilter('unknown_gender')} className="mt-0.5 block text-xs font-semibold text-neutral-600 hover:underline">{tagCounts.unknown_gender} gender not known</button>
        )}
      </div>
    </div>
  );
};

export default AdminFollowUpsPage;
