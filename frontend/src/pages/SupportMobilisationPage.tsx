import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import AppOverflowMenu from '../components/AppOverflowMenu';
import AppSelect from '../components/AppSelect';
import SegmentedTabs from '../components/SegmentedTabs';
import InfoTip from '../components/InfoTip';
import { useToast } from '../components/Toast';
import ModalShell from '../components/followups/ModalShell';
import FollowUpContactModal from '../components/followups/FollowUpContactModal';
import FollowUpIssuesPanel from '../components/followups/FollowUpIssuesPanel';
import MessageTemplatePicker from '../components/followups/MessageTemplatePicker';
import NotInterestedPopup from '../components/followups/NotInterestedPopup';
import ExportContactsPopup from '../components/followups/ExportContactsPopup';
import { useAuth } from '../hooks/useAuth';
import { useAppData } from '../context/AppDataContext';
import { followUpContactsApi, followUpIssuesApi, messageTemplatesApi, settingsApi } from '../services/api';
import type { FollowUpContact, FollowUpContactUpdate, FollowUpIssue, FollowUpStatus, MessageTemplate } from '../types';
import {
  FOLLOW_UP_STATUS_META,
  buildStatusPatch,
  computeFollowUpStatus,
  followUpStatusOptions,
  isClosedContact,
  isClosedRegistrationStatus,
} from '../utils/followUps';
import { buildWhatsAppLink, normalizeToIntlPhone } from '../utils/phone';
import { compareText, sortByText } from '../utils/sort';
import LoginDetailsCard from '../components/participants/LoginDetailsCard';

type MobTab = 'register' | 'follow';

const GENDERS = ['Male', 'Female'];
const AGE_RANGES = ['18 - 24', '25 - 34', '35 - 44', '45 - 59', '60 and above'];
const EMPTY_LEAD = { email: '', first: '', last: '', gender: '', age: '', occupation: '', phone: '', note: '' };

const CARD = 'rounded-[20px] border border-[#eef0f4] bg-white shadow-[0_2px_8px_-3px_rgba(17,24,39,0.10)]';
const INPUT = 'min-h-[48px] w-full rounded-xl border border-gray-200 px-3.5 py-3 text-[15px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';

const READ_KEY = 'fof_issue_read';
const unreadIssueCount = (issues: FollowUpIssue[]) => {
  let map: Record<string, string> = {};
  try { map = JSON.parse(localStorage.getItem(READ_KEY) || '{}'); } catch { /* ignore */ }
  return issues.filter((issue) => issue.updatedAt && issue.updatedAt > (map[issue.id] || '')).length;
};
const markIssuesRead = (issues: FollowUpIssue[]) => {
  try {
    const map = JSON.parse(localStorage.getItem(READ_KEY) || '{}');
    issues.forEach((issue) => { map[issue.id] = new Date().toISOString(); });
    localStorage.setItem(READ_KEY, JSON.stringify(map));
  } catch { /* ignore */ }
};

const shortDate = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(date);
};

const ChipGroup: React.FC<{ label: string; options: string[]; value: string; onChange: (value: string) => void }> = ({ label, options, value, onChange }) => (
  <div>
    <span className="mb-2 block text-[13px] font-semibold text-gray-900">{label}</span>
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(value === option ? '' : option)}
          className={`min-h-[42px] rounded-full border px-3.5 py-2 text-[13px] font-semibold transition ${value === option ? 'border-primary bg-primary text-white' : 'border-gray-200 bg-white text-gray-700'}`}
        >
          {option}
        </button>
      ))}
    </div>
  </div>
);

const SupportMobilisationPage: React.FC = () => {
  const { user } = useAuth();
  const { cohorts, activeCohort, liveRevision } = useAppData();
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState<MobTab>(searchParams.get('tab') === 'follow' ? 'follow' : 'register');

  const [contacts, setContacts] = useState<FollowUpContact[]>([]);
  const [myLeads, setMyLeads] = useState<FollowUpContact[]>([]);
  const [issues, setIssues] = useState<FollowUpIssue[]>([]);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [registrationLink, setRegistrationLink] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const initialLoadRef = useRef(true);

  const [lead, setLead] = useState(EMPTY_LEAD);
  const [leadTouched, setLeadTouched] = useState(false);
  const [leadSaving, setLeadSaving] = useState(false);
  const [leadError, setLeadError] = useState('');
  const [leadSaved, setLeadSaved] = useState('');

  const [showClosed, setShowClosed] = useState(false);
  const toast = useToast();
  const [editingContact, setEditingContact] = useState<FollowUpContact | null>(null);
  const [messagingContact, setMessagingContact] = useState<FollowUpContact | null>(null);
  const [notInterestedContact, setNotInterestedContact] = useState<FollowUpContact | null>(null);
  const [showIssues, setShowIssues] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  const leadSource = user ? `Registered by ${user.name}` : '';

  const loadAll = useCallback(async () => {
    if (!user?.id) return;
    if (initialLoadRef.current) setLoading(true);
    setLoadError('');
    try {
      const [contactsRes, allRes, templatesRes, linkRes] = await Promise.all([
        followUpContactsApi.getAll({ ownerId: user.id }),
        followUpContactsApi.getAll(),
        messageTemplatesApi.getAll({ category: 'FOLLOW_UP' }),
        settingsApi.getRegistrationLink(),
      ]);
      const issuesRes = await followUpIssuesApi.getAll();
      setContacts(sortByText(contactsRes.contacts, (contact) => contact.fullName));
      setMyLeads(allRes.contacts.filter((contact) => contact.registeredById === user.id || contact.source === `Registered by ${user.name}`));
      setIssues(issuesRes.issues);
      setTemplates(sortByText(templatesRes.templates, (template) => template.useCase));
      setRegistrationLink(linkRes.url);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load mobilisation.');
    } finally {
      setLoading(false);
      initialLoadRef.current = false;
    }
  }, [user?.id, user?.name, liveRevision]);

  useEffect(() => { void loadAll(); }, [loadAll]);
  useEffect(() => {
    const interval = setInterval(() => void loadAll(), 30000);
    return () => clearInterval(interval);
  }, [loadAll]);

  const openContacts = useMemo(() => contacts.filter((contact) => !contact.archivedAt), [contacts]);
  const visibleContacts = useMemo(() => {
    const list = showClosed ? contacts.filter((contact) => !!contact.archivedAt) : [...openContacts];
    list.sort((a, b) => ((isClosedContact(a) ? 1 : 0) - (isClosedContact(b) ? 1 : 0)) || compareText(a.fullName, b.fullName));
    return list;
  }, [contacts, openContacts, showClosed]);
  const closedCount = contacts.length - openContacts.length;

  useEffect(() => {
    if (showClosed && closedCount === 0) setShowClosed(false);
  }, [showClosed, closedCount]);

  const visibleIssues = useMemo(() => {
    const contactIds = new Set(contacts.map((contact) => contact.id));
    return issues.filter((issue) => issue.reportedById === user?.id || (issue.contactId ? contactIds.has(issue.contactId) : false));
  }, [contacts, issues, user?.id]);
  const unread = unreadIssueCount(visibleIssues);

  if (user && user.role !== 'SUPPORT') {
    return <Navigate to="/dashboard" replace />;
  }

  const replaceContact = (updated: FollowUpContact) => {
    setContacts((prev) => sortByText(prev.map((c) => (c.id === updated.id ? updated : c)), (contact) => contact.fullName));
  };

  // Same status rules as the follow-up table: closing a registration also closes the reply/next action.
  const handleFieldChange = async (contact: FollowUpContact, patch: FollowUpContactUpdate) => {
    try {
      if (patch.registrationStatus) {
        if (patch.registrationStatus === 'REGISTERED' || isClosedRegistrationStatus(patch.registrationStatus)) {
          patch.replyStatus = 'REPLIED';
          patch.nextAction = 'CLOSE';
        } else if (isClosedRegistrationStatus(contact.registrationStatus) && !isClosedRegistrationStatus(patch.registrationStatus)) {
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

      const wasClosed = !!contact.archivedAt;
      const nowClosed = !!updated.archivedAt;
      if (wasClosed !== nowClosed) {
        const firstName = contact.fullName.split(' ')[0];
        const reason = FOLLOW_UP_STATUS_META[computeFollowUpStatus(updated)].label;
        const previous: FollowUpContactUpdate = {
          messageStatus: contact.messageStatus,
          replyStatus: contact.replyStatus,
          callStatus: contact.callStatus,
          registrationStatus: contact.registrationStatus,
          nextAction: contact.nextAction,
          archivedAt: contact.archivedAt ?? null,
        };
        toast({
          tone: 'info',
          message: nowClosed ? `${firstName} moved to Closed · ${reason}` : `${firstName} is open again`,
          actionLabel: 'Undo',
          onAction: () => {
            void followUpContactsApi.update(contact.id, previous)
              .then(({ contact: restored }) => replaceContact(restored))
              .catch(() => void loadAll());
          },
        });
      }
    } catch {
      toast({ tone: 'error', message: "That change didn't save. Please try again." });
      void loadAll();
    }
  };

  const handleStatusChange = (contact: FollowUpContact, status: FollowUpStatus) => {
    if (status === 'NOT_INTERESTED') { setNotInterestedContact(contact); return; }
    void handleFieldChange(contact, buildStatusPatch(status) as FollowUpContactUpdate);
  };

  const handleMessageSent = async (contact: FollowUpContact) => {
    const { contact: logged } = await followUpContactsApi.logContact(contact.id);
    replaceContact(logged);
  };

  const leadNameError = leadTouched && !lead.first.trim();
  const leadPhoneError = leadTouched && !lead.phone.trim()
    ? 'A WhatsApp number is required.'
    : leadTouched && lead.phone.trim() && !normalizeToIntlPhone(lead.phone)
      ? 'Enter a valid WhatsApp number.'
      : '';

  const submitLead = async () => {
    if (!user) return;
    setLeadSaved('');
    setLeadError('');
    if (!lead.first.trim() || !lead.phone.trim() || !normalizeToIntlPhone(lead.phone)) { setLeadTouched(true); return; }
    const normalized = normalizeToIntlPhone(lead.phone);
    const duplicate = [...myLeads, ...contacts].find((contact) => normalizeToIntlPhone(contact.phone) === normalized);
    if (duplicate) { setLeadError(`This number already belongs to ${duplicate.fullName}.`); return; }

    const fullName = `${lead.first.trim()} ${lead.last.trim()}`.trim();

    setLeadSaving(true);
    try {
      const { contact } = await followUpContactsApi.create({
        fullName,
        phone: lead.phone.trim(),
        source: leadSource,
        cohortId: activeCohort?.id ?? null,
        followUpCount: 0,
        email: lead.email.trim() || null,
        gender: lead.gender || null,
        ageRange: lead.age || null,
        occupation: lead.occupation.trim() || null,
        registeredById: user.id,
        notes: lead.note.trim() || null,
      });
      setMyLeads((prev) => [contact, ...prev]);
      setLead(EMPTY_LEAD);
      setLeadTouched(false);
      setLeadSaved(`${fullName} was sent to the back office to assign.`);
    } catch (err) {
      setLeadError(err instanceof Error ? err.message : 'Could not register this person.');
    } finally {
      setLeadSaving(false);
    }
  };

  const overflowItems = [
    { label: unread > 0 ? `Issues (${unread} new)` : 'Issues', onClick: () => { setShowIssues(true); markIssuesRead(visibleIssues); } },
    { label: 'Export contacts', onClick: () => setShowExport(true) },
  ];

  const copyRegistrationLink = () => {
    if (!registrationLink) return;
    void navigator.clipboard?.writeText(registrationLink);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  return (
    <div>
      <PageHeader
        title="Mobilisation"
        tourId="support:mobilisation"
        subtitle="Register people you meet, and follow up the ones assigned to you."
      />

      <div className="flex max-w-[760px] flex-col gap-3">
        <div className="flex items-center gap-2">
          <div data-wt="mob-tabs" className="min-w-0 flex-1">
            <SegmentedTabs
              tabs={[
                { key: 'register', label: 'Registration' },
                { key: 'follow', label: `Follow-ups (${openContacts.length})` },
              ]}
              active={tab}
              onChange={(key) => setTab(key as MobTab)}
            />
          </div>
          <div data-wt="mob-more"><AppOverflowMenu items={overflowItems} /></div>
        </div>

        {registrationLink && (
          <button
            type="button"
            onClick={copyRegistrationLink}
            data-wt="mob-link"
            title="Copy registration link"
            aria-label={linkCopied ? 'Registration link copied' : 'Copy registration link'}
            className={`inline-flex items-center gap-1.5 self-start rounded-full px-3 py-1.5 text-xs font-semibold transition ${linkCopied ? 'bg-emerald-100/80 text-emerald-700' : 'bg-[#f6f7f9] text-gray-600 hover:bg-gray-100'}`}
          >
            <svg className="h-3.5 w-3.5 flex-none" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
            <span>{linkCopied ? 'Copied' : 'Registration link'}</span>
            {linkCopied ? (
              <svg className="h-3.5 w-3.5 flex-none" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.4" d="m5 13 4 4L19 7" /></svg>
            ) : (
              <svg className="h-3.5 w-3.5 flex-none" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7v10a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2Z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 17H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1" /></svg>
            )}
          </button>
        )}

        {loadError && <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{loadError}</p>}

        {tab === 'register' && (
          <>
            <section data-wt="mob-register" className={`${CARD} p-[18px]`}>
              <h2 className="text-base font-bold text-gray-900">Register someone</h2>
              <p className="mt-1 text-[13px] leading-normal text-gray-500">The details we collect when someone signs up for a cohort.</p>
              <div className="mt-4 flex flex-col gap-3">
                <label className="block">
                  <span className="mb-1.5 block text-[13px] font-semibold text-gray-900">Email</span>
                  <input type="email" value={lead.email} onChange={(e) => setLead((prev) => ({ ...prev, email: e.target.value }))} placeholder="name@example.com" className={INPUT} />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[13px] font-semibold text-gray-900">First name</span>
                  <input value={lead.first} onChange={(e) => setLead((prev) => ({ ...prev, first: e.target.value }))} placeholder="First name" className={INPUT} />
                  {leadNameError && <span className="mt-1 block text-xs font-medium text-red-700">Enter their first name.</span>}
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[13px] font-semibold text-gray-900">Surname</span>
                  <input value={lead.last} onChange={(e) => setLead((prev) => ({ ...prev, last: e.target.value }))} placeholder="Surname" className={INPUT} />
                </label>
                <ChipGroup label="Gender" options={GENDERS} value={lead.gender} onChange={(value) => setLead((prev) => ({ ...prev, gender: value }))} />
                <ChipGroup label="Age range" options={AGE_RANGES} value={lead.age} onChange={(value) => setLead((prev) => ({ ...prev, age: value }))} />
                <label className="block">
                  <span className="mb-1.5 block text-[13px] font-semibold text-gray-900">Occupation</span>
                  <span className="mb-1.5 block text-xs text-gray-500">What they do for a living</span>
                  <input value={lead.occupation} onChange={(e) => setLead((prev) => ({ ...prev, occupation: e.target.value }))} placeholder="Occupation" className={INPUT} />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[13px] font-semibold text-gray-900">WhatsApp number</span>
                  <span className="mb-1.5 block text-xs text-gray-500">This becomes their username for the app</span>
                  <input type="tel" value={lead.phone} onChange={(e) => setLead((prev) => ({ ...prev, phone: e.target.value }))} placeholder="0803 000 0000" className={INPUT} />
                  {leadPhoneError && <span className="mt-1 block text-xs font-medium text-red-700">{leadPhoneError}</span>}
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[13px] font-semibold text-gray-900">Any other questions or concerns?</span>
                  <span className="mb-1.5 block text-xs text-gray-500">Optional</span>
                  <textarea value={lead.note} onChange={(e) => setLead((prev) => ({ ...prev, note: e.target.value }))} rows={3} placeholder="Anything they asked or mentioned" className={`${INPUT} resize-y`} />
                </label>
                {leadError && <p className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{leadError}</p>}
                {leadSaved && <p className="rounded-xl bg-emerald-100/80 px-3.5 py-2.5 text-sm font-semibold text-emerald-700">{leadSaved}</p>}
                <button type="button" onClick={() => { void submitLead(); }} disabled={leadSaving} className="min-h-[48px] w-full rounded-xl bg-primary p-3 text-[15px] font-semibold text-white disabled:opacity-60">
                  {leadSaving ? 'Registering…' : 'Register'}
                </button>
              </div>
            </section>

            {myLeads.length > 0 && (
              <section className={`${CARD} p-[18px]`}>
                <h3 className="mb-3 text-sm font-bold text-gray-900">People you registered</h3>
                <div className="flex flex-col gap-2.5">
                  {myLeads.map((contact) => {
                    const statusLabel = contact.ownerId ? FOLLOW_UP_STATUS_META[computeFollowUpStatus(contact)].label : 'Waiting to be assigned';
                    return (
                      <div key={contact.id} className="rounded-[14px] border border-[#f1f2f5] p-3">
                        <div className="flex flex-wrap items-center gap-2.5">
                          <span className="text-sm font-semibold text-gray-900">{contact.fullName}</span>
                          <span className="ml-auto rounded-full bg-[#fff8f3] px-2.5 py-0.5 text-[11px] font-bold text-[#c2410c]">{statusLabel}</span>
                        </div>
                        <p className="mt-1 text-xs text-gray-500">{contact.phone}</p>
                        {contact.registrationStatus === 'REGISTERED' && <LoginDetailsCard followUpContactId={contact.id} className="mt-2.5" />}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </>
        )}

        {tab === 'follow' && (
          <>
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-semibold text-gray-700">{showClosed ? 'Closed contacts' : 'Assigned to you'}</span>
              <InfoTip label="Open and Closed">
                <span className="block font-bold text-white">Open</span>
                <span className="block">People you are still following up: To contact, Waiting, Needs reminder, Replied, Call back later, Will join next cohort.</span>
                <span className="mt-2 block font-bold text-white">Moves to Closed</span>
                <span className="block">Registered, Wrong number, Not interested (including not a good time or not a TCN member), and No response.</span>
                <span className="mt-2 block text-white/60">To reopen someone, change their status back. Registering someone yourself does not add them here.</span>
              </InfoTip>
              <div className="ml-auto grid grid-cols-2 gap-0.5 rounded-full border border-[#eef0f4] bg-white p-0.5 text-xs font-semibold">
                <button type="button" onClick={() => setShowClosed(false)} aria-pressed={!showClosed} className={`rounded-full px-3 py-1.5 transition ${!showClosed ? 'bg-[#3f4757] text-white' : 'text-gray-600'}`}>
                  Open ({openContacts.length})
                </button>
                <button
                  type="button"
                  onClick={() => setShowClosed(true)}
                  disabled={closedCount === 0}
                  aria-pressed={showClosed}
                  className={`rounded-full px-3 py-1.5 transition disabled:cursor-default disabled:opacity-40 ${showClosed ? 'bg-[#3f4757] text-white' : 'text-gray-600'}`}
                >
                  Closed ({closedCount})
                </button>
              </div>
            </div>

            {loading ? (
              <p className={`${CARD} px-4 py-12 text-center text-sm text-gray-500`}>Loading your follow-ups…</p>
            ) : visibleContacts.length === 0 ? (
              <section className={`${CARD} px-5 py-9 text-center`}>
                {contacts.length === 0 ? (
                  <>
                    <p className="text-[14.5px] font-semibold text-gray-900">Nobody assigned to you</p>
                    <p className="mt-1 text-[13px] leading-normal text-gray-500">When the back office assigns someone for follow-up, they appear here.</p>
                  </>
                ) : (
                  <>
                    <p className="text-[14.5px] font-semibold text-gray-900">All caught up</p>
                    <p className="mt-1 text-[13px] leading-normal text-gray-500">
                      Everyone assigned to you is closed.{' '}
                      <button type="button" onClick={() => setShowClosed(true)} className="font-semibold text-[#c2410c]">See closed ({closedCount})</button>
                    </p>
                  </>
                )}
              </section>
            ) : visibleContacts.map((contact) => {
              const status = computeFollowUpStatus(contact);
              const meta = FOLLOW_UP_STATUS_META[status];
              const waLink = buildWhatsAppLink(contact.phone, '');
              const assigned = shortDate(contact.createdAt);
              return (
                <section key={contact.id} className={`${CARD} p-4`}>
                  <div className="flex items-center gap-2">
                    <p className="min-w-0 flex-1 truncate text-[15px] font-bold text-gray-900">{contact.fullName}</p>
                    <span className={`flex-none whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold ${meta.tone}`}>{meta.label}</span>
                    <button
                      type="button"
                      onClick={() => setEditingContact(contact)}
                      aria-label={`Edit ${contact.fullName}`}
                      title="Edit details"
                      className="grid h-8 w-8 flex-none place-items-center rounded-[10px] border border-gray-200 bg-white text-gray-500 hover:text-gray-700"
                    >
                      <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Z" /></svg>
                    </button>
                  </div>
                  <p className="mt-1 text-[12.5px] text-gray-500">{contact.phone || 'No phone'}{assigned ? ` · assigned ${assigned}` : ''}</p>
                  {contact.notes?.trim() && (
                    <p className="mt-2.5 whitespace-pre-wrap rounded-[10px] bg-[#f6f7f9] px-3 py-2.5 text-[13px] leading-normal text-gray-700">{contact.notes}</p>
                  )}
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <button type="button" onClick={() => setMessagingContact(contact)} className="min-h-[40px] rounded-[10px] border border-[#ffdeca] bg-[#fff8f3] px-2 py-2 text-[12.5px] font-semibold text-[#c2410c]">
                      Templates
                    </button>
                    {waLink ? (
                      <a href={waLink} target="_blank" rel="noreferrer" className="inline-flex min-h-[40px] items-center justify-center rounded-[10px] border border-gray-200 bg-white px-2 py-2 text-[12.5px] font-semibold text-gray-700">WhatsApp</a>
                    ) : (
                      <span className="inline-flex min-h-[40px] items-center justify-center rounded-[10px] border border-gray-100 bg-gray-50 px-2 py-2 text-[12.5px] font-semibold text-gray-400">WhatsApp</span>
                    )}
                    {contact.phone ? (
                      <a href={`tel:${contact.phone.replace(/[^\d+]/g, '')}`} className="inline-flex min-h-[40px] items-center justify-center rounded-[10px] border border-gray-200 bg-white px-2 py-2 text-[12.5px] font-semibold text-gray-700">Call</a>
                    ) : (
                      <span className="inline-flex min-h-[40px] items-center justify-center rounded-[10px] border border-gray-100 bg-gray-50 px-2 py-2 text-[12.5px] font-semibold text-gray-400">Call</span>
                    )}
                  </div>
                  <div className="mt-3">
                    <AppSelect
                      label="Where do they stand?"
                      value={status}
                      onChange={(value) => handleStatusChange(contact, value as FollowUpStatus)}
                      options={followUpStatusOptions}
                      placeholder="Choose status"
                    />
                  </div>
                  {status === 'REGISTERED' && <LoginDetailsCard followUpContactId={contact.id} className="mt-3" />}
                </section>
              );
            })}

          </>
        )}
      </div>

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

      {notInterestedContact && (
        <NotInterestedPopup
          contactName={notInterestedContact.fullName}
          existingNotes={notInterestedContact.notes}
          onCancel={() => setNotInterestedContact(null)}
          onSave={(subReason, notes) => {
            const patch = { ...buildStatusPatch('NOT_INTERESTED', subReason), notes: notes.trim() || null } as FollowUpContactUpdate;
            void handleFieldChange(notInterestedContact, patch);
            setNotInterestedContact(null);
          }}
        />
      )}

      <ModalShell isOpen={showIssues} onClose={() => setShowIssues(false)} title="Issues" subtitle="Questions and blockers on your follow-ups." wide>
        <FollowUpIssuesPanel
          issues={visibleIssues}
          onIssuesChanged={setIssues}
          contacts={contacts}
          owners={[]}
          currentUserId={user?.id}
          onIssuesOpen={() => markIssuesRead(visibleIssues)}
          canResolve
          canDelete
          canAssignOwner={false}
          canReply={false}
        />
      </ModalShell>

      {showExport && <ExportContactsPopup contacts={contacts} onClose={() => setShowExport(false)} />}
    </div>
  );
};

export default SupportMobilisationPage;
