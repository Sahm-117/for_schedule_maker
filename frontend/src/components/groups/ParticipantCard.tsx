import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import ModalShell from '../followups/ModalShell';
import InfoTip from '../InfoTip';
import AppSelect from '../AppSelect';
import DepartmentHandoff from '../participants/DepartmentHandoff';
import ProfileOverview from '../participants/ProfileOverview';
import { useToast } from '../Toast';
import { departmentReferralsApi, faithProjectsApi, participantCheckInsApi, participantPushApi, participantFlagsApi, participantNotesApi, participantsApi } from '../../services/api';
import { buildWhatsAppLink } from '../../utils/phone';
import { shortMoment } from '../../utils/participantApp';
import { unreadTrails, type FaithTrail, type ThreadReads } from '../../utils/faithThread';
import type { DepartmentReferral, FaithProject, FaithProjectCategory, FaithProjectStatus, Participant, ParticipantCheckIn, ParticipantFlag, ParticipantHandover, ParticipantNote } from '../../types';

// Faith project states mapped onto the V2 design's labels.
const FP_CHIP: Record<FaithProjectStatus, { label: string; cls: string }> = {
  NOT_DRAFTED: { label: 'Not started', cls: 'bg-[#f6f7f9] text-gray-500' },
  AWAITING_DRAFT: { label: 'Sent back for work', cls: 'bg-[#fef3c7] text-[#b45309]' },
  NEEDS_REFINEMENT: { label: 'With you to review', cls: 'bg-[#fff1e6] text-[#c2410c]' },
  UNDER_REFINEMENT: { label: 'With the back office', cls: 'bg-[#ede9fe] text-[#6d28d9]' },
  APPROVED: { label: 'Approved', cls: 'bg-[#f2fbf5] text-[#15803d]' },
};

const CAN_SEND_UP: FaithProjectStatus[] = ['NOT_DRAFTED', 'AWAITING_DRAFT', 'NEEDS_REFINEMENT'];

const CONCERN_REASONS = ['Attendance', 'Engagement', 'Emotional wellbeing', 'Spiritual struggle', 'Other'];

type TrailEntry = { key: string; who: string; role: string; at: string; text: string; sortAt: string };

const initialsOf = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('');
const formatDate = (iso: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(new Date(iso));

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
            {saving ? 'Saving…' : 'Save'}
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
  onNoteAdded: (note: ParticipantNote) => void;
  onFlagRaised: (flag: ParticipantFlag) => void;
  onFlagCleared: (flagId: string) => void;
  threadReads: ThreadReads;
  onThreadRead: (participantId: string, trail: FaithTrail) => void;
  /** When they wrote this week's reflection in the participant app (never the text). */
  reflectedAt?: string | null;
  /** An unanswered "I need help" from the participant app. */
  helpRequest?: ParticipantCheckIn | null;
  onHelpHandled?: (checkIn: ParticipantCheckIn) => void;
  /** Has an active app login but no saved push subscription — can't get alerts. */
  noAlerts?: boolean;
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
  onNoteAdded,
  onFlagRaised,
  onFlagCleared,
  threadReads,
  onThreadRead,
  reflectedAt,
  helpRequest,
  onHelpHandled,
  noAlerts,
}) => {
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
  const unread = unreadTrails(participant.id, project, notes, userId, threadReads);
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
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${participant.status === 'ARCHIVED' ? 'bg-neutral-100 text-neutral-600' : 'bg-[#f2fbf5] text-[#15803d]'}`}>
          {participant.status === 'ARCHIVED' ? 'Archived' : 'Active'}
        </span>
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
          {unread.size > 0 && (
            <span className="relative flex h-2 w-2" aria-label="New messages" title={unread.has('office') && unread.has('coach') ? 'New messages from the back office and the participant' : unread.has('office') ? 'New message from the back office' : 'New message from the participant'}>
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-40 motion-reduce:hidden" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
            </span>
          )}
          <svg width="10" height="10" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.4" d="m9 5 7 7-7 7" /></svg>
        </button>
        {reflectedAt && (
          <span className="rounded-full bg-sky-100/80 px-2.5 py-1 text-[11px] font-semibold text-sky-700" title="They wrote this week's reflection in the app. Only they can read it.">
            Reflected {shortMoment(reflectedAt)}
          </span>
        )}
      </div>

      {helpRequest && (
        <div className="mt-2.5 rounded-xl bg-red-100/80 px-[13px] py-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.04em] text-red-700">Asked for help · {shortMoment(helpRequest.createdAt)}</p>
          <p className="mt-1 text-[13px] leading-relaxed text-gray-700">They answered &ldquo;I need help&rdquo; in the app. Reach out today.</p>
          <div className="mt-2.5 flex gap-2">
            {buildWhatsAppLink(participant.phone, '') && (
              <a href={buildWhatsAppLink(participant.phone, '') ?? undefined} target="_blank" rel="noreferrer" className="inline-flex min-h-[38px] items-center rounded-[10px] bg-white px-3 text-[12.5px] font-semibold text-gray-700">WhatsApp</a>
            )}
            <button type="button" onClick={() => { void markHelpHandled(); }} disabled={handlingHelp} className="min-h-[38px] rounded-[10px] bg-red-700 px-3 text-[12.5px] font-semibold text-white disabled:opacity-60">
              {handlingHelp ? 'Saving…' : 'I have reached out'}
            </button>
          </div>
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
              <button type="button" className={menuItemCls} onClick={() => setMenu('concern')}>{flag ? 'Attention flagged' : 'Flag concern'}</button>
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
              {concernSaving ? 'Flagging…' : 'Flag concern'}
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
        </div>
      </Sheet>

      <FaithProjectSheet
        open={fpOpen}
        onClose={() => setFpOpen(false)}
        participant={participant}
        project={project}
        notes={notes}
        groupName={groupName}
        userId={userId}
        supportName={supportName}
        categories={faithProjectCategories}
        onSaved={onProjectSaved}
        onNoteAdded={onNoteAdded}
        unread={unread}
        onTrailRead={(trail) => onThreadRead(participant.id, trail)}
      />

      <EditNameModal
        participant={editingName ? participant : null}
        onClose={() => setEditingName(false)}
        onSaved={onParticipantUpdated}
      />
    </div>
  );
};

const FaithProjectSheet: React.FC<{
  open: boolean;
  onClose: () => void;
  participant: Participant;
  project: FaithProject | null;
  notes: ParticipantNote[];
  groupName: string | null;
  userId: string;
  supportName: string;
  categories: FaithProjectCategory[];
  onSaved: (project: FaithProject) => void;
  onNoteAdded: (note: ParticipantNote) => void;
  unread: Set<FaithTrail>;
  onTrailRead: (trail: FaithTrail) => void;
}> = ({ open, onClose, participant, project, notes, groupName, userId, supportName, categories, onSaved, onNoteAdded, unread, onTrailRead }) => {
  const status = project?.status ?? 'NOT_DRAFTED';
  const chip = FP_CHIP[status];
  const editable = CAN_SEND_UP.includes(status);
  const [tab, setTab] = useState<'coach' | 'office'>('coach');
  const [body, setBody] = useState(project?.body ?? '');
  const [note, setNote] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [categoryId, setCategoryId] = useState(project?.categoryId ?? '');
  const [showFullTrail, setShowFullTrail] = useState(false);
  const [trailOpen, setTrailOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setBody(project?.body ?? '');
    setNote('');
    setError('');
    setCategoryId(project?.categoryId ?? '');
    setShowFullTrail(false);
    const nextTab = unread.has('coach') ? 'coach' : unread.has('office') ? 'office' : 'coach';
    setTab(nextTab);
    setTrailOpen(unread.size > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, project?.body]);

  // Reading a trail clears its dot.
  useEffect(() => {
    if (open && trailOpen && unread.has(tab)) onTrailRead(tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, trailOpen, tab, unread.has(tab)]);

  const noteEntry = (entry: ParticipantNote): TrailEntry => ({
    key: entry.id,
    who: entry.byParticipant ? participant.fullName : entry.authorName || 'Support',
    role: entry.byParticipant ? 'Participant' : 'Support',
    at: formatDate(entry.createdAt),
    text: entry.body,
    sortAt: entry.createdAt,
  });
  const byTime = (a: TrailEntry, b: TrailEntry) => a.sortAt.localeCompare(b.sortAt);
  const coachTrail = notes.filter((entry) => entry.noteType === 'FAITH_COACH').map(noteEntry).sort(byTime);
  const officeTrail: TrailEntry[] = [
    ...(project?.reviewHistory ?? []).map((entry, index) => ({
      key: `review-${index}`,
      who: entry.actorName,
      role: 'Back office',
      at: formatDate(entry.at),
      text: entry.note?.trim() || (entry.action === 'APPROVED' ? 'Approved.' : 'Changes requested.'),
      sortAt: entry.at,
    })),
    ...notes.filter((entry) => entry.noteType === 'FAITH_OFFICE').map(noteEntry),
  ].sort(byTime);
  const trail = tab === 'office' ? officeTrail : coachTrail;
  const visibleTrail = showFullTrail ? trail : trail.slice(-2);

  const addNote = async () => {
    if (!note.trim() || noteSaving) return;
    setNoteSaving(true);
    setError('');
    try {
      const { note: saved } = await participantNotesApi.create({
        participantId: participant.id,
        body: note.trim(),
        authorId: userId,
        groupId: participant.groupId ?? null,
        noteType: tab === 'office' ? 'FAITH_OFFICE' : 'FAITH_COACH',
      });
      onNoteAdded(saved);
      if (tab === 'coach') {
        void participantPushApi.notify([participant.id], 'Your support replied', 'New feedback on your faith project.', '/me/faith');
      }
      setNote('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'This note could not be saved.');
    } finally {
      setNoteSaving(false);
    }
  };

  const save = async (nextStatus: FaithProjectStatus) => {
    if (nextStatus === 'UNDER_REFINEMENT' && !body.trim()) { setError('Write the faith project before sending it to the back office.'); return; }
    if (nextStatus === 'UNDER_REFINEMENT' && !categoryId) { setError('Choose a category before sending this to the back office.'); return; }
    setSaving(true);
    setError('');
    try {
      const { project: saved } = await faithProjectsApi.upsertForParticipant(participant.id, {
        body: body.trim() || null,
        categoryId: categoryId || null,
        status: nextStatus,
        updatedById: userId,
      });
      onSaved(saved);
      if (note.trim()) await addNote();
      if (nextStatus === 'UNDER_REFINEMENT') {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
        const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
        fetch(`${supabaseUrl}/functions/v1/notify-faith-project-submitted`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: anonKey, Authorization: `Bearer ${anonKey}` },
          body: JSON.stringify({ participantName: participant.fullName, supportName, groupName: groupName ?? undefined }),
        }).catch(() => {/* non-critical */});
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to save');
    } finally {
      setSaving(false);
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
      footer={editable ? (
        <>
          <button type="button" onClick={() => { void save('AWAITING_DRAFT'); }} disabled={saving} className="min-h-[46px] rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 disabled:opacity-60">
            Send back for work
          </button>
          <button type="button" onClick={() => { void save('UNDER_REFINEMENT'); }} disabled={saving} className="min-h-[46px] flex-1 rounded-xl bg-primary p-3 text-[15px] font-semibold text-white disabled:opacity-60">
            {saving ? 'Saving…' : 'Send to back office'}
          </button>
        </>
      ) : undefined}
    >
      {editable ? (
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          placeholder="Nothing drafted yet. Write the participant's faith project…"
          className="w-full resize-y rounded-[14px] border border-[#ffdeca] bg-[#fff8f3] p-3.5 text-[14.5px] leading-relaxed text-gray-800 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      ) : (
        <div className="whitespace-pre-wrap rounded-[14px] border border-[#ffdeca] bg-[#fff8f3] p-3.5 text-[14.5px] leading-relaxed text-gray-800">
          {project?.body?.trim() || 'Nothing drafted yet.'}
        </div>
      )}
      {error && <p className="mt-3 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-600">{error}</p>}

      {editable && (
        <div className="mt-4">
          <AppSelect label="Faith Project category" value={categoryId} onChange={setCategoryId} options={categories.map((category) => ({ value: category.id, label: category.name }))} placeholder="Choose a category" />
          {categories.length === 0 && <p className="mt-2 text-xs text-amber-700">No categories available yet.</p>}
        </div>
      )}

      <div className="mt-4">
        <button type="button" onClick={() => setTrailOpen((shown) => !shown)} className="flex w-full items-center gap-2 text-left">
          <span className="flex-1 text-[13px] font-semibold text-gray-900">Comments{trail.length ? ` (${trail.length})` : ''}</span>
          {unread.size > 0 && !trailOpen && <span className="h-2 w-2 rounded-full bg-red-500" aria-label="New reply" />}
          <svg className={`h-4 w-4 text-gray-500 transition-transform ${trailOpen ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m9 5 7 7-7 7" /></svg>
        </button>
      </div>

      {trailOpen && <>
      <div className="mt-3 flex items-center gap-2">
      <div className="flex flex-1 gap-2 rounded-full bg-[#f6f7f9] p-1">
        {([['coach', 'With participant'], ['office', 'With back office']] as Array<['coach' | 'office', string]>).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => { setTab(key); setNote(''); setShowFullTrail(false); }}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-full px-2.5 py-[9px] text-[12.5px] font-semibold transition ${tab === key ? 'bg-[#3f4757] text-white' : 'text-gray-600'}`}
          >
            {label}
            {unread.has(key) && tab !== key && <span className="h-1.5 w-1.5 rounded-full bg-red-500" aria-label="New" />}
          </button>
        ))}
      </div>
      <InfoTip label="Who sees this trail">
        {tab === 'office'
          ? 'Only you and the back office see this. The participant never sees these notes.'
          : 'The participant sees everything in this trail.'}
      </InfoTip>
      </div>

      {trail.length === 0 ? (
        <p className="px-4 py-6 text-center text-[13.5px] text-gray-400">No notes on this trail yet.</p>
      ) : (
        <div className="mt-3 flex flex-col gap-2.5">
          {visibleTrail.map((entry) => (
            <div key={entry.key} className={`rounded-xl px-3.5 py-3 ${entry.role === 'Participant' ? 'bg-[#fff8f3]' : 'bg-[#f6f7f9]'}`}>
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-[13px] font-bold text-gray-900">{entry.who}</span>
                <span className="text-[11px] font-semibold text-gray-400">{entry.role}</span>
                <span className="ml-auto text-[11px] text-gray-400">{entry.at}</span>
              </div>
              <p className="mt-1 text-[13.5px] leading-relaxed text-gray-700">{entry.text}</p>
            </div>
          ))}
          {trail.length > visibleTrail.length && (
            <button type="button" onClick={() => setShowFullTrail(true)} className="self-start px-1 py-1.5 text-[12.5px] font-semibold text-primary">
              Show {trail.length - visibleTrail.length} earlier {trail.length - visibleTrail.length === 1 ? 'note' : 'notes'}
            </button>
          )}
        </div>
      )}

      <label className="mt-4 block">
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Write feedback…" aria-label="Write feedback" className={`${TEXT_INPUT} resize-y`} />
      </label>
      {note.trim() && <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          onClick={() => { void addNote(); }}
          disabled={noteSaving}
          className="rounded-xl bg-primary px-4 py-[11px] text-[13.5px] font-semibold text-white transition disabled:opacity-60"
        >
          {noteSaving ? 'Saving…' : 'Add note'}
        </button>
      </div>}
      </>}
    </Sheet>
  );
};

export default ParticipantCard;
