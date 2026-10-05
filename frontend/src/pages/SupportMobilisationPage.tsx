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
import NoNumberHelp from '../components/followups/NoNumberHelp';
import NotInterestedPopup from '../components/followups/NotInterestedPopup';
import LoginIssuePopup from '../components/followups/LoginIssuePopup';
import FollowUpStatusFlow from '../components/followups/FollowUpStatusFlow';
import ExportContactsPopup from '../components/followups/ExportContactsPopup';
import { useAuth } from '../hooks/useAuth';
import { useAppData } from '../context/AppDataContext';
import { followUpContactsApi, followUpIssuesApi, followUpLoginIssuesApi, formRegistrationsApi, messageTemplatesApi, settingsApi } from '../services/api';
import type { FollowUpContact, FollowUpContactUpdate, FollowUpIssue, FollowUpRegistrationStatus, FollowUpStatus, ItLoginIssue, MessageTemplate, User } from '../types';
import type { FormRegistration } from '../services/supabase-api';
import {
  FOLLOW_UP_STATUS_META,
  buildStatusPatch,
  computeFollowUpFunnel,
  computeFollowUpStatus,
  contactInCohortScope,
  isNoFormRegistrationError,
  NO_FORM_MESSAGE,
  isClosedContact,
  isClosedRegistrationStatus,
  supportStatusOptions,
} from '../utils/followUps';
import Spinner from '../components/Spinner';
import { buildWhatsAppLink, normalizeToIntlPhone } from '../utils/phone';
import { compareText, sortByText } from '../utils/sort';
import LoginDetailsCard from '../components/participants/LoginDetailsCard';
import FormQuestionBox from '../components/followups/FormQuestionBox';
import SignUpStageFilter from '../components/followups/SignUpStageFilter';
import { emailLoginDetails, hasLoginToSend } from '../utils/loginEmail';

type MobTab = 'register' | 'follow' | 'it';

// A support meets someone and takes their name and number, nothing more. The
// person fills in the Google Form themselves once they know what FOF is about,
// and that form is what actually registers them.
const EMPTY_PROSPECT = { fullName: '', phone: '' };

const CARD = 'rounded-[20px] border border-[#eef0f4] bg-white shadow-[0_2px_8px_-3px_rgba(17,24,39,0.10)]';
const INPUT = 'min-h-[48px] w-full rounded-xl border border-gray-200 px-3.5 py-3 text-[15px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';

// IT issues tab: same soft surface, pill buttons and field as My Hub.
const IT_SURFACE = 'rounded-[28px] bg-white shadow-[0_1px_2px_rgba(17,24,39,0.04),0_12px_32px_-16px_rgba(17,24,39,0.18)]';
const IT_PRIMARY = 'flex h-[48px] w-full items-center justify-center gap-2 rounded-full bg-primary px-5 text-[15px] font-semibold text-white transition active:scale-[0.98] disabled:opacity-60';
const IT_SECONDARY = 'flex h-[44px] w-full items-center justify-center gap-2 rounded-full bg-[#f2f2f4] px-4 text-[14px] font-semibold text-gray-900 transition active:scale-[0.98]';
const IT_FIELD = 'w-full rounded-2xl border-0 bg-[#f5f5f7] px-4 py-3.5 text-[15px] placeholder:text-gray-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/30';

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

// "27 Sept, 9:38 am" — when someone filled in the form.
const shortDateTime = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const time = new Intl.DateTimeFormat('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true }).format(date);
  return `${shortDate(value)}, ${time}`;
};

// "5m ago" / "3h ago" today, then the date and time ("27 Sept, 9:38 am").
// On the sign-up list: how far their follow-up has got, so every support can
// see it (not only the one following them up).
const SIGN_UP_STAGE: Partial<Record<FollowUpRegistrationStatus, { label: string; tone: string }>> = {
  REGISTERED: { label: 'Login not shared yet', tone: 'bg-amber-100/80 text-amber-800' },
  LOGIN_SHARED: { label: 'Login shared', tone: 'bg-sky-100/80 text-sky-700' },
  LOGIN_ISSUE: { label: 'Issue with login', tone: 'bg-orange-100/80 text-orange-700' },
  ACCESS_CONFIRMED: { label: 'Logged in', tone: 'bg-emerald-600 text-white' },
  NEXT_COHORT: { label: 'Next cohort', tone: 'bg-violet-100/80 text-violet-700' },
};
// Filter choices: the stages above, plus people nobody is following up yet.
const SIGN_UP_FILTERS: Array<{ value: string; label: string }> = [
  { value: 'REGISTERED', label: 'Login not shared yet' },
  { value: 'LOGIN_SHARED', label: 'Login shared' },
  { value: 'LOGIN_ISSUE', label: 'Issue with login' },
  { value: 'ACCESS_CONFIRMED', label: 'Logged in' },
  { value: 'NEXT_COHORT', label: 'Next cohort' },
  { value: '__unassigned__', label: 'Waiting to be assigned' },
];
const signUpInStage = (row: { contactId: string | null; contactStatus: FollowUpRegistrationStatus | null; contactOwnerName: string | null }, stage: string) =>
  stage === '__unassigned__' ? !!row.contactId && !row.contactOwnerName : row.contactStatus === stage;
const signUpStageChip = (status: FollowUpRegistrationStatus | null) => {
  const stage = status ? SIGN_UP_STAGE[status] : null;
  return stage ? <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${stage.tone}`}>{stage.label}</span> : null;
};

const reportedWhen = (value?: string | null) => {
  if (!value) return '';
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return '';
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (mins < 24 * 60) return `${Math.round(mins / 60)}h ago`;
  return shortDateTime(value);
};


const SupportMobilisationPage: React.FC = () => {
  const { user } = useAuth();
  if (!user || user.role !== 'SUPPORT') return <Navigate to="/support" replace />;
  return <SupportMobilisationContent user={user} />;
};

const SupportMobilisationContent: React.FC<{ user: User }> = ({ user }) => {
  const { cohorts, activeCohort, liveRevision } = useAppData();
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get('tab');
  const [tab, setTab] = useState<MobTab>(initialTab === 'follow' ? 'follow' : initialTab === 'it' ? 'it' : 'register');

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
  // Follow-up stages ticked in the filter (empty = everyone).
  const [signUpStages, setSignUpStages] = useState<string[]>([]);
  const [signUpFrom, setSignUpFrom] = useState('');
  const [signUpTo, setSignUpTo] = useState('');
  const signUpDateOn = !!(signUpFrom || signUpTo);
  // On a phone the keyboard covers the list under the search box. When it's
  // tapped, bring the box up under the header so the names show as they filter.
  const signUpSearchRef = useRef<HTMLInputElement | null>(null);
  const bringSignUpSearchUp = () => {
    window.setTimeout(() => signUpSearchRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 300);
  };
  const [prospectTouched, setProspectTouched] = useState(false);
  const [prospectSaving, setProspectSaving] = useState(false);
  const [prospectError, setProspectError] = useState('');
  const [prospectSaved, setProspectSaved] = useState('');

  const [showClosed, setShowClosed] = useState(false);
  const [showPastCohorts, setShowPastCohorts] = useState(false);
  const toast = useToast();
  const [editingContact, setEditingContact] = useState<FollowUpContact | null>(null);
  const [messagingContact, setMessagingContact] = useState<FollowUpContact | null>(null);
  // Templates go out by WhatsApp, or by email from Send email / the email in the i pop-up.
  const [messageChannel, setMessageChannel] = useState<'whatsapp' | 'email'>('whatsapp');
  const openTemplates = (contact: FollowUpContact, channel: 'whatsapp' | 'email') => {
    setMessageChannel(channel);
    setMessagingContact(contact);
  };
  // Send email: once they're registered it opens the email app with their login
  // details; before that, the templates. Falls back to the templates if there's no
  // login to send (they've set their own password, or it isn't ready yet).
  const sendEmail = async (contact: FollowUpContact) => {
    if (!hasLoginToSend(contact)) { openTemplates(contact, 'email'); return; }
    try {
      const result = await emailLoginDetails(contact, user);
      if (result === 'password-set') toast({ message: `${contact.fullName.split(' ')[0]} has set their own password, so there's no login to send.` });
      if (result !== 'opened') openTemplates(contact, 'email');
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      toast({ tone: 'error', message: message === NO_FORM_MESSAGE ? message : 'Could not load their login details. Choose a message instead.' });
      openTemplates(contact, 'email');
    }
  };
  const [notInterestedContact, setNotInterestedContact] = useState<FollowUpContact | null>(null);
  const [showIssues, setShowIssues] = useState(false);
  // Set when "Log an issue" is picked on a contact's own menu: the Issues form opens with them ticked.
  const [issueStartContactId, setIssueStartContactId] = useState<string | null>(null);
  const [showExport, setShowExport] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [mobilisationTarget, setMobilisationTarget] = useState<number | null>(null);
  // Phone-only: the number cards scroll sideways; the arrow hints at more and
  // hides once the row is scrolled to the end.
  const numbersRowRef = useRef<HTMLDivElement | null>(null);
  const [numbersAtEnd, setNumbersAtEnd] = useState(false);
  const updateNumbersAtEnd = () => {
    const el = numbersRowRef.current;
    if (el) setNumbersAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 4);
  };
  const [loginIssueContact, setLoginIssueContact] = useState<FollowUpContact | null>(null);
  // Follow-up cards whose "Number needs checking" strip is open.
  const [numberHelpOpen, setNumberHelpOpen] = useState<Record<string, boolean>>({});
  const [copiedEmailId, setCopiedEmailId] = useState<string | null>(null);
  // The i pop-up by a follow-up's name: their number and email.
  const [infoOpenId, setInfoOpenId] = useState<string | null>(null);
  const copyText = async (text: string) => {
    try { await navigator.clipboard.writeText(text); toast({ message: 'Number copied' }); } catch { /* ignore */ }
  };
  const copyEmail = async (contactId: string, email: string) => {
    try {
      await navigator.clipboard.writeText(email);
      setCopiedEmailId(contactId);
      setTimeout(() => setCopiedEmailId(null), 2000);
    } catch { /* ignore */ }
  };

  // IT issues tab: only for IT Support (a HubItSupport row in this cohort).
  const [isItSupport, setIsItSupport] = useState(false);
  const [itLoaded, setItLoaded] = useState(false);
  const [itIssues, setItIssues] = useState<ItLoginIssue[]>([]);
  const [itShowResolved, setItShowResolved] = useState(false);
  const [resolvingIssue, setResolvingIssue] = useState<ItLoginIssue | null>(null);
  const [resolveNote, setResolveNote] = useState('');
  const [resolveSaving, setResolveSaving] = useState(false);

  const loadItIssues = useCallback(async () => {
    // No cohort yet (still loading): don't settle "not IT Support", or ?tab=it
    // would bounce to Registration before the real answer arrives.
    if (!activeCohort?.id) { setIsItSupport(false); setItIssues([]); return; }
    try {
      const res = await followUpLoginIssuesApi.getForItSupport(activeCohort.id);
      setIsItSupport(res.isItSupport);
      setItIssues(res.isItSupport ? res.issues : []);
    } catch (err) {
      console.warn('Failed to load login issues:', err);
    } finally {
      setItLoaded(true);
    }
  }, [activeCohort?.id]);

  // The cohort's sign-up target (set by the admin on Follow-ups → Overview).
  useEffect(() => {
    if (!activeCohort?.id) { setMobilisationTarget(null); return; }
    let cancelled = false;
    settingsApi.getMobilisationTarget(activeCohort.id)
      .then(({ target }) => { if (!cancelled) setMobilisationTarget(target); })
      .catch(() => { if (!cancelled) setMobilisationTarget(null); });
    return () => { cancelled = true; };
  }, [activeCohort?.id, liveRevision]);

  const prospectSource = user ? `Added for follow up by ${user.name}` : '';

  // Signed up counts this cohort only (as on the admin Follow-ups overview).
  // Prospects = people still being followed up who haven't signed up yet,
  // split into prior-cohort ones (no cohort until assigned) and this cohort's.
  // Onboarded = this cohort's people whose follow-up closed as Participant
  // confirmed access (they chose their password / signed in to the app).
  const mobilisationNumbers = useMemo(() => {
    if (!activeCohort) return null;
    // Test contacts never count towards the numbers.
    const scoped = allContacts.filter((c) => !c.isTest && contactInCohortScope(c, activeCohort.id, activeCohort.id));
    const current = computeFollowUpFunnel(scoped.filter((c) => c.cohortId));
    const prior = computeFollowUpFunnel(scoped.filter((c) => !c.cohortId));
    const onboarded = scoped.filter((c) => c.cohortId && computeFollowUpStatus(c) === 'ACCESS_CONFIRMED').length;
    return { signedUp: current.signedUp, currentProspects: current.open, priorProspects: prior.open, onboarded };
  }, [allContacts, activeCohort]);

  // A change just saved must not be undone by a refresh that was already on its way.
  const lastEditAt = useRef(0);

  const loadAll = useCallback(async () => {
    const startedAt = Date.now();
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
      if (lastEditAt.current > startedAt) return;
      setContacts(sortByText(contactsRes.contacts, (contact) => contact.fullName));
      setAllContacts(allRes.contacts);
      setMyProspects(allRes.contacts.filter((contact) => contact.registeredById === user.id || contact.source === `Registered by ${user.name}` || contact.source === `Added for follow up by ${user.name}`));
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
  }, [user?.id, user?.name]);

  const [signUpsRefreshing, setSignUpsRefreshing] = useState(false);
  const refreshSignUps = async () => {
    setSignUpsRefreshing(true);
    try {
      const res = await formRegistrationsApi.getAll();
      setSignUps(res.registrations);
    } catch (err) {
      console.warn('Failed to refresh form sign-ups:', err);
    } finally {
      setSignUpsRefreshing(false);
    }
  };

  useEffect(() => { void loadAll(); }, [liveRevision, loadAll]);
  useEffect(() => {
    const interval = setInterval(() => void loadAll(), 30000);
    return () => clearInterval(interval);
  }, [loadAll]);
  useEffect(() => { void loadItIssues(); }, [liveRevision, loadItIssues]);
  useEffect(() => {
    const interval = setInterval(() => void loadItIssues(), 30000);
    return () => clearInterval(interval);
  }, [loadItIssues]);

  // ?tab=it for someone who isn't IT Support lands on Registration instead.
  useEffect(() => {
    if (tab === 'it' && itLoaded && !isItSupport) setTab('register');
  }, [tab, itLoaded, isItSupport]);

  const openItIssues = useMemo(() => itIssues.filter((issue) => issue.status === 'OPEN'), [itIssues]);
  const resolvedItIssues = useMemo(() => itIssues.filter((issue) => issue.status !== 'OPEN'), [itIssues]);
  const visibleItIssues = itShowResolved ? resolvedItIssues : openItIssues;

  useEffect(() => {
    if (itShowResolved && resolvedItIssues.length === 0) setItShowResolved(false);
  }, [itShowResolved, resolvedItIssues.length]);

  const submitResolve = async () => {
    if (!resolvingIssue || resolveSaving) return;
    setResolveSaving(true);
    try {
      const { registrationStatus } = await followUpLoginIssuesApi.resolve(resolvingIssue.id, resolveNote);
      const firstName = resolvingIssue.contactName.split(' ')[0];
      toast({
        tone: 'success',
        message: registrationStatus === 'ACCESS_CONFIRMED'
          ? `${firstName} is in the app. Moved to Logged in.`
          : `${firstName} moved back to Login shared until they sign in.`,
      });
      setResolvingIssue(null);
      setResolveNote('');
      void loadItIssues();
    } catch (err) {
      toast({ tone: 'error', message: err instanceof Error && err.message ? err.message : "That didn't save. Please try again." });
    } finally {
      setResolveSaving(false);
    }
  };

  // Default view stays on the active cohort (plus contacts with no cohort at
  // all, which count as belonging to it); "Show past cohorts" reveals the rest.
  const cohortScopedContacts = useMemo(() => {
    if (showPastCohorts || !activeCohort) return contacts;
    return contacts.filter((contact) => contactInCohortScope(contact, activeCohort.id, activeCohort.id));
  }, [contacts, showPastCohorts, activeCohort]);

  // "People you added" follows the same cohort scope as the follow-up list.
  const cohortScopedProspects = useMemo(() => {
    if (showPastCohorts || !activeCohort) return myProspects;
    return myProspects.filter((contact) => contactInCohortScope(contact, activeCohort.id, activeCohort.id));
  }, [myProspects, showPastCohorts, activeCohort]);

  const openContacts = useMemo(() => cohortScopedContacts.filter((contact) => !contact.archivedAt), [cohortScopedContacts]);
  const visibleContacts = useMemo(() => {
    const list = showClosed ? cohortScopedContacts.filter((contact) => !!contact.archivedAt) : [...openContacts];
    list.sort((a, b) => ((isClosedContact(a) ? 1 : 0) - (isClosedContact(b) ? 1 : 0)) || compareText(a.fullName, b.fullName));
    return list;
  }, [cohortScopedContacts, openContacts, showClosed]);
  const closedCount = cohortScopedContacts.length - openContacts.length;

  useEffect(() => {
    if (showClosed && closedCount === 0) setShowClosed(false);
  }, [showClosed, closedCount]);

  const visibleIssues = useMemo(() => {
    const contactIds = new Set(contacts.map((contact) => contact.id));
    return issues.filter((issue) => issue.reportedById === user?.id || (issue.contactId ? contactIds.has(issue.contactId) : false));
  }, [contacts, issues, user?.id]);
  const unread = unreadIssueCount(visibleIssues);

  const replaceContact = (updated: FollowUpContact) => {
    lastEditAt.current = Date.now();
    setContacts((prev) => sortByText(prev.map((c) => (c.id === updated.id ? updated : c)), (contact) => contact.fullName));
  };

  // Same status rules as the follow-up table: closing a registration also closes the reply/next action.
  const handleFieldChange = async (contact: FollowUpContact, patch: FollowUpContactUpdate) => {
    try {
      if (patch.registrationStatus) {
        if (patch.registrationStatus === 'REGISTERED') {
          // Signing up no longer closes the follow-up -- their app login is still
          // owed. ACCESS_CONFIRMED is what closes it, and it is covered below.
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
    } catch (err) {
      if (isNoFormRegistrationError(err)) {
        toast({ tone: 'error', message: `Not saved. ${NO_FORM_MESSAGE}` });
      } else {
        toast({ tone: 'error', message: "That change didn't save. Please try again." });
      }
      void loadAll();
    }
  };

  const handleStatusChange = (contact: FollowUpContact, status: FollowUpStatus) => {
    if (status === 'NOT_INTERESTED') { setNotInterestedContact(contact); return; }
    if (status === 'LOGIN_ISSUE') { setLoginIssueContact(contact); return; }
    void handleFieldChange(contact, buildStatusPatch(status) as FollowUpContactUpdate);
  };

  const handleMessageSent = async (contact: FollowUpContact) => {
    const { contact: logged } = await followUpContactsApi.logContact(contact.id);
    replaceContact(logged);
  };

  // The sheet keeps growing, so searching is the only way to answer "has this
  // person signed up?" once there are more rows than fit on a screen.
  // One card per person: someone who filled the form more than once (to fix
  // their name, say) shows their latest submission, with the dates of all of
  // them. Every submission is still stored; this only changes the list.
  const signUpPeople = useMemo(() => {
    const byPerson = new Map<string, FormRegistration & { submittedAt: string[]; allNames: string[] }>();
    for (const row of signUps) { // newest first
      const key = row.contactId ?? row.phoneNormalised ?? row.id;
      const seen = byPerson.get(key);
      if (seen) {
        seen.submittedAt.push(row.signedUpAt);
        seen.allNames.push(row.fullName);
      } else {
        byPerson.set(key, { ...row, submittedAt: [row.signedUpAt], allNames: [row.fullName] });
      }
    }
    return [...byPerson.values()];
  }, [signUps]);
  const visibleSignUps = useMemo(() => {
    const needle = signUpSearch.trim().toLowerCase();
    const digits = needle.replace(/\D/g, '');
    return signUpPeople.filter((row) => {
      if (signUpStages.length > 0 && !signUpStages.some((stage) => signUpInStage(row, stage))) return false;
      if (signUpFrom || signUpTo) {
        const day = (row.signedUpAt || '').slice(0, 10);
        if (!day) return false;
        if (signUpFrom && day < signUpFrom) return false;
        if (signUpTo && day > signUpTo) return false;
      }
      if (!needle) return true;
      return row.allNames.some((name) => name.toLowerCase().includes(needle))
        || (digits.length >= 3 && row.phone.replace(/\D/g, '').includes(digits));
    });
  }, [signUpPeople, signUpSearch, signUpStages, signUpFrom, signUpTo]);
  const signUpStageOptions = useMemo(
    () => SIGN_UP_FILTERS.map((option) => ({ ...option, count: signUpPeople.filter((row) => signUpInStage(row, option.value)).length })),
    [signUpPeople],
  );

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
      const signedUp = ['REGISTERED', 'LOGIN_SHARED', 'LOGIN_ISSUE', 'ACCESS_CONFIRMED'].includes(duplicate.registrationStatus);
      setProspectError(
        `${duplicate.fullName} is already in the app${signedUp ? ' and has registered' : ''} — ${owner}. No need to save them again.`,
      );
      return;
    }

    // They registered on the form but no contact was created for them, so this is
    // the same person arriving from the other side.
    const signUpMatch = signUps.find((row) => (row.phoneNormalised ?? normalizeToIntlPhone(row.phone)) === normalized);
    if (signUpMatch && !signUpMatch.contactId) {
      setProspectError(`${signUpMatch.fullName} already registered on the form. The back office will assign them.`);
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

  return (
    <div>
      <PageHeader
        title="Mobilisation"
        tourId="support:mobilisation"
        subtitle="Save the details of people you meet, see who has registered, and follow up the ones assigned to you."
      />

      <div className="flex max-w-[760px] flex-col gap-3">
        <div className="flex items-center gap-2">
          <div data-wt="mob-tabs" className="min-w-0 flex-1">
            <SegmentedTabs
              tabs={[
                { key: 'register', label: 'Registration' },
                { key: 'follow', label: `Follow-ups (${openContacts.length})` },
                ...(isItSupport ? [{ key: 'it', label: `IT issues (${openItIssues.length})`, dot: openItIssues.length > 0 }] : []),
              ]}
              active={tab}
              onChange={(key) => setTab(key as MobTab)}
              scrollable
            />
          </div>
          <div data-wt="mob-more"><AppOverflowMenu items={overflowItems} /></div>
        </div>

        {tab === 'register' && registrationLink && (
          <div data-wt="mob-link" className="inline-flex self-start items-center gap-1.5 text-xs font-semibold text-gray-600">
            <span className="px-1">Registration link</span>
            <a href={registrationLink} target="_blank" rel="noopener noreferrer" aria-label="Open registration form" title="Open registration form" className="grid h-10 w-10 place-items-center rounded-full bg-[#f6f7f9] hover:bg-gray-100 hover:text-gray-800">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5h5v5m0-5L10 14" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h4" /></svg>
            </a>
            <button type="button" onClick={copyRegistrationLink} aria-label={linkCopied ? 'Registration link copied' : 'Copy registration link'} title={linkCopied ? 'Copied' : 'Copy registration link'} className={`grid h-10 w-10 place-items-center rounded-full bg-[#f6f7f9] ${linkCopied ? 'text-emerald-700' : 'hover:bg-gray-100'}`}>
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
                  {prospectSaving ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Saving…</span>) : 'Save details'}
                </button>
              </div>
            </section>

            {mobilisationNumbers && (
              <div className="relative">
              <div ref={numbersRowRef} onScroll={updateNumbersAtEnd} className="-mb-1 flex snap-x gap-3 overflow-x-auto pb-1 [scrollbar-width:none] sm:mb-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:pb-0 [&::-webkit-scrollbar]:hidden">
                <section className={`${CARD} min-w-[150px] flex-1 snap-start p-4 sm:min-w-0`}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Target</p>
                    {mobilisationTarget ? (
                      <InfoTip label="About the target">{mobilisationNumbers.signedUp} people in {activeCohort?.name} have registered on the form, out of a target of {mobilisationTarget}.</InfoTip>
                    ) : null}
                  </div>
                  {mobilisationTarget ? (
                    <>
                      <p className="mt-1 text-sm text-gray-600"><span className="text-2xl font-bold tabular-nums text-gray-900">{mobilisationNumbers.signedUp}</span> of {mobilisationTarget}</p>
                      <p className={`mt-1 text-xs font-semibold ${mobilisationNumbers.signedUp >= mobilisationTarget ? 'text-emerald-700' : 'text-amber-700'}`}>
                        {mobilisationNumbers.signedUp >= mobilisationTarget ? 'Target reached' : `${mobilisationTarget - mobilisationNumbers.signedUp} to go`}
                      </p>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100">
                        <span className={`block h-full ${mobilisationNumbers.signedUp >= mobilisationTarget ? 'bg-emerald-500' : 'bg-primary'}`} style={{ width: `${Math.min(mobilisationNumbers.signedUp / mobilisationTarget, 1) * 100}%` }} />
                      </div>
                    </>
                  ) : (
                    <p className="mt-1 text-xs text-gray-500">No target set yet</p>
                  )}
                </section>
                <section className={`${CARD} min-w-[150px] flex-1 snap-start p-4 sm:min-w-0`}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Prospects</p>
                    <InfoTip label="About prospects">
                      Still being followed up and not registered yet: {mobilisationNumbers.priorProspects} from a prior cohort, {mobilisationNumbers.currentProspects} from {activeCohort?.name} (current).
                    </InfoTip>
                  </div>
                  <p className="mt-1 text-sm text-gray-600"><span className="text-2xl font-bold tabular-nums text-gray-900">{mobilisationNumbers.priorProspects + mobilisationNumbers.currentProspects}</span></p>
                  <p className="mt-1 text-xs font-semibold text-gray-600">Not registered yet</p>
                </section>
                <section className={`${CARD} min-w-[150px] flex-1 snap-start p-4 sm:min-w-0`}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Onboarded</p>
                    <InfoTip label="About onboarded">
                      {mobilisationNumbers.onboarded} of the {mobilisationNumbers.signedUp} people registered for {activeCohort?.name} have confirmed their login: they chose their password and got into the app.
                    </InfoTip>
                  </div>
                  <p className="mt-1 text-sm text-gray-600"><span className="text-2xl font-bold tabular-nums text-gray-900">{mobilisationNumbers.onboarded}</span>{mobilisationNumbers.signedUp > 0 ? ` of ${mobilisationNumbers.signedUp}` : ''}</p>
                  <p className="mt-1 text-xs font-semibold text-emerald-700">Confirmed login</p>
                  {mobilisationNumbers.signedUp > 0 && (
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100">
                      <span className="block h-full bg-emerald-500" style={{ width: `${Math.min(mobilisationNumbers.onboarded / mobilisationNumbers.signedUp, 1) * 100}%` }} />
                    </div>
                  )}
                </section>
              </div>
              <button
                type="button"
                onClick={() => numbersRowRef.current?.scrollBy({ left: 160, behavior: 'smooth' })}
                aria-label="Show more numbers"
                tabIndex={numbersAtEnd ? -1 : 0}
                className={`absolute right-1 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-white/95 text-gray-500 shadow-[0_4px_14px_-4px_rgba(17,24,39,0.25)] transition-opacity duration-300 sm:hidden ${numbersAtEnd ? 'pointer-events-none opacity-0' : 'opacity-100'}`}
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="m9 6 6 6-6 6" /></svg>
              </button>
              </div>
            )}

            <section className={`${CARD} p-[18px]`}>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-bold text-gray-900">Registered on the form</h3>
                <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-[11px] font-bold text-neutral-600">{signUpDateOn ? `${visibleSignUps.length} of ${signUpPeople.length}` : signUpPeople.length}</span>
                <button
                  type="button"
                  onClick={() => { void refreshSignUps(); }}
                  disabled={signUpsRefreshing}
                  aria-label="Refresh registrations"
                  title="Refresh"
                  className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 disabled:opacity-60"
                >
                  <svg className={`h-4 w-4 ${signUpsRefreshing ? 'animate-spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M21 12a9 9 0 1 1-2.64-6.36" />
                    <path d="M21 3v6h-6" />
                  </svg>
                </button>
              </div>
              <p className="mt-1 text-[13px] leading-normal text-gray-500">Everyone who filled in the registration form. Check here before asking the back office.</p>

              {signUps.length > 0 && (
                <div className="mt-3 flex items-center gap-2">
                <div className="relative min-w-0 flex-1 scroll-mt-28">
                  <input
                    ref={signUpSearchRef}
                    value={signUpSearch}
                    onChange={(e) => setSignUpSearch(e.target.value)}
                    onFocus={bringSignUpSearchUp}
                    placeholder="Search name or number"
                    className={`${INPUT} scroll-mt-28 pr-11`}
                  />
                  {signUpSearch && (
                    <button
                      type="button"
                      // Keep the keyboard up: clear without taking focus off the box.
                      onPointerDown={(e) => e.preventDefault()}
                      onClick={() => { setSignUpSearch(''); signUpSearchRef.current?.focus(); }}
                      aria-label="Clear search"
                      className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6 6 18" /></svg>
                    </button>
                  )}
                </div>
                <SignUpStageFilter options={signUpStageOptions} values={signUpStages} onChange={setSignUpStages} dateFrom={signUpFrom} dateTo={signUpTo} onDateChange={(from, to) => { setSignUpFrom(from); setSignUpTo(to); }} />
                </div>
              )}

              {/* While searching, hold this area's height so the page doesn't shrink
                  (and jump) as fewer names match. */}
              <div className={signUpSearch.trim() || signUpStages.length > 0 || signUpDateOn ? 'min-h-[min(60vh,32rem)]' : ''}>
              {signUps.length === 0 ? (
                <p className="mt-3 rounded-[14px] bg-[#f6f7f9] px-3.5 py-3 text-[13px] text-gray-500">Nobody has registered on the form yet.</p>
              ) : visibleSignUps.length === 0 ? (
                <p className="mt-3 rounded-[14px] bg-[#f6f7f9] px-3.5 py-3 text-[13px] text-gray-500">{signUpSearch.trim() ? `Nobody matching “${signUpSearch.trim()}”` : 'Nobody'}{signUpStages.length > 0 ? ' at those stages' : ''}{signUpDateOn ? ' in those dates' : ''} has registered.</p>
              ) : (
                // Everyone who ever signed up lives here, so the list is capped at
                // roughly five cards and scrolls. The fade tells you there's more.
                <div className="relative mt-3">
                  <div className="flex max-h-[32rem] flex-col gap-2.5 overflow-y-auto overscroll-contain pb-1 pr-0.5">
                  {visibleSignUps.map((row) => (
                    <div key={row.id} className="rounded-[14px] border border-[#f1f2f5] p-3">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <span className="text-sm font-semibold text-gray-900">{row.fullName}</span>
                        <span className="ml-auto text-[11px] font-semibold text-gray-500">{shortDateTime(row.signedUpAt)}</span>
                      </div>
                      <p className="mt-1 text-xs text-gray-500">{row.phone}</p>
                      {row.submittedAt.length > 1 && (
                        <p className="mt-1 text-[11px] text-gray-500">
                          Filled the form {row.submittedAt.length === 2 ? 'twice' : `${row.submittedAt.length} times`} · {[...row.submittedAt].reverse().map((at) => shortDate(at)).join(', ')}
                        </p>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {row.contactId ? (
                          <span className="rounded-full bg-emerald-100/80 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700">
                            Registered on reg form
                          </span>
                        ) : row.outcome === 'FAILED' ? (
                          <span className="rounded-full bg-red-100/80 px-2.5 py-0.5 text-[11px] font-bold text-red-700">Could not be added</span>
                        ) : (
                          <span className="rounded-full bg-amber-100/80 px-2.5 py-0.5 text-[11px] font-bold text-amber-700">Not linked yet</span>
                        )}
                        {signUpStageChip(row.contactStatus)}
                        {row.contactOwnerName ? (
                          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-gray-500">
                            Followed up by {row.contactOwnerName}
                            {(() => {
                              // A shortcut to ask the support how it's going. Not shown on your own follow-ups.
                              if (!row.contactOwnerPhone || row.contactOwnerId === user?.id) return null;
                              const message = `Hi ${row.contactOwnerName.split(' ')[0]}, it's ${user?.name ?? 'a fellow support'}. I saw ${row.fullName} in the registrations list and you're following them up. Any challenge I can help with?`;
                              const link = buildWhatsAppLink(row.contactOwnerPhone, message);
                              return link ? (
                                <a
                                  href={link}
                                  target="_blank"
                                  rel="noreferrer"
                                  aria-label={`Message ${row.contactOwnerName} on WhatsApp`}
                                  title={`Message ${row.contactOwnerName} on WhatsApp`}
                                  className="inline-grid h-5 w-5 place-items-center rounded-full bg-[#25d366] text-white"
                                >
                                  <svg viewBox="0 0 24 24" fill="currentColor" className="h-3 w-3" aria-hidden="true">
                                    <path d="M12.032 21.965c-1.922 0-3.805-.537-5.414-1.556l-3.633.954.995-3.513a9.939 9.939 0 0 1-1.653-5.534c0-5.523 4.5-10.023 10.023-10.023 2.685 0 5.208 1.045 7.104 2.942a9.975 9.975 0 0 1 2.941 7.104c0 5.522-4.5 10.022-10.023 10.022l-.34-.003v-.001Zm0-18.524c-4.7 0-8.524 3.823-8.524 8.523 0 1.87.606 3.674 1.741 5.16l-1.144 4.035 4.172-1.115a8.54 8.54 0 0 0 4.755 1.443c4.7 0 8.523-3.823 8.523-8.523 0-2.278-.888-4.419-2.5-6.03a8.534 8.534 0 0 0-6.023-2.493Z" />
                                    <path d="M17.507 14.307c-.269-.134-1.592-.785-1.838-.874-.247-.09-.427-.134-.607.134-.179.27-.696.875-.854 1.055-.157.18-.314.202-.583.067-.27-.134-1.137-.418-2.165-1.335-.8-.713-1.34-1.594-1.497-1.863-.157-.27-.016-.415.118-.55.12-.119.27-.313.404-.47.135-.156.18-.269.27-.448.09-.18.045-.336-.022-.47-.067-.135-.607-1.46-.832-2-.22-.525-.445-.437-.607-.445-.157-.008-.336-.01-.516-.01-.18 0-.472.067-.72.336-.247.27-.944.923-.944 2.252 0 1.33.966 2.614 1.102 2.794.135.18 1.902 2.906 4.61 4.075 2.707 1.168 2.707.78 3.195.73.494-.05 1.588-.645 1.812-1.27.224-.623.224-1.157.157-1.27-.067-.112-.247-.18-.516-.314Z" />
                                  </svg>
                                </a>
                              ) : null;
                            })()}
                          </span>
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
              </div>
            </section>

            {cohortScopedProspects.length > 0 && (
              <section className={`${CARD} p-[18px]`}>
                <h3 className="mb-3 text-sm font-bold text-gray-900">People you added</h3>
                <div className="flex flex-col gap-2.5">
                  {cohortScopedProspects.map((contact) => {
                    const statusLabel = contact.ownerId ? FOLLOW_UP_STATUS_META[computeFollowUpStatus(contact)].label : 'Waiting to be assigned';
                    return (
                      <div key={contact.id} className="rounded-[14px] border border-[#f1f2f5] p-3">
                        <div className="flex flex-wrap items-center gap-2.5">
                          <span className="text-sm font-semibold text-gray-900">{contact.fullName}</span>
                          <span className="ml-auto rounded-full bg-[#fff8f3] px-2.5 py-0.5 text-[11px] font-bold text-[#c2410c]">{statusLabel}</span>
                        </div>
                        <p className="mt-1 text-xs text-gray-500">{contact.phone}</p>
                        {(contact.registrationStatus === 'REGISTERED' || contact.registrationStatus === 'LOGIN_SHARED' || contact.registrationStatus === 'LOGIN_ISSUE') && <LoginDetailsCard followUpContactId={contact.id} startDate={contact.cohortStartDate} email={contact.email} className="mt-2.5" />}
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
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[13px] font-semibold text-gray-700">{showClosed ? 'Closed contacts' : 'Assigned to you'}</span>
              <InfoTip label="Open and Closed">
                <span className="block font-bold text-white">Open</span>
                <span className="block">People you are still following up: To contact, Waiting, Needs reminder, Replied, Call back later, Will join next cohort.</span>
                <span className="mt-2 block font-bold text-white">Moves to Closed</span>
                <span className="block">Registered, Wrong number, Not interested (including not a good time or not a TCN member), and No response.</span>
                <span className="mt-2 block text-white/60">To reopen someone, change their status back. Registering someone yourself does not add them here.</span>
              </InfoTip>
              <label className="ml-auto flex items-center gap-2 text-xs font-semibold text-gray-600">
                <span>Show past cohorts</span>
                <button
                  type="button"
                  onClick={() => setShowPastCohorts((v) => !v)}
                  aria-pressed={showPastCohorts}
                  className={`relative h-6 w-11 rounded-full transition ${showPastCohorts ? 'bg-primary' : 'bg-gray-300'}`}
                >
                  <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition ${showPastCohorts ? 'translate-x-5' : ''}`} />
                </button>
              </label>
              <SegmentedTabs
                className="w-60"
                tabs={[{ key: 'open', label: `Open (${openContacts.length})` }, { key: 'closed', label: `Closed (${closedCount})` }]}
                active={showClosed ? 'closed' : 'open'}
                onChange={(k) => { if (k === 'closed' && closedCount === 0) return; setShowClosed(k === 'closed'); }}
              />
            </div>

            {loading ? (
              <p className={`${CARD} flex items-center justify-center gap-1.5 px-4 py-12 text-center text-sm text-gray-500`}><Spinner className="h-3.5 w-3.5" />Loading your follow-ups…</p>
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
              // "00" and the like came in from the form: WhatsApp and Call can't work.
              const phoneOk = !!normalizeToIntlPhone(contact.phone);
              const waLink = phoneOk ? buildWhatsAppLink(contact.phone, '') : null;
              const helpOpen = !!numberHelpOpen[contact.id];
              const assigned = shortDate(contact.createdAt);
              return (
                <section key={contact.id} className={`${CARD} p-4`}>
                  <div className="flex items-center gap-2">
                    <div className="flex min-w-0 flex-1 items-center gap-1.5">
                      <p className="min-w-0 truncate text-[15px] font-bold text-gray-900">{contact.fullName}</p>
                      <button
                        type="button"
                        onClick={() => setInfoOpenId(infoOpenId === contact.id ? null : contact.id)}
                        aria-label={`${contact.fullName}'s number and email`}
                        aria-expanded={infoOpenId === contact.id}
                        className="inline-flex h-5 w-5 flex-none items-center justify-center rounded-full bg-gray-200 text-[11px] font-bold text-gray-600 transition hover:bg-gray-300"
                      >
                        i
                      </button>
                    </div>
                    <span className={`flex-none whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold ${meta.tone}`}>{meta.label}</span>
                    <AppOverflowMenu
                      items={[
                        ...(contact.phone?.trim() ? [{ label: 'Copy number', onClick: () => { void copyText(contact.phone!.trim()); } }] : []),
                        ...(waLink ? [{ label: 'Send message', onClick: () => { window.open(waLink, '_blank', 'noopener,noreferrer'); } }] : []),
                        ...(contact.email?.trim() ? [{ label: 'Send email', onClick: () => { void sendEmail(contact); } }] : []),
                        { label: 'Log an issue', onClick: () => { setIssueStartContactId(contact.id); setShowIssues(true); } },
                        { label: 'Edit contact', onClick: () => setEditingContact(contact) },
                      ]}
                    />
                  </div>
                  {infoOpenId === contact.id && (
                    <div className="mt-1.5 inline-block max-w-full rounded-xl bg-slate-800 px-3 py-2 text-xs text-white shadow-lg">
                      <p>{contact.phone || 'No phone'}</p>
                      {contact.email?.trim() && (
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                          <button type="button" onClick={() => { void sendEmail(contact); }} className="max-w-full break-words text-left text-sky-200 underline">{contact.email.trim()}</button>
                          <button
                            type="button"
                            onClick={() => { void copyEmail(contact.id, contact.email!.trim()); }}
                            className="shrink-0 rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-white/25"
                          >
                            {copiedEmailId === contact.id ? 'Copied!' : 'Copy'}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                  <p className="mt-1 text-[12.5px] text-gray-500">{contact.phone || 'No phone'}{assigned ? ` · assigned ${assigned}` : ''}</p>
                  {!phoneOk && (
                    <div className="mt-2.5 rounded-[12px] bg-amber-50 text-amber-800">
                      <button
                        type="button"
                        onClick={() => setNumberHelpOpen((prev) => ({ ...prev, [contact.id]: !helpOpen }))}
                        aria-expanded={helpOpen}
                        className="flex min-h-[40px] w-full items-center gap-2 px-3 py-2.5 text-left"
                      >
                        <svg className="h-4 w-4 flex-none" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /></svg>
                        <span className="min-w-0 flex-1 whitespace-nowrap text-[12.5px] font-bold">Number needs checking</span>
                        <span className="whitespace-nowrap text-[12px] font-semibold text-amber-700/80">{helpOpen ? 'Hide' : 'Details'}</span>
                        <svg className={`h-4 w-4 flex-none transition-transform ${helpOpen ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="m9 5 7 7-7 7" /></svg>
                      </button>
                      {helpOpen && (
                        <div className="px-3 pb-3">
                          <p className="mb-2.5 text-[12.5px] leading-snug text-amber-900/80">
                            {contact.phone?.trim() ? `They wrote “${contact.phone.trim()}”, which isn't a phone number.` : 'They have no phone number on file.'}
                          </p>
                          <NoNumberHelp
                            contact={contact}
                            hideHeader
                            onEmailInstead={() => { void sendEmail(contact); }}
                            onHaveNumber={() => setEditingContact(contact)}
                          />
                        </div>
                      )}
                    </div>
                  )}
                  <FormQuestionBox contact={contact} onChange={replaceContact} className="mt-2.5" />
                  {contact.notes?.trim() && (
                    <p className="mt-2.5 whitespace-pre-wrap rounded-[10px] bg-[#f6f7f9] px-3 py-2.5 text-[13px] leading-normal text-gray-700">{contact.notes}</p>
                  )}
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <button type="button" onClick={() => openTemplates(contact, 'whatsapp')} className="min-h-[40px] rounded-[10px] border border-[#ffdeca] bg-[#fff8f3] px-2 py-2 text-[12.5px] font-semibold text-[#c2410c]">
                      Templates
                    </button>
                    {waLink ? (
                      <a href={waLink} target="_blank" rel="noreferrer" className="inline-flex min-h-[40px] items-center justify-center rounded-[10px] border border-gray-200 bg-white px-2 py-2 text-[12.5px] font-semibold text-gray-700">WhatsApp</a>
                    ) : (
                      <span className="inline-flex min-h-[40px] items-center justify-center rounded-[10px] border border-gray-100 bg-gray-50 px-2 py-2 text-[12.5px] font-semibold text-gray-400">WhatsApp</span>
                    )}
                    {contact.phone && phoneOk ? (
                      <a href={`tel:${contact.phone.replace(/[^\d+]/g, '')}`} className="inline-flex min-h-[40px] items-center justify-center rounded-[10px] border border-gray-200 bg-white px-2 py-2 text-[12.5px] font-semibold text-gray-700">Call</a>
                    ) : (
                      <span className="inline-flex min-h-[40px] items-center justify-center rounded-[10px] border border-gray-100 bg-gray-50 px-2 py-2 text-[12.5px] font-semibold text-gray-400">Call</span>
                    )}
                  </div>
                  <FollowUpStatusFlow status={status} className="mt-3.5" />
                  <div className="mt-3">
                    <AppSelect
                      label="Where do they stand?"
                      value={status}
                      onChange={(value) => handleStatusChange(contact, value as FollowUpStatus)}
                      options={supportStatusOptions(status)}
                      placeholder="Choose status"
                    />
                  </div>
                  {(status === 'REGISTERED' || status === 'LOGIN_SHARED' || status === 'LOGIN_ISSUE') && <LoginDetailsCard followUpContactId={contact.id} startDate={contact.cohortStartDate} email={contact.email} className="mt-3" />}
                </section>
              );
            })}

          </>
        )}

        {tab === 'it' && isItSupport && (
          <>
            <div className="flex items-center justify-end gap-2">
              <div className="grid grid-cols-2 gap-0.5 rounded-full bg-[#f2f2f4] p-1 text-xs font-semibold">
                <button type="button" onClick={() => setItShowResolved(false)} aria-pressed={!itShowResolved} className={`rounded-full px-3.5 py-1.5 transition ${!itShowResolved ? 'bg-white text-gray-900 shadow-[0_1px_3px_rgba(17,24,39,0.12)]' : 'text-gray-600'}`}>
                  Open ({openItIssues.length})
                </button>
                <button
                  type="button"
                  onClick={() => setItShowResolved(true)}
                  disabled={resolvedItIssues.length === 0}
                  aria-pressed={itShowResolved}
                  className={`rounded-full px-3.5 py-1.5 transition disabled:cursor-default disabled:opacity-40 ${itShowResolved ? 'bg-white text-gray-900 shadow-[0_1px_3px_rgba(17,24,39,0.12)]' : 'text-gray-600'}`}
                >
                  Resolved ({resolvedItIssues.length})
                </button>
              </div>
              <InfoTip label="About IT issues">
                <span className="block">When a support picks Issue with login, it shows here with what they wrote.</span>
                <span className="mt-2 block">Reach the person or their support, send a new login code if needed, then mark it resolved. If they have signed in, they move to Logged in. If not yet, back to Login shared.</span>
              </InfoTip>
            </div>

            {visibleItIssues.length === 0 ? (
              <section className={`${IT_SURFACE} px-6 py-10 text-center`}>
                <p className="text-[17px] font-semibold text-gray-900">No login issues</p>
                <p className="mt-1 text-[13px] leading-normal text-gray-500">When a support in your hub reports someone who can't get into the app, they appear here.</p>
              </section>
            ) : visibleItIssues.map((issue) => {
              const open = issue.status === 'OPEN';
              const waLink = issue.contactPhone ? buildWhatsAppLink(issue.contactPhone, '') : null;
              const supportWaLink = issue.ownerPhone ? buildWhatsAppLink(issue.ownerPhone, `Hello ${issue.ownerName?.split(' ')[0] ?? ''}, about ${issue.contactName}'s login: `) : null;
              return (
                <section key={issue.id} className={`${IT_SURFACE} p-5`}>
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[17px] font-semibold text-gray-900">{issue.contactName}</p>
                      <p className="mt-0.5 text-[13px] text-gray-500">{issue.contactPhone || 'No phone'}{issue.cohortName ? ` · ${issue.cohortName}` : ''}</p>
                    </div>
                    <span className={`flex-none whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold ${open ? 'bg-orange-100/80 text-orange-700' : 'bg-emerald-100/80 text-emerald-700'}`}>{open ? 'Open' : 'Resolved'}</span>
                  </div>

                  <blockquote className="mt-3.5 whitespace-pre-wrap rounded-2xl bg-[#f5f5f7] px-4 py-3 text-[14px] leading-normal text-gray-800">{issue.description}</blockquote>
                  <p className="mt-2 px-1 text-[12px] text-gray-500">Reported by {issue.reportedByName || 'a support'} · {reportedWhen(issue.updatedAt || issue.createdAt)}</p>
                  {issue.signedIn && open && (
                    <span className="mt-2 inline-flex rounded-full bg-emerald-100/80 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700">They have signed in</span>
                  )}

                  <div className="mt-4 grid grid-cols-2 gap-2">
                    {waLink ? (
                      <a href={waLink} target="_blank" rel="noreferrer" className={IT_SECONDARY}>WhatsApp</a>
                    ) : (
                      <span className={`${IT_SECONDARY} opacity-50`}>WhatsApp</span>
                    )}
                    {issue.contactPhone ? (
                      <a href={`tel:${issue.contactPhone.replace(/[^\d+]/g, '')}`} className={IT_SECONDARY}>Call</a>
                    ) : (
                      <span className={`${IT_SECONDARY} opacity-50`}>Call</span>
                    )}
                  </div>

                  <div className="mt-4 flex items-center gap-3 border-t border-[#f0f0f2] pt-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-400">Their support</p>
                      <p className="truncate text-[14px] font-semibold text-gray-900">{issue.ownerName || 'Not assigned'}</p>
                    </div>
                    {supportWaLink && (
                      <a href={supportWaLink} target="_blank" rel="noreferrer" className="flex-none rounded-full bg-emerald-100/80 px-3 py-1.5 text-xs font-semibold text-emerald-700">WhatsApp {issue.ownerName?.split(' ')[0]}</a>
                    )}
                  </div>

                  {open && <LoginDetailsCard followUpContactId={issue.contactId} startDate={issue.cohortStartDate} email={allContacts.find((c) => c.id === issue.contactId)?.email} className="mt-3" />}
                  {open ? (
                    <button
                      type="button"
                      onClick={() => { setResolvingIssue(issue); setResolveNote(''); }}
                      className={`${IT_PRIMARY} mt-4`}
                    >
                      Mark resolved
                    </button>
                  ) : (
                    <p className="mt-3 border-t border-[#f0f0f2] pt-3 text-[12.5px] text-gray-500">
                      Resolved{issue.resolvedByName ? ` by ${issue.resolvedByName}` : ''}{issue.resolvedAt ? ` · ${reportedWhen(issue.resolvedAt)}` : ''}{issue.resolution ? `: ${issue.resolution}` : ''}
                    </p>
                  )}
                </section>
              );
            })}
          </>
        )}
      </div>

      {loginIssueContact && (
        <LoginIssuePopup
          contactName={loginIssueContact.fullName}
          onCancel={() => setLoginIssueContact(null)}
          onSubmit={async (description) => {
            // Saved first so the alert that the status change sends can quote it.
            await followUpLoginIssuesApi.report(loginIssueContact.id, description);
            const contact = loginIssueContact;
            setLoginIssueContact(null);
            await handleFieldChange(contact, buildStatusPatch('LOGIN_ISSUE') as FollowUpContactUpdate);
            void loadItIssues();
          }}
        />
      )}

      <ModalShell
        isOpen={!!resolvingIssue}
        onClose={() => { if (!resolveSaving) setResolvingIssue(null); }}
        title="Mark resolved"
        subtitle={resolvingIssue ? resolvingIssue.contactName : undefined}
        footer={(
          <>
            <button type="button" onClick={() => setResolvingIssue(null)} disabled={resolveSaving} className="rounded-full bg-[#f2f2f4] px-5 py-2.5 text-sm font-semibold text-gray-700 disabled:opacity-50">Cancel</button>
            <button type="button" onClick={() => { void submitResolve(); }} disabled={resolveSaving} className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-60">
              {resolveSaving ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Saving…</span>) : 'Mark resolved'}
            </button>
          </>
        )}
      >
        <p className="text-[13px] leading-normal text-gray-600">
          {resolvingIssue?.signedIn
            ? 'They have signed in, so they will move to Logged in and their support is told.'
            : "They haven't signed in yet, so they will go back to Login shared and their support is told."}
        </p>
        <label className="mt-4 block">
          <span className="mb-1.5 block text-[13px] font-semibold text-gray-900">What fixed it? (optional)</span>
          <textarea
            value={resolveNote}
            onChange={(e) => setResolveNote(e.target.value)}
            placeholder="e.g. Sent a new login code"
            className={`${IT_FIELD} min-h-[96px] resize-y`}
          />
        </label>
      </ModalShell>

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
        channel={messageChannel}
        onHaveNumber={(contact) => { setMessagingContact(null); setEditingContact(contact); }}
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

      <ModalShell isOpen={showIssues} onClose={() => { setShowIssues(false); setIssueStartContactId(null); }} title="Issues" subtitle="Questions and blockers on your follow-ups." wide>
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
          startWithContactIds={issueStartContactId ? [issueStartContactId] : undefined}
        />
      </ModalShell>

      {showExport && <ExportContactsPopup contacts={cohortScopedContacts} closedToggle onClose={() => setShowExport(false)} />}
    </div>
  );
};

export default SupportMobilisationPage;
