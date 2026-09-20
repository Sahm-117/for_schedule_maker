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
import { followUpContactsApi, followUpIssuesApi, formRegistrationsApi, messageTemplatesApi, settingsApi } from '../services/api';
import type { FollowUpContact, FollowUpContactUpdate, FollowUpIssue, FollowUpStatus, MessageTemplate, User } from '../types';
import type { FormRegistration } from '../services/supabase-api';
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

// A support meets someone and takes their name and number, nothing more. The
// person fills in the Google Form themselves once they know what FOF is about,
// and that form is what actually registers them.
const EMPTY_PROSPECT = { fullName: '', phone: '' };

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


const SupportMobilisationPage: React.FC = () => {
  const { user } = useAuth();
  if (!user || user.role !== 'SUPPORT') return <Navigate to="/support" replace />;
  return <SupportMobilisationContent user={user} />;
};

const SupportMobilisationContent: React.FC<{ user: User }> = ({ user }) => {
  const { cohorts, activeCohort, liveRevision } = useAppData();
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState<MobTab>(searchParams.get('tab') === 'follow' ? 'follow' : 'register');

  const [contacts, setContacts] = useState<FollowUpContact[]>([]);
  const [myProspects, setMyProspects] = useState<FollowUpContact[]>([]);
  // Every contact in the app, not just this support's. The duplicate check has to
  // see people other supports saved and people who registered on their own,
  // otherwise saving someone already in the app silently creates a second row.
  const [allContacts, setAllContacts] = useState<FollowUpContact[]>([]);
  const [issues, setIssues] = useState<FollowUpIssue[]>([]);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [registrationLink, setRegistrationLink] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const initialLoadRef = useRef(true);

  const [prospect, setProspect] = useState(EMPTY_PROSPECT);
  const [signUps, setSignUps] = useState<FormRegistration[]>([]);
  const [signUpSearch, setSignUpSearch] = useState('');
  const [prospectTouched, setProspectTouched] = useState(false);
  const [prospectSaving, setProspectSaving] = useState(false);
  const [prospectError, setProspectError] = useState('');
  const [prospectSaved, setProspectSaved] = useState('');

  const [showClosed, setShowClosed] = useState(false);
  const toast = useToast();
  const [editingContact, setEditingContact] = useState<FollowUpContact | null>(null);
  const [messagingContact, setMessagingContact] = useState<FollowUpContact | null>(null);
  const [notInterestedContact, setNotInterestedContact] = useState<FollowUpContact | null>(null);
  const [showIssues, setShowIssues] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  const prospectSource = user ? `Registered by ${user.name}` : '';

  const loadAll = useCallback(async () => {
    if (!user?.id) return;
    if (initialLoadRef.current) setLoading(true);
    setLoadError('');
    try {
      // Every support sees every form sign-up, so nobody has to ask the back
      // office whether someone has registered.
      const [contactsRes, allRes, templatesRes, linkRes, signUpRes] = await Promise.all([
        followUpContactsApi.getAll({ ownerId: user.id }),
        followUpContactsApi.getAll(),
        messageTemplatesApi.getAll({ category: 'FOLLOW_UP' }),
        settingsApi.getRegistrationLink(),
        formRegistrationsApi.getAll(),
      ]);
      const issuesRes = await followUpIssuesApi.getAll();
      setContacts(sortByText(contactsRes.contacts, (contact) => contact.fullName));
      setAllContacts(allRes.contacts);
      setMyProspects(allRes.contacts.filter((contact) => contact.registeredById === user.id || contact.source === `Registered by ${user.name}`));
      setIssues(issuesRes.issues);
      setTemplates(sortByText(templatesRes.templates, (template) => template.useCase));
      setRegistrationLink(linkRes.url);
      setSignUps(signUpRes.registrations);
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

  const replaceContact = (updated: FollowUpContact) => {
    setContacts((prev) => sortByText(prev.map((c) => (c.id === updated.id ? updated : c)), (contact) => contact.fullName));
  };

  // Same status rules as the follow-up table: closing a registration also closes the reply/next action.
  const handleFieldChange = async (contact: FollowUpContact, patch: FollowUpContactUpdate) => {
    try {
      if (patch.registrationStatus) {
        if (patch.registrationStatus === 'REGISTERED') {
          // Signing up no longer closes the follow-up -- their app login is still
          // owed. LOGIN_SHARED is what closes it, and it is covered below.
          patch.replyStatus = 'REPLIED';
          patch.nextAction = 'SEND_MESSAGE';
          patch.archivedAt = null;
        } else if (isClosedRegistrationStatus(patch.registrationStatus)) {
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

  // The sheet keeps growing, so searching is the only way to answer "has this
  // person signed up?" once there are more rows than fit on a screen.
  const visibleSignUps = useMemo(() => {
    const needle = signUpSearch.trim().toLowerCase();
    if (!needle) return signUps;
    const digits = needle.replace(/\D/g, '');
    return signUps.filter((row) =>
      row.fullName.toLowerCase().includes(needle)
      || (digits.length >= 3 && row.phone.replace(/\D/g, '').includes(digits)));
  }, [signUps, signUpSearch]);

  const prospectNameError = prospectTouched && !prospect.fullName.trim();
  const prospectPhoneError = prospectTouched && !prospect.phone.trim()
    ? 'A WhatsApp number is required.'
    : prospectTouched && prospect.phone.trim() && !normalizeToIntlPhone(prospect.phone)
      ? 'Enter a valid WhatsApp number.'
      : '';

  const submitProspect = async () => {
    if (!user) return;
    setProspectSaved('');
    setProspectError('');
    if (!prospect.fullName.trim() || !prospect.phone.trim() || !normalizeToIntlPhone(prospect.phone)) { setProspectTouched(true); return; }
    const normalized = normalizeToIntlPhone(prospect.phone);

    // Checked against EVERY contact, not just this support's. Someone who signed
    // up on the form, or whom another support met, is already in the app, and a
    // second row would leave the back office with two of the same person --
    // one Registered, one To contact.
    const duplicate = allContacts.find((contact) => normalizeToIntlPhone(contact.phone) === normalized);
    if (duplicate) {
      const owner = duplicate.ownerName
        ? `being followed up by ${duplicate.ownerName}`
        : 'waiting to be assigned';
      const signedUp = duplicate.registrationStatus === 'REGISTERED' || duplicate.registrationStatus === 'LOGIN_SHARED';
      setProspectError(
        `${duplicate.fullName} is already in the app${signedUp ? ' and has signed up' : ''} — ${owner}. No need to save them again.`,
      );
      return;
    }

    // They registered on the form but no contact was created for them, so this is
    // the same person arriving from the other side.
    const signUpMatch = signUps.find((row) => (row.phoneNormalised ?? normalizeToIntlPhone(row.phone)) === normalized);
    if (signUpMatch && !signUpMatch.contactId) {
      setProspectError(`${signUpMatch.fullName} already signed up on the form. The back office will assign them.`);
      return;
    }

    const fullName = prospect.fullName.trim();

    setProspectSaving(true);
    try {
      const { contact } = await followUpContactsApi.create({
        fullName,
        phone: prospect.phone.trim(),
        source: prospectSource,
        cohortId: activeCohort?.id ?? null,
        followUpCount: 0,
        registeredById: user.id,
      });
      setMyProspects((prev) => [contact, ...prev]);
      setProspect(EMPTY_PROSPECT);
      setProspectTouched(false);
      setProspectSaved(`${fullName} was saved and sent to the back office to assign.`);
    } catch (err) {
      setProspectError(err instanceof Error ? err.message : 'Could not register this person.');
    } finally {
      setProspectSaving(false);
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

  const shareRegistrationLink = async () => {
    if (!registrationLink) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'FOF registration', text: 'Register for FOF here:', url: registrationLink });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
      }
    }
    copyRegistrationLink();
  };

  return (
    <div>
      <PageHeader
        title="Mobilisation"
        tourId="support:mobilisation"
        subtitle="Save the details of people you meet, see who has signed up, and follow up the ones assigned to you."
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
          <div data-wt="mob-link" className="inline-flex self-start items-center rounded-full bg-[#f6f7f9] text-xs font-semibold text-gray-600">
            <a href={registrationLink} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-8 items-center gap-1 rounded-l-full py-1 pl-3 pr-2 hover:bg-gray-100 hover:text-gray-800" title="Open registration form">
              Registration link
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5h5v5m0-5L10 14" /></svg>
            </a>
            <button type="button" onClick={() => { void shareRegistrationLink(); }} aria-label="Share registration link" title="Share registration link" className="grid h-8 w-8 place-items-center border-l border-gray-200 hover:bg-gray-100">
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 12v7a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-7M12 3v12m0-12 4 4m-4-4-4 4" /></svg>
            </button>
            <button type="button" onClick={copyRegistrationLink} aria-label={linkCopied ? 'Registration link copied' : 'Copy registration link'} title={linkCopied ? 'Copied' : 'Copy registration link'} className={`grid h-8 w-8 place-items-center rounded-r-full border-l border-gray-200 ${linkCopied ? 'text-emerald-700' : 'hover:bg-gray-100'}`}>
              {linkCopied ? (
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.4" d="m5 13 4 4L19 7" /></svg>
              ) : (
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7v10a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2Z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 17H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1" /></svg>
              )}
            </button>
          </div>
        )}

        {loadError && <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{loadError}</p>}

        {tab === 'register' && (
          <>
            <section data-wt="mob-register" className={`${CARD} p-[18px]`}>
              <h2 className="text-base font-bold text-gray-900">Save someone's details</h2>
              <p className="mt-1 text-[13px] leading-normal text-gray-500">Take their name and number when you meet them. They register themselves on the form once they know what FOF is about.</p>
              <div className="mt-4 flex flex-col gap-3">
                <label className="block">
                  <span className="mb-1.5 block text-[13px] font-semibold text-gray-900">Full name</span>
                  <input value={prospect.fullName} onChange={(e) => setProspect((prev) => ({ ...prev, fullName: e.target.value }))} placeholder="Full name" className={INPUT} />
                  {prospectNameError && <span className="mt-1 block text-xs font-medium text-red-700">Enter their full name.</span>}
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[13px] font-semibold text-gray-900">WhatsApp number</span>
                  <input type="tel" value={prospect.phone} onChange={(e) => setProspect((prev) => ({ ...prev, phone: e.target.value }))} placeholder="0803 000 0000" className={INPUT} />
                  {prospectPhoneError && <span className="mt-1 block text-xs font-medium text-red-700">{prospectPhoneError}</span>}
                </label>
                {prospectError && <p className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{prospectError}</p>}
                {prospectSaved && <p className="rounded-xl bg-emerald-100/80 px-3.5 py-2.5 text-sm font-semibold text-emerald-700">{prospectSaved}</p>}
                <button type="button" onClick={() => { void submitProspect(); }} disabled={prospectSaving} className="min-h-[48px] w-full rounded-xl bg-primary p-3 text-[15px] font-semibold text-white disabled:opacity-60">
                  {prospectSaving ? 'Saving…' : 'Save details'}
                </button>
              </div>
            </section>

            <section className={`${CARD} p-[18px]`}>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-bold text-gray-900">Signed up on the form</h3>
                <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-[11px] font-bold text-neutral-600">{signUps.length}</span>
              </div>
              <p className="mt-1 text-[13px] leading-normal text-gray-500">Everyone who filled in the registration form. Check here before asking the back office.</p>

              {signUps.length > 0 && (
                <input
                  value={signUpSearch}
                  onChange={(e) => setSignUpSearch(e.target.value)}
                  placeholder="Search by name or number"
                  className={`${INPUT} mt-3`}
                />
              )}

              {signUps.length === 0 ? (
                <p className="mt-3 rounded-[14px] bg-[#f6f7f9] px-3.5 py-3 text-[13px] text-gray-500">Nobody has signed up on the form yet.</p>
              ) : visibleSignUps.length === 0 ? (
                <p className="mt-3 rounded-[14px] bg-[#f6f7f9] px-3.5 py-3 text-[13px] text-gray-500">Nobody matching “{signUpSearch.trim()}” has signed up.</p>
              ) : (
                // Everyone who ever signed up lives here, so the list is capped at
                // roughly five cards and scrolls. The fade tells you there's more.
                <div className="relative mt-3">
                  <div className="flex max-h-[32rem] flex-col gap-2.5 overflow-y-auto overscroll-contain pb-1 pr-0.5">
                  {visibleSignUps.map((row) => (
                    <div key={row.id} className="rounded-[14px] border border-[#f1f2f5] p-3">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <span className="text-sm font-semibold text-gray-900">{row.fullName}</span>
                        <span className="ml-auto text-[11px] font-semibold text-gray-500">{shortDate(row.signedUpAt)}</span>
                      </div>
                      <p className="mt-1 text-xs text-gray-500">{row.phone}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {row.contactId ? (
                          <span className="rounded-full bg-emerald-100/80 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700">
                            {row.outcome === 'MATCHED' ? 'Already a contact' : 'Added as a new prospect'}
                          </span>
                        ) : row.outcome === 'FAILED' ? (
                          <span className="rounded-full bg-red-100/80 px-2.5 py-0.5 text-[11px] font-bold text-red-700">Could not be added</span>
                        ) : (
                          <span className="rounded-full bg-amber-100/80 px-2.5 py-0.5 text-[11px] font-bold text-amber-700">Not linked yet</span>
                        )}
                        {row.contactOwnerName ? (
                          <span className="text-[11px] font-semibold text-gray-500">Followed up by {row.contactOwnerName}</span>
                        ) : row.contactId ? (
                          <span className="text-[11px] font-semibold text-gray-500">Waiting to be assigned</span>
                        ) : null}
                      </div>
                    </div>
                  ))}
                  </div>
                  {visibleSignUps.length > 5 && (
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 rounded-b-[14px] bg-gradient-to-t from-white to-transparent" />
                  )}
                </div>
              )}
            </section>

            {myProspects.length > 0 && (
              <section className={`${CARD} p-[18px]`}>
                <h3 className="mb-3 text-sm font-bold text-gray-900">People you registered</h3>
                <div className="flex flex-col gap-2.5">
                  {myProspects.map((contact) => {
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
