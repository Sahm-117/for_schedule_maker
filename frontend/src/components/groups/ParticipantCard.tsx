import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import ModalShell from '../followups/ModalShell';
import InfoTip from '../InfoTip';
import AppSelect from '../AppSelect';
import DepartmentHandoff from '../participants/DepartmentHandoff';
import ProfileOverview from '../participants/ProfileOverview';
import RetakingChip, { RetakeMarkModal } from '../participants/RetakingChip';
import { useToast } from '../Toast';
import { departmentReferralsApi, faithHelpRequestsApi, faithProjectsApi, participantCheckInsApi, participantFlagsApi, participantsApi } from '../../services/api';
import { buildParticipantMessageLink, buildWhatsAppLink } from '../../utils/phone';
import WhatsAppIcon from '../WhatsAppIcon';
import { FAITH_PROJECT_STATUS_LABEL, shortMoment } from '../../utils/participantApp';
import FaithProjectHistory from '../faithProjects/FaithProjectHistory';
import { FAITH_HELP_REASON_LABELS } from '../../types';
import type { OnboardingState, DepartmentReferral, FaithHelpRequest, FaithProject, FaithProjectCategory, FaithProjectStatus, FaithProjectVersion, Participant, ParticipantAppInfo, ParticipantCheckIn, ParticipantFlag, ParticipantHandover, ParticipantNote, ParticipantUpdate, RetakeMatch, Testimony } from '../../types';
import { appUseLine } from '../../utils/appUse';
import { PROGRESS_STEPS, StepPill } from '../OnboardingStepPills';
import NotOpenedTag from '../participants/NotOpenedTag';
import Spinner from '../Spinner';

const TESTIMONY_STATUS_CHIP: Record<Testimony['status'], { label: string; cls: string }> = {
  PENDING: { label: 'Waiting for approval', cls: 'bg-amber-100/80 text-amber-700' },
  APPROVED: { label: 'Shared', cls: 'bg-emerald-100/80 text-emerald-700' },
  HIDDEN: { label: 'Hidden', cls: 'bg-neutral-100 text-neutral-600' },
};

// Faith project states mapped onto the V2 design's labels.
const FP_CHIP: Record<FaithProjectStatus, { label: string; cls: string }> = {
  NOT_DRAFTED: { label: FAITH_PROJECT_STATUS_LABEL.NOT_DRAFTED, cls: 'bg-[#f6f7f9] text-gray-500' },
  SAVED: { label: FAITH_PROJECT_STATUS_LABEL.SAVED, cls: 'bg-[#f2fbf5] text-[#15803d]' },
};

const CONCERN_REASONS = ['Attendance', 'Engagement', 'Emotional wellbeing', 'Spiritual struggle', 'Other'];

const initialsOf = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('');

const TEXT_INPUT = 'w-full rounded-xl border border-gray-200 px-3.5 py-3 text-[15px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';

// Bottom sheet in the design's style, portalled so no ancestor can clip it.
const Sheet: React.FC<{
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  headerExtra?: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: string;
  children: React.ReactNode;
}> = ({ open, onClose, title, subtitle, headerExtra, footer, maxWidth = 'max-w-[560px]', children }) => {
  const downOnOverlay = useRef(false);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-[rgba(17,24,39,0.42)]"
        onPointerDown={(e) => { downOnOverlay.current = e.target === e.currentTarget; }}
        onClick={(e) => { if (downOnOverlay.current && e.target === e.currentTarget) onClose(); downOnOverlay.current = false; }}
      />
      <div className={`relative z-10 max-h-[88vh] w-full ${maxWidth} overflow-y-auto rounded-t-[20px] bg-white shadow-[0_-8px_40px_-12px_rgba(0,0,0,0.3)] sm:m-4 sm:rounded-[20px]`}>
        <div className="sticky top-0 z-[2] flex items-center gap-2.5 border-b border-[#eef0f4] bg-white px-[18px] py-4">
          <div className="min-w-0">
            <h3 className="text-base font-bold text-gray-900">{title}</h3>
            {subtitle && <p className="mt-0.5 text-[12.5px] text-gray-500">{subtitle}</p>}
          </div>
          <div className="ml-auto flex items-center gap-2.5">
            {headerExtra}
            <button type="button" onClick={onClose} aria-label="Close" className="h-[34px] w-[34px] rounded-[10px] border border-gray-200 bg-white text-sm text-gray-600">✕</button>
          </div>
        </div>
        <div className="p-[18px]">{children}</div>
        {footer && (
          <div className="sticky bottom-0 flex gap-2.5 border-t border-[#eef0f4] bg-white/90 px-[18px] py-[13px]">{footer}</div>
        )}
      </div>
    </div>,
    document.body
  );
};

const CopyPhoneButton: React.FC<{ phone?: string | null }> = ({ phone }) => {
  const [copied, setCopied] = useState(false);
  if (!phone) return null;
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(phone);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      }}
      className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-orange-100 bg-orange-50/70 px-2.5 py-1 text-xs font-semibold text-gray-500 transition-colors hover:border-orange-200 hover:bg-orange-100 hover:text-primary"
      title="Copy phone number"
      aria-label={`Copy phone number ${phone}`}
    >
      <span className="truncate">{phone}</span>
      <span className="flex-shrink-0 text-[11px]">{copied ? 'Copied' : 'Copy'}</span>
    </button>
  );
};

// Read-only registration details (from the church platform / Google Form). Empty values show "—".
const RegistrationDetails: React.FC<{ participant: Participant }> = ({ participant }) => {
  const { email, gender, ageRange, departments, registrationDate, smartRequest } = participant;
  const regDate = registrationDate ? registrationDate.slice(0, 10) : null;
  const dash = <span className="text-gray-400">—</span>;
  const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{label}</p>
      <div className="mt-0.5 break-words text-sm text-gray-700">{children}</div>
    </div>
  );
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Row label="Email">{email ? <span className="break-all">{email}</span> : dash}</Row>
      <Row label="Gender">{gender || dash}</Row>
      <Row label="Age range">{ageRange || dash}</Row>
      <Row label="Registration date">{regDate || dash}</Row>
      <div className="sm:col-span-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Department(s)</p>
        {departments && departments.length > 0 ? (
          <div className="mt-1 flex flex-wrap gap-1.5">
            {departments.map((d) => (
              <span key={d} className="max-w-full break-words rounded-full bg-indigo-100/80 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">{d}</span>
            ))}
          </div>
        ) : <div className="mt-0.5 text-sm">{dash}</div>}
      </div>
      <div className="sm:col-span-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">SMART request</p>
        {smartRequest ? <p className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-6 text-gray-700">{smartRequest}</p> : <div className="mt-0.5 text-sm">{dash}</div>}
      </div>
    </div>
  );
};

const NOTE_TITLE: Record<string, string> = { MEETING: 'Meeting note', HANDOVER: 'Handover note', CHECK_IN: 'Check-in' };

// "How it went: …\n\nNeeds attention: …" becomes labelled paragraphs.
const noteSections = (body: string) =>
  body.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean).map((part) => {
    const match = part.match(/^(How it went|Needs attention):\s*([\s\S]*)$/);
    return match ? { label: match[1], text: match[2] } : { label: null as string | null, text: part };
  });

// Notes as a tidy accordion: title, author and date on one line; tap to read.
const NotesAccordion: React.FC<{ notes: ParticipantNote[] }> = ({ notes }) => {
  const [openId, setOpenId] = useState<string | null>(notes[0]?.id ?? null);
  const [showAll, setShowAll] = useState(false);
  if (notes.length === 0) return null;
  const shown = showAll ? notes : notes.slice(0, 4);
  return (
    <div className="mt-3 space-y-2">
      {shown.map((note) => {
        const open = openId === note.id;
        const sections = noteSections(note.body);
        const date = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(new Date(note.createdAt));
        return (
          <div key={note.id} className="overflow-hidden rounded-xl border border-[#f1f2f5] bg-[#fafafb]">
            <button
              type="button"
              onClick={() => setOpenId(open ? null : note.id)}
              aria-expanded={open}
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold text-gray-900">{NOTE_TITLE[note.noteType] ?? 'Note'}</span>
                <span className="block truncate text-[11.5px] text-gray-500">{note.authorName || 'Support'} · {date}</span>
              </span>
              {sections.some((section) => section.label === 'Needs attention') && (
                <span className="flex-none rounded-full bg-amber-100/80 px-2 py-0.5 text-[10.5px] font-semibold text-amber-700">Concern</span>
              )}
              <svg className={`h-4 w-4 flex-none text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m6 9 6 6 6-6" />
              </svg>
            </button>
            {open && (
              <div className="space-y-2.5 border-t border-[#f1f2f5] bg-white px-3 py-3">
                {sections.map((section, index) => (
                  <div key={index}>
                    {section.label && <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{section.label}</p>}
                    <p className="mt-0.5 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-gray-700">{section.text}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
      {notes.length > 4 && (
        <button type="button" onClick={() => setShowAll((v) => !v)} className="text-xs font-semibold text-primary">
          {showAll ? 'Show fewer' : `Show all ${notes.length} notes`}
        </button>
      )}
    </div>
  );
};

const EditNameModal: React.FC<{
  participant: Participant | null;
  onClose: () => void;
  onSaved: (p: Participant) => void;
}> = ({ participant, onClose, onSaved }) => {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (participant) { setName(participant.fullName); setError(''); }
  }, [participant]);

  if (!participant) return null;

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) { setError('Name is required'); return; }
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      const { participant: updated } = await participantsApi.update(participant.id, { fullName: trimmedName });
      onSaved(updated);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell
      isOpen={!!participant}
      onClose={onClose}
      title="Edit name"
      footer={(
        <>
          <button type="button" onClick={onClose} className="rounded-2xl border border-orange-200 px-5 py-2.5 text-sm font-semibold text-gray-600 hover:bg-orange-50">Cancel</button>
          <button type="button" onClick={() => { void handleSave(); }} disabled={saving} className="rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
            {saving ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Saving…</span>) : 'Save'}
          </button>
        </>
      )}
    >
      <div className="flex flex-col gap-4">
        {error && <p className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-600">{error}</p>}
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Full name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-xl border border-orange-200 px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            placeholder="e.g. Adaeze Obi"
          />
        </div>
      </div>
    </ModalShell>
  );
};

interface ParticipantCardProps {
  participant: Participant;
  groupName: string | null;
  project: FaithProject | null;
  notes: ParticipantNote[];
  handovers: ParticipantHandover[];
  weekId: number | null;
  userId: string;
  supportName: string;
  faithProjectCategories: FaithProjectCategory[];
  openFlag: ParticipantFlag | null;
  onProjectSaved: (project: FaithProject) => void;
  onParticipantUpdated: (participant: Participant) => void;
  onAddNote: () => void;
  onFlagRaised: (flag: ParticipantFlag) => void;
  onFlagCleared: (flagId: string) => void;
  /** When they wrote this week's reflection in the participant app (never the text). */
  reflectedAt?: string | null;
  /** An unanswered "I need help" from the participant app. */
  helpRequest?: ParticipantCheckIn | null;
  onHelpHandled?: (checkIn: ParticipantCheckIn) => void;
  /** Has an active app login but no saved push subscription — can't get alerts. */
  noAlerts?: boolean;
  /** Signed in, but never opened the app from their Home Screen. */
  notInstalled?: boolean;
  /** Their phone type and when the app was last opened, for the line under the tags. */
  appInfo?: ParticipantAppInfo;
  /** The phone details have loaded, so no line really means "not seen". */
  appInfoLoaded?: boolean;
  /** Their onboarding steps. Once all are done the card just says Ready. */
  onboarding?: OnboardingState | null;
  /** Open ("is it going well?") faith help requests for this participant. */
  faithHelpRequests?: FaithHelpRequest[];
  onFaithHelpResolved?: (request: FaithHelpRequest) => void;
  /** This participant's testimonies, every status. */
  testimonies?: Testimony[];
  /** Marks these testimony ids as viewed by this support (clears the "New testimony" pill). */
  onTestimonyViewed?: (ids: string[]) => void;
  /** Records in other cohorts on the same number, for the Retaking chip. */
  retakeMatches?: RetakeMatch[];
}

const ParticipantCard: React.FC<ParticipantCardProps> = ({
  participant,
  groupName,
  project,
  notes,
  handovers,
  weekId,
  userId,
  supportName,
  faithProjectCategories,
  openFlag,
  onProjectSaved,
  onParticipantUpdated,
  onAddNote,
  onFlagRaised,
  onFlagCleared,
  reflectedAt,
  helpRequest,
  onHelpHandled,
  noAlerts,
  notInstalled,
  appInfo,
  appInfoLoaded,
  onboarding,
  faithHelpRequests,
  onFaithHelpResolved,
  testimonies,
  onTestimonyViewed,
  retakeMatches,
}) => {
  const appLine = appUseLine(appInfo);
  const [retakeMarkOpen, setRetakeMarkOpen] = useState(false);
  const updateRetake = async (patch: ParticipantUpdate) => {
    const { participant: saved } = await participantsApi.update(participant.id, patch);
    onParticipantUpdated({ ...participant, ...saved, groupId: participant.groupId, groupName: participant.groupName });
  };
  const [handlingHelp, setHandlingHelp] = useState(false);
  const markHelpHandled = async () => {
    if (!helpRequest) return;
    setHandlingHelp(true);
    try {
      onHelpHandled?.((await participantCheckInsApi.markHandled(helpRequest.id, userId)).checkIn);
    } catch { /* stays visible to try again */ } finally {
      setHandlingHelp(false);
    }
  };
  const [resolvingHelpId, setResolvingHelpId] = useState<string | null>(null);
  const resolveFaithHelp = async (requestId: string) => {
    setResolvingHelpId(requestId);
    try {
      onFaithHelpResolved?.((await faithHelpRequestsApi.resolve(requestId, userId)).request);
    } catch { /* stays visible to try again */ } finally {
      setResolvingHelpId(null);
    }
  };
  // Shared "just my support" testimony -- the one thing on this list that's
  // addressed to this support specifically, so it gets its own labelled
  // section (like the faith-help box) instead of hiding in the View sheet.
  const supportTestimonies = (testimonies ?? []).filter((t) => t.visibility === 'SUPPORT' && t.status === 'APPROVED');
  const sharedTestimony = supportTestimonies[0] ?? null;
  const unseenTestimonyIds = supportTestimonies.filter((t) => !t.viewedAt).map((t) => t.id);
  const [menu, setMenu] = useState<'closed' | 'main' | 'concern'>('closed');
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [viewOpen, setViewOpen] = useState(false);
  const showToast = useToast();
  const [referrals, setReferrals] = useState<DepartmentReferral[]>([]);
  const loadReferrals = () => {
    departmentReferralsApi.getForParticipants([participant.id])
      .then((r) => setReferrals(r.referrals))
      .catch(() => setReferrals([]));
  };
  useEffect(() => {
    if (viewOpen) loadReferrals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewOpen, participant.id]);
  // Opening the card clears the "New testimony" pill.
  useEffect(() => {
    if (viewOpen && unseenTestimonyIds.length > 0) onTestimonyViewed?.(unseenTestimonyIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewOpen, unseenTestimonyIds.join(',')]);
  const [editingName, setEditingName] = useState(false);
  const [fpOpen, setFpOpen] = useState(false);

  const flag = openFlag;
  const [concernOpen, setConcernOpen] = useState(false);
  const [concernSaving, setConcernSaving] = useState(false);
  const [concernError, setConcernError] = useState('');
  const [concernReason, setConcernReason] = useState<string | null>(null);
  const [concernOther, setConcernOther] = useState('');
  const [concernNote, setConcernNote] = useState('');
  const [concernTouched, setConcernTouched] = useState(false);

  const status = project?.status ?? 'NOT_DRAFTED';
  const chip = FP_CHIP[status];
  // Opens WhatsApp on their number; hidden when there is no usable number (a teen's is hidden from most supports).
  const messageLink = buildParticipantMessageLink(participant.phone, participant.fullName);

  useEffect(() => {
    if (menu === 'closed') return undefined;
    const place = () => {
      const rect = menuButtonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = 210;
      const left = Math.max(12, rect.right - width);
      // The concern list is tall: open upwards when there is more room above, and never run off screen.
      const spaceBelow = window.innerHeight - rect.bottom - 18;
      const spaceAbove = rect.top - 18;
      const openUp = spaceBelow < 320 && spaceAbove > spaceBelow;
      setMenuStyle(openUp
        ? { position: 'fixed', bottom: window.innerHeight - rect.top + 6, left, width, maxHeight: spaceAbove, overflowY: 'auto', zIndex: 110 }
        : { position: 'fixed', top: rect.bottom + 6, left, width, maxHeight: spaceBelow, overflowY: 'auto', zIndex: 110 });
    };
    const close = (event: PointerEvent) => {
      if (menuRef.current?.contains(event.target as Node) || menuButtonRef.current?.contains(event.target as Node)) return;
      setMenu('closed');
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    document.addEventListener('pointerdown', close);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      document.removeEventListener('pointerdown', close);
    };
  }, [menu]);

  const openConcern = (reason: string) => {
    setConcernReason(reason);
    setConcernOther('');
    setConcernNote('');
    setConcernTouched(false);
    setConcernError('');
    setMenu('closed');
  };

  const saveConcern = async () => {
    if (!concernReason || concernSaving) return;
    const isOther = concernReason === 'Other';
    if (isOther && !concernOther.trim()) { setConcernTouched(true); return; }
    setConcernSaving(true);
    setConcernError('');
    try {
      const { flag: saved } = await participantFlagsApi.raise({
        participantId: participant.id,
        participantName: participant.fullName,
        groupId: participant.groupId ?? null,
        weekId,
        reason: isOther ? concernOther.trim() : concernReason,
        note: concernNote.trim() || null,
        raisedById: userId,
        raisedByName: supportName,
      });
      onFlagRaised(saved);
      setConcernReason(null);
    } catch (err) {
      setConcernError(err instanceof Error ? err.message : 'This flag could not be saved.');
    } finally {
      setConcernSaving(false);
    }
  };

  const clearFlag = async () => {
    if (!flag) return;
    setMenu('closed');
    try {
      await participantFlagsApi.clear(flag.id, userId);
      onFlagCleared(flag.id);
      setConcernOpen(false);
    } catch {
      /* flag stays visible if clearing fails */
    }
  };

  const menuItemCls = 'w-full rounded-[10px] px-3 py-2.5 text-left text-[13px] font-semibold text-gray-800 hover:bg-gray-50';

  return (
    <div className="rounded-[18px] border border-[#eef0f4] bg-white p-4 shadow-[0_2px_8px_-3px_rgba(17,24,39,0.10)]">
      <div className="flex flex-wrap items-center gap-3">
        <div className="grid h-10 w-10 flex-none place-items-center rounded-full bg-[#fff1e6] text-sm font-bold text-[#c2410c]">{initialsOf(participant.fullName)}</div>
        <div className="min-w-0 flex-auto">
          <p className="truncate text-[15px] font-bold text-gray-900">{participant.fullName}</p>
          <p className="mt-0.5 text-xs text-gray-500">{groupName || 'No group'}</p>
        </div>
        {flag && (
          <button
            type="button"
            onClick={() => setConcernOpen((open) => !open)}
            className="inline-flex items-center gap-1.5 rounded-full border border-[#fde68a] bg-[#fffbeb] py-1 pl-2.5 pr-2 text-[11px] font-bold text-[#92400e]"
          >
            Needs attention
            <svg className={`h-3.5 w-3.5 transition-transform ${concernOpen ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m9 5 7 7-7 7" /></svg>
          </button>
        )}
        {messageLink && (
          <a
            href={messageLink}
            target="_blank"
            rel="noreferrer"
            aria-label={`WhatsApp ${participant.fullName}`}
            title="Message on WhatsApp"
            className="grid h-9 w-9 flex-none place-items-center rounded-[10px] border border-gray-200 bg-white"
          >
            <WhatsAppIcon />
          </a>
        )}
        <button
          ref={menuButtonRef}
          type="button"
          onClick={() => setMenu((current) => (current === 'closed' ? 'main' : 'closed'))}
          aria-label="Participant actions"
          className="grid h-9 w-9 flex-none place-items-center rounded-[10px] border border-gray-200 bg-white text-gray-700"
        >
          <svg width="16" height="16" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true"><path d="M10 4.25a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5Zm0 4.5a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5Zm-1.25 5.75a1.25 1.25 0 1 1 2.5 0 1.25 1.25 0 0 1-2.5 0Z" /></svg>
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {participant.status === 'ARCHIVED' && (
          <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] font-semibold text-neutral-600">Archived</span>
        )}
        <RetakingChip participant={participant} matches={retakeMatches} onUpdate={updateRetake} />
        {notInstalled && (
          <NotOpenedTag className="px-2.5 py-1 text-[11px]" />
        )}
        {noAlerts && (
          <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] font-semibold text-neutral-600" title="They have an app login but can't receive push notifications on any device.">
            No alerts
          </span>
        )}
        <button
          type="button"
          onClick={() => setFpOpen(true)}
          title="Open faith project"
          className={`inline-flex items-center gap-1.5 rounded-full py-1 pl-2.5 pr-2 text-[11px] font-bold ${chip.cls}`}
        >
          <span className="font-semibold opacity-70">Faith project</span>
          <span>{chip.label}</span>
          {status === 'SAVED' && !project?.categoryId && (
            <span className="font-medium opacity-60" title="No Faith Project category chosen yet. Open it to pick one.">· No category</span>
          )}
          <svg width="10" height="10" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.4" d="m9 5 7 7-7 7" /></svg>
        </button>
        {reflectedAt && (
          <span className="rounded-full bg-sky-100/80 px-2.5 py-1 text-[11px] font-semibold text-sky-700" title="They wrote this week's reflection in the app. Only they can read it.">
            Reflected {shortMoment(reflectedAt)}
          </span>
        )}
        {unseenTestimonyIds.length > 0 && (
          <span className="rounded-full bg-emerald-100/80 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
            New testimony
          </span>
        )}
      </div>
      {onboarding && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {onboarding.completed ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100/80 px-2.5 py-1 text-xs font-semibold text-emerald-700">
              <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="m5 13 4 4L19 7" /></svg>
              Ready
            </span>
          ) : (
            PROGRESS_STEPS.map((step) => <StepPill key={step.key} label={step.label} done={onboarding[step.key]} />)
          )}
        </div>
      )}
      {(appLine || appInfoLoaded) && <p className="mt-2 text-[11.5px] text-gray-500">{appLine || 'Not seen in the app yet'}</p>}

      {helpRequest && (
        <div className="mt-2.5 rounded-xl bg-red-100/80 px-[13px] py-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.04em] text-red-700">Asked for help · {shortMoment(helpRequest.createdAt)}</p>
          <p className="mt-1 text-[13px] leading-relaxed text-gray-700">They answered &ldquo;I need help&rdquo; in the app. Reach out today.</p>
          <div className="mt-2.5 flex gap-2">
            {buildWhatsAppLink(participant.phone, '') && (
              <a href={buildWhatsAppLink(participant.phone, '') ?? undefined} target="_blank" rel="noreferrer" className="inline-flex min-h-[38px] items-center rounded-[10px] bg-white px-3 text-[12.5px] font-semibold text-gray-700">WhatsApp</a>
            )}
            <button type="button" onClick={() => { void markHelpHandled(); }} disabled={handlingHelp} className="min-h-[38px] rounded-[10px] bg-red-700 px-3 text-[12.5px] font-semibold text-white disabled:opacity-60">
              {handlingHelp ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Saving…</span>) : 'I have reached out'}
            </button>
          </div>
        </div>
      )}

      {(faithHelpRequests ?? []).map((request) => (
        <div key={request.id} className="mt-2.5 rounded-xl bg-orange-100/80 px-[13px] py-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.04em] text-orange-700">Faith project isn&apos;t going well · {shortMoment(request.createdAt)}</p>
          <p className="mt-1 text-[13px] font-semibold text-gray-800">{FAITH_HELP_REASON_LABELS[request.reason]}</p>
          {request.note && <p className="mt-1 text-[13px] leading-relaxed text-gray-700">{request.note}</p>}
          <div className="mt-2.5 flex gap-2">
            {buildWhatsAppLink(participant.phone, '') && (
              <a href={buildWhatsAppLink(participant.phone, '') ?? undefined} target="_blank" rel="noreferrer" className="inline-flex min-h-[38px] items-center rounded-[10px] bg-white px-3 text-[12.5px] font-semibold text-gray-700">WhatsApp</a>
            )}
            <button type="button" onClick={() => { void resolveFaithHelp(request.id); }} disabled={resolvingHelpId === request.id} className="min-h-[38px] rounded-[10px] bg-orange-700 px-3 text-[12.5px] font-semibold text-white disabled:opacity-60">
              {resolvingHelpId === request.id ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Saving…</span>) : 'Mark resolved'}
            </button>
          </div>
        </div>
      ))}

      {sharedTestimony && (
        <div className="mt-2.5 rounded-xl bg-emerald-100/80 px-[13px] py-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.04em] text-emerald-700">Testimony · {shortMoment(sharedTestimony.createdAt)}</p>
          {sharedTestimony.title && <p className="mt-1 text-[13px] font-semibold text-gray-800">{sharedTestimony.title}</p>}
          <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-gray-700">{sharedTestimony.body}</p>
        </div>
      )}

      {flag && concernOpen && (
        <div className="mt-2.5 rounded-xl border border-[#fde68a] bg-[#fffbeb] px-[13px] py-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.04em] text-[#92400e]">{flag.reason}</p>
          <p className="mt-1 text-[13px] leading-relaxed text-gray-700">{flag.note || 'No note added.'}</p>
          <p className="mt-1.5 text-[11.5px] text-gray-400">
            Flagged by {flag.raisedByName || 'Support'}{flag.weekNumber ? ` · Week ${flag.weekNumber}` : ''}
          </p>
        </div>
      )}

      {menu !== 'closed' && createPortal(
        <div ref={menuRef} style={menuStyle} className="flex flex-col gap-0.5 rounded-[14px] border border-[#eef0f4] bg-white p-1.5 shadow-[0_18px_40px_-18px_rgba(17,24,39,0.3)]">
          {menu === 'main' ? (
            <>
              <button type="button" className={menuItemCls} onClick={() => { setMenu('closed'); setViewOpen(true); }}>View</button>
              {messageLink && (
                <a href={messageLink} target="_blank" rel="noreferrer" className={`${menuItemCls} flex items-center gap-2`} onClick={() => { window.setTimeout(() => setMenu('closed'), 0); }}>
                  <WhatsAppIcon />
                  Send message
                </a>
              )}
              <button type="button" className={menuItemCls} onClick={() => setMenu('concern')}>{flag ? 'Attention flagged' : 'Flag concern'}</button>
              <button type="button" className={menuItemCls} onClick={() => { setMenu('closed'); setRetakeMarkOpen(true); }}>Mark as retaking</button>
            </>
          ) : (
            <>
              <button type="button" className="w-full rounded-[10px] px-3 py-2 text-left text-xs font-semibold text-gray-500 hover:bg-gray-50" onClick={() => setMenu('main')}>← Back</button>
              {CONCERN_REASONS.map((reason) => (
                <button key={reason} type="button" className={menuItemCls} onClick={() => openConcern(reason)}>{reason}</button>
              ))}
              {flag && (
                <button type="button" className="w-full rounded-[10px] px-3 py-2.5 text-left text-[13px] font-semibold text-red-700 hover:bg-red-50" onClick={() => { void clearFlag(); }}>
                  Clear flag
                </button>
              )}
            </>
          )}
        </div>,
        document.body
      )}

      <Sheet
        open={!!concernReason}
        onClose={() => setConcernReason(null)}
        title="Flag a concern"
        subtitle={`${participant.fullName} · ${concernReason ?? ''}`}
        maxWidth="max-w-[520px]"
        footer={(
          <>
            <button type="button" onClick={() => setConcernReason(null)} className="min-h-[46px] rounded-xl border border-gray-200 bg-white px-[18px] py-3 text-sm font-semibold text-gray-700">Cancel</button>
            <button type="button" onClick={() => { void saveConcern(); }} disabled={concernSaving} className="min-h-[46px] flex-1 rounded-xl bg-primary p-3 text-[15px] font-semibold text-white disabled:opacity-60">
              {concernSaving ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Flagging…</span>) : 'Flag concern'}
            </button>
          </>
        )}
      >
        {concernReason === 'Other' && (
          <label className="mb-3.5 block">
            <span className="mb-1.5 block text-[13px] font-semibold text-gray-900">What is the concern?</span>
            <input value={concernOther} onChange={(e) => setConcernOther(e.target.value)} placeholder="Name the concern in a few words" className={`${TEXT_INPUT} min-h-[48px]`} />
            {concernTouched && !concernOther.trim() && <span className="mt-1 block text-xs font-medium text-red-700">Say what the concern is.</span>}
          </label>
        )}
        <div className="mb-0.5 flex items-center gap-2">
          <span className="text-[13px] font-semibold text-gray-900">Add a note</span>
          <InfoTip label="About flags">Operations is notified as soon as you flag someone.</InfoTip>
        </div>
        <label className="block">
          <span className="mb-1.5 block text-[12.5px] text-gray-500">Optional. Anything leadership should know.</span>
          <textarea value={concernNote} onChange={(e) => setConcernNote(e.target.value)} rows={4} placeholder="Missed the last four meetings and is not answering calls." className={`${TEXT_INPUT} resize-y`} />
        </label>
        {concernError && <p className="mt-3 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{concernError}</p>}
      </Sheet>

      <RetakeMarkModal
        participant={retakeMarkOpen ? participant : null}
        onClose={() => setRetakeMarkOpen(false)}
        onSave={(note) => updateRetake({ retakeStatus: 'CONFIRMED', retakeNote: note, retakeCheckedById: userId, retakeCheckedAt: new Date().toISOString() })}
      />
      <Sheet open={viewOpen} onClose={() => setViewOpen(false)} title={participant.fullName} subtitle="Participant details">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <CopyPhoneButton phone={participant.phone} />
            <button
              type="button"
              onClick={() => { setViewOpen(false); setEditingName(true); }}
              className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-50"
            >
              Edit name
            </button>
          </div>
          <RegistrationDetails participant={participant} />
          <ProfileOverview participant={participant} showBasics />
          <DepartmentHandoff
            participant={participant}
            referrals={referrals}
            userId={userId}
            onChanged={(message) => { showToast({ message }); loadReferrals(); }}
            onError={(message) => showToast({ message, tone: 'error' })}
          />
          <div className="rounded-[14px] border border-[#f1f2f5] p-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[13px] font-bold text-gray-900">Handover context</p>
                {handovers[0]?.fromSupportName ? (
                  <p className="mt-1 text-xs text-gray-600">
                    Previously supported by <span className="font-semibold text-gray-800">{handovers[0].fromSupportName}</span>
                    {handovers[0].faithProjectStatus ? ` · Faith project: ${handovers[0].faithProjectStatus.replaceAll('_', ' ').toLowerCase()}` : ''}
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-gray-500">No previous support handover recorded yet.</p>
                )}
              </div>
              <button type="button" onClick={() => { setViewOpen(false); onAddNote(); }} className="shrink-0 rounded-xl border border-orange-200 bg-white px-3 py-1.5 text-xs font-semibold text-primary hover:bg-orange-50">
                Add note
              </button>
            </div>
            <NotesAccordion notes={notes.filter((note) => note.noteType === 'HANDOVER' || note.noteType === 'MEETING' || note.noteType === 'CHECK_IN')} />
          </div>
          {(testimonies ?? []).length > 0 && (
            <div className="rounded-[14px] border border-[#f1f2f5] p-3.5">
              <p className="text-[13px] font-bold text-gray-900">Testimonies</p>
              <div className="mt-2.5 flex flex-col gap-2">
                {(testimonies ?? []).map((t) => {
                  const chip = TESTIMONY_STATUS_CHIP[t.status];
                  return (
                    <div key={t.id} className="rounded-xl bg-[#f9fafb] p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        {t.title && <span className="text-[12.5px] font-bold text-gray-900">{t.title}</span>}
                        <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold ${chip.cls}`}>{chip.label}</span>
                        <span className="ml-auto text-[11px] text-gray-400">{shortMoment(t.createdAt)}</span>
                      </div>
                      <p className="mt-1 whitespace-pre-wrap text-[12.5px] leading-relaxed text-gray-700">{t.body}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </Sheet>

      <FaithProjectSheet
        open={fpOpen}
        onClose={() => setFpOpen(false)}
        participant={participant}
        project={project}
        categories={faithProjectCategories}
        onSaved={onProjectSaved}
      />

      <EditNameModal
        participant={editingName ? participant : null}
        onClose={() => setEditingName(false)}
        onSaved={onParticipantUpdated}
      />
    </div>
  );
};

// What the participant saved, read-only for their support, plus an optional category and the edit history.
// Participants edit their own project; there is no review step.
const FaithProjectSheet: React.FC<{
  open: boolean;
  onClose: () => void;
  participant: Participant;
  project: FaithProject | null;
  categories: FaithProjectCategory[];
  onSaved: (project: FaithProject) => void;
}> = ({ open, onClose, participant, project, categories, onSaved }) => {
  const chip = FP_CHIP[project?.status ?? 'NOT_DRAFTED'];
  const [versions, setVersions] = useState<FaithProjectVersion[]>([]);
  const [historyFailed, setHistoryFailed] = useState(false);
  const [categoryId, setCategoryId] = useState(project?.categoryId ?? '');
  const [error, setError] = useState('');
  const firstName = participant.fullName.trim().split(/\s+/)[0] || 'The participant';

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setCategoryId(project?.categoryId ?? '');
    setError('');
    faithProjectsApi.getVersions(participant.id)
      .then((res) => { if (!cancelled) { setVersions(res.versions); setHistoryFailed(false); } })
      .catch(() => { if (!cancelled) { setVersions([]); setHistoryFailed(true); } });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, participant.id, project?.updatedAt]);

  const changeCategory = async (next: string) => {
    if (!project) return;
    const previous = categoryId;
    setCategoryId(next);
    setError('');
    try {
      await faithProjectsApi.setCategory(project.id, next || null);
      onSaved({ ...project, categoryId: next || null, categoryName: categories.find((category) => category.id === next)?.name ?? null });
    } catch (err) {
      setCategoryId(previous);
      setError(err instanceof Error ? err.message : 'Could not save the category.');
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={participant.fullName}
      subtitle="Faith project"
      headerExtra={<div className="flex flex-wrap items-center justify-end gap-1.5">
        {project?.categoryName && <span className="rounded-full bg-[#eef2f7] px-2.5 py-1 text-[11px] font-bold text-[#4b5563]">{project.categoryName}</span>}
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${chip.cls}`}>{chip.label}</span>
      </div>}
    >
      <div className="whitespace-pre-wrap rounded-[14px] border border-[#ffdeca] bg-[#fff8f3] p-3.5 text-[14.5px] leading-relaxed text-gray-800">
        {project?.body?.trim() || 'Nothing saved yet.'}
      </div>
      <p className="mt-2 text-[12.5px] text-gray-400">{firstName} edits this themselves. You are told each time they save.</p>
      {error && <p className="mt-3 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-600">{error}</p>}

      {project && (
        <div className="mt-4">
          <AppSelect label="Faith Project category (optional)" value={categoryId} onChange={(value) => { void changeCategory(value); }} options={[{ value: '', label: 'No category' }, ...categories.map((category) => ({ value: category.id, label: category.name }))]} placeholder="No category" />
        </div>
      )}

      <FaithProjectHistory className="mt-3" versions={versions} participantLabel={firstName} loadFailed={historyFailed} />
    </Sheet>
  );
};

export default ParticipantCard;
